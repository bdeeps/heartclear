// Chapter 2: the cardiac cycle. The heart beats with the pump model (physio.js): chambers
// shrink and swell with their real volumes, valves open and shut when the pressures cross,
// and a live Wiggers diagram draws left ventricular, aortic and left atrial pressure and
// left ventricular volume over one beat.
import { THREE, canvasTexture } from '../kit.js';
import { compactReadout, fitNarrow, makeHeart, makeDriver, tint } from '../heart.js';
import { atRate, ecg, fillTime, REF } from '../physio.js';
import { audio } from '../ui.js';

const SPEEDS = { 1: 'real time', 0.5: 'half speed', 0.25: 'quarter speed' };

// One beat on a board: pressures (top), LV volume (bottom), ECG (thin strip), phases shaded.
function drawWiggers(g, w, h, d) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h);
  const b = d?.beat; if (!b) return;
  const T = b.T, e = b.events, L = 70, R = w - 24;
  const X = (t) => L + (t / T) * (R - L);
  const pTop = 96, pBot = Math.round(h * 0.6), vTop = pBot + 30, vBot = h - 44;
  const pMax = Math.max(140, Math.ceil((b.sys + 15) / 20) * 20);
  const YP = (p) => pBot - (p / pMax) * (pBot - pTop);
  const vMin = 0, vMax = 160, YV = (v) => vBot - ((v - vMin) / (vMax - vMin)) * (vBot - vTop);
  // systole shading: from the mitral valve shutting to it opening again (wraps at high rates)
  const shade = (t0, t1, col) => { g.fillStyle = col; if (t1 >= t0) g.fillRect(X(t0), pTop - 50, X(t1) - X(t0), vBot - pTop + 50); else { g.fillRect(X(t0), pTop - 50, R - X(t0), vBot - pTop + 50); g.fillRect(L, pTop - 50, X(t1) - L, vBot - pTop + 50); } };
  shade(e.mvClose, e.mvOpen, 'rgba(255,107,154,.09)');
  shade(e.avOpen, e.avClose, 'rgba(255,107,154,.1)');
  // grid
  g.font = '17px sans-serif'; g.lineWidth = 1;
  for (let p = 0; p <= pMax; p += 20) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(L, YP(p)); g.lineTo(R, YP(p)); g.stroke(); if (p % 40 === 0) { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText(p, 18, YP(p) + 6); } }
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('mmHg', 10, pTop - 14);
  for (const v of [50, 150]) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(L, YV(v)); g.lineTo(R, YV(v)); g.stroke(); g.fillText(v, 22, YV(v) + 6); }
  g.fillText('mL', 24, vTop - 4);
  // ECG strip
  g.strokeStyle = 'rgba(92,225,169,.85)'; g.lineWidth = 2.5; g.beginPath();
  for (let i = 0; i <= 200; i++) { const t = (i / 200) * T, y = 58 - ecg(t, b.hr) * 26; i ? g.lineTo(X(t), y) : g.moveTo(X(t), y); }
  g.stroke();
  // traces
  const line = (key, Y, col, width = 4) => { g.strokeStyle = col; g.lineWidth = width; g.beginPath(); b.samples.forEach((s, i) => (i ? g.lineTo(X(s.t), Y(s[key])) : g.moveTo(X(s.t), Y(s[key])))); g.stroke(); };
  line('pao', YP, '#ffb547');
  line('pla', YP, '#8fb0ff', 3);
  line('plv', YP, '#ff5a6a');
  line('vlv', YV, '#e8eef8', 3.5);
  // valve events
  g.font = 'bold 18px sans-serif';
  const mark = (t, text, col) => { g.strokeStyle = col; g.setLineDash([6, 6]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(t), pTop - 20); g.lineTo(X(t), vBot); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.fillText(text, Math.min(R - 60, X(t) + 5), pTop - 26); };
  mark(e.mvClose, 'LUB', '#ffd166');
  mark(e.avClose, 'DUB', '#ffd166');
  // title and key
  g.fillStyle = '#e8eef8'; g.font = 'bold 22px sans-serif'; g.fillText('One heartbeat, left side', L, 28);
  g.font = 'bold 17px sans-serif';
  [['LV pressure', '#ff5a6a'], ['aorta', '#ffb547'], ['left atrium', '#8fb0ff'], ['LV volume', '#e8eef8'], ['ECG', '#5ce1a9']].reduce((x, [t, c]) => { g.fillStyle = c; g.fillText(t, x, h - 14); return x + g.measureText(t).width + 26; }, L);
  g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '16px sans-serif'; g.fillText('systole shaded', R - 120, h - 14);
  // cursor
  const x = X(d.t);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, pTop - 40); g.lineTo(x, vBot); g.stroke();
  const s = d.sample;
  g.fillStyle = '#ff5a6a'; g.beginPath(); g.arc(x, YP(s.plv), 7, 0, 7); g.fill();
  g.fillStyle = '#ffb547'; g.beginPath(); g.arc(x, YP(s.pao), 6, 0, 7); g.fill();
  g.fillStyle = '#e8eef8'; g.beginPath(); g.arc(x, YV(s.vlv), 6, 0, 7); g.fill();
}

export default {
  id: 'pump',
  short: 'The heartbeat',
  title: 'One heartbeat, step by step',
  subtitle: 'Fill, squeeze, push, relax: the cardiac cycle and its lub-dub.',
  view: { pos: [0, 4.55, 10], target: [0, 4.45, 0] },
  learn: `<p>Each heartbeat has two halves. In <b>diastole</b> the muscle relaxes and the ventricles <b>fill</b>. Blood flows in from the atria through the open tricuspid and mitral valves. Right at the end, the atria give a small squeeze, the <b>atrial kick</b>, to top the ventricles up.</p>
    <p>In <b>systole</b> the ventricles squeeze. For a split second all four valves are shut and the pressure shoots up with no blood moving: <b>isovolumetric contraction</b>. When the pressure inside beats the pressure in the arteries, the aortic and pulmonary valves pop open and blood rushes out: <b>ejection</b>.</p>
    <p>The sounds a doctor hears are valves snapping shut. <b>“Lub”</b> is the tricuspid and mitral valves closing as systole starts. <b>“Dub”</b> is the aortic and pulmonary valves closing as it ends.</p>
    <p>Each beat pushes out about <b>70 mL</b>, the <b>stroke volume</b>. That is roughly <b>55–70%</b> of the blood in the full ventricle, the <b>ejection fraction</b>. Multiply by the heart rate and you get the <b>cardiac output</b>: about <b>5 litres a minute</b> at rest. A squeezing chamber is a pump just like a syringe: see <a href="/pascalclear/">Pascal's principle</a> for how pressure pushes a fluid, and <a href="/newtonclear/">Newton's laws</a> for why pushing blood forward pushes back on the heart.</p>
    <p class="tip"><b>Try it:</b> slow the beat right down and watch the valves, then raise the heart rate and see what happens to the filling time.</p>`,
  terms: [
    { t: 'Diastole', d: 'The relaxing part of the heartbeat, when the ventricles fill with blood.' },
    { t: 'Systole', d: 'The squeezing part of the heartbeat, when the ventricles pump blood out.' },
    { t: 'Stroke volume', d: 'How much blood one ventricle pumps out in one beat: about 70 mL at rest.' },
    { t: 'Cardiac output', d: 'How much blood the heart pumps per minute: heart rate × stroke volume, about 5 L/min at rest.' },
    { t: 'Ejection fraction', d: 'The share of the blood in a full ventricle that one beat pushes out. Normally about 55–70%.' },
  ],
  defaults: { hr: 70, speed: 0.5, sound: false },
  controls: [
    { key: 'hr', type: 'range', label: 'Heart rate', min: 50, max: 180, step: 1, ends: ['sleeping', 'hard exercise'], fmt: (v) => Math.round(v) + ' beats/min' },
    { key: 'speed', type: 'seg', label: 'Slow motion', options: [{ v: 1, label: '1×' }, { v: 0.5, label: '½×' }, { v: 0.25, label: '¼×' }], fmt: (v) => SPEEDS[v] },
    { key: 'sound', type: 'toggle', label: 'Hear the lub-dub', hint: 'Short thumps when the valves shut. Uses your speaker.' },
  ],
  quiz: [
    { q: 'What makes the “lub” sound?', options: ['The ventricles squeezing', 'The tricuspid and mitral valves closing', 'Blood hitting the aorta', 'The atria filling'], answer: 1, why: 'Lub is the inlet (AV) valves snapping shut as the ventricles start to squeeze. Dub is the outlet valves shutting.' },
    { q: 'A heart beats 70 times a minute and pumps 70 mL per beat. What is its cardiac output?', options: ['140 mL/min', 'About 5 L/min', 'About 50 L/min', '70 L/min'], answer: 1, why: '70 × 70 mL = 4,900 mL, about 5 litres every minute.' },
    { q: 'During isovolumetric contraction…', options: ['All four valves are shut and pressure rises', 'Blood rushes into the aorta', 'The ventricles fill', 'The atria squeeze'], answer: 0, why: 'The ventricle squeezes a closed box, so pressure climbs until it can push the outlet valve open.' },
  ],
  reel: [
    { ms: 5600, caption: 'Each beat the ventricles fill, then squeeze out about 70 mL. Lub-dub is the valves slamming shut.', set: { hr: 70, speed: 0.3 }, view: { pos: [2.8, 5.9, 6.0], target: [2.5, 5.3, 0] }, spin: 0 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); root.position.set(2.55, 5.6, 0); root.scale.setScalar(0.72); stage.root.add(root);
    const heart = makeHeart(stage, { labels: false, pericardium: false });
    root.add(heart.root);
    heart.setXray(1);
    const phaseL = tint(stage.label('', [0, 3.3, 0], root), 'gold');
    const flash = tint(stage.label('', [1.2, 0.9, 1.2], root), 'gold');
    let flashT = 0;
    const drv = makeDriver(heart, {
      muted: () => audio.muted || !cur.sound,
      onLub: () => { flash.element.innerHTML = '<b>LUB</b> · inlet valves shut'; flashT = 0.6; },
      onDub: () => { flash.element.innerHTML = '<b>DUB</b> · outlet valves shut'; flashT = 0.6; },
    });
    let cur = {};

    const chart = canvasTexture(1000, 470, (g, w, h) => drawWiggers(g, w, h, drv));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 3.85), new THREE.MeshBasicMaterial({ map: chart.tex, transparent: true, toneMapped: false }));
    board.position.set(-0.35, 2.55, 0.3); stage.root.add(board);
    let acc = 0;
    const fit = fitNarrow(stage, { pos: [1.1, 4.3, 10.5], target: [1.0, 4.0, 0] });
    return compactReadout(stage, {
      update(dt, s) {
        dt = Math.max(0, dt); fit(); cur = s;
        drv.update(dt, atRate(s.hr), s.speed);
        flashT -= dt * s.speed * 1.4; flash.visible = flashT > 0;
        phaseL.element.innerHTML = `<b>${drv.phase.name}</b>`;
                acc += dt; if (acc > 1 / 30) { acc = 0; chart.redraw(); }
      },
      readout: (s) => {
        const b = drv.beat; if (!b) return '';
        return `<div class="big">${drv.phase.name}</div>
          <div class="row"><span>Cardiac output = rate × volume</span><b>${b.co.toFixed(1)} L/min</b></div>
          <div class="row"><span>Heart rate × stroke volume</span><b>${Math.round(s.hr)}/min × ${Math.round(b.sv)} mL</b></div>
          <div class="row"><span>Ejection fraction</span><b>${Math.round(b.ef)}%</b></div>
          <div class="row"><span>Inlet valves · outlet valves</span><b>${drv.sample.mv ? 'open' : 'shut'} · ${drv.sample.av ? 'open' : 'shut'}</b></div>
          <div class="row"><span>Filling time per beat</span><b>${fillTime(b).toFixed(2)} s</b></div>
          <small>${drv.phase.note} ${s.hr > 75 ? 'Faster rates here also mean a stronger squeeze, as in exercise.' : `A resting adult: about ${REF.co} L/min.`}</small>`;
      },
    });
  },
};
