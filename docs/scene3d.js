import * as THREE from './vendor/three.module.js';
import { createCar } from './car3d.js';
import { RULES } from './engine.js';

const ROAD_START = -40, ROAD_END = 650, DOWNHILL = -.012;
const DRIVING_LANE = 4.95;
const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const headingAt = distance => .7 * ease((distance - RULES.gates[0].at) / 70) - 1 * ease((distance - RULES.gates[1].at) / 70);
const heightAt = distance => DOWNHILL * Math.min(distance, RULES.bayStart);
const stations = [{ x: 0, z: 0 }];
for (let distance = ROAD_START; distance < ROAD_END; distance++) {
  const previous = stations.at(-1), heading = headingAt(distance + .5);
  const horizontal = Math.sqrt(1 - (distance < RULES.bayStart ? DOWNHILL ** 2 : 0));
  stations.push({ x: previous.x + Math.sin(heading) * horizontal, z: previous.z - Math.cos(heading) * horizontal });
}
const origin = stations[-ROAD_START];

// Distance is road arc length, shared with the game engine rather than world Z.
export function roadPose(distance, lateral = 0) {
  const clamped = Math.max(ROAD_START, Math.min(ROAD_END, distance)), index = Math.floor(clamped) - ROAD_START;
  const a = stations[index], b = stations[Math.min(index + 1, stations.length - 1)], fraction = clamped - Math.floor(clamped), heading = headingAt(clamped);
  return { x: a.x + (b.x - a.x) * fraction - origin.x + Math.cos(heading) * lateral, y: heightAt(clamped), z: a.z + (b.z - a.z) * fraction - origin.z + Math.sin(heading) * lateral, heading };
}

export function steeringAt(distance) { return -(headingAt(distance + 3) - headingAt(distance)) * 1.5; }

export function createScene3D(canvas, onUnavailable) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#172f3c'); scene.fog = new THREE.Fog('#172f3c', 95, 360);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 1500);
  const sun = new THREE.DirectionalLight('#ffe2b4', 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -13; sun.shadow.camera.right = sun.shadow.camera.top = 13;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 70; sun.shadow.bias = -.0003;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#b5dff1', '#29312e', 1.8));

  // A local studio environment gives the paint and chrome useful reflections.
  const environment = new THREE.Scene(); environment.background = new THREE.Color('#778a8d');
  for (const [x, y, z, width, height] of [[-6, 3, 0, 3, 7], [6, 4, 0, 4, 8], [0, 8, -4, 8, 5]]) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: new THREE.Color('#f0e4cb').multiplyScalar(3), side: THREE.DoubleSide }));
    light.position.set(x, y, z); light.lookAt(0, 0, 0); environment.add(light);
  }
  const pmrem = new THREE.PMREMGenerator(renderer), environmentMap = pmrem.fromScene(environment, .12);
  scene.environment = environmentMap.texture; scene.environmentIntensity = .65; pmrem.dispose();
  environment.traverse(item => { if (item.isMesh) { item.geometry.dispose(); item.material.dispose(); } });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 direction; void main(){ float h=normalize(direction).y; vec3 low=vec3(.21,.31,.34); vec3 high=vec3(.015,.055,.10); gl_FragColor=vec4(mix(low,high,smoothstep(-.02,.55,h)),1.0); }'
  })); scene.add(sky);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: '#e4ead1', fog: false })); moon.position.set(-240, 170, 650); scene.add(moon);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.MeshStandardMaterial({ color: '#18353e', metalness: .45, roughness: .32 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -11, -300); scene.add(sea);

  function strip(start, end, left, right, elevation, material, interval = 2) {
    const positions = [], indices = [], count = Math.ceil((end - start) / interval);
    for (let index = 0; index <= count; index++) {
      const distance = start + (end - start) * index / count;
      for (const offset of [left, right]) { const p = roadPose(distance, offset); positions.push(p.x, p.y + elevation, p.z); }
      if (index < count) { const a = index * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  const asphalt = new THREE.MeshStandardMaterial({ color: '#30363c', roughness: .94 });
  const shoulders = new THREE.MeshStandardMaterial({ color: '#5b645f', roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: '#c1cbc0', roughness: .8 });
  strip(ROAD_START, ROAD_END, -10, 10, -.06, shoulders); strip(ROAD_START, ROAD_END, -7, 7, 0, asphalt);
  for (const side of [-1, 1]) strip(ROAD_START, ROAD_END, side * 6.6 - .055, side * 6.6 + .055, .015, white);
  const yellow = new THREE.MeshStandardMaterial({ color: '#d7ba77', roughness: .85 });
  strip(ROAD_START, ROAD_END, -.1, .1, .02, yellow);
  const transform = new THREE.Object3D();
  function instances(geometry, material, entries) {
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    entries.forEach(entry => { const pose = roadPose(entry.distance, entry.offset); transform.position.set(pose.x, pose.y + entry.height, pose.z); transform.rotation.set(0, -pose.heading, 0); transform.updateMatrix(); mesh.setMatrixAt(entry.index, transform.matrix); });
    mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  const dashes = [];
  for (let distance = ROAD_START; distance < ROAD_END; distance += 9) for (const offset of [-3.35, 3.35]) dashes.push({ index: dashes.length, distance, offset, height: .025 });
  instances(new THREE.BoxGeometry(.09, .025, 4), white, dashes);
  const steel = new THREE.MeshStandardMaterial({ color: '#8c9b9b', metalness: .7, roughness: .5 });
  const posts = [];
  for (const side of [-1, 1]) {
    const points = [];
    for (let distance = ROAD_START; distance <= ROAD_END; distance += 3) { const p = roadPose(distance, side * 7.7); points.push(new THREE.Vector3(p.x, p.y + .83, p.z)); }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 350, .085, 4, false), steel); scene.add(rail);
    for (let distance = ROAD_START; distance < ROAD_END; distance += 7) posts.push({ index: posts.length, distance, offset: side * 7.7, height: .39 });
  }
  instances(new THREE.BoxGeometry(.12, .78, .12), steel, posts);
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff0cc', emissive: '#ffd999', emissiveIntensity: 3 });
  for (let distance = -20; distance < ROAD_END; distance += 50) {
    const p = roadPose(distance, -8.6), lamp = new THREE.Group(); lamp.position.set(p.x, p.y, p.z); lamp.rotation.y = -p.heading;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.07, .12, 6, 6), steel); stem.position.y = 3;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, .09, .09), steel); arm.position.set(.85, 6, 0);
    const light = new THREE.Mesh(new THREE.BoxGeometry(.55, .06, .24), lampMaterial); light.position.set(1.45, 5.96, 0);
    lamp.add(stem, arm, light); scene.add(lamp);
  }
  const bay = new THREE.MeshStandardMaterial({ color: '#285f4d', roughness: .85, emissive: '#12533c', emissiveIntensity: .25 });
  strip(RULES.bayStart, RULES.bayEnd, .2, 6.4, .035, bay);
  const mint = new THREE.MeshStandardMaterial({ color: '#a3ebbb', emissive: '#548f6e', emissiveIntensity: .4 });
  strip(RULES.bayStart, RULES.bayEnd, 6.1, 6.22, .045, mint);
  for (let distance = RULES.bayStart; distance <= RULES.bayEnd; distance += 12) strip(distance, distance + .15, .3, 6.1, .05, mint);

  function sign(distance, text, subtitle, direction = 0) {
    const group = new THREE.Group(), p = roadPose(distance, 7.2); group.position.set(p.x, p.y, p.z); group.rotation.y = -p.heading;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 3.5, 6), steel); post.position.y = 1.75; group.add(post);
    const textureCanvas = document.createElement('canvas'); textureCanvas.width = 256; textureCanvas.height = 320;
    const ctx = textureCanvas.getContext('2d'); ctx.fillStyle = '#15332e'; ctx.fillRect(0, 0, 256, 320);
    if (direction) {
      ctx.fillStyle = '#e4ddba'; ctx.beginPath(); ctx.arc(128, 99, 84, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#df755e'; ctx.lineWidth = 13; ctx.stroke();
      ctx.fillStyle = '#172831'; ctx.font = 'bold 90px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 128);
      ctx.fillStyle = '#dcc598'; ctx.font = 'bold 51px sans-serif'; ctx.fillText(direction > 0 ? '↱' : '↰', 128, 233);
    } else { ctx.fillStyle = '#a4eabb'; ctx.font = 'bold 43px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 142); }
    ctx.fillStyle = '#c2dccd'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(subtitle, 128, 286);
    const texture = new THREE.CanvasTexture(textureCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.94), new THREE.MeshStandardMaterial({ map: texture, roughness: .8, side: THREE.DoubleSide })); plate.position.y = 3.2; group.add(plate); scene.add(group);
  }
  RULES.gates.forEach((gate, index) => {
    sign(gate.at, String(gate.speed), gate.name, index ? -1 : 1);
    for (let offset = 12; offset <= 65; offset += 12) {
      const p = roadPose(gate.at + offset, index ? -7.25 : 7.25);
      const chevron = new THREE.Mesh(new THREE.BoxGeometry(.08, .65, 1.05), yellow); chevron.position.set(p.x, p.y + 1.2, p.z); chevron.rotation.y = -p.heading; scene.add(chevron);
    }
  });
  sign(RULES.bayStart, '停车区', '减速至 3 km/h'); sign(RULES.bayEnd, '终点', '560 m');

  for (let index = 0; index < 15; index++) {
    const p = roadPose(index * 46, -48 - (index % 3) * 28), height = 16 + index % 5 * 9;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(40 + index % 3 * 14, height, 5), new THREE.MeshBasicMaterial({ color: index % 2 ? '#1d363b' : '#263e43' }));
    mountain.position.set(p.x, p.y + height / 2 - 6, p.z); mountain.rotation.y = index; scene.add(mountain);
  }
  const car = createCar(); scene.add(car.root);
  const carPosition = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), lookAt = new THREE.Vector3();
  let wasReady = true, previousPhase = 'ready', previousDistance = 0, compact = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize(width, height) { if (!width || !height) return; compact = width < 560; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  function render(run, dt) {
    const failed = run.phase === 'failed', progress = failed ? Math.min(run.failureTime / 1.8, 1) : 0;
    const distance = run.distance + (failed ? progress * run.speed * .35 : 0), p = roadPose(distance, DRIVING_LANE + (failed ? progress * progress * 6 : 0));
    car.root.position.set(p.x, p.y + (failed ? Math.sin(progress * Math.PI) * 2 : 0), p.z);
    car.root.rotation.set(distance < RULES.bayStart ? DOWNHILL : 0, -p.heading, failed ? (reduced ? .4 : progress * Math.PI * 2.5) : 0, 'YXZ');
    car.update(distance, run.force, steeringAt(distance)); carPosition.copy(car.root.position);
    const right = new THREE.Vector3(Math.cos(p.heading), 0, Math.sin(p.heading)), forward = new THREE.Vector3(Math.sin(p.heading), 0, -Math.cos(p.heading));
    const ready = run.phase === 'ready';
    if (ready) {
      desiredCamera.copy(carPosition).addScaledVector(right, 6.4).addScaledVector(forward, 7.8); desiredCamera.y += 2.9;
      lookAt.copy(carPosition).addScaledVector(right, compact ? .7 : 2.8); lookAt.y += 1.05;
    } else {
      desiredCamera.copy(carPosition).addScaledVector(right, 3.1).addScaledVector(forward, -11); desiredCamera.y += 5.1;
      const ahead = roadPose(distance + 17, DRIVING_LANE); lookAt.set(ahead.x, ahead.y + .7, ahead.z);
    }
    const resetCamera = ready !== wasReady || (run.phase === 'running' && previousPhase !== 'running') || run.distance < previousDistance;
    if (resetCamera || ready || run.paused) camera.position.copy(desiredCamera);
    else camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 7));
    const fov = compact ? 62 : ready ? 38 : 48;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.lookAt(lookAt); wasReady = ready; previousPhase = run.phase; previousDistance = run.distance;
    sun.position.copy(carPosition).add(new THREE.Vector3(-10, 20, -12)); sun.target.position.copy(carPosition);
    renderer.render(scene, camera);
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onUnavailable(); });
  return { resize, render };
}
