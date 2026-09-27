// Chapter 4: the two circulations. Blood leaves the right heart for the lungs (pulmonary
// circulation), comes back to the left heart, leaves for the body (systemic circulation) and
// returns to the right heart: a figure of eight with the heart in the middle.
// Numbers (Guyton & Hall, ch. 14, 20, 41): about 5 L of blood; cardiac output about 5 L/min at
// rest, so one lap takes about a minute; arterial O2 saturation about 98%, mixed venous about 75%
// at rest; the body uses about 250 mL O2/min at rest. In exercise, venous saturation follows Fick's
// principle: SvO2 = SaO2 − VO2 / (CO × 1.34 × Hb). Coronary flow about 225 mL/min (4–5% of output).
import { THREE, M, tube, clamp } from '../kit.js';
import { compactReadout, fitNarrow, makeHeart, makeDriver, tint, ROUTES, VESSELS, smoothPts, pathOf, eggGeometry, BLUE, RED } from '../heart.js';
import { beat, exerciseParams, venousSat, REF } from '../physio.js';

const HP = new THREE.Vector3(0.1, 4.25, 0), HS = 0.55;           // heart position and scale in the scene
const W = (p) => p.clone().multiplyScalar(HS).add(HP);
const LAP_SPEEDUP = 12;                                          // the animation runs 12× faster than life

// A pseudo-random wiggle through a capillary bed between a and b, passing near c.
function bed(a, c, b, spread, seed, n = 7) {
  const r = (i) => { const x = Math.sin(i * 91.7 + seed * 13.1) * 43758.5; return x - Math.floor(x) - 0.5; };
  const pts = [a];
  for (let i = 1; i < n; i++) {
    const k = i / n, base = k < 0.5 ? a.clone().lerp(c, k * 2) : c.clone().lerp(b, (k - 0.5) * 2);
    pts.push(base.add(new THREE.Vector3(r(i) * spread, r(i + 20) * spread, r(i + 40) * spread * 0.5)));
  }
  pts.push(b);
  return pts;
}

// The colour of blood at a given oxygen saturation: red when full, blue (the textbook convention)
// when it has given oxygen away, darker still after hard exercise.
const cRed = new THREE.Color(RED), cBlue = new THREE.Color(BLUE);
export function satColor(sat, out) {
  const k = clamp((sat - 0.75) / (0.98 - 0.75), 0, 1);
  out.copy(cBlue).lerp(cRed, k);
  if (sat < 0.75) out.multiplyScalar(0.55 + 0.45 * (sat / 0.75));
  return out;
}

export default {
  id: 'circuits',
  short: 'Two circuits',
  title: 'Two circuits, one heart',
  subtitle: 'To the lungs and back, to the body and back: a figure of eight.',
  view: { pos: [-0.9, 5.0, 14.2], target: [-1.25, 4.75, 0] },
  learn: `<p>Your blood travels round <b>two loops</b>, and it passes through the heart once for each.</p>
    <p>In the <b>pulmonary circulation</b>, the right ventricle pumps oxygen-poor blood to the <b>lungs</b>. There it squeezes through capillaries thinner than a hair, wrapped round tiny air sacs, dumps carbon dioxide and picks up oxygen. It returns to the left atrium bright red, about <b>98% full</b> of oxygen.</p>
    <p>In the <b>systemic circulation</b>, the left ventricle pumps it through the aorta to every organ. In the body's capillaries it hands over oxygen and comes back through the veins to the right atrium, still about <b>75% full</b> at rest. That spare oxygen is a reserve for when you run.</p>
    <p>An adult has about <b>5 litres</b> of blood, and at rest the heart pumps about 5 litres a minute. So a drop of blood makes the whole trip in <b>about a minute</b>. The heart muscle feeds itself through the <b>coronary arteries</b>, which take about 4–5% of each beat. William Harvey worked out this circulation in 1628, by showing that the heart pumps far more blood than the body could possibly make.</p>
    <p class="tip"><b>Try it:</b> turn on "follow one drop", then move from resting to running and watch the drop speed up and the returning blood get darker.</p>`,
  terms: [
    { t: 'Pulmonary circulation', d: 'The loop from the right heart through the lungs to the left heart.' },
    { t: 'Systemic circulation', d: 'The loop from the left heart through the body to the right heart.' },
    { t: 'Capillary', d: 'The tiniest blood vessel, one cell thick, where oxygen and food pass into the tissues.' },
    { t: 'Oxygen saturation', d: 'How full of oxygen the haemoglobin in blood is: about 98% in arteries.' },
    { t: 'Artery and vein', d: 'Arteries carry blood away from the heart; veins carry it back.' },
  ],
  defaults: { activity: 0, follow: true },
  controls: [
    { key: 'activity', type: 'range', label: 'What you are doing', min: 0, max: 1, step: 0.01, ends: ['resting', 'running hard'], fmt: (v) => (v < 0.15 ? 'resting' : v < 0.45 ? 'walking' : v < 0.75 ? 'jogging' : 'running hard') },
    { key: 'follow', type: 'toggle', label: 'Follow one drop' },
  ],
  quiz: [
    { q: 'Where does blood pick up oxygen?', options: ['In the heart', 'In the lung capillaries', 'In the aorta', 'In the veins'], answer: 1, why: 'Only in the lungs is blood next to fresh air, across walls one cell thick.' },
    { q: 'About how long does one full trip round the body take at rest?', options: ['1 second', 'About 1 minute', 'About 1 hour', 'A day'], answer: 1, why: 'About 5 L of blood pumped at about 5 L per minute: roughly a minute per lap.' },
    { q: 'The pulmonary artery carries…', options: ['Oxygen-rich blood to the body', 'Oxygen-poor blood to the lungs', 'Blood to the heart muscle', 'Air'], answer: 1, why: 'Arteries go away from the heart. This one takes oxygen-poor blood to the lungs.' },
  ],
  reel: [
    { ms: 5800, caption: 'Blood loops twice: right heart to the lungs, left heart to the body. One lap takes about a minute.', set: { activity: 0, follow: true }, view: { pos: [0.4, 4.7, 11.6], target: [0.2, 4.4, 0] }, spin: 0 },
  ],

  build({ stage }) {
    const scene = new THREE.Group(); stage.root.add(scene);
    const heart = makeHeart(stage, { labels: false, flow: false, coronary: true, pericardium: false });
    heart.root.position.copy(HP); heart.root.scale.setScalar(HS); scene.add(heart.root);
    heart.setXray(1);

    // Lungs, head and arms, rest of the body.
    const lungMat = new THREE.MeshStandardMaterial({ color: 0xf2a7b6, transparent: true, opacity: 0.22, roughness: 0.7, depthWrite: false });
    const lungR = new THREE.Mesh(eggGeometry([1.05, 1.6, 0.8], -0.15), lungMat); lungR.position.set(-3.1, 5.0, -0.5);
    const lungL = new THREE.Mesh(eggGeometry([0.95, 1.55, 0.8], -0.15), lungMat); lungL.position.set(3.2, 5.0, -0.5);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0xe8c9a8, transparent: true, opacity: 0.16, roughness: 0.7, depthWrite: false });
    const headB = new THREE.Mesh(eggGeometry([1.3, 0.6, 0.6]), bedMat); headB.position.set(0.9, 7.55, -0.5);
    const bodyB = new THREE.Mesh(eggGeometry([2.1, 0.75, 0.7]), bedMat); bodyB.position.set(0.0, 1.0, -0.5);
    scene.add(lungR, lungL, headB, bodyB);
    const lab = [
      tint(stage.label('Right lung: picks up O₂', [-3.1, 3.1, -0.5], scene), 'red'),
      tint(stage.label('Left lung', [3.2, 3.15, -0.5], scene), 'red'),
      tint(stage.label('Head and arms', [2.9, 7.6, -0.5], scene), 'blue'),
      tint(stage.label('Rest of the body: gives O₂ away', [0, 0.05, -0.5], scene), 'blue'),
      tint(stage.label('Heart', [1.6, 3.2, 0.5], scene), ''),
    ];

    // Build the four figure-of-eight loops, each tagged so we know the oxygen level along it.
    const rpaEnd = W(VESSELS.rpa.at(-1)), lpaEnd = W(VESSELS.lpa.at(-1));
    const rLung = (to, seed) => bed(rpaEnd, lungR.position.clone().add(new THREE.Vector3(0, 0.3, 0.2)), to, 1.1, seed);
    const lLung = (to, seed) => bed(lpaEnd, lungL.position.clone().add(new THREE.Vector3(0, 0.3, 0.2)), to, 1.0, seed);
    const svcTop = W(VESSELS.svc[0]), ivcBot = W(VESSELS.ivc[0]);
    const head = (from, seed) => [...bed(from, headB.position.clone().add(new THREE.Vector3(0, 0, 0.3)), new THREE.Vector3(-0.2, 7.0, -0.2), 0.9, seed), svcTop.clone().add(new THREE.Vector3(0, 0.8, 0)), svcTop];
    const body = (from, seed) => [from.clone().add(new THREE.Vector3(0, -0.5, 0)), ...bed(from.clone().add(new THREE.Vector3(0.1, -1.0, 0)), bodyB.position.clone().add(new THREE.Vector3(0, 0, 0.3)), new THREE.Vector3(-1.1, 1.6, -0.2), 1.6, seed), ivcBot.clone().add(new THREE.Vector3(0, -0.6, 0)), ivcBot];
    const inside = (r) => smoothPts(r.pts.map(W), 90);
    const R = ROUTES.right, L = ROUTES.left;
    const loopDefs = [
      [[inside(R[2]), 'v'], [rLung(W(VESSELS.rpvI[0]), 1), 'lung'], [inside(L[2]), 'a'], [head(W(VESSELS.carotid.at(-1)), 2), 'tissue']],
      [[inside(R[1]), 'v'], [rLung(W(VESSELS.rpvS[0]), 3), 'lung'], [inside(L[0]), 'a'], [body(W(VESSELS.aorta.at(-1)), 4), 'tissue']],
      [[inside(R[0]), 'v'], [lLung(W(VESSELS.lpvS[0]), 5), 'lung'], [inside(L[1]), 'a'], [head(W(VESSELS.brachio.at(-1)), 6), 'tissue']],
      [[inside(R[3]), 'v'], [lLung(W(VESSELS.lpvI[0]), 7), 'lung'], [inside(L[3]), 'a'], [body(W(VESSELS.aorta.at(-1)), 8), 'tissue']],
    ];
    const loops = loopDefs.map((segs) => {
      const pts = [], marks = [];
      segs.forEach(([p, kind]) => { marks.push({ i: pts.length, kind }); pts.push(...p); });
      const path = pathOf(pts);
      const ranges = marks.map((m, j) => ({ kind: m.kind, u0: path.uAt(m.i), u1: j + 1 < marks.length ? path.uAt(marks[j + 1].i) : 1 }));
      return { path, ranges };
    });
    // Vessels outside the heart, as faint tubes.
    const vesselMat = (c) => new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.22, roughness: 0.5, depthWrite: false });
    loopDefs.forEach((segs) => segs.forEach(([p, kind]) => { if (kind === 'lung' || kind === 'tissue') scene.add(tube(smoothPts(p, 60), 0.05, vesselMat(kind === 'lung' ? 0xb08fff : 0xff9aa6), false, 80)); }));

    // Blood dots.
    const per = 70, N = loops.length * per;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N);
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dots.frustumCulled = false; scene.add(dots);
    const u = new Float32Array(N).map((_, i) => ((i % per) + ((i * 0.618) % 1)) / per);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), M.glow(0xffffff));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 32), M.glow(0xffd166));
    scene.add(star, ring);
    const starL = tint(stage.label('', [0, 0.45, 0], star), 'gold');
    const o = new THREE.Object3D(), p = new THREE.Vector3(), col = new THREE.Color();

    const drv = makeDriver(heart);
    let sv = 0.75, lapT = 60, co = 5, vo2 = 250, satNow = 0.75, place = '';
    const satAt = (loop, uu) => {
      const r = loop.ranges.find((x) => uu >= x.u0 && uu < x.u1) || loop.ranges[0];
      const k = (uu - r.u0) / Math.max(1e-6, r.u1 - r.u0);
      if (r.kind === 'v') return [sv, 'right heart'];
      if (r.kind === 'a') return [REF.sao2 / 100, 'left heart and arteries'];
      if (r.kind === 'lung') return [k < 0.2 ? sv : k < 0.55 ? sv + (REF.sao2 / 100 - sv) * ((k - 0.2) / 0.35) : REF.sao2 / 100, 'lung capillaries'];
      return [k < 0.2 ? REF.sao2 / 100 : k < 0.7 ? REF.sao2 / 100 + (sv - REF.sao2 / 100) * ((k - 0.2) / 0.5) : sv, k < 0.7 ? 'body capillaries' : 'veins, heading home'];
    };
    const fit = fitNarrow(stage, { pos: [0.3, 4.4, 13], target: [0.2, 4.2, 0] });
    return compactReadout(stage, {
      update(dt, s) {
        dt = Math.max(0, dt); fit();
        const ex = exerciseParams(s.activity), b = beat(ex);
        co = b.co; vo2 = REF.vo2Rest + s.activity * 2750;           // up to ≈ 3 L O2/min, a fit young adult's peak
        sv = venousSat(co, vo2);
        lapT = REF.bloodVolume / co * 60;                          // seconds for one lap in real life
        drv.update(dt, ex, 1, { flow: false });
        const pulse = 0.75 + 0.5 * (drv.q?.eject || 0);
        for (let L = 0; L < loops.length; L++) {
          const loop = loops[L], v = (LAP_SPEEDUP / lapT) * dt;
          for (let j = 0; j < per; j++) {
            const i = L * per + j;
            const [sat] = satAt(loop, u[i]);
            u[i] = (u[i] + v * (sat > 0.9 ? pulse : 1)) % 1;
            loop.path.at(u[i], p);
            o.position.copy(p); o.updateMatrix(); dots.setMatrixAt(i, o.matrix);
            dots.setColorAt(i, satColor(satAt(loop, u[i])[0], col));
          }
        }
        dots.instanceMatrix.needsUpdate = true; dots.instanceColor.needsUpdate = true;
        star.visible = ring.visible = s.follow;
        if (s.follow) {
          const [sat, where] = satAt(loops[1], u[per]);
          loops[1].path.at(u[per], star.position); ring.position.copy(star.position); ring.lookAt(stage.camera.position);
          star.material.color.copy(satColor(sat, col)).lerp(new THREE.Color(0xffffff), 0.35);
          satNow = sat; place = where;
          starL.element.innerHTML = `<b>${Math.round(sat * 100)}% O₂</b>`;
        }
        lab.forEach((l) => { l.visible = stage.host.clientWidth >= 560 || l === lab[4]; });
      },
      readout: (s) => `<div class="big">One lap: about ${lapT >= 50 ? '1 minute' : Math.round(lapT) + ' seconds'}</div>
        <div class="row"><span>${REF.bloodVolume} L of blood, pumped at</span><b>${co.toFixed(1)} L/min</b></div>
        <div class="row"><span>O₂ in arteries · in veins</span><b>${REF.sao2}% · ${Math.round(sv * 100)}%</b></div>
        <div class="row"><span>O₂ used by the body</span><b>${(vo2 / 1000).toFixed(2)} L/min</b></div>
        <div class="row"><span>Heart's own supply (coronaries)</span><b>≈ ${Math.round(0.045 * co * 1000)} mL/min</b></div>
        <small>${s.follow ? `Your drop: ${place}, ${Math.round(satNow * 100)}% O₂. ` : ''}Shown ${LAP_SPEEDUP}× faster than life.</small>`,
    });
  },
};
