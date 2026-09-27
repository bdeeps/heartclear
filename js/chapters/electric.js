// Chapter 3: the heart's wiring. The SA node fires, a wave of depolarisation sweeps over the
// atria, waits in the AV node, races down the bundle of His and its branches, and spreads
// through the Purkinje fibres into the ventricles. The muscle lights up as the wave passes,
// in step with a lead II ECG on the board.
// Timings from Guyton & Hall, ch. 10: the impulse reaches the AV node about 0.03 s after the
// SA node fires, is held there so that it enters the ventricular septum at about 0.16 s, and the
// last ventricular muscle is excited at about 0.22 s. Conduction speeds: atrial muscle about
// 0.3 m/s, AV node 0.01–0.05 m/s, Purkinje fibres 1.5–4 m/s.
import { THREE, M, tube, canvasTexture, clamp } from '../kit.js';
import { compactReadout, fitNarrow, makeHeart, makeDriver, tint, vf, P, MUSCLE, smoothPts } from '../heart.js';
import { atRate, ecg, ecgTimes } from '../physio.js';

const REST = new THREE.Color(MUSCLE), FRONT = new THREE.Color(0xfff0a0), ON = new THREE.Color(0xff9a4a);

// The conduction system as paths in heart space, with when the impulse travels along each.
function wiring(PR) {
  const his = vf(-0.05, -0.35, 0.06);
  return [
    { id: 'sa-av', pts: [P.saNode, new THREE.Vector3(-0.8, 0.45, 0.3), new THREE.Vector3(-0.55, 0.1, 0.12), P.avNode], t0: 0, t1: 0.03 },
    { id: 'bach', pts: [P.saNode, new THREE.Vector3(-0.4, 0.95, 0.0), new THREE.Vector3(0.2, 0.95, -0.4), new THREE.Vector3(0.7, 0.8, -0.6)], t0: 0, t1: 0.05 },
    { id: 'his', pts: [P.avNode, his], t0: PR - 0.035, t1: PR - 0.02 },
    { id: 'rbb', pts: [his, vf(-0.2, -1.2, 0.2), vf(-0.3, -2.0, 0.22)], t0: PR - 0.02, t1: PR },
    { id: 'lbb', pts: [his, vf(0.14, -1.1, -0.08), vf(0.22, -2.15, -0.1)], t0: PR - 0.02, t1: PR },
    { id: 'pk1', pts: [vf(0.22, -2.15, -0.1), vf(0.62, -1.95, -0.3), vf(0.8, -1.2, -0.32), vf(0.72, -0.45, -0.3)], t0: PR, t1: PR + 0.03 },
    { id: 'pk2', pts: [vf(0.22, -2.15, -0.1), vf(0.4, -1.6, -0.62), vf(0.42, -0.6, -0.62)], t0: PR, t1: PR + 0.03 },
    { id: 'pk3', pts: [vf(0.22, -2.15, -0.1), vf(0.5, -1.5, 0.28), vf(0.55, -0.6, 0.26)], t0: PR, t1: PR + 0.03 },
    { id: 'pk4', pts: [vf(-0.3, -2.0, 0.22), vf(-0.85, -1.4, 0.5), vf(-1.0, -0.6, 0.42)], t0: PR, t1: PR + 0.03 },
    { id: 'pk5', pts: [vf(-0.3, -2.0, 0.22), vf(-0.45, -1.4, 0.72), vf(-0.35, -0.6, 0.72)], t0: PR, t1: PR + 0.03 },
  ];
}

function drawECG(g, w, h, st) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h);
  const { hr, t } = st, e = ecgTimes(hr), T = e.RR, L = 40, R = w - 24;
  const X = (x) => L + (x / T) * (R - L), mid = h * 0.6, Y = (mv) => mid - mv * 118;
  // ECG paper
  g.lineWidth = 1;
  for (let x = 0; x <= T + 1e-6; x += 0.04) { g.strokeStyle = Math.round(x / 0.04) % 5 ? 'rgba(255,107,154,.07)' : 'rgba(255,107,154,.18)'; g.beginPath(); g.moveTo(X(x), 50); g.lineTo(X(x), h - 60); g.stroke(); }
  for (let y = 50; y <= h - 60; y += 15) { g.strokeStyle = (y - 50) % 75 ? 'rgba(255,107,154,.07)' : 'rgba(255,107,154,.18)'; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); }
  // trace, drawn up to the cursor brightly and faint after it
  const trace = (a, b, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); for (let i = 0; i <= 300; i++) { const x = a + ((b - a) * i) / 300; const y = Y(ecg(x, hr)); i ? g.lineTo(X(x), y) : g.moveTo(X(x), y); } g.stroke(); };
  trace(0, T, 'rgba(92,225,169,.25)', 3);
  trace(0, t, '#5ce1a9', 4);
  // wave names and intervals
  g.fillStyle = '#e8eef8'; g.font = 'bold 22px sans-serif';
  g.fillText('P', X(e.pOn + e.pDur / 2) - 6, Y(0.15) - 16);
  g.fillText('QRS', X(e.qrsOn + 0.035) + 16, Y(1.0));
  g.fillText('T', X(e.tPeak) - 6, Y(0.3) - 16);
  const span = (a, b, y, text) => { g.strokeStyle = '#ffd166'; g.fillStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(a), y); g.lineTo(X(b), y); g.moveTo(X(a), y - 6); g.lineTo(X(a), y + 6); g.moveTo(X(b), y - 6); g.lineTo(X(b), y + 6); g.stroke(); g.font = 'bold 17px sans-serif'; g.fillText(text, X(a) + 4, y + 22); };
  span(e.pOn, e.qrsOn, h - 88, `PR ${e.PR.toFixed(2)} s`);
  span(e.qrsOn, e.qrsOn + e.qrsDur, h - 48, `QRS ${e.qrsDur.toFixed(2)} s`);
  span(e.qrsOn, e.tEnd, h - 88 + 0.001, '');
  g.fillStyle = '#ffd166'; g.fillText(`QT ${e.QT.toFixed(2)} s`, X(e.tEnd) - 90, h - 66);
  g.fillStyle = '#e8eef8'; g.font = 'bold 22px sans-serif'; g.fillText(`ECG, lead II · one beat · ${Math.round(hr)} beats/min`, L, 32);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '16px sans-serif'; g.fillText('small square 0.04 s', R - 150, 32);
  // cursor
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(t), 50); g.lineTo(X(t), h - 60); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(t), Y(ecg(t, hr)), 7, 0, 7); g.fill();
}

export default {
  id: 'electric',
  short: 'The spark',
  title: 'The heart’s own electricity',
  subtitle: 'A built-in pacemaker, a deliberate delay, and a wave you can see on an ECG.',
  view: { pos: [0, 4.55, 10], target: [0, 4.45, 0] },
  learn: `<p>Nobody has to tell your heart to beat. A tiny patch of special cells in the right atrium, the <b>sinoatrial (SA) node</b>, fires an electrical spark by itself, about <b>60 to 100 times a minute</b> at rest. It is the heart’s natural <b>pacemaker</b>.</p>
    <p>The spark spreads across both atria like a ripple, and they squeeze. Then it reaches the <b>atrioventricular (AV) node</b>, which holds it back for about <b>a tenth of a second</b>. That pause gives the atria time to empty into the ventricles.</p>
    <p>Next the signal races down the <b>bundle of His</b> in the septum, splits into the left and right <b>bundle branches</b>, and spreads through the fast <b>Purkinje fibres</b>. The ventricles squeeze from the bottom up, like squeezing toothpaste towards the cap, pushing blood up and out.</p>
    <p>Electrodes on the skin pick up this wave as an <b>ECG</b>. The <b>P wave</b> is the atria firing, the tall <b>QRS</b> is the ventricles firing, and the <b>T wave</b> is the ventricles recharging. When the rhythm goes wrong, too fast, too slow or irregular, it is called an <b>arrhythmia</b>. Doctors read ECGs to spot them, and some people get an artificial <b>pacemaker</b>, a small device that sends the spark when the heart's own system can't. For the electricity itself, see <a href="/energyclear/">energy</a>.</p>
    <p class="tip"><b>Try it:</b> at 1/10 speed, watch the glow pause at the AV node, then flash through the ventricles right as the QRS appears.</p>`,
  terms: [
    { t: 'SA node', d: 'The heart’s natural pacemaker: a small group of cells in the right atrium that fires each heartbeat.' },
    { t: 'AV node', d: 'The gateway between atria and ventricles. It delays the signal by about 0.1 s so the ventricles can fill.' },
    { t: 'Purkinje fibres', d: 'Fast-conducting fibres that spread the signal through the ventricle walls.' },
    { t: 'Depolarisation', d: 'The electrical switch that makes a heart muscle cell contract.' },
    { t: 'ECG', d: 'Electrocardiogram: a recording of the heart’s electrical activity from electrodes on the skin.' },
    { t: 'Arrhythmia', d: 'Any heart rhythm that is too fast, too slow or irregular.' },
  ],
  defaults: { hr: 70, speed: 0.1, wiring: true },
  controls: [
    { key: 'hr', type: 'range', label: 'SA node rate', min: 40, max: 180, step: 1, ends: ['slow', 'fast'], fmt: (v) => Math.round(v) + ' beats/min' },
    { key: 'speed', type: 'seg', label: 'Slow motion', options: [{ v: 1, label: '1×' }, { v: 0.25, label: '¼×' }, { v: 0.1, label: '1/10×' }], fmt: (v) => (v === 1 ? 'real time' : v === 0.25 ? 'quarter speed' : 'a tenth of real speed') },
    { key: 'wiring', type: 'toggle', label: 'Show the wiring' },
  ],
  quiz: [
    { q: 'Where does each heartbeat start?', options: ['In the brain', 'In the SA node in the right atrium', 'In the left ventricle', 'In the aorta'], answer: 1, why: 'The SA node fires by itself. Nerves from the brain only speed it up or slow it down.' },
    { q: 'Why does the AV node delay the signal?', options: ['To save energy', 'So the atria can finish pushing blood into the ventricles', 'Because it is broken', 'To make the T wave'], answer: 1, why: 'The pause of about 0.1 s lets the ventricles fill before they squeeze.' },
    { q: 'On an ECG, what does the QRS show?', options: ['The atria firing', 'The ventricles firing', 'The valves closing', 'The ventricles recharging'], answer: 1, why: 'QRS is the big electrical wave of the ventricles depolarising, just before they squeeze.' },
  ],
  reel: [
    { ms: 5600, caption: 'Each beat starts with a spark from the SA node, the heart’s built-in pacemaker.', set: { hr: 70, speed: 0.12, wiring: true }, spin: 0 },
    { ms: 5000, caption: 'The spark pauses, then sweeps the ventricles from the bottom up: that is the QRS on an ECG.', set: { hr: 70, speed: 0.1, wiring: true }, view: { pos: [3.0, 5.9, 6.0], target: [2.45, 5.3, 0] }, spin: 0 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); root.position.set(2.45, 5.55, 0); root.scale.setScalar(0.8); stage.root.add(root);
    const heart = makeHeart(stage, { labels: false, flow: false, coronary: false, pericardium: false });
    heart.root.updateMatrixWorld(true);
    root.add(heart.root);
    heart.setXray(1);
    heart.cavities.forEach((c) => { c.visible = false; });
    heart.muscles.forEach((m) => { m.material.opacity = 0.5; });
    heart.vessels.forEach((m) => { m.material.opacity = 0.18; });
    Object.values(heart.valves).forEach((v) => { v.visible = false; });

    // Activation time for every vertex of the muscle (seconds after the SA node fires).
    const toFrame = new THREE.Matrix4().makeRotationFromEuler(heart.groups.vFrame.rotation).invert();
    const m = heart.meshes, atria = [m.ra, m.rAur, m.la, m.lAur], vents = [m.lv, m.rv, m.conus];
    const cells = [];
    const v = new THREE.Vector3();
    const prep = (mesh, fn) => {
      mesh.updateMatrixWorld(true);
      const pos = mesh.geometry.attributes.position, act = new Float32Array(pos.count), kind = new Float32Array(pos.count);
      const inv = new THREE.Matrix4().copy(heart.root.matrixWorld).invert();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv); [act[i], kind[i]] = fn(v.clone()); }
      cells.push({ mesh, act, kind, col: mesh.geometry.attributes.color });
    };
    let dMax = 0;
    atria.forEach((mesh) => { mesh.updateMatrixWorld(true); });
    const saDist = (p) => p.distanceTo(P.saNode);
    atria.forEach((mesh) => prep(mesh, (p) => { dMax = Math.max(dMax, saDist(p)); return [saDist(p), 0]; }));
    cells.forEach((c) => { for (let i = 0; i < c.act.length; i++) c.act[i] = 0.02 + 0.07 * (c.act[i] / dMax); });   // atria done by ~0.09 s
    vents.forEach((mesh) => prep(mesh, (p) => {
      const f = p.applyMatrix4(toFrame);
      const hgt = clamp((f.y + 2.62) / 2.8, 0, 1), lat = clamp(Math.abs(f.x + 0.05) / 1.3, 0, 1);
      return [0.012 + 0.06 * clamp(0.7 * hgt + 0.3 * lat, 0, 1), 1];                  // added to the PR interval below
    }));

    // Wiring
    const wg = new THREE.Group(); heart.root.add(wg);
    let paths = [], builtPR = -1;
    const nodes = [];
    const nodeMat = M.glow(0xffd166);
    [P.saNode, P.avNode].forEach((p) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), nodeMat.clone()); s.position.copy(p); wg.add(s); nodes.push(s); });
    const sparkGeo = new THREE.SphereGeometry(0.075, 12, 8);
    const buildWiring = (PR) => {
      paths.forEach((p) => { wg.remove(p.mesh, p.spark); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
      paths = wiring(PR).map((w) => {
        const pts = smoothPts(w.pts, 40);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.4, toneMapped: false });
        const mesh = tube(pts, w.id.startsWith('pk') ? 0.022 : 0.035, mat, false, 60);
        const spark = new THREE.Mesh(sparkGeo, M.glow(0xffffff)); spark.visible = false;
        wg.add(mesh, spark);
        return { ...w, mesh, mat, spark, curve: new THREE.CatmullRomCurve3(pts) };
      });
      builtPR = PR;
    };
    const H = (x, y, z) => new THREE.Vector3(x, y, z);
    const labs = [
      tint(stage.label('SA node', H(-1.85, 1.2, 0.3), heart.root), 'gold'),
      tint(stage.label('AV node', H(-1.9, -0.25, 0.3), heart.root), 'gold'),
      tint(stage.label('Bundle of His and branches', vf(-0.2, -2.3, 1.0), heart.root), 'gold'),
      tint(stage.label('Purkinje fibres', vf(1.65, -1.2, -0.4), heart.root), 'gold'),
    ];
    const stepL = tint(stage.label('', [0, 3.3, 0], root), 'gold');

    const drv = makeDriver(heart);
    let st = { hr: 70, t: 0 }, acc = 0, step = '';
    const chart = canvasTexture(1000, 400, (g, w, h) => drawECG(g, w, h, st));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 3.28), new THREE.MeshBasicMaterial({ map: chart.tex, transparent: true, toneMapped: false }));
    board.position.set(-0.35, 2.3, 0.3); stage.root.add(board);
    const c = new THREE.Color();
    const fit = fitNarrow(stage, { pos: [1.1, 4.3, 10.5], target: [1.0, 4.0, 0] });
    return compactReadout(stage, {
      update(dt, s) {
        dt = Math.max(0, dt); fit();
        drv.update(dt, atRate(s.hr), s.speed, { flow: false });
        const e = ecgTimes(s.hr), t = drv.t, PR = e.PR;
        if (Math.abs(PR - builtPR) > 1e-3) buildWiring(PR);
        st = { hr: s.hr, t };
        wg.visible = s.wiring; labs.forEach((l) => { l.visible = s.wiring && stage.host.clientWidth >= 560; });
        // Muscle colours: bright at the wavefront, warm while excited, back to rest as it recovers.
        for (const cell of cells) {
          const { act, kind, col } = cell;
          for (let i = 0; i < act.length; i++) {
            const ta = kind[i] ? PR + act[i] : act[i];
            const apd = kind[i] ? e.QT - 0.03 - 0.5 * act[i] : 0.12;          // later-excited cells recover sooner
            const ph = t - ta;
            if (ph >= 0 && ph < 0.025) c.copy(FRONT).lerp(ON, ph / 0.025);
            else if (ph >= 0.025 && ph < apd) c.copy(ON).lerp(REST, clamp((ph - 0.025) / apd, 0, 1) * 0.35 + 0.25);
            else if (ph >= apd && ph < apd + 0.06) c.copy(ON).lerp(REST, 0.6 + 0.4 * ((ph - apd) / 0.06));
            else c.copy(REST);
            col.setXYZ(i, c.r, c.g, c.b);
          }
          col.needsUpdate = true;
        }
        // The wiring glows as the impulse passes; a spark runs along each path.
        for (const p of paths) {
          const k = (t - p.t0) / Math.max(1e-3, p.t1 - p.t0);
          p.mat.opacity = k >= 0 && k <= 1.6 ? 1 : 0.35;
          p.spark.visible = k >= 0 && k <= 1;
          if (p.spark.visible) p.spark.position.copy(p.curve.getPointAt(clamp(k, 0, 1)));
        }
        const saGlow = t < 0.03, avGlow = t >= 0.03 && t < PR - 0.03;
        nodes[0].scale.setScalar(saGlow ? 1.8 : 1); nodes[1].scale.setScalar(avGlow ? 1.3 + 0.3 * Math.sin(t * 90) : 1);
        step = t < 0.02 ? 'SA node fires' : t < 0.1 ? 'Atria excited: P wave' : t < PR - 0.03 ? 'Held at the AV node' : t < PR ? 'Down the bundle of His' : t < PR + 0.09 ? 'Ventricles excited: QRS' : t < e.tEnd ? 'Ventricles recover: T wave' : 'Resting, waiting for the next spark';
        stepL.element.innerHTML = `<b>${step}</b>`;
        acc += dt; if (acc > 1 / 30) { acc = 0; chart.redraw(); }
      },
      readout: (s) => {
        const e = ecgTimes(s.hr);
        return `<div class="big">${step || 'SA node fires'}</div>
          <div class="row"><span>SA node fires every</span><b>${e.RR.toFixed(2)} s (${Math.round(s.hr)}/min)</b></div>
          <div class="row"><span>PR interval (includes the AV delay)</span><b>${e.PR.toFixed(2)} s</b></div>
          <div class="row"><span>QRS: ventricles excited</span><b>${e.qrsDur.toFixed(2)} s</b></div>
          <div class="row"><span>QT: excite and recover</span><b>${e.QT.toFixed(2)} s</b></div>
          <small>${s.hr < 60 ? 'Under 60 a minute is called bradycardia. It is normal in many fit people and during sleep.' : s.hr > 100 ? 'Over 100 a minute at rest is called tachycardia. During exercise it is normal.' : 'A normal resting rhythm from the SA node is called sinus rhythm.'}</small>`;
      },
    });
  },
};
