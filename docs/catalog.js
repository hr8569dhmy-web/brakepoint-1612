export const VEHICLES = Object.freeze([
  Object.freeze({ id: 'mpv', name: '巡航 MPV', description: '双拼车漆 · 长座舱', paint: '#0b101a', roof: '#d2bd96', cabinScale: 1, rearRoof: 2.16, scale: [1, 1, 1] }),
  Object.freeze({ id: 'suv', name: '山行 SUV', description: '高车身 · 蓝色车漆', paint: '#244765', roof: '#315b7a', cabinScale: 1.02, rearRoof: 1.85, scale: [1.06, 1.05, .9] }),
  Object.freeze({ id: 'sport', name: '赤影轿跑', description: '低车顶 · 溜背轮廓', paint: '#982b3b', roof: '#b43d4b', cabinScale: .6, rearRoof: .95, scale: [1.04, .94, .91] })
]);
const common = { limit: 1612, maxForce: 2100, initialSpeed: 108 / 3.6, stopSpeed: 3 / 3.6 };
function course(id, name, description, bayStart, bayEnd, acceleration, grade, gates, angles, scenery) {
  const bends = gates.map((gate, index) => Object.freeze({ at: gate.at, angle: angles[index], length: id === 'city' ? 65 : 60 }));
  return Object.freeze({ id, name, description, grade, scenery, bends: Object.freeze(bends), rules: Object.freeze({ ...common, bayStart, bayEnd, acceleration, gates: Object.freeze(gates.map(Object.freeze)) }) });
}
export const TRACKS = Object.freeze([
  course('coast', '海岸夜航', '560 m · 双弯 · 经典路线', 460, 560, 1.05, -.012, [{ at: 180, speed: 80, name: '第一弯道' }, { at: 350, speed: 55, name: '第二弯道' }], [1.05, -1.4], 'coast'),
  course('mountain', '山路连弯', '640 m · 三连弯 · 提前制动', 540, 640, 1.15, -.018, [{ at: 160, speed: 80, name: '第一弯道' }, { at: 300, speed: 60, name: '第二弯道' }, { at: 440, speed: 45, name: '第三弯道' }], [.9, -1.25, .8], 'mountain'),
  course('city', '城市环线', '520 m · 直角弯 · 霓虹夜景', 420, 520, .85, -.006, [{ at: 150, speed: 75, name: '第一弯道' }, { at: 300, speed: 50, name: '第二弯道' }], [Math.PI / 2, -Math.PI / 2], 'city')
]);
export const getVehicle = id => VEHICLES.find(vehicle => vehicle.id === id) || VEHICLES[0];
export const getTrack = id => TRACKS.find(track => track.id === id) || TRACKS[0];
export function normalizeSelection(value) { return { vehicleId: getVehicle(value?.vehicleId).id, trackId: getTrack(value?.trackId).id }; }
