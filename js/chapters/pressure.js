// Chapter 5: blood pressure. A cuff on the upper arm squeezes the brachial artery; a stethoscope
// at the elbow hears Korotkoff sounds only while the cuff pressure sits between the diastolic and
// systolic pressure. The arterial pressure comes from the pump model (physio.js), so stiff
// arteries and exercise change it for real.
// Sources:
//  - AHA, "Understanding Blood Pressure Readings": normal below 120/80 mmHg.
//  - WHO fact sheet "Hypertension" (2025): hypertension is 140/90 mmHg or higher; about 1.4 billion
//    adults aged 30–79 had it in 2024, and about 44% of them did not know.
//    https://www.who.int/news-room/fact-sheets/detail/hypertension
//  - WHO Hypertension country profile, India (2023): about 188 million adults aged 30–79, 31%.
//    https://www.who.int/publications/m/item/hypertension-ind-2023-country-profile
//  - Pressures along the circulation: Guyton & Hall, ch. 14 (aorta mean ≈ 100 mmHg, arterial end
//    of capillaries ≈ 35, venous end ≈ 10, right atrium ≈ 0; the biggest drop is in the arterioles).
//  - Cuff technique: AHA scientific statement on BP measurement (Muntner et al., Hypertension
//    73:e35, 2019): deflate at 2–3 mmHg per second; the first tapping sound is systolic
//    (Korotkoff phase 1) and silence is diastolic (phase 5).
// The model's pressure is the central aortic pressure; the brachial reading is usually a few mmHg
// higher in systole, which we ignore.
import { THREE, M, rod, tube, canvasTexture, clamp, lerp } from '../kit.js';
import { compactReadout, fitNarrow, tint, pathOf, BLUE, RED } from '../heart.js';
import { beat, at, exerciseParams, REF } from '../physio.js';
import { audio } from '../ui.js';

// [name, mean mmHg, pulse amplitude ± mmHg] along the circulation (Guyton & Hall, ch. 14)
const ALONG = [['Aorta', 96, 20], ['Big arteries', 94, 21], ['Small arteries', 86, 12], ['Arterioles', 58, 4], ['Capil- laries', 22, 0.5], ['Venules', 12, 0], ['Veins', 7, 0], ['Vena cava', 2, 0]];
const HISTORY_S = 5;                       // seconds of trace on the board

let actx = null;
function tap(muted) {
  if (muted) return;
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  if (actx.state === 'suspended') actx.resume();
  const t = actx.currentTime, n = actx.sampleRate * 0.06, buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.18));
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = 0.9;
  src.connect(f).connect(g).connect(actx.destination); src.start(t);
}

function draw(g, w, h, st) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h);
  const b = st.b; if (!b) return;
  // Left: arterial pressure trace with the cuff line.
  const L = 58, R = w * 0.56, top = 60, bot = h - 50, pMax = 200;
  const Y = (p) => bot - (clamp(p, 0, pMax) / pMax) * (bot - top);
  g.font = '16px sans-serif'; g.lineWidth = 1;
  for (let p = 0; p <= pMax; p += 40) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(L, Y(p)); g.lineTo(R, Y(p)); g.stroke(); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText(p, 14, Y(p) + 5); }
  const n = st.hist.length;
  g.strokeStyle = '#ffb547'; g.lineWidth = 3.5; g.beginPath();
  st.hist.forEach((p, i) => { const x = L + (i / (n - 1)) * (R - L); i ? g.lineTo(x, Y(p)) : g.moveTo(x, Y(p)); }); g.stroke();
  g.strokeStyle = '#8ef0ff'; g.setLineDash([10, 7]); g.lineWidth = 3; g.beginPath(); g.moveTo(L, Y(st.cuff)); g.lineTo(R, Y(st.cuff)); g.stroke(); g.setLineDash([]);
  st.taps.forEach((x) => { const px = L + x * (R - L); g.fillStyle = '#ffd166'; g.beginPath(); g.arc(px, Y(st.cuff), 8, 0, 7); g.fill(); });
  g.fillStyle = '#8ef0ff'; g.font = 'bold 17px sans-serif'; g.fillText(`cuff ${Math.round(st.cuff)}`, R - 88, Y(st.cuff) - 10);
  g.fillStyle = '#e8eef8'; g.font = 'bold 21px sans-serif'; g.fillText('Artery pressure (mmHg), last 5 s', L, 34);
  g.fillStyle = '#ffd166'; g.font = 'bold 16px sans-serif'; g.fillText('● tap heard', L, h - 18);
  // Right: pressure along the circulation, the pulsing range shrinking to a steady trickle.
  const L2 = w * 0.62, R2 = w - 20, n2 = ALONG.length, bw = (R2 - L2) / n2;
  const ex = st.b.map / 96;                     // scale Guyton's resting profile to today's mean pressure
  g.fillStyle = '#e8eef8'; g.font = 'bold 21px sans-serif'; g.fillText('Pressure along the way', L2, 34);
  ALONG.forEach(([name, mean, amp], i) => {
    const x = L2 + i * bw + 6, k = i === 0 ? (b.sys - b.dia) / 2 / 20 : 1;
    const m = i < 5 ? mean * ex : mean, a = amp * k * (i < 3 ? ex : 1);
    g.fillStyle = i < 4 ? 'rgba(255,90,106,.85)' : i === 4 ? 'rgba(200,120,220,.85)' : 'rgba(79,123,255,.85)';
    g.fillRect(x, Y(m), bw - 12, bot - Y(m));
    if (a > 1) { g.fillStyle = 'rgba(255,209,102,.9)'; g.fillRect(x, Y(m + a), bw - 12, Y(m - a) - Y(m + a)); }
    g.save(); g.translate(x + bw / 2 - 2, bot + 8); g.rotate(-0.0); g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '13px sans-serif';
    const words = name.split(' '); words.forEach((wd, j) => g.fillText(wd, -g.measureText(wd).width / 2 - 4, 14 + j * 14)); g.restore();
  });
  g.fillStyle = 'rgba(255,209,102,.9)'; g.font = '15px sans-serif'; g.fillText('yellow: pulse swing', R2 - 150, 58);
}

export default {
  id: 'pressure',
  short: 'Blood pressure',
  title: 'Blood pressure: 120 over 80',
  subtitle: 'What the two numbers mean, how a cuff finds them, and why stretchy arteries matter.',
  view: { pos: [-0.9, 4.2, 12.4], target: [-1.2, 4.05, 0] },
  learn: `<p>Each squeeze of the left ventricle pushes blood into arteries that are already full, so the pressure inside them rises and falls with every beat. The peak is the <b>systolic</b> pressure; the low point just before the next beat is the <b>diastolic</b>. A healthy adult reading is around <b>120/80 mmHg</b>: “120 over 80”, in millimetres of mercury. (For how pressure pushes on everything around it, see <a href="/pascalclear/">Pascal's principle</a>.)</p>
    <p>To measure it, a <b>cuff</b> round the upper arm is pumped up until it squashes the artery flat. Then it is let down slowly, 2–3 mmHg a second. When the cuff drops just below the systolic peak, blood spurts through at the top of each beat and makes a <b>tapping</b> sound, a <b>Korotkoff sound</b>. When the cuff drops below diastolic, the artery stays open, the flow goes smooth and the tapping stops.</p>
    <p>Stretchy arteries are the secret to a steady flow. The aorta balloons out with each beat and springs back between beats, like an air tank on a pump, the <b>Windkessel effect</b>. By the time blood reaches the <b>capillaries</b> the pressure has dropped to about 35 mmHg and barely pulses; in the veins it is under 10. Why fast narrow jets have lower pressure is <a href="/bernoulliclear/">Bernoulli's principle</a>.</p>
    <p>A reading of <b>140/90 or more</b>, again and again, is called <b>high blood pressure</b> (hypertension). The WHO estimates <b>1.4 billion</b> adults aged 30–79 had it in 2024; its 2023 profile for India counted about <b>188 million</b>. Nearly half of the people who have it don't know, because it usually causes no symptoms. Only a proper check can tell, so it is worth having your blood pressure measured by a health worker, and a doctor can explain what your numbers mean.</p>
    <p class="tip"><b>Try it:</b> press “Measure” and listen for the first tap and the last one. Then make the arteries stiff and watch the gap between the numbers grow.</p>`,
  terms: [
    { t: 'Systolic pressure', d: 'The highest pressure in your arteries, just after the heart squeezes. The top number.' },
    { t: 'Diastolic pressure', d: 'The lowest pressure in your arteries, between beats. The bottom number.' },
    { t: 'mmHg', d: 'Millimetres of mercury: how high the pressure would push a column of mercury. 120 mmHg is about 16 kPa.' },
    { t: 'Korotkoff sounds', d: 'The tapping heard through a stethoscope as blood spurts past a partly squeezed artery.' },
    { t: 'Windkessel effect', d: 'Stretchy arteries store blood during each beat and push it on between beats, smoothing the flow.' },
    { t: 'Hypertension', d: 'Blood pressure that stays at 140/90 mmHg or higher. It strains the heart and blood vessels over years.' },
  ],
  defaults: { cuff: 0, auto: false, stiff: false, exercise: 0, sound: false },
  controls: [
    { key: 'cuff', type: 'range', label: 'Cuff pressure', min: 0, max: 200, step: 1, ends: ['loose', 'tight'], fmt: (v) => Math.round(v) + ' mmHg' },
    { key: 'go', type: 'buttons', label: 'Measure', items: [{ label: 'Measure: pump up and let down', act: (s) => { s.cuff = 180; s.auto = true; } }, { label: 'Stop', act: (s) => { s.auto = false; } }] },
    { key: 'stiff', type: 'toggle', label: 'Stiff arteries (as in many older people)' },
    { key: 'exercise', type: 'range', label: 'Exercise', min: 0, max: 1, step: 0.01, ends: ['resting', 'running'], fmt: (v) => (v < 0.1 ? 'resting' : v < 0.6 ? 'moderate' : 'hard') },
    { key: 'sound', type: 'toggle', label: 'Hear the taps', hint: 'Uses your speaker.' },
  ],
  quiz: [
    { q: 'In a reading of 120/80, what is the 80?', options: ['The heart rate', 'The pressure between beats (diastolic)', 'The peak pressure', 'Your age limit'], answer: 1, why: 'The bottom number is the lowest arterial pressure, as the heart refills.' },
    { q: 'When do you hear Korotkoff sounds?', options: ['When the cuff is looser than the diastolic pressure', 'When the cuff pressure is between systolic and diastolic', 'Only when the cuff is fully tight', 'All the time'], answer: 1, why: 'The artery pops open only at the top of each beat, so the spurting flow taps.' },
    { q: 'Stiff arteries tend to make…', options: ['Both numbers lower', 'The top number higher and the gap wider', 'No difference', 'The heart stop'], answer: 1, why: 'Less stretch means less cushioning: pressure shoots higher in each beat and falls further between beats.' },
  ],
  reel: [
    { ms: 5800, caption: '120 over 80: the peak pressure of each beat, and the low point between beats.', set: { cuff: 0, auto: false, stiff: false, exercise: 0 }, view: { pos: [0.3, 3.9, 11], target: [0.3, 3.6, 0] }, spin: 0 },
    { ms: 5000, caption: 'A cuff finds them: tapping starts at the top number and stops at the bottom one.', set: { cuff: 124, auto: true, stiff: false, exercise: 0 }, view: { pos: [0.3, 3.9, 11], target: [0.3, 3.6, 0] }, spin: 0 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    // Arm, lying along x with the hand to the right, at shoulder height of y = 4.4.
    const y0 = 4.35, skin = new THREE.MeshStandardMaterial({ color: 0xd9a47e, transparent: true, opacity: 0.22, roughness: 0.6, depthWrite: false });
    const upper = rod(-4.1, 0.6, 0.78, 0.66, skin, 40); upper.position.y = y0;
    const fore = rod(0.6, 4.2, 0.62, 0.46, skin, 40); fore.position.y = y0; fore.rotation.z = 0.0;
    const bone = rod(-3.9, 0.5, 0.12, 0.12, M.matte(0xefe6d6), 16); bone.position.set(0, y0 + 0.1, -0.25);
    root.add(upper, fore, bone);
    // Brachial artery (front of the arm) with three parts: before, under and after the cuff.
    const art = (x0, x1) => { const m = rod(x0, x1, 0.14, 0.14, new THREE.MeshStandardMaterial({ color: 0xd8404c, transparent: true, opacity: 0.55, depthWrite: false }), 24, true); m.position.y = y0; m.position.z = 0.35; root.add(m); return m; };
    art(-4.1, -2.6); const squeezed = art(-2.6, -0.4); art(-0.4, 4.2);
    const vein = rod(-4.1, 4.2, 0.1, 0.1, new THREE.MeshStandardMaterial({ color: 0x5a6ccc, transparent: true, opacity: 0.4, depthWrite: false }), 16); vein.position.set(0, y0 - 0.25, 0.3); root.add(vein);
    // The cuff: a fabric sleeve and its rubber tube to the gauge.
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0x2b4a7a, roughness: 0.8, transparent: true, opacity: 0.8 });
    const cuff = rod(-2.7, -0.3, 0.95, 0.95, cuffMat, 48); cuff.position.y = y0; root.add(cuff);
    const hose = tube([[-1.5, y0 + 0.9, 0.3], [-1.2, y0 + 1.6, 0.5], [0.4, y0 + 2.0, 0.7], [1.95, y0 + 1.8, 0.85]], 0.045, M.plastic(0x1b1d24), false, 40); root.add(hose);
    // Gauge: an aneroid dial.
    const dial = canvasTexture(256, 256, (g, w, h, p = 0) => {
      g.clearRect(0, 0, w, h); g.fillStyle = '#f5f1e6'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 3; g.stroke();
      const ang = (v) => Math.PI * 0.75 + (v / 300) * Math.PI * 1.5;       // 0 at lower left, clockwise
      g.fillStyle = '#222'; g.font = 'bold 20px sans-serif';
      for (let v = 0; v <= 300; v += 20) { const a = ang(v), r0 = v % 60 ? 100 : 92; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke(); if (v % 60 === 0) g.fillText(v, 128 + Math.cos(a) * 72 - 16, 128 + Math.sin(a) * 72 + 7); }
      g.font = '15px sans-serif'; g.fillText('mmHg', 106, 190);
      const a = ang(p); g.strokeStyle = '#d8404c'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(128, 128, 9, 0, 7); g.fill();
    });
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ map: dial.tex, toneMapped: false }));
    gauge.position.set(2.7, y0 + 1.75, 0.85); root.add(gauge);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.05, 10, 48), M.metal(0xc0c6d0)); rim.position.copy(gauge.position); root.add(rim);
    // Stethoscope chest piece over the artery at the elbow.
    const steth = rod(0, 0.12, 0.3, 0.3, M.metal(0xc0c6d0), 32); steth.rotation.y = -Math.PI / 2; steth.position.set(0.95, y0 + 0.05, 0.62); root.add(steth);
    const stethTube = tube([[0.95, y0 + 0.05, 0.75], [1.3, y0 + 0.7, 1.1], [1.1, y0 + 1.5, 1.0], [0.6, y0 + 2.3, 0.8]], 0.035, M.plastic(0x1b1d24), false, 40); root.add(stethTube);
    const rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 40), M.glow(0xffd166, { transparent: true, opacity: 0 })); r.position.copy(steth.position).add(new THREE.Vector3(0, 0, 0.12)); root.add(r); return r; });
    // Blood dots in the artery.
    const path = pathOf([[-4.1, y0, 0.35], [4.2, y0, 0.35]]);
    const N = 90, dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), M.glow(RED), N); dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dots.frustumCulled = false; root.add(dots);
    const u = Float32Array.from({ length: N }, (_, i) => i / N), jit = Float32Array.from({ length: N }, (_, i) => Math.sin(i * 12.9898) * 0.5);
    const o = new THREE.Object3D(), p = new THREE.Vector3();
    const labs = [
      tint(stage.label('Cuff', [-1.5, y0 + 1.3, 0.6], root), 'side'),
      tint(stage.label('Brachial artery', [-3.5, y0 + 0.45, 0.6], root), 'red'),
      tint(stage.label('Stethoscope', [1.3, y0 - 0.6, 0.8], root), ''),
      tint(stage.label('Pressure gauge', [2.7, y0 + 2.75, 0.85], root), ''),
    ];
    const hear = tint(stage.label('', [3.0, y0 + 0.75, 0.8], root), 'gold');

    // Board
    const st = { b: null, hist: new Array(200).fill(80), cuff: 0, taps: [] };
    const chart = canvasTexture(1100, 380, (g, w, h) => draw(g, w, h, st));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 3.1), new THREE.MeshBasicMaterial({ map: chart.tex, transparent: true, toneMapped: false }));
    board.position.set(0.1, 1.72, 0.4); root.add(board);

    let t = 0, acc = 0, histAcc = 0, prevP = 0, ringT = [9, 9, 9], ringI = 0, open = 1, heard = 'Silence', sysSeen = null, diaSeen = null, lastTap = -9, flowK = 1;
    const fit = fitNarrow(stage, { pos: [0.3, 3.6, 12], target: [0.3, 3.2, 0] });
    return compactReadout(stage, {
      update(dt, s) {
        dt = Math.max(0, dt); fit();
        const opts = { ...exerciseParams(s.exercise), ...(s.stiff ? { Ca: 0.8, Zc: 0.06 } : {}) };
        const b = beat(opts); st.b = b;
        t = (t + dt) % b.T;
        const smp = at(b, t / b.T), P = smp.pao;
        // Automatic measurement: pump to 180, then let down at 3 mmHg/s.
        if (s.auto) { s.cuff = Math.max(0, s.cuff - 3 * dt); if (s.cuff <= 40) s.auto = false; }
        const cuffP = s.cuff; st.cuff = cuffP;
        // The artery under the cuff is open when the blood pressure beats the cuff pressure.
        const want = clamp((P - cuffP) / 12, 0, 1);
        open = lerp(open, want, 1 - Math.exp(-dt * 40));
        squeezed.scale.set(1, 0.15 + 0.85 * open, 0.15 + 0.85 * open);
        cuff.scale.set(1, 1 + cuffP / 2500, 1 + cuffP / 2500);
        // Korotkoff: a tap as the artery snaps open while the cuff sits between diastolic and systolic.
        const between = cuffP > b.dia + 1 && cuffP < b.sys - 0.5;
        if (between && prevP <= cuffP && P > cuffP) {
          lastTap = t; ringT[ringI] = 0; ringI = (ringI + 1) % 3; tap(audio.muted || !s.sound);
          st.taps.push(1);
          if (s.auto && sysSeen === null) sysSeen = Math.round(cuffP);
          if (s.auto) diaSeen = Math.round(cuffP);
        }
        if (!s.auto && s.cuff > 170) { sysSeen = null; diaSeen = null; }
        prevP = P;
        heard = cuffP >= b.sys ? (cuffP > 5 ? 'Silence: artery squeezed shut' : 'Silence') : between ? 'Tap… tap… blood spurts through' : cuffP > 5 ? 'Silence: smooth flow again' : 'Silence';
        hear.element.innerHTML = `<b>${heard}</b>`;
        rings.forEach((r, i) => { ringT[i] += dt; const k = ringT[i] / 0.5; r.material.opacity = k < 1 ? 1 - k : 0; r.scale.setScalar(1 + k * 1.6); });
        // Flow in the artery: pulses with the heart, stops beyond a shut cuff.
        flowK = lerp(flowK, open, 1 - Math.exp(-dt * 20));
        const v = (0.8 + 3 * smp.qav / 450) * flowK;
        for (let i = 0; i < N; i++) {
          u[i] = (u[i] + (v * dt) / path.total) % 1;
          path.at(u[i], p);
          const under = p.x > -2.6 && p.x < -0.4, sq = under ? 0.15 + 0.85 * open : 1;
          o.position.set(p.x, p.y + jit[i] * 0.14 * sq, p.z + jit[(i + 7) % N] * 0.14 * sq); o.updateMatrix(); dots.setMatrixAt(i, o.matrix);
        }
        dots.instanceMatrix.needsUpdate = true;
        dots.visible = true;
        // Trace history.
        histAcc += dt;
        while (histAcc > HISTORY_S / st.hist.length) { histAcc -= HISTORY_S / st.hist.length; st.hist.shift(); st.hist.push(P); st.taps = st.taps.map((x) => x - 1 / st.hist.length).filter((x) => x > 0); }
        acc += dt; if (acc > 1 / 20) { acc = 0; chart.redraw(); dial.redraw(cuffP); }
        labs.forEach((l) => { l.visible = stage.host.clientWidth >= 560; });
      },
      readout: (s) => {
        const b = st.b; if (!b) return '';
        const measured = sysSeen !== null && diaSeen !== null && !s.auto && diaSeen < sysSeen ? `<div class="row"><span>Your cuff reading</span><b>${sysSeen}/${diaSeen} mmHg</b></div>` : '';
        return `<div class="big">${Math.round(b.sys)}/${Math.round(b.dia)} mmHg</div>
          <div class="row"><span>Cuff</span><b>${Math.round(s.cuff)} mmHg · ${heard.split(':')[0]}</b></div>
          ${measured}
          <div class="row"><span>Heart rate · per beat</span><b>${b.hr} /min · ${Math.round(b.sv)} mL</b></div>
          <div class="row"><span>Pulse pressure (top − bottom)</span><b>${Math.round(b.sys - b.dia)} mmHg</b></div>
          <small>${s.stiff ? 'Stiff arteries cushion each beat less, so the top number rises and the bottom one falls.' : s.exercise > 0.1 ? 'In exercise the top number rises while the bottom one barely changes: the muscles’ small arteries open wide.' : 'Normal is below 120/80. Readings of 140/90 or more, again and again, are high blood pressure.'}</small>`;
      },
    });
  },
};
