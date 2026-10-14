import { RULES, createRun, step, nextTarget } from './engine.js?v=choices-1';
import { VEHICLES, TRACKS, getVehicle, getTrack, normalizeSelection } from './catalog.js?v=choices-1';

const $ = id => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let selection = normalizeSelection();
try { selection = normalizeSelection(JSON.parse(localStorage.getItem('brakepoint-selection') || 'null')); } catch {}
let run = createRun(selection), previewRun = null, garageReturn = null, pendingSelection = null, pressing = false, lastTime = 0, visualTime = 0, width = 1000, height = 420;
let overlayKind = 'intro', helpWasPaused = false, soundOn = false, audio = null, soundClock = 0, lastGate = 0, resultShown = false, toastTime = 0;
let best = 0;
function loadBest() {
  try { const value = Number(localStorage.getItem(`brakepoint-best-${selection.trackId}`) || (selection.trackId === 'coast' ? localStorage.getItem('brakepoint-best') : 0)); best = Number.isFinite(value) && value > 0 ? value : 0; } catch { best = 0; }
}
loadBest();
let view = '2d', requestedView = '3d', renderer3d = null, loading3d = null, unavailable3d = false, rendererKey = '', sceneVersion = 0;

function applyView(value) {
  view = value;
  canvas.parentElement.classList.toggle('three-dimensional', value === '3d');
  canvas.classList.toggle('hidden', value === '3d'); $('world3d').classList.toggle('hidden', value !== '3d');
  $('view3d').setAttribute('aria-pressed', String(value === '3d')); $('view2d').setAttribute('aria-pressed', String(value === '2d'));
  resize();
}
function fallback3d() {
  unavailable3d = true; requestedView = '2d'; applyView('2d');
  $('view3d').disabled = true; $('viewStatus').textContent = '3D 暂不可用，已切换至 2D';
}
async function changeView(value) {
  setPress(false); requestedView = value;
  if (value === '2d') { applyView('2d'); return; }
  if (unavailable3d) return;
  const choice = previewRun || run, key = `${choice.vehicleId}/${choice.trackId}`;
  if (!renderer3d || rendererKey !== key) {
    const version = ++sceneVersion;
    $('viewStatus').textContent = '正在准备 3D…';
    try {
      loading3d ||= import('./scene3d.js?v=choices-1');
      const { createScene3D } = await loading3d;
      if (version !== sceneVersion || unavailable3d) return;
      renderer3d?.dispose(); renderer3d = null;
      renderer3d = createScene3D($('world3d'), fallback3d, choice); rendererKey = key; renderer3d.resize(width, height);
      $('viewStatus').textContent = '';
    } catch (error) { if (version === sceneVersion) { console.warn('3D scene unavailable', error); fallback3d(); } }
  }
  if (requestedView === '3d' && !unavailable3d) applyView('3d');
}
$('view3d').onclick = () => changeView('3d'); $('view2d').onclick = () => changeView('2d');

function tone(freq, duration = .1, kind = 'sine', volume = .04) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = kind; oscillator.frequency.setValueAtTime(freq, audio.currentTime);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch {}
}

function showPanel(kind, html) {
  overlayKind = kind; $('panel').innerHTML = html; $('overlay').classList.remove('hidden');
  $('overlay').append($('viewControls'));
  $('panel').querySelector('button')?.focus({ preventScroll: true });
}
function hidePanel() { overlayKind = ''; canvas.parentElement.append($('viewControls')); $('overlay').classList.add('hidden'); }
function setupButtons() {
  return `<div class="setup-inline"><button id="chooseVehicle" class="setup-button"><small>更换车型</small>${getVehicle(selection.vehicleId).name} <span>⌄</span></button><button id="chooseTrack" class="setup-button"><small>选择赛道</small>${getTrack(selection.trackId).name} <span>⌄</span></button></div>`;
}
function bindSetup() { $('chooseVehicle').onclick = () => openGarage('vehicleChoice'); $('chooseTrack').onclick = () => openGarage('trackChoice'); }
function updateCourse() {
  const track = getTrack(run.trackId), rules = track.rules;
  $('trackLabel').textContent = `${track.name} · ${getVehicle(run.vehicleId).name}`;
  $('routeLine').querySelectorAll('.route-gate,.route-bay').forEach(node => node.remove());
  $('routeLine').insertAdjacentHTML('beforeend', rules.gates.map(gate => `<span class="route-gate" style="left:${gate.at / rules.bayEnd * 100}%"><b>${gate.speed}</b></span>`).join('') + `<span class="route-bay" style="left:${rules.bayStart / rules.bayEnd * 100}%;width:${(rules.bayEnd - rules.bayStart) / rules.bayEnd * 100}%">停车区</span>`);
  $('routeEnd').textContent = `${rules.bayEnd} m`;
}
function intro() {
  const rules = getTrack(selection.trackId).rules;
  showPanel('intro', `<div class="overline">THE ART OF LETTING GO</div><h1>临界制动<span>留住最后一米。</span></h1><p class="intro-copy">夜间下坡，制动系统异常。你仅剩一块脆弱的踏板。<br>把握加压与卸力的节奏，<strong>别让力度超过 1612 N。</strong></p>${setupButtons()}<div class="steps"><span><b>01</b>弯道降到 ${rules.gates.map(gate => gate.speed).join(' / ')}</span><span><b>02</b>驶入停车区</span><span><b>03</b>车速降到 3 以下</span></div><div class="start-row"><button id="start" class="primary-button">开始挑战 <span>↗</span></button><span class="start-side">空格或触控踏板<br>按住加压 · 松开卸力</span></div><div class="start-hint">长按约 1.7 秒会突破断裂线，试着点按稳住力度。<br>车型仅改变外观；1612 N 与运动模型均为虚构规则。</div>${best ? `<div class="best-badge">本赛道最佳 ${best} 分</div>` : ''}`);
  $('start').onclick = start; bindSetup(); $('start').focus({ preventScroll: true });
}
function openGarage(focus = 'vehicleChoice') {
  if (overlayKind === 'garage') { $(focus).focus(); return; }
  if (overlayKind === 'help') closeHelp();
  recordBest();
  garageReturn = { kind: overlayKind, paused: run.paused };
  run.paused = true;
  setPress(false); pendingSelection = { ...selection }; previewRun = createRun(pendingSelection);
  const options = (items, id) => items.map(item => `<option value="${item.id}"${id === item.id ? ' selected' : ''}>${item.name}</option>`).join('');
  showPanel('garage', `<div class="garage-panel"><div class="overline">YOUR NEXT RUN</div><h2>选一辆车，换一条路。</h2><div class="garage-fields"><label>车型<select id="vehicleChoice">${options(VEHICLES, selection.vehicleId)}</select></label><label>赛道<select id="trackChoice">${options(TRACKS, selection.trackId)}</select></label></div><p id="choiceDescription" class="choice-description"></p><p class="garage-note">车型仅改变外观，刹车控制一致。赛道有不同的弯道和停车区。${run.phase === 'ready' ? '应用后返回开始界面。' : '应用配置会重新开始一局；返回可继续当前挑战。'}</p><div class="button-group"><button id="applyChoice" class="primary-button">${run.phase === 'ready' ? '应用配置' : '应用并重新开始'} <span>↗</span></button><button id="cancelChoice" class="secondary-button">返回</button></div></div>`);
  const refresh = () => {
    pendingSelection = normalizeSelection({ vehicleId: $('vehicleChoice').value, trackId: $('trackChoice').value });
    previewRun = createRun(pendingSelection); const track = getTrack(pendingSelection.trackId);
    $('choiceDescription').textContent = `${getVehicle(pendingSelection.vehicleId).description} · ${track.description}。弯道限速 ${track.rules.gates.map(gate => gate.speed).join(' / ')} km/h，停车区 ${track.rules.bayStart}–${track.rules.bayEnd} m。`;
    changeView(requestedView);
  };
  $('vehicleChoice').onchange = refresh; $('trackChoice').onchange = refresh;
  $('applyChoice').onclick = () => {
    const ready = run.phase === 'ready'; selection = { ...pendingSelection }; previewRun = null; pendingSelection = null;
    try { localStorage.setItem('brakepoint-selection', JSON.stringify(selection)); } catch {}
    loadBest();
    if (ready) { run = createRun(selection); updateCourse(); intro(); changeView(requestedView); } else start();
  };
  $('cancelChoice').onclick = closeGarage; refresh(); $(focus).focus({ preventScroll: true });
}
function closeGarage() {
  if (overlayKind !== 'garage') return;
  previewRun = null; pendingSelection = null; const previous = garageReturn; overlayKind = '';
  run.paused = previous.paused;
  changeView(requestedView);
  if (run.phase === 'ready') intro();
  else if (run.phase === 'running') { if (previous.paused) pause(); else resume(); }
  else result();
}
$('garage').onclick = () => openGarage();
function setPress(value) { pressing = value && run.phase === 'running' && !run.paused && !overlayKind; $('pedal').classList.toggle('pressed', pressing); }
function start() {
  previewRun = null; pendingSelection = null; run = createRun(selection); run.phase = 'running'; updateCourse(); changeView(requestedView); setPress(false); hidePanel(); lastGate = 0; resultShown = false; soundClock = 0;
  $('sceneMessage').textContent = '长按加压，松开卸力。保持节奏。'; toastTime = 3;
  $('pause').disabled = false; $('pedal').disabled = false; $('world').parentElement.classList.remove('failure'); tone(440, .18);
}
function pause() {
  if (overlayKind === 'garage') closeGarage();
  if (run.phase !== 'running') return;
  setPress(false); run.paused = true;
  showPanel('pause', `<div class="overline">TAKE A BREATH</div><h2>先缓一口气。</h2><p class="intro-copy">车速与力度已冻结。回来时，继续掌握你的节奏。</p>${setupButtons()}<div class="button-group"><button id="resume" class="primary-button">继续挑战 <span>→</span></button><button id="restart" class="secondary-button">重新开始</button></div>`);
  $('resume').onclick = resume; $('restart').onclick = start; bindSetup();
}
function resume() { run.paused = false; hidePanel(); $('pedal').focus({ preventScroll: true }); }
function help() {
  if (overlayKind === 'garage') closeGarage();
  const rules = getTrack(run.trackId).rules;
  if (overlayKind === 'help') { closeHelp(); return; }
  helpWasPaused = run.paused;
  if (run.phase === 'running') run.paused = true;
  setPress(false);
  showPanel('help', `<div class="help-panel"><div class="overline">DRIVER'S NOTES</div><h2>刹车，也需要节奏。</h2><ul class="help-list"><li><b>按住空格 / 踏板</b>：力度持续上升。<b>松开</b>：力度迅速下降；短按交替，维持适当力度。</li><li><b>1612 N 是断裂线</b>：恰好 1612 N 可继续；任何超过都会让踏板断裂、车辆翻滚并失败。</li><li><b>通过全部弯道</b>：${rules.gates.map(gate => `${gate.at} m 处 ≤ ${gate.speed} km/h`).join('；')}。超速入弯会失控。</li><li><b>最后停车</b>：在 ${rules.bayStart}–${rules.bayEnd} m 的绿色避险区内，降至 ≤ 3 km/h 即获胜。冲出区域会失败；过早减速可松开踏板继续滑行。</li><li><b>Esc</b> 暂停 / 继续，<b>R</b> 重开。切出窗口自动暂停。音效可在右上角开启。</li></ul><p class="intro-copy">虚构街机游戏，不对应任何真实品牌或事故；力度、路况与车辆运动均非驾驶指导。</p><button id="closeHelp" class="primary-button">明白了 <span>✓</span></button></div>`);
  $('closeHelp').onclick = closeHelp;
}
function closeHelp() {
  if (run.phase === 'running') { if (helpWasPaused) pause(); else resume(); }
  else if (run.phase === 'ready') intro(); else result();
}
function recordBest() {
  if (run.phase === 'won' && run.score > best) { best = run.score; try { localStorage.setItem(`brakepoint-best-${run.trackId}`, String(best)); } catch {} }
}
function result() {
  const won = run.phase === 'won', rules = getTrack(run.trackId).rules;
  recordBest();
  const failureCopy = {
    pedal: ['踏板断裂。', '力度越过了 1612 N。下一次缩短长按，用松开的间隙卸掉压力。'],
    curve: ['弯道失控。', `进入${rules.gates[run.gates]?.name || '弯道'}时车速过高。更早开始制动，在路标前降至目标速度。`],
    edge: ['错过最后一米。', '你冲出了避险停车区。通过最后一处弯道后，尽早控制车速，在绿色区域内停下。']
  };
  const [title, description] = won ? ['稳稳停下。', '你把恐慌留在身后，把车留在了避险区。控制，比蛮力更有力量。'] : (failureCopy[run.reason] || failureCopy.edge);
  showPanel('result', `<div class="overline ${won ? '' : 'result-label'}">${won ? 'CONTROL IS EVERYTHING' : 'RUN ENDED / TRY AGAIN'}</div><h2>${title}</h2><p class="intro-copy">${description}</p><div class="result-stats"><div><small>${won ? '本次得分' : '已行驶'}</small><b>${won ? run.score : Math.floor(run.distance)}</b><i>${won ? '分' : 'm'}</i></div><div><small>力度峰值</small><b>${Math.round(run.peak)}</b><i>N</i></div><div><small>用时</small><b>${run.elapsed.toFixed(1)}</b><i>s</i></div></div>${setupButtons()}<div class="button-group"><button id="retry" class="primary-button">${won ? '再挑战一次' : '重新挑战'} <span>↗</span></button><button id="reviewHelp" class="secondary-button">查看玩法</button></div>${best ? `<div class="best-badge">本赛道最佳 ${best} 分 · 保存在此浏览器</div>` : ''}`);
  $('retry').onclick = start; $('reviewHelp').onclick = help; bindSetup();
  $('pause').disabled = true; $('pedal').disabled = true;
}

$('pedal').addEventListener('pointerdown', event => { event.preventDefault(); if (run.phase === 'running' && !run.paused) { $('pedal').setPointerCapture(event.pointerId); setPress(true); } });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('pedal').addEventListener(name, () => setPress(false));
$('pedal').addEventListener('contextmenu', event => event.preventDefault());
$('pause').onclick = pause; $('help').onclick = help;
$('sound').onclick = () => { soundOn = !soundOn; $('sound').textContent = `音效 ${soundOn ? 'ON' : 'OFF'}`; $('sound').setAttribute('aria-pressed', String(soundOn)); $('sound').setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效'); tone(660, .15); };
const nativeControl = target => target !== $('pedal') && (['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA'].includes(target?.tagName) || target === $('view3d') || target === $('view2d'));
window.addEventListener('keydown', event => {
  if (event.code === 'Tab' && overlayKind) {
    const buttons = [...$('overlay').querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href]')]; const index = buttons.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
    else if (!event.shiftKey && index === buttons.length - 1) { event.preventDefault(); buttons[0]?.focus(); }
  }
  if ((event.code === 'Space' || event.code === 'KeyR') && nativeControl(event.target)) return;
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) { if (overlayKind === 'intro' || overlayKind === 'result') start(); else if (overlayKind === 'pause') resume(); else setPress(true); } }
  if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); start(); }
  if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); if (overlayKind === 'help') closeHelp(); else if (overlayKind === 'pause') resume(); else if (overlayKind === 'garage') closeGarage(); else if (run.phase === 'running') pause(); }
});
window.addEventListener('keyup', event => {
  if (event.code !== 'Space') return;
  setPress(false);
  if (!nativeControl(event.target)) event.preventDefault();
});
window.addEventListener('blur', () => { setPress(false); if (run.phase === 'running' && !run.paused) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { setPress(false); if (run.phase === 'running' && !run.paused) pause(); } });
$('overlay').setAttribute('role', 'dialog'); $('overlay').setAttribute('aria-modal', 'true'); $('overlay').setAttribute('aria-label', '游戏菜单');
function resize() { const rect = canvas.parentElement.getBoundingClientRect(); width = rect.width; height = rect.height; const dpr = Math.min(2, devicePixelRatio || 1); canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); renderer3d?.resize(width, height); }
new ResizeObserver(resize).observe(canvas.parentElement);

function updateHUD() {
  const rules = getTrack(run.trackId).rules, target = nextTarget(run), speed = Math.round(run.speed * 3.6), force = Math.round(run.force);
  const displayed = previewRun || run;
  $('trackLabel').textContent = `${previewRun ? '预览 · ' : ''}${getTrack(displayed.trackId).name} · ${getVehicle(displayed.vehicleId).name}`;
  $('speed').textContent = speed; $('force').textContent = force; $('peak').textContent = Math.round(run.peak);
  const dangerous = run.force >= 1370, safe = run.force >= 500 && run.force < 1250;
  $('forceFill').style.width = `${run.force / rules.maxForce * 100}%`;
  $('forceFill').style.background = dangerous ? '#ff795f' : safe ? '#8de5bf' : '#b5d7cb';
  $('force').style.color = dangerous ? '#ff795f' : '';
  $('pedal').classList.toggle('danger', dangerous);
  $('forceStatus').textContent = run.phase === 'failed' && run.reason === 'pedal' ? '踏板已断裂' : dangerous ? '危险！立即松开' : safe ? '有效制动 · 保持节奏' : force > 0 ? '轻度制动' : '尚未施力';
  $('forceStatus').style.color = dangerous ? '#ff795f' : safe ? '#8de5bf' : '';
  $('targetText').textContent = run.gates < rules.gates.length ? `${target.name} · 限速 ${target.speed} km/h` : run.distance < rules.bayStart ? '绿色避险区 · 驶入后停车' : '已进入避险区 · 降至 3 km/h';
  $('remaining').textContent = run.gates < rules.gates.length || run.distance < rules.bayStart ? `${Math.max(0, Math.ceil(target.at - run.distance))} m` : `${Math.max(0, Math.floor(rules.bayEnd - run.distance))} m 剩余`;
  $('routeFill').style.width = `${Math.min(100, run.distance / rules.bayEnd * 100)}%`; $('routeCar').style.left = `${Math.min(100, run.distance / rules.bayEnd * 100)}%`;
  $('speedHint').textContent = run.phase === 'ready' ? '控制力度，保持冷静' : run.phase === 'won' ? '安全抵达，挑战完成' : run.phase === 'failed' ? '挑战结束，重整节奏' : run.distance >= rules.bayStart ? '踩住节奏，在这里停下' : speed > target.speed ? `前方目标 ≤ ${target.speed} km/h` : '车速达标，注意前方';
  $('sceneSpeed').textContent = run.phase === 'ready' ? '车辆待命' : `${Math.floor(run.distance).toString().padStart(3, '0')} m / ${rules.bayEnd} m`;
  $('phaseLabel').textContent = run.paused ? '已暂停' : { ready: '等待出发', running: '挑战进行中', won: '安全抵达', failed: '挑战失败' }[run.phase];
  $('controlTitle').textContent = run.phase === 'running' && run.force >= 1370 ? '松开！给踏板一个喘息。' : '一点节奏，一线生机。';
}

function polygon(points, fill) { ctx.fillStyle = fill; ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fill(); }
function line(x1, y1, x2, y2, color, weight = 1) { ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function roundRect(x, y, w, h, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); }
function car(x, y, scale, angle = 0, state = run) {
  const model = getVehicle(state.vehicleId), sporty = model.id === 'sport';
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  const beams = ctx.createLinearGradient(65, 0, 250, 0); beams.addColorStop(0, '#fff3b54d'); beams.addColorStop(1, '#fff3b500'); polygon([[65, -13], [250, -27], [250, 22], [65, 1]], beams);
  ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.ellipse(1, 19, 75, 6, 0, 0, Math.PI * 2); ctx.fill();
  // Stylized V800 proportions: tall MPV roof, long cabin, two-tone body and vertical lamps.
  const paint = ctx.createLinearGradient(0,-30,0,14);paint.addColorStop(0,model.roof);paint.addColorStop(.35,model.paint);paint.addColorStop(1,'#101923');
  polygon(sporty ? [[-69,6],[-65,-24],[-37,-42],[-20,-45],[14,-45],[41,-29],[66,-24],[74,7],[68,14],[-63,14]] : [[-69,6],[-67,-31],[-61,-53],[-49,-58],[12,-58],[28,-54],[45,-34],[66,-28],[72,-20],[74,7],[68,14],[-63,14]],paint);
  const roof = ctx.createLinearGradient(0,-59,0,-24);roof.addColorStop(0,model.roof);roof.addColorStop(1,model.paint);
  polygon(sporty ? [[-65,-24],[-37,-42],[-20,-45],[14,-45],[41,-29],[66,-24],[72,-20],[45,-25],[14,-39],[-20,-39],[-59,-23]] : [[-67,-31],[-61,-53],[-49,-58],[12,-58],[28,-54],[45,-34],[66,-28],[72,-20],[53,-23],[39,-29],[-66,-28]],roof);
  polygon(sporty ? [[-53,-27],[-32,-38],[-19,-40],[12,-40],[30,-29]] : [[-57,-31],[-53,-49],[-44,-53],[10,-53],[24,-49],[39,-32]],'#10232d');
  if (!sporty) polygon([[26,-47],[37,-33],[32,-33]],'#36535a');
  line(-57,-29,39,-29,'#cad7cf',1.5); if (!sporty) line(-29,-52,-31,-29,'#4a5960',2); line(4,sporty?-40:-52,4,-29,'#616a6b',2);
  line(-34,-27,-34,8,'#582635',.8);line(4,-27,4,8,'#582635',.8);line(30,-27,30,8,'#582635',.8);
  line(-63,7,62,7,'#c1c9bc',1.5);line(-58,-22,58,-22,'#d78c9233',1);
  roundRect(-9,-24,20,3,1,'#d9d5c3');roundRect(31,-25,8,3,1,'#d9d5c3');roundRect(33,-34,12,6,2,'#bac6bd');line(36,-29,35,-25,'#738b87',2);
  roundRect(-68,-30,3,18,1,'#ff7975');roundRect(61,-24,10,3,1,'#ffefd4');roundRect(64,-20,5,15,1,'#1c2831');
  for(let i=0;i<3;i++)roundRect(65,-19+i*5,2,3,1,'#f5e7c5');
  roundRect(59,4,13,5,1,'#101f2a');line(61,5,71,5,'#dbe6d9',2);line(73,-19,73,3,'#ddd8ba',1.5);line(58,12,73,12,'#afb6ab',2);
  [-43,44].forEach(wheel => {ctx.fillStyle='#061219';ctx.beginPath();ctx.arc(wheel,10,12,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#293840';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#c8c9b5';ctx.beginPath();ctx.arc(wheel,10,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7f958e';ctx.beginPath();ctx.arc(wheel,10,3,0,Math.PI*2);ctx.fill();for(let i=0;i<12;i++){const a=i*Math.PI/6+state.distance*.5;line(wheel+Math.cos(a)*6,10+Math.sin(a)*6,wheel+Math.cos(a)*7.5,10+Math.sin(a)*7.5,'#4a605c',2);}});
  ctx.restore();
}
function draw(run) {
  const track = getTrack(run.trackId), rules = track.rules;
  const w = width, h = height, roadY = h * .79, time = visualTime, running = run.phase === 'running';
  let d = run.distance;
  if (run.phase === 'failed') d += Math.min(run.failureTime, 1.5) * run.speed * .45;
  const camera = d * 8.5;
  const sky = ctx.createLinearGradient(0, 0, 0, roadY); sky.addColorStop(0, '#0b202b'); sky.addColorStop(.57, '#244148'); sky.addColorStop(1, '#4d6a64'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // All art is drawn locally, without external assets or requests.
  for (let i = 0; i < 47; i++) { const x = (i * 113.7 + 39) % w, y = (i * 37.9 + 13) % (h * .38); ctx.fillStyle = `rgba(180,209,207,${.12 + (i%5)*.08})`; ctx.fillRect(x, y, i%7 === 0 ? 2 : 1, 1); }
  const moonX = w * .77, moonY = h * .18; const moonGlow = ctx.createRadialGradient(moonX, moonY, 2, moonX, moonY, 72); moonGlow.addColorStop(0, '#d4e9cf20'); moonGlow.addColorStop(1, '#d4e9cf00'); ctx.fillStyle = moonGlow; ctx.fillRect(moonX-72,moonY-72,144,144); ctx.fillStyle = '#c7dbcb'; ctx.beginPath(); ctx.arc(moonX, moonY, 18, 0, Math.PI*2); ctx.fill(); ctx.fillStyle='#193440'; ctx.beginPath();ctx.arc(moonX-7,moonY-6,17,0,Math.PI*2);ctx.fill();
  const mountainOffset = camera * .08;
  for(let layer=0;layer<3;layer++) {
    const points = [[-100,h]]; const spacing = 110 + layer*25;
    for(let i=-2;i<Math.ceil(w/spacing)+3;i++){const px=i*spacing - mountainOffset % spacing;const py=h*(.48+layer*.055)-(Math.sin(i*1.74+layer*2)+1)*h*(.105-layer*.023);points.push([px,py]);}
    points.push([w+200,h]);polygon(points,['#29474b','#203f43','#173439'][layer]);
  }
  if (track.id === 'coast') {
  const water = ctx.createLinearGradient(0,h*.55,0,roadY);water.addColorStop(0,'#1c3941');water.addColorStop(1,'#23444a');ctx.fillStyle=water;ctx.fillRect(0,h*.58,w,h*.25);
  for(let i=0;i<16;i++){const y=h*.61+i*3.5;const x=(i*79.13-camera*.11)%(w+100);line(x,y,x+30+i%3*20,y,'#66938c12');}
  // Distant bridge and a string of warm lights.
  const bridgeX = w*.52-camera*.025; line(bridgeX-100,h*.62,bridgeX+380,h*.62,'#284a50',5);
  for(let i=0;i<2;i++){const bx=bridgeX+i*220;line(bx,h*.62,bx,h*.41,'#36545b',5);for(let j=-4;j<=4;j++)line(bx,h*.43,bx+j*27,h*.62,'#375a614d',1);}
  for(let i=0;i<20;i++){ctx.fillStyle=i%3?'#c29d674d':'#e1bc8180';ctx.fillRect(bridgeX-100+i*24,h*.615,2,2);}
  }
  if (track.id === 'city') for (let i = -1; i < w / 70 + 2; i++) {
    const x = i * 70 - camera * .07 % 70, top = h * (.28 + (i % 3 + 3) % 3 * .07);
    roundRect(x, top, 53, roadY - top, 2, '#172d40');
    for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) roundRect(x + 6 + col * 11, top + 12 + row * 17, 5, 7, 1, (row + col + i) % 3 ? '#c5975966' : '#8ee5bf99');
  }
  polygon([[0,roadY-18],[w,roadY-18],[w,h],[0,h]],'#10272e');
  ctx.fillStyle='#2c4148';ctx.fillRect(0,roadY,w,36);ctx.fillStyle='#4a5c60';ctx.fillRect(0,roadY, w,2);ctx.fillStyle='#142b34';ctx.fillRect(0,roadY+36,w,h-roadY-36);
  for(let i=-1;i<w/80+2;i++){let x=i*80-camera%80;ctx.fillStyle='#b9beb26b';ctx.fillRect(x,roadY+23,38,2);}
  for(let i=-1;i<w/42+1;i++){const x=i*42-camera%42;polygon([[x,roadY+36],[x+23,roadY+36],[x+15,roadY+43],[x-8,roadY+43]],i%2?'#3f5357':'#b49766');}
  const carX = run.phase === 'ready' ? w*.72 : Math.max(90,w*.27), scale = run.phase === 'ready' && w>560 ? 1.85 : w < 560 ? .8 : 1.14;
  const bayX = carX + (rules.bayStart-d)*8.5, bayEnd = carX + (rules.bayEnd-d)*8.5;
  if(bayX < w && bayEnd > -30){ctx.fillStyle='#6ccda94a';ctx.fillRect(bayX,roadY, bayEnd-bayX,36);line(bayX,roadY,bayEnd,roadY,'#9fe7b9',3);for(let x=bayX;x<bayEnd;x+=60){polygon([[x,roadY+7],[x+15,roadY+15],[x,roadY+23],[x+5,roadY+15]],'#a7e0b16b');}roundRect(bayX-5,roadY-60,92,25,3,'#2b6755');ctx.fillStyle='#c5efc8';ctx.font='10px sans-serif';ctx.fillText('避险停车区',bayX+9,roadY-43);line(bayX+9,roadY-35,bayX+9,roadY,'#639587',3);}
  const lampSpacing=400;for(let i=-1;i<w/lampSpacing+2;i++){const x=i*lampSpacing-camera%lampSpacing+160;line(x,roadY-10,x,roadY-133,'#28424a',3);line(x,roadY-133,x+30,roadY-133,'#28424a',3);line(x+26,roadY-131,x+39,roadY-131,'#e9dbab',3);const glow=ctx.createRadialGradient(x+34,roadY-132,0,x+34,roadY-132,100);glow.addColorStop(0,'#f4d79e16');glow.addColorStop(1,'#f4d79e00');ctx.fillStyle=glow;ctx.fillRect(x-65,roadY-225,200,200);polygon([[x+27,roadY-127],[x-23,roadY],[x+91,roadY],[x+39,roadY-127]],'#ecd5ac07');}
  for (const [index,gate] of rules.gates.entries()) {
    const x=carX+(gate.at-d)*8.5;if(x<-70||x>w+80)continue;line(x,roadY,x,roadY-92,'#718984',3);ctx.fillStyle='#e3dfcc';ctx.beginPath();ctx.arc(x,roadY-94,22,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c96550';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#20353a';ctx.font='bold 19px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(gate.speed,x,roadY-88);ctx.textAlign='left';roundRect(x-28,roadY-61,56,16,2,'#1f4147');ctx.fillStyle='#b0c7c3';ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText(`${index+1}号弯道`,x,roadY-50);ctx.textAlign='left';for(let j=0;j<3;j++){const cx=x+50+j*24;polygon([[cx,roadY-30],[cx+10,roadY-24],[cx,roadY-18],[cx+4,roadY-24]],'#ddb778');}line(x,roadY,x,roadY+36,'#dbb68566',2);
  }
  // Foreground guardrail with parallax.
  for(let i=-1;i<w/100+2;i++){const x=i*100-camera%100;line(x,roadY-2,x,roadY-15,'#617777',3);}line(0,roadY-16,w,roadY-16,'#a1af9d55',2);
  if(running && run.force>200 && run.speed>2){for(let i=0;i<5;i++){const alpha=(1-i/5)*run.force/rules.limit*.12;ctx.fillStyle=`rgba(204,224,211,${alpha})`;ctx.beginPath();ctx.ellipse(carX-40-i*17,roadY-4-i*4,15+i*5,7+i*2,0,0,Math.PI*2);ctx.fill();}}
  let cx=carX,cy=roadY-10,angle=0;
  if(run.phase==='failed'){
    const p=Math.min(1,run.failureTime/1.85);cx+=p*Math.min(w*.5,370);cy-=Math.sin(p*Math.PI)*105;angle=(reduced ? .6 : p*Math.PI*3.5);if(p>=1)cy=roadY-13;
    if(run.reason==='pedal'){
      const px=w-87,py=100;ctx.save();ctx.translate(px,py);line(-6,25,-16,54,'#f79770',4);line(8,15,17,-12,'#f79770',4);ctx.rotate(-.15);roundRect(-24,-30,46,30,4,'#28444c');polygon([[-24,6],[-6,0],[6,10],[22,2],[22,26],[-24,26]],'#91b1b6');line(-24,5,22,2,'#ff795f',2);for(let i=0;i<5;i++)line(-16+i*8,12,-16+i*8,22,'#344d54',2);ctx.restore();ctx.fillStyle='#ff957d';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('踏板断裂',px,py+69);ctx.textAlign='left';
    }
    for(let i=0;i<18;i++){const p2=Math.min(1,run.failureTime/1.3),a=i*2.39;const sx=carX+Math.cos(a)*p2*(35+i*7)+p2*70,sy=roadY-20+Math.sin(a)*p2*80+p2*p2*50;ctx.fillStyle=i%2?'#ffa076':'#80caba';ctx.save();ctx.translate(sx,sy);ctx.rotate(a+p2*6);ctx.fillRect(-2,-1,4+i%3,2);ctx.restore();}
  } else if(running && !reduced && !run.paused) cy+=Math.sin(d*2)*Math.min(1.2,run.speed/25);
  car(cx,cy,scale,angle,run);
  if(running && run.force>=1370){ctx.strokeStyle=`rgba(255,121,95,${.12+Math.sin(time*10)*.07})`;ctx.lineWidth=10;ctx.strokeRect(5,5,w-10,h-10);}
  if(run.phase==='won'){ctx.fillStyle='#9cecc38c';for(let i=0;i<20;i++){const x=carX+Math.sin(i*2.4)*120,y=roadY-35-((time*30+i*17)%160);ctx.fillRect(x,y,2,4);}}
  const vignette=ctx.createRadialGradient(w*.5,h*.4,h*.18,w*.5,h*.4,w*.75);vignette.addColorStop(0,'#04101800');vignette.addColorStop(1,'#04101877');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
}

function frame(timestamp) {
  const dt = lastTime ? Math.min(.05, (timestamp-lastTime)/1000) : 0; lastTime=timestamp;
  if (!run.paused) visualTime+=dt;
  const phaseBefore=run.phase;
  // Fixed substeps preserve collision and force boundaries across display frame rates.
  let rest=dt;while(rest>0){const delta=Math.min(rest,1/120);step(run,delta,pressing);rest-=delta;}
  if(phaseBefore==='running'&&run.phase==='failed'){
    setPress(false);$('world').parentElement.classList.add('failure');$('sceneMessage').textContent=run.reason==='pedal'?'踏板断裂！车辆失控。':run.reason==='curve'?'超速入弯！车辆失控。':'冲出避险区！';tone(70,.6,'sawtooth',.08);
  }
  if(phaseBefore==='running'&&run.phase==='won'){setPress(false);$('sceneMessage').textContent='安全停车 · 挑战完成';tone(660,.3);setTimeout(()=>tone(880,.3),160);setTimeout(()=>tone(1100,.4),320);}
  if(run.gates>lastGate&&run.phase==='running'){lastGate=run.gates;toastTime=2.2;$('sceneMessage').textContent=`${getTrack(run.trackId).rules.gates[run.gates - 1].name}通过 · ${run.gates < getTrack(run.trackId).rules.gates.length ? `前方限速 ${nextTarget(run).speed}` : '准备驶入停车区'}`;tone(750,.13);}
  if(run.phase==='running'&&!run.paused){toastTime-=dt;if(toastTime<=0)$('sceneMessage').textContent=run.force>=1370?'危险！立即松开踏板':run.distance>=getTrack(run.trackId).rules.bayStart?'已进入停车区 · 在这里停下':'';soundClock+=dt;if(run.force>=1370&&soundClock>.23){soundClock=0;tone(1000,.08,'square',.015);}}
  if(!resultShown&&overlayKind!=='garage'&&((run.phase==='failed'&&run.failureTime>2.15)||(run.phase==='won'&&phaseBefore==='won'))){resultShown=true;result();}
  updateHUD();const displayed = previewRun || run; if(view === '3d' && renderer3d) renderer3d.render(displayed, dt); else draw(displayed);requestAnimationFrame(frame);
}
updateCourse();intro();resize();changeView('3d');requestAnimationFrame(frame);
