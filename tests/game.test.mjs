import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, RULES } from '../docs/engine.js';
import { roadPose, steeringAt } from '../docs/scene3d.js';

test('the 3D road follows engine distance, has two bends and a level parking bay', () => {
  const origin = roadPose(0); assert.ok(Math.hypot(origin.x, origin.y, origin.z) < 1e-8); assert.equal(origin.heading, 0);
  assert.equal(roadPose(RULES.gates[0].at).heading, 0);
  assert.ok(roadPose(215).heading > .3);
  assert.ok(roadPose(250).heading > .6);
  assert.ok(roadPose(400).heading < roadPose(350).heading);
  assert.ok(roadPose(420).heading < 0);
  assert.equal(roadPose(RULES.bayStart).y, roadPose(RULES.bayEnd).y);
  for (let distance = 0; distance < RULES.bayEnd; distance++) {
    const a = roadPose(distance), b = roadPose(distance + 1);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) - 1) < 1e-6, `arc distance at ${distance}`);
    const lane = roadPose(distance, 3.35);
    assert.ok(Math.abs(Math.hypot(lane.x - a.x, lane.z - a.z) - 3.35) < 1e-8);
  }
});

test('road headings remain continuous at curve entry and exit, including station interpolation', () => {
  for (const distance of [180, 240, 250, 350, 410, 420, 460]) {
    const a = roadPose(distance - .001), b = roadPose(distance + .001);
    assert.ok(Math.abs(a.heading - b.heading) < .0001);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < .00201);
  }
});

test('front wheels point into both bends for a vehicle facing negative Z', () => {
  // Rotating the -Z forward axis about Y gives X = -sin(angle).
  assert.ok(-Math.sin(steeringAt(215)) > 0, 'right bend steers toward positive X');
  assert.ok(-Math.sin(steeringAt(385)) < 0, 'left bend steers toward negative X');
  assert.ok(Math.abs(steeringAt(450)) < 1e-8);
});

test('both bends and the visible wheel angles are pronounced without folding road edges', () => {
  assert.ok(roadPose(240).heading > .95, 'first bend turns at least 54 degrees');
  assert.ok(roadPose(350).heading - roadPose(410).heading > 1.3, 'second bend turns at least 74 degrees');
  for (const distance of [210, 380]) assert.ok(Math.abs(steeringAt(distance)) > .18, 'wheel angle remains visible from chase view');
  for (let distance = 0; distance <= 560; distance++) {
    const curvature = Math.abs(roadPose(distance + 1).heading - roadPose(distance - 1).heading) / 2;
    assert.ok(curvature * 10 < 1, 'inside shoulder radius remains positive');
    assert.ok(Math.abs(steeringAt(distance)) < .35, 'wheel steering stays below 20 degrees');
  }
});

test('both views share the original force, curve, stop and pause contracts', () => {
  const run = () => Object.assign(createRun(), { phase: 'running' });
  const exact = run(); exact.force = 1612; step(exact, 0, true); assert.equal(exact.phase, 'running');
  const over = run(); over.force = 1612.001; step(over, 0, true); assert.equal(over.reason, 'pedal');
  for (const gate of RULES.gates) {
    const fast = run(); Object.assign(fast, { distance: gate.at - .005, speed: (gate.speed + 1) / 3.6, gates: RULES.gates.indexOf(gate) });
    step(fast, .001, false); assert.equal(fast.reason, 'curve');
    const safe = run(); Object.assign(safe, { distance: gate.at - .005, speed: (gate.speed - 1) / 3.6, gates: RULES.gates.indexOf(gate) });
    step(safe, .001, false); assert.equal(safe.phase, 'running');
  }
  const stopped = run(); Object.assign(stopped, { distance: 480, speed: .2, gates: 2 }); step(stopped, .01, false); assert.equal(stopped.phase, 'won');
  const edge = run(); Object.assign(edge, { distance: 560.01, gates: 2 }); step(edge, .01, false); assert.equal(edge.reason, 'edge');
  const paused = run(); paused.paused = true; const snapshot = structuredClone(paused); step(paused, .05, true); assert.deepEqual(paused, snapshot);
});

test('a safe braking rhythm can still finish at 30, 60 and 120 Hz', () => {
  for (const hz of [30, 60, 120]) {
    const run = Object.assign(createRun(), { phase: 'running' });
    for (let frame = 0; frame < hz * 90 && run.phase === 'running'; frame++) {
      const targetSpeed = run.distance < 250 ? 72 : run.distance < 400 ? 48 : Math.sqrt(Math.max(0, 2 * 2.1 * (505 - run.distance))) * 3.6;
      const targetForce = run.speed * 3.6 > targetSpeed ? 1370 : 300;
      const pressing = run.force < targetForce;
      for (let sub = 0; sub < 120 / hz; sub++) step(run, 1 / 120, pressing);
    }
    assert.equal(run.phase, 'won', `${hz} Hz: ${run.reason}, distance ${run.distance}`);
    assert.ok(run.distance >= 460 && run.distance <= 560);
    assert.ok(run.peak <= 1612);
  }
});
