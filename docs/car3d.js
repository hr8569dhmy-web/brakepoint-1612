import * as THREE from './vendor/three.module.js';

// Independently built MPV geometry; no assets or code from the reference game.
export function createCar() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: '#111923', metalness: .65, roughness: .25, clearcoat: 1 });
  const roof = new THREE.MeshPhysicalMaterial({ color: '#c9b896', metalness: .65, roughness: .28, clearcoat: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#09131d', metalness: .3, roughness: .08, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#c9d4d6', metalness: .95, roughness: .18 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#101215', roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#222832', metalness: .5, roughness: .55 });
  const headlight = new THREE.MeshStandardMaterial({ color: '#e8f5ff', emissive: '#cce8ff', emissiveIntensity: 3 });
  const taillight = new THREE.MeshStandardMaterial({ color: '#851c24', emissive: '#ff273a', emissiveIntensity: .7 });

  function mesh(geometry, material, parent = body) {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  function box(w, h, d, x, y, z, material, parent = body) {
    const item = mesh(new THREE.BoxGeometry(w, h, d), material, parent);
    item.position.set(x, y, z); return item;
  }
  function profile(points, breadth, material, bevel = .06) {
    const shape = new THREE.Shape();
    points.forEach(([z, y], index) => index ? shape.lineTo(z, y) : shape.moveTo(z, y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: breadth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, steps: 1 });
    geometry.translate(0, 0, -(breadth - bevel * 2) / 2); geometry.rotateY(-Math.PI / 2);
    return mesh(geometry, material);
  }

  const lower = new THREE.Shape();
  lower.moveTo(-2.68, .34); lower.lineTo(-2.24, .34);
  for (const center of [-1.72, 1.66]) {
    lower.absarc(center, .43, .53, Math.PI + .17, -.17, true);
    lower.lineTo(center < 0 ? 1.14 : 2.64, .34);
  }
  lower.lineTo(2.7, 1.12); lower.lineTo(-1.28, 1.12);
  lower.quadraticCurveTo(-2.45, 1.09, -2.7, .83); lower.closePath();
  const lowerGeometry = new THREE.ExtrudeGeometry(lower, { depth: 1.96, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 4, curveSegments: 20 });
  lowerGeometry.translate(0, 0, -.98); lowerGeometry.rotateY(-Math.PI / 2); mesh(lowerGeometry, paint);
  profile([[-1.35, 1.12], [-.5, 1.94], [-.28, 2.02], [2.28, 2.02], [2.6, 1.85], [2.62, 1.12]], 1.96, roof);
  profile([[-2.7, .87], [-2.65, 1.01], [-1.31, 1.18], [-1.2, 1.1]], 2.03, roof, .025);
  box(1.82, .12, 4.95, 0, .27, .05, dark);
  box(1.43, .025, 2.02, 0, 2.09, .85, glass);

  const windshield = mesh(new THREE.PlaneGeometry(1.72, .94), glass);
  windshield.position.set(0, 1.61, -.98); windshield.rotation.set(.81, Math.PI, 0);
  const rearWindow = mesh(new THREE.PlaneGeometry(1.7, .69), glass);
  rearWindow.position.set(0, 1.56, 2.71);
  for (const side of [-1, 1]) {
    for (const [front, back] of [[-1.03, -.17], [.0, 1.22], [1.37, 2.32]]) {
      const topFront = front < -.5 ? -.5 : front;
      const shape = new THREE.Shape();
      shape.moveTo(front, 1.23); shape.lineTo(topFront, 1.9); shape.lineTo(back, 1.9); shape.lineTo(back, 1.23); shape.closePath();
      const windowMesh = mesh(new THREE.ShapeGeometry(shape), glass);
      windowMesh.rotation.y = side * Math.PI / 2; windowMesh.position.x = side * 1.043;
      // Local horizontal coordinates become vehicle length on the two sides.
      if (side > 0) windowMesh.scale.x = -1;
    }
    box(.022, .035, 4.1, side * 1.058, 1.18, .48, chrome);
    box(.028, .025, 4.73, side * 1.06, .42, .12, chrome);
    for (const z of [-.18, 1.22]) {
      box(.02, .75, .018, side * 1.06, .78, z, dark);
      box(.055, .035, .24, side * 1.085, 1.06, z - .3, chrome);
    }
    const mirror = mesh(new THREE.SphereGeometry(1, 16, 10), roof);
    mirror.scale.set(.2, .1, .18); mirror.position.set(side * 1.17, 1.24, -.94);
    box(.035, .025, .28, side * 1.17, 1.26, -.96, headlight);
    box(.035, .036, 2.55, side * .72, 2.12, .76, chrome);
    box(.085, .38, .035, side * .9, .76, -2.79, headlight);
    box(.085, .45, .035, side * .93, .96, 2.79, taillight);
  }
  box(1.73, .045, .045, 0, 1.02, -2.79, headlight);
  box(1.65, .43, .035, 0, .71, -2.77, dark);
  for (let index = 0; index < 15; index++) box(.013, .39, .025, -.75 + index * .107, .71, -2.8, chrome);
  box(1.8, .035, .04, 0, .38, -2.76, chrome);
  box(1.73, .035, .04, 0, 1.19, 2.78, taillight);

  const plateCanvas = document.createElement('canvas'); plateCanvas.width = 256; plateCanvas.height = 80;
  const plateContext = plateCanvas.getContext('2d');
  plateContext.fillStyle = '#afd9c0'; plateContext.fillRect(0, 0, 256, 80);
  plateContext.fillStyle = '#16352e'; plateContext.font = 'bold 32px sans-serif'; plateContext.textAlign = 'center'; plateContext.fillText('NIGHT 1612', 128, 53);
  const plateTexture = new THREE.CanvasTexture(plateCanvas); plateTexture.colorSpace = THREE.SRGBColorSpace;
  const plateMaterial = new THREE.MeshStandardMaterial({ map: plateTexture, roughness: .5 });
  for (const front of [true, false]) {
    const plate = mesh(new THREE.PlaneGeometry(.48, .15), plateMaterial);
    plate.position.set(0, front ? .4 : .7, front ? -2.8 : 2.8); if (front) plate.rotation.y = Math.PI;
  }

  const wheels = [], steering = [];
  for (const z of [-1.72, 1.66]) for (const side of [-1, 1]) {
    const holder = new THREE.Group(), spin = new THREE.Group(); holder.position.set(side * 1, .43, z); holder.add(spin); root.add(holder);
    if (side < 0) holder.rotation.y = Math.PI;
    const tire = mesh(new THREE.TorusGeometry(.32, .12, 12, 40), rubber, spin); tire.rotation.y = Math.PI / 2;
    const rim = mesh(new THREE.CylinderGeometry(.285, .285, .11, 40), dark, spin); rim.rotation.z = Math.PI / 2;
    const ring = mesh(new THREE.TorusGeometry(.282, .015, 8, 40), chrome, spin); ring.rotation.y = Math.PI / 2; ring.position.x = .115;
    const hub = mesh(new THREE.CylinderGeometry(.072, .072, .04, 24), chrome, spin); hub.rotation.z = Math.PI / 2; hub.position.x = .12;
    const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(.018, .23, .015), chrome, 16), transform = new THREE.Object3D();
    for (let index = 0; index < 16; index++) {
      const angle = index * Math.PI / 8; transform.position.set(.12, Math.cos(angle) * .16, Math.sin(angle) * .16); transform.rotation.x = angle; transform.updateMatrix(); spokes.setMatrixAt(index, transform.matrix);
    }
    spokes.castShadow = true; spin.add(spokes); wheels.push({ spin, side });
    if (z < 0) steering.push({ holder, side });
  }
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d'), gradient = shadowContext.createRadialGradient(32, 32, 5, 32, 32, 32);
  gradient.addColorStop(0, '#000b'); gradient.addColorStop(1, '#0000'); shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015; root.add(shadow);

  return { root, body, update(distance, force, steer) {
    taillight.emissiveIntensity = force > 100 ? 4 : .7;
    for (const wheel of wheels) wheel.spin.rotation.x = -distance / .44 * wheel.side;
    for (const wheel of steering) wheel.holder.rotation.y = (wheel.side < 0 ? Math.PI : 0) + steer;
    body.rotation.x = -Math.min(.025, force / 1612 * .025);
  } };
}
