// Chapter 1: the heart itself. Four chambers, four valves, the great vessels, the coronary
// arteries and the pericardium, with blood flowing through in the right order.
import { THREE } from '../kit.js';
import { compactReadout, makeHeart, makeDriver, sideLabels, tint, fitNarrow } from '../heart.js';
import { REF } from '../physio.js';

export default {
  id: 'anatomy',
  short: 'Inside the heart',
  title: 'Inside the human heart',
  subtitle: 'Two pumps side by side, four rooms, four one-way doors.',
  view: { pos: [-1.6, 4.2, 8.3], target: [-1.45, 3.85, 0] },
  learn: `<p>Your heart is a muscle about the size of your fist. It sits in the middle of your chest, tipped so its point, the <b>apex</b>, leans to your left. We are looking at it from the front, so the patient's <b>right</b> side is on <b>your left</b>, just like a doctor facing you.</p>
    <p>It is really <b>two pumps</b> joined together. The <b>right side</b> takes oxygen-poor blood (blue here) from the body and sends it to the lungs. The <b>left side</b> takes oxygen-rich blood (red) from the lungs and sends it to the whole body. A wall of muscle, the <b>septum</b>, keeps the two apart.</p>
    <p>Each side has a small upper room, an <b>atrium</b>, that collects blood, and a big lower room, a <b>ventricle</b>, that pumps it out. Four <b>valves</b> act as one-way doors: the <b>tricuspid</b> and <b>mitral</b> valves let blood into the ventricles, and the <b>pulmonary</b> and <b>aortic</b> valves let it out. The left ventricle's wall is about three times thicker than the right's, because it has to push blood all the way to your toes.</p>
    <p>The heart feeds itself too: the <b>coronary arteries</b> on its surface are the first branches off the aorta. A thin bag, the <b>pericardium</b>, wraps the whole heart so it can beat without rubbing.</p>
    <p class="tip"><b>Try it:</b> switch off X-ray to see the outside, then take the heart apart and follow one blue dot all the way until it comes back red.</p>`,
  terms: [
    { t: 'Atrium', d: 'One of the two upper chambers. They collect blood coming back to the heart. Plural: atria.' },
    { t: 'Ventricle', d: 'One of the two lower, stronger chambers that pump blood out of the heart.' },
    { t: 'Valve', d: 'A flap of tissue that lets blood flow only one way, like a one-way door.' },
    { t: 'Aorta', d: 'The body’s biggest artery. It carries oxygen-rich blood from the left ventricle to the body.' },
    { t: 'Vena cava', d: 'One of the two big veins, superior (from above) and inferior (from below), that bring blood back to the right atrium.' },
    { t: 'Coronary arteries', d: 'The small arteries on the heart’s surface that feed the heart muscle itself.' },
  ],
  defaults: { explode: 0, xray: true, beating: true, labels: true },
  controls: [
    { key: 'explode', type: 'range', label: 'Take it apart', min: 0, max: 1, step: 0.01, ends: ['together', 'apart'], fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'xray', type: 'toggle', label: 'X-ray: see the blood inside' },
    { key: 'beating', type: 'toggle', label: 'Beating' },
    { key: 'labels', type: 'toggle', label: 'Labels' },
  ],
  quiz: [
    { q: 'Which side of the heart pumps blood to the lungs?', options: ['The left side', 'The right side', 'Both sides equally', 'Neither: the lungs pull it in'], answer: 1, why: 'The right ventricle sends oxygen-poor blood through the pulmonary artery to the lungs. The left side pumps to the body.' },
    { q: 'Why is the left ventricle’s wall so much thicker?', options: ['It holds more blood', 'It must push blood round the whole body, at higher pressure', 'It is older', 'It has to warm the blood'], answer: 1, why: 'The body circuit is long and needs about 120 mmHg; the lung circuit needs only about 25 mmHg.' },
    { q: 'What do the heart’s valves do?', options: ['Make the heartbeat', 'Keep blood flowing one way only', 'Add oxygen to the blood', 'Filter out germs'], answer: 1, why: 'They open to let blood through and snap shut to stop it flowing backwards.' },
  ],
  reel: [
    { ms: 5000, caption: 'Your heart is a fist-sized muscle that beats about 100,000 times a day.', set: { explode: 0, xray: false, beating: true, labels: false }, view: { pos: [0.3, 4.1, 6.9], target: [0.1, 3.55, 0] }, spin: 0.6 },
    { ms: 5600, caption: 'Inside it is two pumps: the right sends blue blood to the lungs, the left sends red blood to the body.', set: { explode: 0, xray: true, beating: true, labels: false }, view: { pos: [0.3, 4.1, 6.9], target: [0.1, 3.55, 0] }, spin: 0.25 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); root.position.set(0, 3.25, 0); stage.root.add(root);
    const heart = makeHeart(stage);
    root.add(heart.root);
    const sides = sideLabels(stage, root, -1.75, 2.05);
    const front = tint(stage.label('You are facing the patient', [0.2, -2.3, 0.8], root), 'side');
    const drv = makeDriver(heart, { muted: () => true });
    let xr = 1;
    const fit = fitNarrow(stage, { pos: [0.2, 4.2, 8.4], target: [0.15, 3.3, 0] });
    return compactReadout(stage, {
      update(dt, s) {
        dt = Math.max(0, dt);
        xr += ((s.xray ? 1 : 0) - xr) * Math.min(1, dt * 5);
        heart.setXray(xr);
        heart.setExplode(s.explode);
        drv.update(dt, { hr: REF.hrRest }, 1, { beatOn: s.beating });
        const narrow = fit();
        heart.showLabels(s.labels, narrow);
        [...sides, front].forEach((l) => { l.visible = s.labels && !narrow; });
      },
      readout: (s) => `<div class="big">About 100,000 beats a day</div>
        <div class="row"><span>Resting heart rate</span><b>60–100 per minute</b></div>
        <div class="row"><span>Blood pumped per beat</span><b>about ${REF.sv} mL</b></div>
        <div class="row"><span>Size and weight</span><b>a fist, about 300 g</b></div>
        <small>${s.xray ? 'Blue: oxygen-poor blood. Red: oxygen-rich. Real blood is always red, just darker when low on oxygen.' : 'Front view: the patient’s right is on your left.'}</small>`,
    });
  },
};
