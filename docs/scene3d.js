import * as THREE from './vendor/three.module.js';
import { createCar } from './car3d.js?v=choices-1';
import { TRACKS, getTrack } from './catalog.js?v=choices-1';

const ROAD_START = -40, DRIVING_LANE = 4.95;
const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const headingAt = (distance, track) => track.bends.reduce((heading, bend) => heading + bend.angle * ease((distance - bend.at) / bend.length), 0);
const roads = new Map(TRACKS.map(track => {
  const end = track.rules.bayEnd + 90, stations = [{ x: 0, z: 0 }];
  for (let distance = ROAD_START; distance < end; distance++) {
    const previous = stations.at(-1), heading = headingAt(distance + .5, track);
    const horizontal = Math.sqrt(1 - (distance < track.rules.bayStart ? track.grade ** 2 : 0));
    stations.push({ x: previous.x + Math.sin(heading) * horizontal, z: previous.z - Math.cos(heading) * horizontal });
  }
  return [track.id, { end, stations, origin: stations[-ROAD_START] }];
}));

// Distance is road arc length, shared with the selected course's game rules.
export function roadPose(distance, lateral = 0, trackId = 'coast') {
  const track = getTrack(trackId), { end, stations, origin } = roads.get(track.id);
  const clamped = Math.max(ROAD_START, Math.min(end, distance)), index = Math.floor(clamped) - ROAD_START;
  const a = stations[index], b = stations[Math.min(index + 1, stations.length - 1)], fraction = clamped - Math.floor(clamped), heading = headingAt(clamped, track);
  return { x: a.x + (b.x - a.x) * fraction - origin.x + Math.cos(heading) * lateral, y: track.grade * Math.min(clamped, track.rules.bayStart), z: a.z + (b.z - a.z) * fraction - origin.z + Math.sin(heading) * lateral, heading };
}

// A small visual gain makes wheel steering legible from the chase camera.
export function steeringAt(distance, trackId = 'coast') {
  const track = getTrack(trackId), curvature = (headingAt(distance + 1, track) - headingAt(distance - 1, track)) / 2;
  return -Math.atan(3.38 * curvature) * 2.4;
}

export function createScene3D(canvas, onUnavailable, selection = {}) {
  const track = getTrack(selection.trackId), RULES = track.rules, ROAD_END = roads.get(track.id).end, DOWNHILL = track.grade;
  const pose = (distance, lateral = 0) => roadPose(distance, lateral, track.id);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#172c3a'); scene.fog = new THREE.Fog('#233642', 95, 360);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 1500);
  const sun = new THREE.DirectionalLight('#ffd3a0', 3.4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -13; sun.shadow.camera.right = sun.shadow.camera.top = 13;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 70; sun.shadow.bias = -.0003; sun.shadow.normalBias = .018;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#a4c8ef', '#283233', .85));

  // A local studio environment gives the paint and chrome useful reflections.
  const environment = new THREE.Scene(); environment.background = new THREE.Color('#34495c');
  for (const [x, y, z, width, height, color, intensity] of [[-7, 4, 1, 3, 7, '#b5d6ff', 3], [6, 5, -6, 8, 5, '#ffe0ad', 5], [0, 9, 1, 5, 9, '#d2e4fa', 2]]) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    light.position.set(x, y, z); light.lookAt(0, 0, 0); environment.add(light);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: '#0b131c' })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1; environment.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer), environmentMap = pmrem.fromScene(environment, .055);
  scene.environment = environmentMap.texture; scene.environmentIntensity = .85; pmrem.dispose();
  environment.traverse(item => { if (item.isMesh) { item.geometry.dispose(); item.material.dispose(); } });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 direction; void main(){ vec3 d=normalize(direction); float h=d.y; vec3 low=mix(vec3(.22,.30,.35),vec3(.48,.29,.20),pow(max(0.0,d.x),3.0)); vec3 high=vec3(.015,.04,.09); gl_FragColor=vec4(mix(low,high,smoothstep(-.03,.55,h)),1.0); }'
  })); scene.add(sky);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: '#e4ead1', fog: false })); moon.position.set(-240, 170, 650); scene.add(moon);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.MeshStandardMaterial({ color: '#102c39', metalness: .2, roughness: .55, envMapIntensity: .12 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -11, -300);
  if (track.id === 'coast') scene.add(sea); else { sea.geometry.dispose(); sea.material.dispose(); }
  if (track.id !== 'coast') {
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.MeshStandardMaterial({ color: track.id === 'city' ? '#19222e' : '#173326', roughness: 1 }));
    terrain.rotation.x = -Math.PI / 2; terrain.position.set(0, -15, -300); scene.add(terrain);
  }

  function strip(start, end, left, right, elevation, material, interval = 2) {
    const positions = [], indices = [], count = Math.ceil((end - start) / interval);
    for (let index = 0; index <= count; index++) {
      const distance = start + (end - start) * index / count;
      for (const offset of [left, right]) { const p = pose(distance, offset); positions.push(p.x, p.y + elevation, p.z); }
      if (index < count) { const a = index * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  const asphalt = new THREE.MeshStandardMaterial({ color: '#262e37', roughness: .78 });
  const shoulders = new THREE.MeshStandardMaterial({ color: '#5b645f', roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: '#c1cbc0', roughness: .8 });
  strip(ROAD_START, ROAD_END, -10, 10, -.06, shoulders); strip(ROAD_START, ROAD_END, -7, 7, 0, asphalt);
  for (const side of [-1, 1]) strip(ROAD_START, ROAD_END, side * 6.6 - .055, side * 6.6 + .055, .015, white);
  const yellow = new THREE.MeshStandardMaterial({ color: '#d7ba77', roughness: .85 });
  strip(ROAD_START, ROAD_END, -.1, .1, .02, yellow);
  const transform = new THREE.Object3D();
  function instances(geometry, material, entries) {
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    entries.forEach(entry => { const p = pose(entry.distance, entry.offset); transform.position.set(p.x, p.y + entry.height, p.z); transform.rotation.set(0, -p.heading, 0); transform.updateMatrix(); mesh.setMatrixAt(entry.index, transform.matrix); });
    mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  const dashes = [];
  for (let distance = ROAD_START; distance < ROAD_END; distance += 9) for (const offset of [-3.35, 3.35]) dashes.push({ index: dashes.length, distance, offset, height: .025 });
  instances(new THREE.BoxGeometry(.09, .025, 4), white, dashes);
  const steel = new THREE.MeshStandardMaterial({ color: '#8c9b9b', metalness: .7, roughness: .5 });
  const posts = [];
  for (const side of [-1, 1]) {
    const points = [];
    for (let distance = ROAD_START; distance <= ROAD_END; distance += 3) { const p = pose(distance, side * 7.7); points.push(new THREE.Vector3(p.x, p.y + .83, p.z)); }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 350, .085, 4, false), steel); scene.add(rail);
    for (let distance = ROAD_START; distance < ROAD_END; distance += 7) posts.push({ index: posts.length, distance, offset: side * 7.7, height: .39 });
  }
  instances(new THREE.BoxGeometry(.12, .78, .12), steel, posts);
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff0cc', emissive: '#ffd999', emissiveIntensity: 3 });
  for (let distance = -20; distance < ROAD_END; distance += 50) {
    const p = pose(distance, -8.6), lamp = new THREE.Group(); lamp.position.set(p.x, p.y, p.z); lamp.rotation.y = -p.heading;
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
    const group = new THREE.Group(), p = pose(distance, 7.2); group.position.set(p.x, p.y, p.z); group.rotation.y = -p.heading;
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
    const direction = Math.sign(track.bends[index].angle);
    sign(gate.at, String(gate.speed), gate.name, direction);
    for (let offset = 12; offset <= 65; offset += 12) {
      const p = pose(gate.at + offset, direction * 7.25);
      const chevron = new THREE.Mesh(new THREE.BoxGeometry(.08, .65, 1.05), yellow); chevron.position.set(p.x, p.y + 1.2, p.z); chevron.rotation.y = -p.heading; scene.add(chevron);
    }
  });
  sign(RULES.bayStart, '停车区', '减速至 3 km/h'); sign(RULES.bayEnd, '终点', `${RULES.bayEnd} m`);

  if (track.id !== 'city') for (let index = 0; index < 15; index++) {
    const p = pose(index * 46, -48 - (index % 3) * 28), height = (16 + index % 5 * 9) * (track.id === 'mountain' ? 1.6 : 1);
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(40 + index % 3 * 14, height, 5), new THREE.MeshBasicMaterial({ color: index % 2 ? '#1d363b' : '#263e43' }));
    mountain.position.set(p.x, p.y + height / 2 - 6, p.z); mountain.rotation.y = index; scene.add(mountain);
  }
  if (track.id === 'city') {
    const walls = new THREE.MeshStandardMaterial({ color: '#293646', metalness: .3, roughness: .7 });
    const windows = new THREE.MeshBasicMaterial({ color: '#e4b778', toneMapped: false });
    for (let distance = -25; distance < ROAD_END; distance += 32) for (const side of [-1, 1]) {
      const p = pose(distance, side * (22 + distance % 3)), height = 14 + ((distance + 25) % 5) * 5;
      const building = new THREE.Mesh(new THREE.BoxGeometry(13, height, 18), walls); building.position.set(p.x, p.y + height / 2 - 5, p.z); building.rotation.y = -p.heading; scene.add(building);
      const rows = Math.max(1, Math.floor((height - 5) / 3)), panes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.2), windows, rows * 16), panel = new THREE.Object3D();
      for (let face = 0; face < 4; face++) for (let row = 0; row < rows; row++) for (let col = 0; col < 4; col++) {
        const y = -height / 2 + 6 + row * 3;
        if (face < 2) panel.position.set(-4.5 + col * 3, y, face ? -9.02 : 9.02);
        else panel.position.set(face === 2 ? 6.52 : -6.52, y, -6.3 + col * 4.2);
        panel.rotation.y = [0, Math.PI, Math.PI / 2, -Math.PI / 2][face]; panel.updateMatrix(); panes.setMatrixAt(face * rows * 4 + row * 4 + col, panel.matrix);
      }
      building.add(panes);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(13.1, .16, 18.1), new THREE.MeshBasicMaterial({ color: side > 0 ? '#7392d9' : '#79b9ab' })); neon.position.y = height / 2 - 1.5; building.add(neon);
    }
  }
  const car = createCar(selection.vehicleId); scene.add(car.root);
  const headlights = new THREE.SpotLight('#d4e8ff', 95, 38, .62, .7, 2);
  headlights.position.set(0, .9, -2.7); headlights.target.position.set(0, -.1, -19); car.root.add(headlights, headlights.target);
  const carPosition = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), lookAt = new THREE.Vector3();
  let wasReady = true, previousPhase = 'ready', previousDistance = 0, compact = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize(width, height) { if (!width || !height) return; compact = width < 560; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  function render(run, dt) {
    const failed = run.phase === 'failed', progress = failed ? Math.min(run.failureTime / 1.8, 1) : 0;
    const distance = run.distance + (failed ? progress * run.speed * .35 : 0), p = pose(distance, DRIVING_LANE + (failed ? progress * progress * 6 : 0));
    car.root.position.set(p.x, p.y + (failed ? Math.sin(progress * Math.PI) * 2 : 0), p.z);
    car.root.rotation.set(distance < RULES.bayStart ? DOWNHILL : 0, -p.heading, failed ? (reduced ? .4 : progress * Math.PI * 2.5) : 0, 'YXZ');
    car.update(distance, run.force, steeringAt(distance, track.id), run.speed); carPosition.copy(car.root.position);
    const right = new THREE.Vector3(Math.cos(p.heading), 0, Math.sin(p.heading)), forward = new THREE.Vector3(Math.sin(p.heading), 0, -Math.cos(p.heading));
    const ready = run.phase === 'ready';
    if (ready) {
      desiredCamera.copy(carPosition).addScaledVector(right, 6.4).addScaledVector(forward, 7.8); desiredCamera.y += 2.9;
      lookAt.copy(carPosition).addScaledVector(right, compact ? .7 : 2.8); lookAt.y += 1.05;
    } else {
      // Follow the previous road pose so the car visibly rotates into the bend.
      const behind = pose(distance - 10, DRIVING_LANE + 3.1); desiredCamera.set(behind.x, behind.y + 4.6, behind.z);
      const ahead = pose(distance + 10, DRIVING_LANE); lookAt.set(ahead.x, ahead.y + .65, ahead.z);
    }
    const resetCamera = ready !== wasReady || (run.phase === 'running' && previousPhase !== 'running') || run.distance < previousDistance;
    if (resetCamera || ready || run.paused) camera.position.copy(desiredCamera);
    else camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 7));
    const fov = compact ? 62 : ready ? 38 : 48;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.lookAt(lookAt); wasReady = ready; previousPhase = run.phase; previousDistance = run.distance;
    sun.position.copy(carPosition).add(new THREE.Vector3(9, 10, -11)); sun.target.position.copy(carPosition);
    renderer.render(scene, camera);
  }
  const contextLost = event => { event.preventDefault(); onUnavailable(); };
  canvas.addEventListener('webglcontextlost', contextLost);
  function dispose() {
    canvas.removeEventListener('webglcontextlost', contextLost);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(item => {
      if (item.isInstancedMesh) item.dispose();
      if (item.geometry) geometries.add(item.geometry);
      for (const material of Array.isArray(item.material) ? item.material : item.material ? [item.material] : []) {
        materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    environmentMap.dispose(); sun.shadow.dispose(); renderer.dispose();
  }
  return { resize, render, dispose };
}
