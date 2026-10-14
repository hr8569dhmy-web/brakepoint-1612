import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { RULES, createRun, step, nextTarget } from '../docs/engine.js';

test('releasing Space always releases the brake after focus moves to a view button', () => {
  const elements = new Map(), handlers = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { style: {}, classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); }
      }, setAttribute() {}, append() {}, focus() {}, addEventListener() {},
      getBoundingClientRect() { return { width: 1000, height: 490 }; },
      getContext() { return { setTransform() {} }; }, querySelector() { return element('start'); }, querySelectorAll() { return []; }
      });
    }
    return elements.get(id);
  };
  element('world').parentElement = element('scene');
  const context = vm.createContext({ RULES, createRun, step, nextTarget,
    document: { getElementById: element, addEventListener() {} },
    window: { addEventListener(name, handler) { handlers.set(name, handler); } },
    matchMedia() { return { matches: false }; }, ResizeObserver: class { observe() {} },
    localStorage: { getItem() { return null; } }, devicePixelRatio: 1,
    requestAnimationFrame() {}, console: { warn() {} }
  });
  // Run the real game input wiring. DOM sizing and the render loop stay inert.
  const source = readFileSync(new URL('../docs/game.js', import.meta.url), 'utf8').replace(/^import .*?;\n/, '');
  vm.runInContext(source, context, { importModuleDynamically: () => Promise.reject(new Error('renderer not used in keyboard test')) });
  vm.runInContext('start()', context);
  for (const target of [element('view2d'), element('view3d'), element('pedal')]) {
    handlers.get('keydown')({ code: 'Space', repeat: false, target: element('pedal'), preventDefault() {} });
    assert.ok(element('pedal').classList.contains('pressed'), 'key press starts braking');
    let cancelled = false;
    handlers.get('keyup')({ code: 'Space', target, preventDefault() { cancelled = true; } });
    assert.equal(element('pedal').classList.contains('pressed'), false, 'key release ends braking regardless of current focus');
    assert.equal(cancelled, target === element('pedal'), 'view buttons retain their native Space activation');
  }
});
