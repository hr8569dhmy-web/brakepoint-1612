import * as THREE from './vendor/three.module.js';

// Independently built MPV geometry; no assets or code from the reference game.
export function createCar() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: '#0b101a', metalness: .82, roughness: .19, clearcoat: 1, clearcoatRoughness: .12 });
  const roof = new THREE.MeshPhysicalMaterial({ color: '#d2bd96', metalness: .72, roughness: .24, clearcoat: 1, clearcoatRoughness: .16 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#101c29', metalness: .18, roughness: .07, clearcoat: 1, side: THREE.DoubleSide });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d4d8da', metalness: 1, roughness: .14 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#0c0f13', roughness: .92 });
  const dark = new THREE.MeshStandardMaterial({ color: '#171d25', metalness: .55, roughness: .4 });
  const headlight = new THREE.MeshStandardMaterial({ color: '#f4f7ff', emissive: '#d6eaff', emissiveIntensity: 5, toneMapped: false });
  const taillight = new THREE.MeshStandardMaterial({ color: '#961c26', emissive: '#ff273a', emissiveIntensity: .8, toneMapped: false });

  function mesh(geometry, material, parent = body) {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  function box(w, h, d, x, y, z, material, parent = body) {
    const item = mesh(new THREE.BoxGeometry(w, h, d), material, parent);
    item.position.set(x, y, z); return item;
  }
  function profile(shape, breadth, material, bevel = .08) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: breadth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 6, curveSegments: 24, steps: 1 });
    geometry.translate(0, 0, -(breadth - bevel * 2) / 2); geometry.rotateY(-Math.PI / 2);
    return mesh(geometry, material);
  }
  function trim(points, radius, material = chrome, parent = body) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(20, points.length * 2), radius, 6, false), material, parent);
  }
  const cabinWidth = y => 1.04 - .13 * THREE.MathUtils.smoothstep(y, 1.25, 2.08);

  const lower = new THREE.Shape();
  lower.moveTo(-2.64, .34); lower.lineTo(-2.24, .34);
  for (const center of [-1.72, 1.66]) {
    lower.absarc(center, .43, .54, Math.PI + .17, -.17, true);
    lower.lineTo(center < 0 ? 1.12 : 2.55, .34);
  }
  lower.quadraticCurveTo(2.74, .38, 2.67, 1.08); lower.quadraticCurveTo(2.3, 1.2, 1.9, 1.18);
  lower.lineTo(-1.26, 1.1); lower.quadraticCurveTo(-2.45, 1.02, -2.68, .91);
  lower.quadraticCurveTo(-2.8, .6, -2.64, .34); lower.closePath();
  profile(lower, 2.06, paint, .085).name = 'lowerBody';

  const cabin = new THREE.Shape();
  cabin.moveTo(-1.35, 1.13); cabin.lineTo(-.61, 1.92);
  cabin.quadraticCurveTo(-.46, 2.1, -.16, 2.105); cabin.quadraticCurveTo(1.25, 2.14, 2.16, 2.08);
  cabin.quadraticCurveTo(2.57, 2.02, 2.61, 1.75); cabin.lineTo(2.64, 1.13); cabin.closePath();
  const upper = profile(cabin, 2.08, roof, .09); upper.name = 'cabin';
  const vertices = upper.geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) vertices.setX(i, vertices.getX(i) * cabinWidth(vertices.getY(i)) / 1.04);
  upper.geometry.computeVertexNormals();

  // Crown the hood across its width and round its leading edge.
  const hoodPositions = [], hoodIndices = [], rows = 14, columns = 24;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, z = -2.68 + t * 1.4, width = .93 + .11 * Math.sin(t * Math.PI / 2);
    for (let col = 0; col <= columns; col++) {
      const u = col / columns * 2 - 1;
      hoodPositions.push(u * width, 1.09 + .17 * t + .09 * (1 - u * u) - .035 * Math.exp(-t * 12), z);
      if (row < rows && col < columns) { const a = row * (columns + 1) + col; hoodIndices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2); }
    }
  }
  const hoodGeometry = new THREE.BufferGeometry(); hoodGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hoodPositions, 3)); hoodGeometry.setIndex(hoodIndices); hoodGeometry.computeVertexNormals();
  mesh(hoodGeometry, roof).name = 'hood';
  box(1.79, .09, 4.97, 0, .27, .04, dark);

  function glassPanel(shape, positionFor, name) {
    const geometry = new THREE.ShapeGeometry(shape, 24), positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) { const p = positionFor(positions.getX(i), positions.getY(i)); positions.setXYZ(i, p.x, p.y, p.z); }
    geometry.computeVertexNormals(); const panel = mesh(geometry, glass); panel.name = name;
    trim(shape.getPoints(36).map(p => positionFor(p.x, p.y)), .012);
    return panel;
  }
  const wind = new THREE.Shape();
  wind.moveTo(-.81, 0); wind.quadraticCurveTo(-.89, .01, -.85, .1); wind.lineTo(-.73, .77);
  wind.quadraticCurveTo(-.71, .85, -.62, .85); wind.lineTo(.62, .85);
  wind.quadraticCurveTo(.71, .85, .73, .77); wind.lineTo(.85, .1); wind.quadraticCurveTo(.89, .01, .81, 0); wind.closePath();
  glassPanel(wind, (x, t) => { const rise = t * .86; return new THREE.Vector3(x, 1.23 + rise, -1.407 + rise * .96 - .018 * (1 - (x / .9) ** 2)); }, 'windshield');
  for (const side of [-1, 1]) trim([new THREE.Vector3(side * .12, 1.245, -1.421), new THREE.Vector3(side * .7, 1.26, -1.398)], .014, dark);

  const rear = new THREE.Shape();
  rear.moveTo(-.8, 0); rear.quadraticCurveTo(-.84, 0, -.84, .07); rear.lineTo(-.78, .57);
  rear.quadraticCurveTo(-.78, .66, -.68, .66); rear.lineTo(.68, .66); rear.quadraticCurveTo(.78, .66, .78, .57);
  rear.lineTo(.84, .07); rear.quadraticCurveTo(.84, 0, .8, 0); rear.closePath();
  glassPanel(rear, (x, y) => new THREE.Vector3(x, 1.25 + y, 2.775 - y * .12), 'rearWindow');

  // Curved window corners and inward-tapered pillars follow the cabin surface.
  for (const side of [-1, 1]) {
    for (const [front, back] of [[-1.15, -.15], [.015, 1.22], [1.38, 2.43]]) {
      const topFront = front < -.5 ? -.56 : front, shape = new THREE.Shape();
      shape.moveTo(front + .06, 1.255); shape.lineTo(back - .065, 1.255); shape.quadraticCurveTo(back, 1.255, back, 1.32);
      shape.lineTo(back - .065, 1.88); shape.quadraticCurveTo(back - .075, 1.97, back - .17, 1.97);
      shape.lineTo(topFront + .08, 1.97); shape.quadraticCurveTo(topFront + .02, 1.965, topFront, 1.89);
      shape.lineTo(front, 1.33); shape.quadraticCurveTo(front - .015, 1.255, front + .06, 1.255); shape.closePath();
      glassPanel(shape, (z, y) => new THREE.Vector3(side * (cabinWidth(y) + .008), y, z), 'sideWindow');
    }
    trim([[-1.38, 1.16], [-.1, 1.185], [1.8, 1.18], [2.52, 1.13]].map(([z, y]) => new THREE.Vector3(side * 1.08, y, z)), .021);
    trim([[-2.48, .43], [-.7, .4], [1.9, .4], [2.5, .46]].map(([z, y]) => new THREE.Vector3(side * 1.075, y, z)), .012);
    for (const z of [-.13, 1.28]) {
      trim([new THREE.Vector3(side * 1.086, .42, z), new THREE.Vector3(side * 1.086, .84, z), new THREE.Vector3(side * 1.08, 1.16, z)], .007, dark);
      const handle = mesh(new THREE.CapsuleGeometry(.024, .2, 4, 10), chrome); handle.rotation.x = Math.PI / 2; handle.position.set(side * 1.09, 1.065, z - .28);
      box(.021, .035, .22, side * 1.096, 1.068, z - .28, dark);
    }
    box(.13, .045, .14, side * 1.1, 1.26, -.96, dark);
    const mirror = mesh(new THREE.SphereGeometry(1, 24, 16), roof); mirror.scale.set(.19, .1, .17); mirror.position.set(side * 1.24, 1.29, -.93);
    const mirrorGlass = mesh(new THREE.SphereGeometry(1, 20, 12), chrome); mirrorGlass.scale.set(.16, .065, .025); mirrorGlass.position.set(side * 1.24, 1.29, -.77);
    box(.04, .021, .25, side * 1.395, 1.27, -.95, headlight);
    trim([new THREE.Vector3(side * .69, 2.18, -.13), new THREE.Vector3(side * .69, 2.205, 1), new THREE.Vector3(side * .69, 2.15, 2.08)], .017);
    for (const z of [-1.72, 1.66]) {
      const arch = [];
      for (let i = 0; i <= 32; i++) { const angle = -.15 + i / 32 * (Math.PI + .3); arch.push(new THREE.Vector3(side * 1.107, .43 + Math.sin(angle) * .556, z + Math.cos(angle) * .556)); }
      trim(arch, .018, paint);
    }
  }
  const sunroof = new THREE.Shape();
  sunroof.moveTo(-.65, 0); sunroof.lineTo(.65, 0); sunroof.quadraticCurveTo(.71, 0, .71, .08);
  sunroof.lineTo(.71, 1.64); sunroof.quadraticCurveTo(.71, 1.72, .64, 1.72); sunroof.lineTo(-.64, 1.72);
  sunroof.quadraticCurveTo(-.71, 1.72, -.71, 1.64); sunroof.lineTo(-.71, .08); sunroof.quadraticCurveTo(-.71, 0, -.65, 0); sunroof.closePath();
  glassPanel(sunroof, (x, z) => new THREE.Vector3(x, 2.247 - .015 * ((z - .85) / .9) ** 2, z + .02), 'sunroof');

  // Layered grille, sculpted bumpers and segmented vertical lamp housings.
  const frontFace = new THREE.Shape();
  frontFace.moveTo(-.93, .36); frontFace.quadraticCurveTo(-1.02, .43, -.96, .92);
  frontFace.quadraticCurveTo(-.92, 1.035, -.78, 1.035); frontFace.lineTo(.78, 1.035);
  frontFace.quadraticCurveTo(.92, 1.035, .96, .92); frontFace.quadraticCurveTo(1.02, .43, .93, .36); frontFace.closePath();
  const grille = mesh(new THREE.ShapeGeometry(frontFace, 20), dark); grille.rotation.y = Math.PI; grille.position.z = -2.78;
  trim(frontFace.getPoints(36).map(p => new THREE.Vector3(p.x, p.y, -2.797)), .019);
  for (let i = 0; i < 23; i++) {
    const x = -.81 + i * .0736, slat = mesh(new THREE.CapsuleGeometry(.009, .41 - .05 * Math.abs(x), 3, 6), chrome); slat.position.set(x, .7, -2.808);
  }
  trim([new THREE.Vector3(-.9, 1.045, -2.76), new THREE.Vector3(0, 1.06, -2.78), new THREE.Vector3(.9, 1.045, -2.76)], .022, headlight);
  for (const side of [-1, 1]) {
    box(.11, .43, .045, side * .92, .75, -2.8, dark);
    for (let i = 0; i < 4; i++) box(.045, .075, .03, side * .926, .59 + i * .098, -2.835, headlight);
    trim([new THREE.Vector3(side * .76, .33, -2.76), new THREE.Vector3(side * .84, .38, -2.79)], .025, headlight);
    box(.075, .48, .045, side * .94, .94, 2.75, taillight);
    for (let i = 0; i < 5; i++) box(.045, .058, .055, side * .943, .75 + i * .08, 2.78, taillight);
    box(.14, .11, .31, side * .71, .28, 2.52, dark);
  }
  trim([new THREE.Vector3(-.93, .31, -2.6), new THREE.Vector3(0, .285, -2.73), new THREE.Vector3(.93, .31, -2.6)], .04, dark);
  trim([new THREE.Vector3(-.91, 1.17, 2.73), new THREE.Vector3(0, 1.18, 2.755), new THREE.Vector3(.91, 1.17, 2.73)], .016, taillight);
  trim([new THREE.Vector3(-.87, .38, 2.61), new THREE.Vector3(0, .35, 2.75), new THREE.Vector3(.87, .38, 2.61)], .016);

  const plateCanvas = document.createElement('canvas'); plateCanvas.width = 256; plateCanvas.height = 80;
  const plateContext = plateCanvas.getContext('2d');
  plateContext.fillStyle = '#afd9c0'; plateContext.fillRect(0, 0, 256, 80);
  plateContext.fillStyle = '#16352e'; plateContext.font = 'bold 32px sans-serif'; plateContext.textAlign = 'center'; plateContext.fillText('NIGHT 1612', 128, 53);
  const plateTexture = new THREE.CanvasTexture(plateCanvas); plateTexture.colorSpace = THREE.SRGBColorSpace;
  const plateMaterial = new THREE.MeshStandardMaterial({ map: plateTexture, roughness: .5 });
  for (const front of [true, false]) {
    const plate = mesh(new THREE.PlaneGeometry(.48, .15), plateMaterial); plate.position.set(0, front ? .41 : .7, front ? -2.835 : 2.79); if (front) plate.rotation.y = Math.PI;
  }

  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d'), halo = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  halo.addColorStop(0, 'rgba(196,225,255,.65)'); halo.addColorStop(.18, 'rgba(180,217,255,.22)'); halo.addColorStop(1, 'rgba(160,205,255,0)');
  glowContext.fillStyle = halo; glowContext.fillRect(0, 0, 64, 64);
  const glowMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const side of [-1, 1]) { const glow = new THREE.Sprite(glowMaterial); glow.position.set(side * .92, .84, -2.87); glow.scale.set(.58, .65, 1); body.add(glow); }

  const wheels = [], steering = [];
  for (const z of [-1.72, 1.66]) for (const side of [-1, 1]) {
    const holder = new THREE.Group(), spin = new THREE.Group(); holder.name = z < 0 ? 'frontWheel' : 'rearWheel'; holder.position.set(side * 1.045, .43, z); holder.add(spin); root.add(holder);
    if (side < 0) holder.rotation.y = Math.PI;
    const tire = mesh(new THREE.TorusGeometry(.322, .113, 16, 48), rubber, spin); tire.rotation.y = Math.PI / 2;
    const rim = mesh(new THREE.CylinderGeometry(.285, .285, .16, 48), dark, spin); rim.rotation.z = Math.PI / 2;
    for (const radius of [.284, .262]) { const ring = mesh(new THREE.TorusGeometry(radius, .009, 8, 48), chrome, spin); ring.rotation.y = Math.PI / 2; ring.position.x = .127; }
    const disc = mesh(new THREE.CylinderGeometry(.22, .22, .025, 32), chrome, spin); disc.rotation.z = Math.PI / 2; disc.position.x = .085;
    const hub = mesh(new THREE.CylinderGeometry(.068, .068, .045, 24), chrome, spin); hub.rotation.z = Math.PI / 2; hub.position.x = .147;
    const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(.016, .22, .014), chrome, 24), transform = new THREE.Object3D();
    for (let i = 0; i < 24; i++) { const angle = i * Math.PI / 12; transform.position.set(.145, Math.cos(angle) * .16, Math.sin(angle) * .16); transform.rotation.x = angle; transform.updateMatrix(); spokes.setMatrixAt(i, transform.matrix); }
    spokes.castShadow = true; spin.add(spokes); wheels.push({ spin, side });
    for (let i = 0; i < 5; i++) { const angle = i * Math.PI * 2 / 5, bolt = mesh(new THREE.SphereGeometry(.011, 6, 4), dark, spin); bolt.position.set(.175, Math.cos(angle) * .042, Math.sin(angle) * .042); }
    if (z < 0) steering.push({ holder, side });
  }
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d'), gradient = shadowContext.createRadialGradient(32, 32, 5, 32, 32, 32);
  gradient.addColorStop(0, '#000c'); gradient.addColorStop(.5, '#0007'); gradient.addColorStop(1, '#0000'); shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015; root.add(shadow);

  return { root, body, update(distance, force, steer, speed = 0) {
    taillight.emissiveIntensity = force > 100 ? 4 : .8;
    for (const wheel of wheels) wheel.spin.rotation.x = -distance / .44 * wheel.side;
    for (const wheel of steering) wheel.holder.rotation.y = (wheel.side < 0 ? Math.PI : 0) + steer;
    body.rotation.x = -Math.min(.035, force / 1612 * .035);
    body.rotation.z = THREE.MathUtils.clamp(-steer * (speed / 22) ** 2 * .15, -.055, .055);
  } };
}
