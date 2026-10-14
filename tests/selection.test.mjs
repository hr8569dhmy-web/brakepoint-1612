import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLES, TRACKS, normalizeSelection } from '../docs/catalog.js';
import { createRun, step, nextTarget } from '../docs/engine.js';
import { roadPose, steeringAt } from '../docs/scene3d.js';

function pilot(trackId, vehicleId, hz) {
  const run = createRun({ trackId, vehicleId }); run.phase = 'running';
  const rules = TRACKS.find(track => track.id === trackId).rules, center = (rules.bayStart + rules.bayEnd) / 2;
  for (let frame = 0; frame < hz * 100 && run.phase === 'running'; frame++) {
    const gate = rules.gates[run.gates];
    const targetSpeed = gate ? gate.speed - 6 : Math.sqrt(Math.max(0, 4.2 * (center - run.distance))) * 3.6;
    const pressing = run.force < (run.speed * 3.6 > targetSpeed ? 1370 : 300);
    for (let sub = 0; sub < 120 / hz; sub++) step(run, 1 / 120, pressing);
  }
  return run;
}

test('all nine vehicle/course choices reach their own parking bay at common frame rates', () => {
  for (const track of TRACKS) for (const hz of [30, 60, 120]) {
    let reference;
    for (const vehicle of VEHICLES) {
      const run = pilot(track.id, vehicle.id, hz);
      assert.equal(run.phase, 'won', `${track.id}/${vehicle.id}/${hz}: ${run.reason} at ${run.distance}`);
      assert.ok(run.distance >= track.rules.bayStart && run.distance <= track.rules.bayEnd);
      assert.equal(run.gates, track.rules.gates.length);
      assert.ok(run.peak <= 1612);
      const result = [run.distance, run.elapsed, run.peak, run.score];
      if (reference) assert.deepEqual(result, reference, 'vehicle appearance does not change brake physics'); else reference = result;
    }
  }
});

test('selected track controls limits, targets, road arc length and curve directions', () => {
  for (const track of TRACKS) {
    for (const [index, gate] of track.rules.gates.entries()) {
      const fast = createRun({ trackId: track.id }); Object.assign(fast, { phase: 'running', gates: index, distance: gate.at - .005, speed: (gate.speed + 1) / 3.6 });
      assert.equal(nextTarget(fast).at, gate.at); step(fast, .001, false); assert.equal(fast.reason, 'curve');
      const safe = createRun({ trackId: track.id }); Object.assign(safe, { phase: 'running', gates: index, distance: gate.at - .005, speed: (gate.speed - 1) / 3.6 });
      step(safe, .001, false); assert.equal(safe.phase, 'running'); assert.equal(safe.gates, index + 1);
      const bend = track.bends[index]; assert.ok(steeringAt(bend.at + bend.length / 2, track.id) * bend.angle < 0);
    }
    for (let distance = 0; distance < track.rules.bayEnd; distance++) {
      const a = roadPose(distance, 0, track.id), b = roadPose(distance + 1, 0, track.id);
      assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) - 1) < 1e-6);
      const curve = Math.abs(roadPose(distance + 1, 0, track.id).heading - roadPose(distance - 1, 0, track.id).heading) / 2;
      assert.ok(curve * 10 < 1, 'inside shoulder does not fold');
    }
    assert.equal(roadPose(track.rules.bayStart, 0, track.id).y, roadPose(track.rules.bayEnd, 0, track.id).y);
    const last = createRun({ trackId: track.id }); last.gates = track.rules.gates.length; assert.equal(nextTarget(last).at, track.rules.bayStart);
  }
});

test('unknown or corrupt saved choices safely resolve to the classic vehicle/course', () => {
  for (const input of [null, undefined, 5, 'bad', {}, { vehicleId: '<script>', trackId: 'missing' }]) assert.deepEqual(normalizeSelection(input), { vehicleId: 'mpv', trackId: 'coast' });
});
