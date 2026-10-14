export const RULES = Object.freeze({ limit: 1612, maxForce: 2100, initialSpeed: 108 / 3.6, bayStart: 460, bayEnd: 560, stopSpeed: 3 / 3.6, gates: [{ at: 180, speed: 80, name: '第一弯道' }, { at: 350, speed: 55, name: '第二弯道' }] });

export function createRun() {
  return { phase: 'ready', force: 0, peak: 0, speed: RULES.initialSpeed, distance: 0, elapsed: 0, gates: 0, reason: '', failureTime: 0, paused: false, score: 0 };
}

export function fail(run, reason) {
  run.phase = 'failed'; run.reason = reason; run.failureTime = 0;
}

export function step(run, dt, pressing) {
  if (run.paused) return;
  if (run.phase === 'failed') { run.failureTime += dt; return; }
  if (run.phase !== 'running') return;
  run.force = Math.max(0, Math.min(RULES.maxForce, run.force + (pressing ? 940 : -1850) * dt));
  run.peak = Math.max(run.peak, run.force);
  // The threshold and motion model are fictional arcade rules.
  if (run.force > RULES.limit) { fail(run, 'pedal'); return; }
  run.elapsed += dt;
  const slope = run.distance < RULES.bayStart ? 1.05 : 0;
  run.speed = Math.max(0, Math.min(140 / 3.6, run.speed + (slope - run.force / RULES.limit * 5.2) * dt));
  run.distance += run.speed * dt;
  while (run.gates < RULES.gates.length && run.distance >= RULES.gates[run.gates].at) {
    if (run.speed * 3.6 > RULES.gates[run.gates].speed) { fail(run, 'curve'); return; }
    run.gates++;
  }
  if (run.distance > RULES.bayEnd) { fail(run, 'edge'); return; }
  if (run.distance >= RULES.bayStart && run.speed <= RULES.stopSpeed) {
    run.phase = 'won'; run.speed = 0;
    run.score = Math.round(1000 + Math.max(0, 1612 - run.peak) * .35 + Math.max(0, 45 - Math.abs(510 - run.distance)) * 12 + Math.max(0, 55 - run.elapsed) * 15);
  }
}

export function nextTarget(run) {
  const gate = RULES.gates[run.gates];
  return gate ? { at: gate.at, speed: gate.speed, name: gate.name } : { at: RULES.bayStart, speed: 3, name: '避险停车区' };
}
