import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// Execute only the document's independent startup guard: the game module is
// deliberately unavailable, as on a failed or stalled script request.
async function shell({ parsed = true } = {}) {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const listeners = new Map(),
    timers = new Map(),
    elements = new Map();
  let timerId = 0,
    reloaded = false,
    mounted = parsed;
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(id, {
      hidden: id === 'startup-error',
      inert: id === 'game-layout',
      focus() {
        this.focused = true;
      },
    });
  }
  const eventTarget = {
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((item) => item !== listener),
      );
    },
  };
  const fire = (type, event = {}) => {
    for (const callback of [...(listeners.get(type) || [])]) {
      callback(event);
    }
  };
  const document = {
    ...eventTarget,
    getElementById: (id) => (mounted ? elements.get(id) : null),
    documentElement: { classList: { remove() {} } },
  };
  const window = {
    ...eventTarget,
    setTimeout(callback, delay) {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const script = /<script id="startup-guard">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (script) {
    vm.runInNewContext(script, {
      window,
      document,
      location: {
        reload: () => {
          reloaded = true;
        },
      },
    });
  }
  return {
    window,
    elements,
    timers,
    fire,
    get: (id) => elements.get(id),
    reloaded: () => reloaded,
    parse() {
      mounted = true;
      fire('readystatechange');
    },
    failScript() {
      fire('error', {
        target: { tagName: 'SCRIPT', hasAttribute: (name) => name === 'data-game-startup' },
      });
    },
    expire() {
      for (const { callback } of [...timers.values()]) {
        callback();
      }
    },
  };
}

test('a failed game script has a retry screen even when the app module never executes', async () => {
  const h = await shell();
  h.failScript();
  assert.equal(h.get('startup-error')?.hidden, false);
  assert.equal(h.get('intro').hidden, true);
  assert.equal(h.get('game-layout').inert, true);
  h.get('startup-retry').onclick();
  assert.equal(h.reloaded(), true);
});

test('a stalled startup has a deadline and cannot silently start behind its retry screen', async () => {
  const h = await shell();
  h.expire();
  assert.equal(h.get('startup-error')?.hidden, false);
  assert.equal(h.window.nyangStartup.ready(), false);
  assert.equal(h.window.nyangStartup.failed, true);
});

test('a script failure before body parsing is shown once the shell exists', async () => {
  const h = await shell({ parsed: false });
  h.failScript();
  h.parse();
  assert.equal(h.get('startup-error')?.hidden, false);
});

test('successful startup clears its watchdog and decoration failures do not interrupt play', async () => {
  const h = await shell();
  assert.ok(h.window.nyangStartup, 'a startup guard must exist independently of app.js');
  assert.equal(h.window.nyangStartup.ready(), true);
  assert.equal(h.timers.size, 0);
  h.fire('error', { target: { tagName: 'IMG' } });
  h.expire();
  assert.equal(h.get('startup-error').hidden, true);
  assert.equal(h.window.nyangStartup.failed, false);
});

test('an app arriving after startup failure cannot initialize behind the retry screen', async () => {
  const source = (await readFile(new URL('../dist/app.js', import.meta.url), 'utf8')).replace(
    /^import[^\n]+\n/gm,
    '',
  );
  const sandbox = {
    window: { nyangStartup: { failed: true } },
    document: {
      getElementById() {
        throw new Error('Late app touched game DOM');
      },
    },
  };
  await assert.rejects(
    vm.runInNewContext(`(async () => { ${source} })()`, sandbox),
    /startup failed/,
  );
});

test('unavailable canvas rendering rejects startup before the game is activated', async () => {
  const source = (await readFile(new URL('../dist/app.js', import.meta.url), 'utf8')).replace(
    /^import[^\n]+\n/gm,
    '',
  );
  let ready = false;
  const sandbox = {
    window: {
      nyangStartup: {
        ready() {
          ready = true;
        },
      },
    },
    document: {
      getElementById() {
        return { getContext: () => null };
      },
    },
  };
  await assert.rejects(
    vm.runInNewContext(`(async () => { ${source} })()`, sandbox),
    /Canvas rendering unavailable/,
  );
  assert.equal(ready, false);
});
