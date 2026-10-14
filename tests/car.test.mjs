import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../docs/vendor/three.module.js';
import { createCar } from '../docs/car3d.js';
import { steeringAt } from '../docs/scene3d.js';

test('car glass and crowned hood remain outside the body, and actual wheels and lean follow steering', () => {
  // Canvas is only used for local plate/halo/shadow textures; no renderer is mocked.
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {}, createRadialGradient: () => ({ addColorStop() {} }) }) }) };
  let car;
  try { car = createCar(); } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  car.root.updateMatrixWorld(true);
  const bodyMeshes = []; car.body.traverse(item => { if (item.isMesh) bodyMeshes.push(item); });
  const probes = [
    ['windshield', [0, 1.6, -8], [0, 0, 1]],
    ['rearWindow', [0, 1.55, 8], [0, 0, -1]],
    ['hood', [0, 5, -2], [0, -1, 0]],
    ['sunroof', [0, 5, 1], [0, -1, 0]],
    ['sideWindow', [4, 1.6, .6], [-1, 0, 0]]
  ];
  for (const [name, origin, direction] of probes) {
    const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
    const hits = ray.intersectObjects(bodyMeshes, false);
    assert.equal(hits[0]?.object.name, name, `${name} must be visible rather than buried in paint`);
  }
  car.root.traverse(item => {
    if (!item.isMesh) return;
    for (const key of ['position', 'normal']) {
      const attr = item.geometry.getAttribute(key);
      assert.ok(attr?.count > 0);
      assert.ok(Array.from(attr.array).every(Number.isFinite), `finite ${key} for ${item.name}`);
    }
  });
  const wheels = car.root.children.filter(item => item.name === 'frontWheel'); assert.equal(wheels.length, 2);
  for (const distance of [210, 380]) {
    const steer = steeringAt(distance); car.update(distance, 900, steer, 20);
    for (const wheel of wheels) assert.ok(Math.abs(wheel.rotation.y - (wheel.position.x < 0 ? Math.PI : 0) - steer) < 1e-8);
    assert.ok(car.body.rotation.z * steer < 0, 'suspension leans outward in each bend');
    assert.ok(Math.abs(car.body.rotation.z) <= .055);
  }
  car.update(380, 0, steeringAt(380), 0); assert.ok(car.body.rotation.z === 0);
});
