import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { RULES, createRun, step, nextTarget } from '../docs/engine.js';
import { VEHICLES, TRACKS, getVehicle, getTrack, normalizeSelection } from '../docs/catalog.js';

test('releasing Space always releases the brake after focus moves to a view button', () => {
  const elements = new Map(), handlers = new Map(), saved = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { style: {}, classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); }
      }, setAttribute() {}, append() {}, focus() {}, addEventListener() {}, insertAdjacentHTML() {},
      getBoundingClientRect() { return { width: 1000, height: 490 }; },
      getContext() { return { setTransform() {} }; }, querySelector() { return element('start'); }, querySelectorAll() { return []; }
      });
    }
    return elements.get(id);
  };
  element('world').parentElement = element('scene');
  const context = vm.createContext({ RULES, createRun, step, nextTarget, VEHICLES, TRACKS, getVehicle, getTrack, normalizeSelection,
    document: { getElementById: element, addEventListener() {} },
    window: { addEventListener(name, handler) { handlers.set(name, handler); } },
    matchMedia() { return { matches: false }; }, ResizeObserver: class { observe() {} },
    localStorage: { getItem() { return null; }, setItem(key,value) { saved.set(key,value); } }, devicePixelRatio: 1,
    requestAnimationFrame() {}, console: { warn() {} }
  });
  // Run the real game input wiring. DOM sizing and the render loop stay inert.
  const source = readFileSync(new URL('../docs/game.js', import.meta.url), 'utf8').replace(/^import .*?;\n/gm, '');
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
  for (const tagName of ['SELECT', 'BUTTON', 'INPUT']) {
    let cancelled = false;
    handlers.get('keydown')({ code: 'Space', repeat: false, target: { tagName }, preventDefault() { cancelled = true; } });
    assert.equal(cancelled, false, `${tagName} keeps native Space behavior`);
    assert.equal(element('pedal').classList.contains('pressed'), false, 'garage controls do not brake or restart');
  }
  vm.runInContext("requestedView = '2d'; run.distance = 123; run.force = 600;", context);
  const original = vm.runInContext('JSON.stringify(run)', context);
  element('vehicleChoice').value = 'suv'; element('trackChoice').value = 'mountain';
  vm.runInContext('openGarage()', context);
  assert.equal(vm.runInContext('run.paused',context), true);
  assert.equal(vm.runInContext('run.trackId',context), 'coast', 'preview does not change current challenge');
  assert.equal(vm.runInContext('previewRun.trackId',context), 'mountain');
  vm.runInContext('closeGarage()',context);
  assert.equal(vm.runInContext('JSON.stringify(run)',context), original, 'cancel restores the exact previous run');
  vm.runInContext('openGarage(); pause(); resume();',context);
  assert.equal(vm.runInContext('previewRun',context), null, 'pause outside the garage cannot leave a stale preview over a moving run');
  element('vehicleChoice').value = 'sport'; element('trackChoice').value = 'city';
  vm.runInContext('openGarage()',context); element('applyChoice').onclick();
  assert.equal(vm.runInContext('run.trackId',context), 'city');
  assert.equal(vm.runInContext('run.vehicleId',context), 'sport');
  assert.equal(vm.runInContext('run.distance',context), 0);
  assert.equal(vm.runInContext('run.phase',context), 'running');
  assert.deepEqual(JSON.parse(saved.get('brakepoint-selection')), { vehicleId:'sport',trackId:'city' });
  vm.runInContext("draw = () => {}; run.phase = 'won'; run.score = 2345; resultShown = false; openGarage(); frame(1000);",context);
  assert.equal(vm.runInContext('overlayKind',context), 'garage', 'automatic settlement does not replace an open choice window');
  assert.equal(saved.get('brakepoint-best-city'), '2345', 'a completed score survives applying another configuration before the result panel');
});
