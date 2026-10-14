import { getTrack, normalizeSelection } from './catalog.js?v=choices-1';

export const RULES = getTrack('coast').rules;

export function createRun(selection) {
  const choice = normalizeSelection(selection), rules = getTrack(choice.trackId).rules;
  return { ...choice, phase: 'ready', force: 0, peak: 0, speed: rules.initialSpeed, distance: 0, elapsed: 0, gates: 0, reason: '', failureTime: 0, paused: false, score: 0 };
}

export function fail(run, reason) { run.phase = 'failed'; run.reason = reason; run.failureTime = 0; }

export function step(run, dt, pressing) {
  if (run.paused) return;
  if (run.phase === 'failed') { run.failureTime += dt; return; }
  if (run.phase !== 'running') return;
  const rules = getTrack(run.trackId).rules;
  run.force = Math.max(0, Math.min(rules.maxForce, run.force + (pressing ? 940 : -1850) * dt));
  run.peak = Math.max(run.peak, run.force);
  // The threshold and motion model are fictional arcade rules.
  if (run.force > rules.limit) { fail(run, 'pedal'); return; }
  run.elapsed += dt;
  const slope = run.distance < rules.bayStart ? rules.acceleration : 0;
  run.speed = Math.max(0, Math.min(140 / 3.6, run.speed + (slope - run.force / rules.limit * 5.2) * dt));
  run.distance += run.speed * dt;
  while (run.gates < rules.gates.length && run.distance >= rules.gates[run.gates].at) {
    if (run.speed * 3.6 > rules.gates[run.gates].speed) { fail(run, 'curve'); return; }
    run.gates++;
  }
  if (run.distance > rules.bayEnd) { fail(run, 'edge'); return; }
  if (run.distance >= rules.bayStart && run.speed <= rules.stopSpeed) {
    run.phase = 'won'; run.speed = 0;
    const center = (rules.bayStart + rules.bayEnd) / 2;
    run.score = Math.round(1000 + Math.max(0, 1612 - run.peak) * .35 + Math.max(0, 45 - Math.abs(center - run.distance)) * 12 + Math.max(0, 55 - run.elapsed) * 15);
  }
}

export function nextTarget(run) {
  const rules = getTrack(run.trackId).rules, gate = rules.gates[run.gates];
  return gate ? { at: gate.at, speed: gate.speed, name: gate.name } : { at: rules.bayStart, speed: 3, name: '避险停车区' };
}
