import { CatGame, CATS, RULES, SPRITE, clamp } from './game-core.js?v=5';
import { createSeed, normalizeSeed } from './seed.js';
import { createIntro } from './intro.js?v=3';
import { createGameAudio } from './audio.js?v=3';
import { CAT_OUTLINES } from './cat-outlines.js';
import { drawCatHitbox } from './hitboxes.js';

if (window.nyangStartup?.failed) {
  throw new Error('Game startup failed; reload to retry');
}
const $ = (id) => document.getElementById(id);
const canvas = $('game'),
  ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Canvas rendering unavailable');
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const storage = {
  get(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* Play remains available if browser storage is disabled. */
    }
  },
};
const validScore = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
let best = validScore(storage.get('nyang-drop.best', 0));
function syncBest(candidate = 0) {
  // An older tab must not overwrite a record made by a newer one. Storage
  // events also reconcile racing writes by retaining the highest value seen.
  const saved = validScore(storage.get('nyang-drop.best', 0));
  best = Math.max(best, saved, validScore(candidate));
  if (best > saved) {
    storage.set('nyang-drop.best', best);
  }
}
let muted = storage.get('nyang-drop.muted', 'false') === 'true';
let showNextPreview = storage.get('nyang-drop.next-preview', 'false') === 'true';
let showHitboxes = storage.get('nyang-drop.hitboxes', 'false') === 'true';
let volumeCloseTimer = null;
const savedVolume = (key, fallback) => {
  const value = Number(storage.get(key, fallback));
  return Number.isFinite(value) ? clamp(Math.round(value), 0, 100) : fallback;
};
let musicVolume = savedVolume('nyang-drop.music-volume', 60);
let effectsVolume = savedVolume('nyang-drop.effects-volume', 80);
const audio = createGameAudio({
  muted,
  musicVolume: musicVolume / 100,
  effectsVolume: effectsVolume / 100,
});
audio.preload();
audio.setVisible(!document.hidden);
let game,
  loaded = false,
  activePointer = null,
  modalKind = null,
  returnState = null,
  pendingRestartSeed = null;
let primaryAction = () => {},
  secondaryAction = () => {},
  toastUntil = 0;
let accumulator = 0,
  previousTime = 0,
  dpr = 1,
  lastUI = '',
  lastDanger = false;
const images = [],
  particles = [],
  labels = [];
let collectionLayout = [];
const intro = createIntro({
  overlay: $('intro'),
  canvas: $('intro-canvas'),
  skip: $('intro-skip'),
  content: $('game-layout'),
  decor: $('room-decor'),
  page: document.documentElement,
  reducedMotion,
  onFinish: () => {
    if (loaded) {
      start();
    } else {
      $('toast').textContent = '고양이를 불러오는 중…';
      $('toast').hidden = false;
    }
  },
});
const introLogo = $('intro-logo');
introLogo.addEventListener('load', () => {
  introLogo.hidden = false;
  $('intro-logo-fallback').hidden = true;
});
introLogo.addEventListener('error', () => {
  introLogo.hidden = true;
  $('intro-logo-fallback').hidden = false;
});
introLogo.src = './assets/nyang-drop-logo.png';

function announce(message) {
  $('announcement').textContent = message;
}
function stopAudio() {
  audio.setPlaying(false);
}
function syncAudio() {
  audio.setPlaying(game?.state === 'playing' && modalKind === null);
}
function tone(kind, level = 0) {
  audio.play(kind, level);
}
function unlockAudio() {
  audio.unlock();
}
function updateMute() {
  const label = muted ? '볼륨 조절 · 음소거 중' : '볼륨 조절';
  $('volume-button').setAttribute('aria-label', label);
  $('volume-button').title = label;
  $('volume-button')
    .querySelector('use')
    .setAttribute('href', muted ? '#i-muted' : '#i-sound');
  $('sound-toggle').setAttribute('aria-pressed', String(muted));
  $('sound-toggle').textContent = muted ? '소리 켜기' : '전체 음소거';
}
function updateVolumes() {
  for (const [name, value] of [
    ['music', musicVolume],
    ['effects', effectsVolume],
  ]) {
    $(`${name}-volume`).value = value;
    $(`${name}-volume`).setAttribute('aria-valuetext', `${value}%`);
    $(`${name}-volume-value`).textContent = `${value}%`;
  }
}
function setSettings(open, focus = true) {
  if (open) {
    setVolumePanel(false);
    cancelPointer();
  }
  $('game-settings').hidden = !open;
  $('settings-button').setAttribute('aria-expanded', String(open));
  if (focus) {
    $(open ? 'next-preview-toggle' : 'settings-button').focus({ preventScroll: true });
  }
}
function setVolumePanel(open, focus = false) {
  window.clearTimeout(volumeCloseTimer);
  volumeCloseTimer = null;
  if (open) {
    setSettings(false, false);
    cancelPointer();
  }
  $('volume-panel').hidden = !open;
  $('volume-button').setAttribute('aria-expanded', String(open));
  if (focus) {
    $(open ? 'music-volume' : 'volume-button').focus({ preventScroll: true });
  }
}
function updateHitboxes() {
  $('hitbox-toggle').checked = showHitboxes;
}
function updateNextPreview() {
  $('next-preview-toggle').checked = showNextPreview;
  $('game-layout').classList.toggle('preview-enabled', showNextPreview);
  for (const suffix of ['desktop', 'mobile']) {
    $(`next-preview-${suffix}`).hidden = !showNextPreview;
    if (showNextPreview && game) {
      const cat = CATS[game.next];
      $(`next-image-${suffix}`).src = `./assets/${cat.file}`;
      $(`next-name-${suffix}`).textContent = cat.name;
      $(`next-level-${suffix}`).textContent = `${game.next + 1}단계`;
    }
  }
}
function toggleMute() {
  muted = !muted;
  storage.set('nyang-drop.muted', muted);
  updateMute();
  audio.setMuted(muted);
  if (!muted) {
    unlockAudio();
  }
}

function cancelPointer() {
  if (activePointer !== null) {
    try {
      canvas.releasePointerCapture(activePointer);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }
  activePointer = null;
}
function showModal({
  kind,
  eyebrow,
  title,
  description,
  button,
  action,
  extra = '',
  secondary,
  onSecondary,
  cats = false,
  footnote = '',
}) {
  setSettings(false, false);
  setVolumePanel(false);
  cancelPointer();
  stopAudio();
  modalKind = kind;
  primaryAction = action;
  secondaryAction = onSecondary || (() => {});
  $('overlay').hidden = false;
  $('welcome-cats').hidden = !cats;
  $('modal-eyebrow').textContent = eyebrow;
  $('modal-title').textContent = title;
  $('modal-description').innerHTML = description;
  $('modal-extra').innerHTML = extra;
  $('primary-button').querySelector('span').textContent = button;
  $('primary-button').disabled = !loaded && kind !== 'error';
  $('secondary-button').hidden = !secondary;
  $('secondary-button').textContent = secondary || '';
  $('modal-footnote').textContent = footnote;
  $('modal-footnote').hidden = !footnote;
  $('pause-button').disabled = true;
  $('restart-button').disabled = true;
  $('seed-input').disabled = true;
  $('seed-apply').disabled = true;
  if (!intro.active && (loaded || kind === 'error')) {
    $('primary-button').focus({ preventScroll: true });
  }
}
function hideModal() {
  setSettings(false, false);
  setVolumePanel(false);
  $('overlay').hidden = true;
  modalKind = null;
  accumulator = 0;
  previousTime = performance.now();
  $('pause-button').disabled = game.state !== 'playing';
  $('restart-button').disabled = false;
  $('seed-input').disabled = false;
  $('seed-apply').disabled = false;
  canvas.focus({ preventScroll: true });
  syncAudio();
}
function start() {
  if (!loaded || intro.active || game.state !== 'ready') {
    return;
  }
  $('toast').hidden = true;
  game.start();
  hideModal();
  updateUI(true);
}
function restart(seed = game.seed) {
  cancelPointer();
  stopAudio();
  game.reset({ seed });
  syncSeed();
  particles.length = 0;
  labels.length = 0;
  toastUntil = 0;
  $('toast').hidden = true;
  lastUI = '';
  accumulator = 0;
  game.start();
  hideModal();
  unlockAudio();
  updateUI(true);
}
function paused() {
  if (!loaded || game.state !== 'playing') {
    return;
  }
  game.pause();
  showModal({
    kind: 'pause',
    eyebrow: 'PAUSED',
    title: '일시정지',
    description: '계속하기를 누르면 재개됩니다.',
    button: '계속하기',
    action: () => {
      game.resume();
      unlockAudio();
      hideModal();
    },
    cats: true,
    secondary: '처음부터 다시',
    onSecondary: () => confirmRestart('pause'),
  });
  updateUI(true);
}
function confirmRestart(previous = null, seed = game.seed) {
  returnState = previous || game.state;
  pendingRestartSeed = seed;
  game.pause();
  showModal({
    kind: 'restart',
    eyebrow: 'RESTART',
    title: '새로 시작할까요?',
    description: '이번 판의 고양이와 점수는 초기화돼요.<br>선택한 시드의 첫 고양이부터 시작해요.',
    button: '새 게임 시작',
    action: () => restart(seed),
    secondary: '계속 플레이하기',
    onSecondary: () => {
      syncSeed();
      if (returnState === 'pause' || returnState === 'paused') {
        game.resume();
        paused();
      } else {
        game.resume();
        hideModal();
      }
    },
  });
  updateUI(true);
}
function help() {
  if (!loaded || intro.active || modalKind === 'error' || modalKind === 'help') {
    return;
  }
  const prior = modalKind;
  const wasPlaying = game.state === 'playing';
  game.pause();
  showModal({
    kind: 'help',
    eyebrow: 'HOW TO PLAY',
    title: '게임 방법',
    description: '같은 단계의 고양이를 합쳐 점수를 얻으세요.',
    extra:
      '<ol class="help-list"><li><strong>1. 위치를 정하고 떨어뜨리기</strong>PC는 이동 후 클릭, 모바일은 드래그 후 손 떼기.<br>방향키 + 스페이스도 사용할 수 있습니다.</li><li><strong>2. 같은 단계끼리 합성</strong>같은 고양이의 그림이 닿으면 다음 단계로 합쳐집니다.<br>2단계 합성은 10점, 이후 단계마다 2배입니다.</li><li><strong>3. 종료선 초과 주의</strong>판정 대상 얼굴이 선 위에 2초 머물면 종료됩니다.<br>낙하 중에는 처음 닿거나 1초 후부터 판정합니다.</li><li><strong>4. 10단계 달성 후에도 계속 진행</strong>10단계끼리는 합쳐지지 않습니다.<br>최고 점수는 이 브라우저에 저장됩니다.</li></ol>',
    button: '알겠어요',
    action: () => {
      if (prior === 'over') {
        gameOver();
      } else if (prior === 'restart') {
        confirmRestart(returnState, pendingRestartSeed);
      } else if (wasPlaying) {
        game.resume();
        hideModal();
      } else if (game.state === 'paused') {
        game.resume();
        paused();
      } else {
        start();
      }
    },
  });
}
function gameOver() {
  syncBest(game.score);
  const score = game.score.toLocaleString('ko-KR');
  showModal({
    kind: 'over',
    eyebrow: game.score > 0 && game.score >= best ? 'BEST SCORE' : 'GAME OVER',
    title: '게임 종료',
    description: '종료선을 2초 이상 초과했습니다.',
    extra: `<div class="result-score">${score}<small style="font-size:13px;letter-spacing:0;margin-left:5px">점</small></div><div class="result-info"><span>최고 단계 <b>Lv. ${game.highest + 1}</b></span><span>합성 <b>${game.merges}번</b></span></div>`,
    button: '다시 시작',
    action: restart,
    cats: true,
    footnote: `최고 기록 ${best.toLocaleString('ko-KR')}점 · 이 브라우저에 저장`,
  });
  announce(`게임 종료. ${score}점. 다시 시작할 수 있어요.`);
  updateUI(true);
}
function toast(message, duration = 2300) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastUntil = game.time + duration;
  announce(message);
}
function gameEvent(event) {
  if (event.type === 'drop') {
    tone('drop');
  }
  if (event.type === 'merge') {
    const { position } = event.body;
    if (!reducedMotion) {
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        particles.push({
          x: position.x,
          y: position.y,
          vx: Math.cos(angle) * (1.5 + Math.random()),
          vy: Math.sin(angle) * 2.2 - 1,
          life: 1,
          color: i % 2 ? CATS[event.level].color : '#dbc99c',
          size: 2 + Math.random() * 2,
        });
      }
    }
    labels.push({
      x: position.x,
      y: position.y - CATS[event.level].radius,
      life: 1,
      text: `+${event.points}`,
    });
    if (particles.length > 240) {
      particles.splice(0, particles.length - 240);
    }
    tone('merge', event.level);
    if (event.chain > 1) {
      toast(`${event.chain}연속 합성`, 1100);
    }
    syncBest(game.score);
    $('score').classList.remove('score-pulse');
    void $('score').offsetWidth;
    $('score').classList.add('score-pulse');
    announce(`${CATS[event.level].name} 합성. ${event.points}점 획득. 총 ${game.score}점.`);
  }
  if (event.type === 'win') {
    toast('10단계 달성 · 계속 플레이할 수 있습니다', 4200);
    tone('win');
  }
  if (event.type === 'over') {
    gameOver();
  }
}
function updateUI(force = false) {
  if (!game) {
    return;
  }
  const key = `${game.score}:${best}:${game.current}:${game.next}:${game.discovered.size}:${game.state}`;
  if (force || key !== lastUI) {
    lastUI = key;
    updateNextPreview();
    for (const id of ['score', 'score-mobile']) {
      $(id).textContent = game.score.toLocaleString('ko-KR');
    }
    for (const id of ['best', 'best-mobile']) {
      $(id).textContent = best.toLocaleString('ko-KR');
    }
    $('discovered-count').textContent = game.discovered.size;
    CATS.forEach((cat, i) => {
      const item = $('cat-collection').children[i],
        found = game.discovered.has(i);
      if (found && !item.classList.contains('found')) {
        item.classList.add('just-found');
      }
      item.classList.toggle('found', found);
      if (!found) {
        item.classList.remove('just-found');
      }
      item.title = `${i + 1}단계 · ${cat.name}${found ? ' · 생성 완료' : ''}`;
    });
  }
  const dangerous = game.dangerMs > 0 && game.state === 'playing';
  if (dangerous !== lastDanger) {
    $('danger-banner').hidden = !dangerous;
    $('board').classList.toggle('danger', dangerous);
    lastDanger = dangerous;
  }
  if (dangerous) {
    $('danger-seconds').textContent = Math.max(0, (RULES.danger - game.dangerMs) / 1000).toFixed(1);
  }
}
function drawCat(level, x, y, radius, angle = 0, alpha = 1, scale = 1) {
  const img = images[level];
  if (!img?.complete || !img.naturalWidth) {
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  const size = radius * SPRITE.scale * scale;
  ctx.drawImage(img, -size * SPRITE.anchorX, -size * SPRITE.anchorY, size, size);
  ctx.restore();
}
function drawBoard() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, RULES.width, RULES.height);
  const danger = game?.dangerMs > 0;
  ctx.save();
  ctx.strokeStyle = danger ? '#b45c38' : '#b49971';
  ctx.setLineDash([5, 7]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, RULES.line);
  ctx.lineTo(412, RULES.line);
  ctx.stroke();
  ctx.restore();
  if (!game) {
    return;
  }
  if (!game.bodies.size && game.state === 'playing') {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a58b65';
    ctx.font = '500 11px "Noto Sans KR", sans-serif';
    ctx.fillText('첫 번째 고양이를 놓아주세요', 220, 416);
    ctx.restore();
  }
  for (const body of game.bodies.values()) {
    let scale = 1;
    if (!reducedMotion && body.cat.eligible) {
      const age = game.time - body.cat.popAt;
      if (age < 220) {
        scale = 1 + Math.sin((age / 220) * Math.PI) * 0.08;
      }
    }
    drawCat(
      body.cat.level,
      body.position.x,
      body.position.y,
      CATS[body.cat.level].radius,
      body.angle,
      1,
      scale,
    );
  }
  if (game.state === 'playing') {
    const radius = CATS[game.current].radius,
      x = game.aimX;
    let landingY = RULES.floor - radius;
    for (const body of game.bodies.values()) {
      const sum = radius + CATS[body.cat.level].radius,
        dx = body.position.x - x;
      if (Math.abs(dx) < sum) {
        landingY = Math.min(landingY, body.position.y - Math.sqrt(sum * sum - dx * dx));
      }
    }
    landingY = Math.max(RULES.spawnY + radius, landingY);
    ctx.save();
    ctx.strokeStyle = '#c9b99a80';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(x, RULES.spawnY + radius + 8);
    ctx.lineTo(x, landingY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#b4a48018';
    ctx.beginPath();
    ctx.arc(x, landingY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawCat(game.current, x, RULES.spawnY, radius, 0, game.canDrop ? 1 : 0.35);
    if (!game.canDrop) {
      ctx.save();
      ctx.strokeStyle = '#cdb58d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        x,
        RULES.spawnY,
        radius + 10,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (1 - (game.cooldownUntil - game.time) / RULES.cooldown),
      );
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const particle of particles) {
    ctx.globalAlpha = particle.life;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const label of labels) {
    ctx.globalAlpha = Math.min(1, label.life * 2);
    ctx.font = '600 17px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a26749';
    ctx.strokeStyle = '#fffdf6';
    ctx.lineWidth = 4;
    ctx.strokeText(label.text, label.x, label.y);
    ctx.fillText(label.text, label.x, label.y);
  }
  ctx.globalAlpha = 1;
  if (showHitboxes) {
    for (const body of game.bodies.values()) {
      drawCatHitbox(ctx, body);
    }
  }
}
function advanceEffects(dt) {
  const factor = dt / 16.67;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * factor;
    p.y += p.vy * factor;
    p.vy += 0.07 * factor;
    p.life -= dt / 650;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
  for (let i = labels.length - 1; i >= 0; i--) {
    const p = labels[i];
    p.y -= 0.4 * factor;
    p.life -= dt / 850;
    if (p.life <= 0) {
      labels.splice(i, 1);
    }
  }
  if (toastUntil && game.time >= toastUntil) {
    $('toast').hidden = true;
    toastUntil = 0;
  }
}
function frame(time) {
  const elapsed = previousTime ? Math.min(time - previousTime, 100) : 0;
  previousTime = time;
  if (game?.state === 'playing') {
    accumulator += elapsed;
    while (accumulator >= RULES.step && game.state === 'playing') {
      game.step();
      advanceEffects(RULES.step);
      accumulator -= RULES.step;
    }
  } else {
    accumulator = 0;
  }
  drawBoard();
  updateUI();
  requestAnimationFrame(frame);
}
function resize() {
  const displayWidth = canvas.getBoundingClientRect().width || RULES.width;
  dpr = (Math.min(window.devicePixelRatio || 1, 2) * displayWidth) / RULES.width;
  canvas.width = Math.round(RULES.width * dpr);
  canvas.height = Math.round(RULES.height * dpr);
  cancelPointer();
  accumulator = 0;
  positionCollectionLabels();
}
function pointX(event) {
  const bounds = canvas.getBoundingClientRect();
  return ((event.clientX - bounds.left) / bounds.width) * RULES.width;
}
canvas.addEventListener('pointerdown', (event) => {
  if (
    !loaded ||
    game.state !== 'playing' ||
    !event.isPrimary ||
    activePointer !== null ||
    (event.pointerType === 'mouse' && event.button !== 0)
  ) {
    return;
  }
  if (event.pointerType !== 'mouse' && !game.canDrop) {
    return;
  }
  event.preventDefault();
  unlockAudio();
  canvas.focus({ preventScroll: true });
  game.aim(pointX(event));
  if (event.pointerType === 'mouse') {
    game.drop();
  } else {
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (!loaded || game.state !== 'playing') {
    return;
  }
  if (event.pointerType === 'mouse' || event.pointerId === activePointer) {
    game.aim(pointX(event));
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerId !== activePointer) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  const x = pointX(event);
  cancelPointer();
  if (inside && game.state === 'playing') {
    game.aim(x);
    game.drop();
  }
});
canvas.addEventListener('pointercancel', cancelPointer);
canvas.addEventListener('lostpointercapture', () => {
  activePointer = null;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('keydown', (event) => {
  if (game?.state !== 'playing') {
    return;
  }
  if (['ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Escape', 'p', 'P'].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === 'ArrowLeft') {
    game.aim(game.aimX - 12);
  }
  if (event.key === 'ArrowRight') {
    game.aim(game.aimX + 12);
  }
  if ([' ', 'Enter'].includes(event.key) && !event.repeat) {
    unlockAudio();
    game.drop();
  }
  if (['Escape', 'p', 'P'].includes(event.key) && !event.repeat) {
    paused();
  }
});
document.addEventListener('keydown', (event) => {
  if (intro.active) {
    return;
  }
  if (event.defaultPrevented) {
    return;
  }
  if ($('overlay').hidden) {
    return;
  }
  const panel = !$('game-settings').hidden
    ? $('game-settings')
    : !$('volume-panel').hidden
      ? $('volume-panel')
      : $('modal');
  const buttons = [...panel.querySelectorAll('button, input')].filter(
    (button) => !button.hidden && !button.disabled,
  );
  if (event.key === 'Tab' && buttons.length) {
    const first = buttons[0],
      last = buttons.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (modalKind === 'pause' || modalKind === 'help') {
      primaryAction();
    } else if (modalKind === 'restart') {
      secondaryAction();
    }
  }
});
$('primary-button').addEventListener('click', () => primaryAction());
function syncSeed() {
  $('seed-input').value = game.seed;
}
$('seed-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!loaded || intro.active || modalKind !== null) {
    return;
  }
  const seed = normalizeSeed($('seed-input').value) || createSeed();
  // A new seed is committed only when the player confirms the new game.
  if (game.bodies.size === 0 && game.score === 0) {
    restart(seed);
  } else {
    confirmRestart(null, seed);
  }
});
$('secondary-button').addEventListener('click', () => secondaryAction());
$('pause-button').addEventListener('click', () => paused());
$('restart-button').addEventListener('click', () => {
  if (loaded) {
    confirmRestart();
  }
});
$('help-button').addEventListener('click', help);
$('volume-button').addEventListener('click', () => setVolumePanel(true, true));
$('volume-close').addEventListener('click', () => setVolumePanel(false, true));
$('volume-control').addEventListener('pointerenter', (event) => {
  if (event.pointerType === 'mouse') {
    setVolumePanel(true);
  }
});
$('volume-control').addEventListener('pointerleave', () => {
  window.clearTimeout(volumeCloseTimer);
  volumeCloseTimer = window.setTimeout(() => {
    volumeCloseTimer = null;
    if (!$('volume-panel').contains(document.activeElement)) {
      setVolumePanel(false);
    }
  }, 180);
});
$('volume-control').addEventListener('focusout', (event) => {
  if (!$('volume-control').contains(event.relatedTarget)) {
    setVolumePanel(false);
  }
});
$('volume-control').addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('volume-panel').hidden) {
    event.preventDefault();
    setVolumePanel(false, true);
  }
});
$('sound-toggle').addEventListener('click', toggleMute);
$('settings-button').addEventListener('click', () => setSettings($('game-settings').hidden));
$('settings-close').addEventListener('click', () => setSettings(false));
$('next-preview-toggle').addEventListener('change', (event) => {
  showNextPreview = event.target.checked;
  storage.set('nyang-drop.next-preview', showNextPreview);
  updateNextPreview();
  resize();
});
$('hitbox-toggle').addEventListener('change', (event) => {
  showHitboxes = event.target.checked;
  storage.set('nyang-drop.hitboxes', showHitboxes);
  updateHitboxes();
  drawBoard();
});
$('game-settings').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    setSettings(false);
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!$('volume-panel').hidden && !$('volume-control').contains(event.target)) {
    setVolumePanel(false);
  }
  if (
    !$('game-settings').hidden &&
    !$('game-settings').contains(event.target) &&
    !$('settings-button').contains(event.target)
  ) {
    setSettings(false, false);
  }
});
$('music-volume').addEventListener('input', (event) => {
  musicVolume = clamp(Number(event.target.value) || 0, 0, 100);
  storage.set('nyang-drop.music-volume', musicVolume);
  audio.setMusicVolume(musicVolume / 100);
  updateVolumes();
  unlockAudio();
});
$('effects-volume').addEventListener('input', (event) => {
  effectsVolume = clamp(Number(event.target.value) || 0, 0, 100);
  storage.set('nyang-drop.effects-volume', effectsVolume);
  audio.setEffectsVolume(effectsVolume / 100);
  updateVolumes();
  unlockAudio();
});
// The automatic intro/start does not request playback. The first actual gesture
// unlocks audio, including pointerup for mobile browsers that require touch end.
document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
document.addEventListener('pointerup', unlockAudio, { capture: true, passive: true });
document.addEventListener('click', unlockAudio, { capture: true });
document.addEventListener(
  'keydown',
  (event) => {
    if (!event.repeat) {
      unlockAudio();
    }
  },
  { capture: true },
);
// Switching tabs/windows never changes game state or opens a pause dialog.
// Discard an interrupted gesture and the background wall-clock interval only.
document.addEventListener('visibilitychange', () => {
  cancelPointer();
  accumulator = 0;
  previousTime = 0;
  audio.setVisible(!document.hidden);
});
window.addEventListener('blur', cancelPointer);
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => {
  cancelPointer();
  accumulator = 0;
  previousTime = 0;
  audio.setVisible(false);
});
window.addEventListener('pageshow', () => {
  accumulator = 0;
  previousTime = 0;
  audio.setVisible(!document.hidden);
});
window.addEventListener('storage', (event) => {
  if (event.key !== 'nyang-drop.best') {
    return;
  }
  syncBest(event.newValue);
  updateUI(true);
});

function renderCollection() {
  const radius = 134,
    arrowRadius = 98;
  // Ten equal sectors keep the cats and their indices visually aligned.
  const arcStep = 360 / CATS.length;
  const minimum = CATS[0].radius,
    maximum = CATS.at(-1).radius;
  const point = (distance, angle) => {
    const radians = (angle * Math.PI) / 180;
    return [200 + distance * Math.cos(radians), 200 + distance * Math.sin(radians)];
  };
  // Keep the existing size progression. The final gap has the same spacing,
  // but intentionally no arrow: level 10 does not merge back into level 1.
  const entries = CATS.map((cat, i) => {
    const angle = -90 + i * arcStep;
    const size = 36 + 50 * ((cat.radius - minimum) / (maximum - minimum)) ** 0.75;
    const [x, y] = point(radius, angle);
    return { cat, angle, size, x, y };
  });
  collectionLayout = entries;
  $('cat-collection').innerHTML = entries
    .map(
      ({ cat, x, y, size }, i) =>
        `<li title="${i + 1}단계 · ${cat.name}" style="left:${x / 4}%;top:${y / 4}%;width:${size / 4}%"><img src="./assets/${cat.file}" alt="${i + 1}단계 ${cat.name}"><span class="cat-level-number">${i + 1}</span></li>`,
    )
    .join('');
  const paths = entries
    .slice(0, -1)
    .map(({ angle }, i) => {
      const [x1, y1] = point(arrowRadius, angle + 7);
      const [x2, y2] = point(arrowRadius, entries[i + 1].angle - 7);
      return `<path d="M ${x1} ${y1} A ${arrowRadius} ${arrowRadius} 0 0 1 ${x2} ${y2}" marker-end="url(#collection-arrowhead)"/>`;
    })
    .join('');
  $('collection-arrows').innerHTML =
    `<defs><marker id="collection-arrowhead" viewBox="0 0 6 6" refX="4.8" refY="3" markerWidth="5" markerHeight="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 6 3 L 0 6" class="arrowhead"/></marker></defs>${paths}`;
}
function positionCollectionLabels() {
  const scale = ($('cat-collection').getBoundingClientRect().width || 400) / 400;
  collectionLayout.forEach(({ angle, size, x, y }, i) => {
    const radians = (angle * Math.PI) / 180,
      dx = Math.cos(radians),
      dy = Math.sin(radians);
    // Keep seven CSS pixels of clear space from the actual visible cat to the
    // 20px badge, including diagonal ears, at every responsive wheel size.
    const points = CAT_OUTLINES[i].points.map(([px, py]) => [
      (px / SPRITE.scale + SPRITE.anchorX - 0.5) * size * scale,
      (py / SPRITE.scale + SPRITE.anchorY - 0.5) * size * scale,
    ]);
    function clearance(distance) {
      const px = dx * distance,
        py = dy * distance;
      let nearest = Infinity,
        inside = false;
      for (let j = 0; j < points.length; j++) {
        const [ax, ay] = points[j],
          [bx, by] = points[(j + 1) % points.length];
        const vx = bx - ax,
          vy = by - ay;
        const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
        nearest = Math.min(nearest, Math.hypot(px - ax - t * vx, py - ay - t * vy));
        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
          inside = !inside;
        }
      }
      return inside ? -nearest : nearest;
    }
    let low = 0,
      high = size * scale + 30;
    for (let j = 0; j < 20; j++) {
      const middle = (low + high) / 2;
      if (clearance(middle) < 17) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const offset = (high / (size * scale)) * 100;
    $('cat-collection').children[i].setAttribute(
      'style',
      `left:${x / 4}%;top:${y / 4}%;width:${size / 4}%;--label-x:${50 + dx * offset}%;--label-y:${50 + dy * offset}%`,
    );
  });
}

function loadCatImages() {
  return new Promise((resolve, reject) => {
    let remaining = CATS.length,
      settled = false;
    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      for (const image of images) {
        image.onload = image.onerror = null;
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    // A request can stall without firing load/error. Leave a usable retry
    // screen instead of waiting forever after the intro watchdog reveals play.
    const timeout = window.setTimeout(
      () => finish(new Error('Cat image loading timed out')),
      15000,
    );
    CATS.forEach((cat, i) => {
      const img = new Image();
      images[i] = img;
      img.onload = () => {
        if (!img.naturalWidth) {
          return finish(new Error(`Invalid cat image: ${cat.file}`));
        }
        if (--remaining === 0) {
          finish();
        }
      };
      img.onerror = () => finish(new Error(`Cat image unavailable: ${cat.file}`));
      img.src = `./assets/${cat.file}`;
    });
  });
}

renderCollection();
updateMute();
updateVolumes();
setSettings(false, false);
setVolumePanel(false);
updateNextPreview();
updateHitboxes();
resize();
requestAnimationFrame(frame);
try {
  if (!window.Matter) {
    throw new Error('Physics engine unavailable');
  }
  game = new CatGame(window.Matter, { seed: createSeed(), onEvent: gameEvent });
  syncSeed();
  updateUI(true);
  window.nyangStartup?.ready();
  await loadCatImages();
  loaded = true;
  $('toast').hidden = true;
  if (intro.active) {
    intro.play(images);
  } else {
    start();
  }
} catch (error) {
  intro.finish();
  $('toast').hidden = true;
  showModal({
    kind: 'error',
    eyebrow: 'LOAD ERROR',
    title: '이미지를 불러오지 못했습니다',
    description: '인터넷 연결을 확인한 뒤<br>다시 불러와 주세요.',
    button: '다시 불러오기',
    action: () => location.reload(),
  });
  console.error('Game loading failed', error);
  window.nyangStartup?.ready();
}
