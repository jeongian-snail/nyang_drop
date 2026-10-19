// Cat rain, paw trail, and title; the app starts play only after onFinish.
export function createIntro({
  overlay,
  canvas,
  skip,
  content,
  decor,
  page,
  reducedMotion = false,
  onFinish = () => {},
  view = window,
}) {
  const ctx = canvas.getContext('2d');
  let finished = false,
    started = false,
    frameId = 0,
    startedAt = null;
  let width = 0,
    height = 0,
    ratio = 1,
    cats = [],
    images = [];
  let pawsVisible = false,
    titleVisible = false,
    revealing = false,
    pileDrawn = false;
  const layers = [content, decor];
  const watchdog = view.setTimeout(finish, 10000);

  function reveal() {
    if (revealing) {
      return;
    }
    revealing = true;
    layers.forEach((layer) => layer.classList.remove('intro-concealed'));
    overlay.classList.add('is-leaving');
  }
  function finish() {
    if (finished) {
      return;
    }
    finished = true;
    reveal();
    overlay.hidden = true;
    content.inert = false;
    page.classList.remove('intro-running');
    view.cancelAnimationFrame(frameId);
    view.clearTimeout(watchdog);
    view.removeEventListener('resize', resize);
    view.removeEventListener('keydown', keydown);
    skip.removeEventListener('click', finish);
    cats = [];
    images = [];
    canvas.width = canvas.height = 1;
    onFinish();
  }
  function keydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    }
    if (event.key === 'Tab' && !finished) {
      event.preventDefault();
      skip.focus({ preventScroll: true });
    }
  }
  function resize() {
    width = Math.max(1, view.innerWidth);
    height = Math.max(1, view.innerHeight);
    ratio = Math.min(view.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    pileDrawn = false;
    // Dense, staggered rows cover phones and wide screens with the same assets.
    const tile = Math.max(100, Math.min(190, Math.min(width, height) * 0.29));
    const step = Math.max(tile * 0.57, Math.sqrt((width * height) / 250));
    const columns = Math.ceil(width / step) + 2,
      rows = Math.ceil(height / step) + 2;
    cats = [];
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = 0; col < columns; col++) {
        const depth = (rows - 1 - row) / Math.max(1, rows - 1);
        cats.push({
          image: (row * 3 + col * 7) % Math.max(1, images.length),
          x: (col - 0.5 + (row % 2) * 0.5) * step + (Math.random() - 0.5) * step * 0.18,
          y: (row - 0.4) * step,
          size: step * (1.95 + Math.random() * 0.2),
          drift: (Math.random() - 0.5) * step,
          angle: (Math.random() - 0.5) * 1.1,
          spin: (Math.random() - 0.5) * 2.8,
          delay: depth * 760 + Math.random() * 190,
          duration: 680 + Math.random() * 170,
        });
      }
    }
  }
  function draw(elapsed) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const cat of cats) {
      const p = Math.min(1, Math.max(0, (elapsed - cat.delay) / cat.duration));
      if (!p) {
        continue;
      }
      const image = images[cat.image];
      if (!image?.complete || !image.naturalWidth) {
        continue;
      }
      const fall = Math.min(1, p / 0.83) ** 2;
      const bounce = p > 0.83 ? Math.sin(((p - 0.83) / 0.17) * Math.PI) * cat.size * 0.07 : 0;
      const y = -cat.size + (cat.y + cat.size) * fall - bounce;
      ctx.save();
      ctx.translate(cat.x + cat.drift * (1 - p), y);
      ctx.rotate(cat.angle + cat.spin * (1 - p));
      ctx.drawImage(image, -cat.size / 2, -cat.size / 2, cat.size, cat.size);
      ctx.restore();
    }
  }
  function frame(time) {
    if (finished) {
      return;
    }
    startedAt ??= time;
    const elapsed = time - startedAt;
    // Keep the settled pile on the canvas while CSS softly blurs and fades it.
    // Redraw only after a resize, instead of repainting every face during the fade.
    if (!pileDrawn) {
      draw(reducedMotion ? 1900 : elapsed);
      pileDrawn = reducedMotion || elapsed >= 1900;
    }
    if (reducedMotion) {
      if (elapsed >= 1000) {
        return finish();
      }
    } else {
      if (elapsed >= 1900 && !pawsVisible) {
        pawsVisible = true;
        overlay.classList.add('is-paws');
      }
      if (elapsed >= 3150 && !titleVisible) {
        titleVisible = true;
        overlay.classList.add('is-title');
      }
      if (elapsed >= 4450) {
        reveal();
      }
      // Match the 1.6s exit transition before enabling game input.
      if (elapsed >= 6050) {
        return finish();
      }
    }
    frameId = view.requestAnimationFrame(frame);
  }
  function play(loadedImages) {
    if (finished || started) {
      return;
    }
    started = true;
    images = loadedImages.filter((image) => image.complete && image.naturalWidth);
    if (!ctx || !images.length) {
      return finish();
    }
    if (reducedMotion) {
      overlay.classList.add('is-reduced', 'is-title');
    }
    resize();
    frameId = view.requestAnimationFrame(frame);
  }
  skip.addEventListener('click', finish);
  view.addEventListener('keydown', keydown);
  view.addEventListener('resize', resize);
  skip.focus({ preventScroll: true });
  return {
    play,
    finish,
    get active() {
      return !finished;
    },
  };
}
