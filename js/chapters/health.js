// Chapter 6: keeping the heart healthy, and what goes wrong. General facts only, never advice.
// Scene 1: a coronary artery narrowed by plaque (atherosclerosis). Poiseuille's law says flow
// through a tube, for the same pressure push, goes as radius⁴. The narrowing sits in series with
// the rest of the heart's small vessels, whose resistance we take as 100× that of the healthy
// segment, so the muscle beyond barely notices a mild narrowing but is starved by a severe one.
// (Real arteries also widen downstream vessels to compensate; see Gould & Lipscomb, Am J Cardiol
// 34:48, 1974, where resting flow held up until about 85% narrowing.)
// Scene 2: CPR. Adult guidance from the AHA (2020 Guidelines) and the European Resuscitation
// Council (2021 Guidelines): push on the lower half of the breastbone 100–120 times a minute,
// 5–6 cm deep, letting the chest come fully back up. Chest compressions provide roughly a quarter
// to a third of normal cardiac output (AHA; e.g. Meaney et al., Circulation 128:417, 2013).
// Risk factors: WHO fact sheet "Cardiovascular diseases (CVDs)", 2021:
// https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)
import { THREE, M, latheX, rod, box, tube, clamp, lerp } from '../kit.js';
import { compactReadout, makeHeart, makeDriver, tint, pathOf, RED, MUSCLE } from '../heart.js';

const R0 = 0.55;                                  // artery radius in the model
const BED = 0.01;                                 // healthy segment resistance / rest of the bed
const plaqueProfile = (n) => { const pts = []; for (let i = 0; i <= 40; i++) { const x = -1.6 + (3.2 * i) / 40, b = Math.cos((x / 1.6) * Math.PI / 2) ** 2; pts.push([x, R0 * 0.98 * (1 - n * b)]); } return pts; };
export const flowLeft = (n) => (1 + BED) / (1 + BED / Math.pow(Math.max(1e-3, 1 - n), 4));

const VIEWS = { artery: { pos: [-1.2, 4.9, 9.4], target: [-1.35, 3.95, 0] }, cpr: { pos: [4.6, 5.2, 5.2], target: [-1.6, 1.9, -0.6] } };

export default {
  id: 'health',
  short: 'Healthy heart',
  title: 'Keeping it healthy, and what goes wrong',
  subtitle: 'Narrowed arteries, heart attacks, CPR, and the habits that protect you.',
  view: VIEWS.artery,
  learn: `<p>Heart and blood-vessel diseases are the world’s leading cause of death, so they are worth understanding. This chapter shares general facts only. For anything about your own heart, <b>talk to a doctor</b>.</p>
    <p><b>Narrowed arteries.</b> Over many years, fatty deposits called <b>plaque</b> can build up inside the coronary arteries: <b>atherosclerosis</b>. Poiseuille's law says the flow through a tube, for the same push, goes with its radius to the <b>fourth power</b>, so halving the radius cuts the flow to one-sixteenth. Arteries cope with mild narrowing, but a severe one starves the muscle beyond it, which can cause chest pain on effort. If a plaque cracks, a clot can block the artery completely: a <b>heart attack</b>. Doctors can open arteries with a tiny balloon and a mesh tube, a <b>stent</b>.</p>
    <p><b>Warning signs</b> of a heart attack include pain or pressure in the chest that may spread to the arm, jaw or back, breathlessness, sweating and feeling sick. It is an emergency: call for help straight away (<b>112</b> or <b>108</b> in India). Other problems: <b>valves</b> can become stiff or leaky, and in <b>heart failure</b> the heart can't pump as well as the body needs. Both are treatable, and a doctor can explain the options.</p>
    <p><b>CPR.</b> If someone collapses and isn’t breathing normally, call the emergency number and push hard and fast in the centre of the chest, <b>100–120 times a minute, 5–6 cm deep</b>. Your hands become the pump, keeping some blood flowing to the brain until help or a defibrillator (AED) arrives. A certified course teaches it properly.</p>
    <p><b>What protects the heart.</b> The WHO lists the main risks: tobacco, unhealthy diet, too little physical activity, harmful alcohol, and the high blood pressure, blood sugar and cholesterol they can lead to; air pollution adds to them. Regular exercise makes the heart pump more per beat, which is why fit people often have a lower resting heart rate.</p>
    <p class="tip"><b>Try it:</b> narrow the artery slowly and watch the muscle beyond it change colour, then switch to CPR and find the right rate and depth.</p>`,
  terms: [
    { t: 'Atherosclerosis', d: 'The slow build-up of fatty plaque inside artery walls, which narrows and stiffens them.' },
    { t: 'Heart attack', d: 'Damage to heart muscle when its blood supply is blocked, usually by a clot on a plaque. An emergency.' },
    { t: 'Stent', d: 'A small mesh tube placed inside a narrowed artery to hold it open.' },
    { t: 'Heart failure', d: 'When the heart can’t pump as much blood as the body needs. It does not mean the heart has stopped.' },
    { t: 'CPR', d: 'Cardiopulmonary resuscitation: chest compressions (and sometimes rescue breaths) that keep blood moving when the heart has stopped.' },
    { t: 'AED', d: 'Automated external defibrillator: a device that talks you through giving a shock to restart a normal rhythm.' },
  ],
  defaults: { scene: 'artery', narrow: 0.3, clot: false, stent: false, rate: 110, depth: 5.5 },
  controls: [
    { key: 'scene', type: 'seg', label: 'Show', options: [{ v: 'artery', label: 'Narrowed artery' }, { v: 'cpr', label: 'CPR' }] },
    { key: 'narrow', type: 'range', label: 'Plaque: how narrowed', min: 0, max: 0.95, step: 0.01, ends: ['clear', 'nearly blocked'], fmt: (v) => Math.round(v * 100) + '% of the width' },
    { key: 'clot', type: 'toggle', label: 'A clot forms on the plaque' },
    { key: 'fix', type: 'buttons', label: 'Treatment (by doctors)', items: [{ label: 'Balloon and stent', act: (s) => { s.stent = true; s.clot = false; s.narrow = 0.08; } }, { label: 'Reset', act: (s) => { s.stent = false; s.clot = false; s.narrow = 0.3; } }] },
    { key: 'rate', type: 'range', label: 'CPR: pushes per minute', min: 60, max: 150, step: 1, ends: ['too slow', 'too fast'], fmt: (v) => Math.round(v) + '/min' },
    { key: 'depth', type: 'range', label: 'CPR: push depth', min: 2, max: 8, step: 0.1, ends: ['shallow', 'deep'], fmt: (v) => v.toFixed(1) + ' cm' },
  ],
  quiz: [
    { q: 'An artery’s radius is halved by plaque. By Poiseuille’s law, the flow through that part for the same push falls to…', options: ['1/2', '1/4', '1/16', 'No change'], answer: 2, why: 'Flow goes with radius to the fourth power: (1/2)⁴ = 1/16.' },
    { q: 'What usually causes a heart attack?', options: ['The heart getting tired', 'A clot blocking a narrowed coronary artery', 'A leaky valve', 'Too much exercise'], answer: 1, why: 'A plaque can crack and a clot forms on it, cutting off blood to part of the heart muscle.' },
    { q: 'Adult CPR guidelines say to push…', options: ['30 times a minute, 1 cm deep', '100–120 times a minute, about 5–6 cm deep', 'As slowly as possible', 'Only on the stomach'], answer: 1, why: 'Hard and fast, in the centre of the chest, letting it come back up each time (AHA and ERC guidelines).' },
  ],
  reel: [
    { ms: 5600, caption: 'Plaque narrows a coronary artery. Halve its width and, at the same push, a sixteenth of the blood gets through.', set: { scene: 'artery', clot: false, stent: false }, anim: { narrow: [0.1, 0.8] }, view: { pos: [0.3, 4.6, 8.8], target: [0.3, 3.5, 0] }, spin: 0 },
    { ms: 5000, caption: 'If someone collapses: call for help, then push hard and fast, 100 to 120 times a minute.', set: { scene: 'cpr', rate: 110, depth: 5.5 }, spin: 0.2 },
  ],

  build({ stage }) {
    // ---------------------------------------------------- artery scene
    const art = new THREE.Group(); art.position.set(0, 3.4, 0); stage.root.add(art);
    const wall = rod(-4, 4, R0, R0, new THREE.MeshPhysicalMaterial({ color: 0xe06a74, transparent: true, opacity: 0.28, roughness: 0.3, clearcoat: 0.6, depthWrite: false, side: THREE.DoubleSide }), 48, true);
    art.add(wall);
    let plaque = null, shownN = -1;
    const plaqueMat = new THREE.MeshStandardMaterial({ color: 0xf2d27a, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false });
    const setPlaque = (n) => { if (plaque) { art.remove(plaque); plaque.geometry.dispose(); } plaque = latheX(plaqueProfile(n), plaqueMat, { seg: 48 }); art.add(plaque); shownN = n; };
    const clot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M.matte(0x5a0f18)); clot.scale.set(0.35, 0.25, 0.25); art.add(clot);
    const stentG = new THREE.Group(); art.add(stentG);
    for (let i = 0; i < 9; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.9, 0.018, 6, 24), M.metal(0xd8dde6)); r.rotation.y = Math.PI / 2; r.position.x = -1.6 + i * 0.4; stentG.add(r); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const b = rod(-1.6, 1.6, 0.012, 0.012, M.metal(0xd8dde6), 6); b.position.set(0, Math.cos(a) * R0 * 0.9, Math.sin(a) * R0 * 0.9); stentG.add(b); }
    // Heart muscle the artery feeds: healthy before the narrowing, at risk after it.
    const muscleMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
    const before = box(3.6, 0.5, 2.6, muscleMat(MUSCLE)); before.position.set(-2.2, -0.85, 0);
    const beyond = box(3.6, 0.5, 2.6, muscleMat(MUSCLE)); beyond.position.set(2.2, -0.85, 0);
    art.add(before, beyond);
    const path = pathOf([[-4, 0, 0], [4, 0, 0]]);
    const N = 160, dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), M.glow(RED), N);
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dots.frustumCulled = false; art.add(dots);
    const u = Float32Array.from({ length: N }, (_, i) => i / N), ang = Float32Array.from({ length: N }, (_, i) => i * 2.39996), rad = Float32Array.from({ length: N }, (_, i) => Math.sqrt(((i * 0.618) % 1)));
    const o = new THREE.Object3D(), p = new THREE.Vector3();
    const artLabs = [
      tint(stage.label('Coronary artery', [-3.3, 0.85, 0], art), 'red'),
      tint(stage.label('Plaque', [0, 0.95, 0], art), 'gold'),
      tint(stage.label('Heart muscle it feeds', [2.4, -1.45, 1.2], art), ''),
    ];
    const status = tint(stage.label('', [2.2, 1.2, 0], art), 'gold');

    // ---------------------------------------------------- CPR scene
    const cpr = new THREE.Group(); cpr.position.set(-1.2, 0, 0); stage.root.add(cpr);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0xd9a47e, transparent: true, opacity: 0.2, roughness: 0.6, depthWrite: false });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 2.6, 8, 24), torsoMat); torso.rotation.x = Math.PI / 2; torso.scale.set(1.15, 1, 0.62); torso.position.set(0, 1.05, 0.2); cpr.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 20), torsoMat); head.position.set(0, 1.1, -3.45); cpr.add(head);
    const sternum = box(0.35, 0.08, 1.9, M.matte(0xefe6d6)); sternum.position.set(0, 1.72, -1.4); cpr.add(sternum);
    const heart = makeHeart(stage, { labels: false, flow: true, coronary: true, pericardium: false });
    heart.root.scale.setScalar(0.34); heart.root.rotation.x = -Math.PI / 2; heart.root.position.set(0.15, 1.05, -1.3); cpr.add(heart.root);
    heart.setXray(0.6);
    const hands = new THREE.Group(); cpr.add(hands);
    const skinM = M.matte(0xc98e66);
    const h1 = box(0.8, 0.22, 0.95, skinM); const h2 = box(0.8, 0.22, 0.95, skinM); h2.position.y = 0.24; h2.rotation.y = Math.PI / 2;
    const arm1 = rod(0, 2.6, 0.16, 0.16, skinM, 16); arm1.rotation.z = Math.PI / 2; arm1.position.set(-0.25, 1.5, 0.35);
    const arm2 = arm1.clone(); arm2.position.x = 0.25;
    hands.add(h1, h2, arm1, arm2);
    hands.position.set(0, 1.86, -1.05);
    const cprLabs = [
      tint(stage.label('Hands on the lower half of the breastbone', [1.9, 3.2, -1.05], cpr), 'gold'),
      tint(stage.label('Heart squeezed between breastbone and spine', [2.2, 0.6, -1.3], cpr), 'red'),
    ];
    const depthL = tint(stage.label('', [-1.9, 2.4, -1.05], cpr), 'side');
    const drv = makeDriver(heart);

    let t = 0, flowK = 1, lastScene = null, push = 0;
    const cBefore = new THREE.Color(MUSCLE), cStarved = new THREE.Color(0x4a3a52), col = new THREE.Color();
    const api = {
      update(dt, s) {
        dt = Math.max(0, dt); t += dt;
        if (s.scene !== lastScene) { if (lastScene !== null || s.scene !== 'artery') stage.setView(VIEWS[s.scene].pos, VIEWS[s.scene].target, 0.9); lastScene = s.scene; }
        const narrowOn = stage.host.clientWidth >= 560;
        art.visible = s.scene === 'artery'; cpr.visible = s.scene === 'cpr';
        artLabs.forEach((l) => { l.visible = art.visible && narrowOn; }); status.visible = art.visible;
        cprLabs.forEach((l) => { l.visible = cpr.visible && narrowOn; }); depthL.visible = cpr.visible;
        if (art.visible) {
          if (Math.abs(s.narrow - shownN) > 0.004) setPlaque(s.narrow);
          const q = s.clot ? 0 : flowLeft(s.narrow);
          flowK = lerp(flowK, q, 1 - Math.exp(-dt * 4));
          clot.visible = s.clot; stentG.visible = s.stent;
          clot.scale.set(0.5, R0 * (1 - s.narrow) * 1.05, R0 * (1 - s.narrow) * 1.05);
          beyond.material.color.copy(cBefore).lerp(cStarved, clamp(1 - flowK, 0, 1) ** 1.5);
          const beat = 0.6 + 0.4 * Math.max(0, Math.sin(t * 7.3));
          for (let i = 0; i < N; i++) {
            const x = -4 + u[i] * 8, b = Math.abs(x) < 1.6 ? Math.cos((x / 1.6) * Math.PI / 2) ** 2 : 0, rr = R0 * 0.85 * (1 - s.narrow * b);
            // Continuity: the same flow squeezes through a narrow part faster (see bernoulliclear).
            const speed = (1.6 * flowK * beat) * (R0 * R0 * 0.72) / Math.max(0.01, rr * rr);
            u[i] = (u[i] + (Math.min(0.6, speed) * dt) / 8) % 1;
            path.at(u[i], p);
            o.position.set(p.x, Math.cos(ang[i]) * rad[i] * rr, Math.sin(ang[i]) * rad[i] * rr); o.updateMatrix(); dots.setMatrixAt(i, o.matrix);
          }
          dots.instanceMatrix.needsUpdate = true;
          status.element.innerHTML = s.clot ? '<b>Blocked: heart attack. Call for help now.</b>' : flowK < 0.5 ? '<b>Muscle beyond is short of blood</b>' : '<b>Muscle beyond is getting enough blood</b>';
        }
        if (cpr.visible) {
          const f = s.rate / 60, ph = (t * f) % 1, d = (s.depth / 100) * 12 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2));   // 12 units ≈ 1 m in this scene
          push = d;
          hands.position.y = 1.86 - d; sternum.position.y = 1.72 - d;
          heart.root.scale.set(0.34, 0.34, 0.34 * (1 - d * 0.35));   // squeezed front to back
          drv.update(0, { hr: 70 }, 0, { beatOn: false, flow: false });
          heart.flow.step(dt, { mv: 1, av: 1, fill: 0.3, eject: clamp(d * 2, 0, 1) * clamp(s.depth / 5, 0, 1) }, 1);
          depthL.element.innerHTML = `<b>${s.depth.toFixed(1)} cm · ${Math.round(s.rate)}/min</b>`;
        }
      },
      readout: (s) => {
        if (s.scene === 'cpr') {
          const rOk = s.rate >= 100 && s.rate <= 120, dOk = s.depth >= 5 && s.depth <= 6;
          return `<div class="big">${rOk && dOk ? 'Good compressions' : 'Adjust: see below'}</div>
            <div class="row"><span>Rate (guideline 100–120/min)</span><b class="${rOk ? 'ok' : 'no'}">${Math.round(s.rate)}/min ${rOk ? '✓' : s.rate < 100 ? 'faster' : 'slower'}</b></div>
            <div class="row"><span>Depth (guideline 5–6 cm)</span><b class="${dOk ? 'ok' : 'no'}">${s.depth.toFixed(1)} cm ${dOk ? '✓' : s.depth < 5 ? 'deeper' : 'less deep'}</b></div>
            <div class="row"><span>Blood moved vs a beating heart</span><b>roughly ¼ to ⅓</b></div>
            <small>Call the emergency number first (112, or 108 for an ambulance in India). Use an AED if one is nearby. A certified course teaches CPR properly.</small>`;
        }
        const q = s.clot ? 0 : flowLeft(s.narrow), r = 1 - s.narrow;
        return `<div class="big">${s.clot ? 'Artery blocked' : `Flow to the muscle: ${Math.round(q * 100)}%`}</div>
          <div class="row"><span>Width left at the narrowest point</span><b>${Math.round(r * 100)}%</b></div>
          <div class="row"><span>Poiseuille: this part alone, same push (r⁴)</span><b>${s.clot ? '0' : (Math.pow(r, 4) * 100).toFixed(r > 0.3 ? 0 : 1)}%</b></div>
          <div class="row"><span>With the rest of the heart's vessels in line</span><b>${Math.round(q * 100)}%</b></div>
          <small>${s.clot ? 'A clot on a plaque has cut off the blood. This is a heart attack: an emergency. Call 112 (108 for an ambulance in India).' : s.stent ? 'A stent holds the artery open. Doctors decide who needs one.' : 'Mild narrowing barely changes the flow, which is why it often causes no symptoms. Severe narrowing starves the muscle. Only a doctor can check your arteries.'}</small>`;
      },
    };
    setPlaque(0.3);
    return compactReadout(stage, api);
  },
};
