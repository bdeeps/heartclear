// HeartClear's 3D heart: a stylised but anatomically placed human heart with its four chambers,
// four valves, great vessels, coronary arteries and pericardium, plus blood that flows through
// it in step with the pump model (physio.js).
//
// Orientation: we look at the patient from the front (anterior view), as in an anatomy atlas.
// So the patient's RIGHT side is on YOUR LEFT. Axes of the heart group: +x = patient's left,
// +y = up (towards the head), +z = forwards (towards you, the chest wall).
// Placement follows standard anatomy (Gray's Anatomy; NHLBI "How the Heart Works"):
//  - the right ventricle forms most of the front surface; the left ventricle forms the apex,
//    which points down, forwards and to the patient's left;
//  - the right atrium is on the right border, fed by the superior and inferior venae cavae;
//  - the left atrium is the most posterior chamber, fed by four pulmonary veins;
//  - the pulmonary trunk leaves the right ventricle in front and to the left of the aorta and
//    splits under the aortic arch; the right pulmonary artery passes behind the ascending aorta;
//  - the left ventricle's wall is about three times thicker than the right's (≈ 10–12 mm vs 3–5 mm).
// One model unit is about 4 cm, so the heart is about 12 cm from base to apex, "the size of a fist".
import { THREE, M, tube, torus, clamp, lerp, approach } from './kit.js';
import { beat, at, atRate, phaseName } from './physio.js';

// Blood colours: oxygen-poor (blue) and oxygen-rich (red), the textbook convention.
// Real blood is always red: dark red when it carries less oxygen, bright red when it is full.
export const BLUE = 0x4f7bff, RED = 0xff3b4a;
export const MUSCLE = 0x93303a;

// ---------------------------------------------------------------- the ventricle frame
// The ventricles are built in their own frame: origin at the middle of the base (the valve plane),
// −y running down the long axis to the apex. The frame is tilted so the apex points down, left and
// forwards, about 45° from vertical, as in a real chest.
export const VF_ROT = new THREE.Euler(-0.42, 0, 0.74, 'ZXY');
export const vf = (x, y, z) => new THREE.Vector3(x, y, z).applyEuler(VF_ROT);

// Key points in heart space (see the header for axes).
export const P = {
  tricuspid: vf(-0.6, 0.02, 0.3),
  mitral: vf(0.36, 0.02, -0.25),
  aortic: new THREE.Vector3(-0.05, 0.1, -0.02),
  pulmonary: new THREE.Vector3(0.22, 0.55, 0.62),
  ra: new THREE.Vector3(-0.98, 0.24, 0.12),
  la: new THREE.Vector3(0.3, 0.52, -0.72),
  apex: vf(0.3, -2.35, -0.15),
  saNode: new THREE.Vector3(-0.88, 0.86, 0.26),
  avNode: new THREE.Vector3(-0.38, 0.0, -0.06),
};

// Vessel centre lines (heart space).
const V = (...a) => a.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
export const VESSELS = {
  svc: V([-1.05, 2.25, -0.05], [-1.05, 1.5, -0.02], [-1.03, 0.9, 0.04]),
  ivc: V([-0.85, -1.45, -0.34], [-0.9, -0.9, -0.26], [-0.95, -0.25, -0.06]),
  aorta: V(P.aortic, [-0.14, 0.6, 0.12], [-0.24, 1.25, 0.16], [-0.18, 1.85, 0.0], [0.08, 2.2, -0.32], [0.48, 2.28, -0.7], [0.74, 1.95, -1.2], [0.76, 1.1, -1.45], [0.74, 0.0, -1.5], [0.72, -1.95, -1.5]),
  brachio: V([0.02, 2.12, -0.3], [-0.2, 2.6, -0.26], [-0.35, 3.0, -0.25]),
  carotid: V([0.3, 2.28, -0.55], [0.3, 2.7, -0.55], [0.32, 3.05, -0.55]),
  subclav: V([0.58, 2.22, -0.85], [0.78, 2.6, -0.9], [1.0, 2.95, -0.92]),
  trunk: V(P.pulmonary, [0.34, 1.05, 0.5], [0.42, 1.4, 0.18], [0.42, 1.5, -0.14]),
  lpa: V([0.42, 1.5, -0.14], [0.95, 1.58, -0.42], [1.45, 1.5, -0.55], [1.95, 1.38, -0.62]),
  rpa: V([0.42, 1.5, -0.14], [-0.1, 1.38, -0.55], [-0.8, 1.32, -0.62], [-1.5, 1.26, -0.64], [-1.95, 1.22, -0.64]),
  rpvS: V([-1.95, 0.85, -0.95], [-1.3, 0.78, -0.92], [-0.35, 0.66, -0.86]),
  rpvI: V([-1.95, 0.3, -0.95], [-1.3, 0.3, -0.92], [-0.3, 0.36, -0.86]),
  lpvS: V([1.95, 0.85, -0.92], [1.45, 0.78, -0.88], [0.92, 0.68, -0.8]),
  lpvI: V([1.95, 0.32, -0.92], [1.45, 0.34, -0.88], [0.92, 0.4, -0.8]),
};

// ---------------------------------------------------------------- shapes
// An egg: a sphere stretched to radii r and narrowed towards −y by `taper` (0 = plain ellipsoid).
export function eggGeometry(r, taper = 0, seg = 48) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.66));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + taper * y;
    p.setXYZ(i, x * r[0] * k, y * r[1], z * r[2] * k);
  }
  g.computeVertexNormals();
  const c = new Float32Array(p.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export const muscleMat = () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.35, transparent: true, opacity: 1 });
const vesselMat = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.4, transparent: true, opacity: 1 });

// Paint every vertex of a mesh one colour (the muscle meshes use vertex colours so the
// electrical chapter can light them up).
export function paint(mesh, hex) {
  const c = new THREE.Color(hex), a = mesh.geometry.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b);
  a.needsUpdate = true;
}

// ---------------------------------------------------------------- valves
// A valve: a ring with n leaflets that swing downstream (+z of the valve group) to open.
function valve(n, R, ringColor = 0xeedbb0) {
  const g = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xf6ead0, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  g.add(torus(R, R * 0.12, M.plastic(ringColor, { roughness: 0.5 }), 40));
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2, w = (Math.PI * 2) / n;
    const pivot = new THREE.Group();
    pivot.position.set(R * Math.cos(a), R * Math.sin(a), 0);
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 14, a - w / 2 + 0.03, w - 0.06), leafMat);
    leaf.position.set(-R * Math.cos(a), -R * Math.sin(a), 0);
    pivot.add(leaf);
    pivot.userData.axis = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    g.add(pivot); leaves.push(pivot);
  }
  g.open = 0;
  g.setOpen = (k) => {
    g.open = k;
    leaves.forEach((p) => p.quaternion.setFromAxisAngle(p.userData.axis, k * 1.25));
  };
  g.setOpen(0);
  g.leafMat = leafMat;
  return g;
}
const aim = (obj, from, to) => { obj.position.copy(from); obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize()); };

// ---------------------------------------------------------------- paths
// A polyline sampled by arc length, so blood can travel along it at a steady speed.
export function pathOf(points) {
  const Pt = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
  const L = [0];
  for (let i = 1; i < Pt.length; i++) L.push(L[i - 1] + Pt[i].distanceTo(Pt[i - 1]));
  const total = L[L.length - 1];
  return {
    points: Pt, total, lengths: L,
    uAt: (i) => L[i] / total,
    at(u, out = new THREE.Vector3()) {
      const d = clamp(u, 0, 1) * total;
      let lo = 0, hi = L.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= d) lo = m; else hi = m; }
      const k = (d - L[lo]) / Math.max(1e-9, L[hi] - L[lo]);
      return out.copy(Pt[lo]).lerp(Pt[hi], k);
    },
  };
}
// Smooth a polyline with a Catmull-Rom curve, sampled finely.
export const smoothPts = (pts, n = 60) => new THREE.CatmullRomCurve3(pts.map((p) => p.clone())).getPoints(n);

// Blood routes through the heart. Each is [points, index of the inlet valve, index of the outlet valve].
function routes() {
  const right = (inlet, pa) => {
    const pts = [...inlet, P.ra.clone().add(new THREE.Vector3(0.02, -0.05, 0.05)), P.tricuspid, vf(-0.62, -0.7, 0.3), vf(-0.5, -1.45, 0.28), vf(-0.25, -1.2, 0.42), vf(-0.12, -0.55, 0.5), P.pulmonary, ...VESSELS.trunk.slice(1), ...pa.slice(1)];
    return { pts, av: inlet.length + 1, sl: inlet.length + 6 };
  };
  const left = (pv, out) => {
    const pts = [...pv, P.la.clone(), P.mitral, vf(0.4, -0.8, -0.22), vf(0.3, -1.75, -0.18), vf(0.08, -1.25, -0.02), vf(-0.02, -0.5, 0.02), P.aortic, ...out];
    return { pts, av: pv.length + 1, sl: pv.length + 6 };
  };
  const ao = VESSELS.aorta.slice(1);
  const toArch = ao.slice(0, 4);
  return {
    right: [right(VESSELS.svc, VESSELS.lpa), right(VESSELS.ivc, VESSELS.rpa), right(VESSELS.svc, VESSELS.rpa), right(VESSELS.ivc, VESSELS.lpa)],
    left: [left(VESSELS.rpvS, ao), left(VESSELS.lpvS, [...toArch, ...VESSELS.brachio.slice(1)]), left(VESSELS.rpvI, [...toArch, ...VESSELS.carotid.slice(1)]), left(VESSELS.lpvI, ao)],
  };
}
export const ROUTES = routes();

// ---------------------------------------------------------------- the heart
// opts: { labels: true|false, flow: true|false, coronary: true }
export function makeHeart(stage, opts = {}) {
  const o = { labels: true, flow: true, coronary: true, pericardium: true, ...opts };
  const root = new THREE.Group();
  const parts = {};
  const muscles = [], cavities = [], vessels = [];

  // ---- ventricles
  const vFrame = new THREE.Group(); vFrame.rotation.copy(VF_ROT); root.add(vFrame);
  const lvG = new THREE.Group(), rvG = new THREE.Group(); vFrame.add(lvG, rvG);
  const mk = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };
  const lv = mk(eggGeometry([0.92, 1.42, 0.88], 0.4), muscleMat(), lvG); lv.position.set(0.3, -1.2, -0.2);
  const rv = mk(eggGeometry([0.9, 1.12, 0.64], 0.38), muscleMat(), rvG); rv.position.set(-0.4, -0.92, 0.3);
  // Right ventricular outflow tract (the conus) rising to the pulmonary valve.
  const toFrame = new THREE.Matrix4().makeRotationFromEuler(VF_ROT).invert();
  const conusPts = [vf(-0.3, -0.75, 0.4), vf(-0.12, -0.25, 0.48), P.pulmonary.clone()].map((p) => p.applyMatrix4(toFrame));
  const conus = mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(conusPts), 24, 0.3, 16, false), muscleMat(), rvG);
  conus.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(conus.geometry.attributes.position.count * 3).fill(1), 3));
  const lvCav = mk(eggGeometry([0.46, 0.98, 0.44], 0.25, 36), M.ghost(RED, 0.5), lvG); lvCav.position.set(0.36, -0.98, -0.22);
  const rvCav = mk(eggGeometry([0.62, 0.9, 0.42], 0.25, 36), M.ghost(BLUE, 0.5), rvG); rvCav.position.set(-0.55, -0.85, 0.42);
  const septum = mk(new THREE.PlaneGeometry(0.1, 0.1), M.ghost(0xffd0a8, 0.0), lvG); septum.visible = false;
  muscles.push(lv, rv, conus); cavities.push(lvCav, rvCav);

  // ---- atria (heart space)
  const raG = new THREE.Group(), laG = new THREE.Group(); root.add(raG, laG);
  const ra = mk(eggGeometry([0.64, 0.74, 0.62], -0.05), muscleMat(), raG); ra.position.copy(P.ra);
  const rAur = mk(eggGeometry([0.32, 0.2, 0.22], 0), muscleMat(), raG); rAur.position.set(-0.62, 0.72, 0.55); rAur.rotation.set(0.2, 0, -0.5);
  const la = mk(eggGeometry([0.74, 0.5, 0.52], 0), muscleMat(), laG); la.position.copy(P.la);
  const lAur = mk(eggGeometry([0.3, 0.17, 0.2], 0), muscleMat(), laG); lAur.position.set(0.82, 0.62, 0.12); lAur.rotation.set(0, 0.3, 0.5);
  const raCav = mk(eggGeometry([0.46, 0.55, 0.46], 0, 32), M.ghost(BLUE, 0.5), raG); raCav.position.copy(P.ra);
  const laCav = mk(eggGeometry([0.58, 0.38, 0.4], 0, 32), M.ghost(RED, 0.5), laG); laCav.position.copy(P.la);
  muscles.push(ra, rAur, la, lAur); cavities.push(raCav, laCav);
  [lv, rv, conus, ra, rAur, la, lAur].forEach((m) => paint(m, MUSCLE));

  // ---- great vessels (coloured by the blood inside them)
  const aoG = new THREE.Group(), ptG = new THREE.Group(); root.add(aoG, ptG);
  const vtube = (pts, r, color, parent) => { const m = tube(smoothPts(pts, 80), r, vesselMat(color), false, 120); parent.add(m); vessels.push(m); return m; };
  vtube(VESSELS.aorta, 0.27, 0xd8404c, aoG);
  vtube(VESSELS.brachio, 0.14, 0xd8404c, aoG); vtube(VESSELS.carotid, 0.1, 0xd8404c, aoG); vtube(VESSELS.subclav, 0.11, 0xd8404c, aoG);
  vtube(VESSELS.trunk, 0.26, 0x4f6fd8, ptG); vtube(VESSELS.lpa, 0.19, 0x4f6fd8, ptG); vtube(VESSELS.rpa, 0.19, 0x4f6fd8, ptG);
  vtube(VESSELS.svc, 0.22, 0x5a6ccc, raG); vtube(VESSELS.ivc, 0.25, 0x5a6ccc, raG);
  for (const k of ['rpvS', 'rpvI', 'lpvS', 'lpvI']) vtube(VESSELS[k], 0.12, 0xd8505a, laG);

  // ---- valves: AV valves open into the ventricles, semilunar valves open into the arteries
  const tri = valve(3, 0.3), mit = valve(2, 0.28), pul = valve(3, 0.2), aor = valve(3, 0.22);
  aim(tri, P.tricuspid, vf(-0.62, -0.7, 0.3)); rvG.attach(tri);
  aim(mit, P.mitral, vf(0.4, -0.8, -0.22)); lvG.attach(mit);
  aim(pul, P.pulmonary, VESSELS.trunk[1]); ptG.add(pul);
  aim(aor, P.aortic, VESSELS.aorta[1]); aoG.add(aor);
  const valves = { tri, mit, pul, aor };

  // ---- coronary arteries: found by casting rays at the finished muscle surface
  root.updateMatrixWorld(true);
  const corG = new THREE.Group(); root.add(corG);
  const ray = new THREE.Raycaster(), C0 = new THREE.Vector3(-0.1, -0.5, -0.2);
  const onSurface = (guess, lift = 0.035) => {
    const g = guess.isVector3 ? guess : new THREE.Vector3(...guess);
    const dir = C0.clone().sub(g).normalize(), from = g.clone().addScaledVector(dir, -3);
    ray.set(from, dir);
    const h = ray.intersectObjects(muscles, false)[0];
    return h ? h.point.clone().addScaledVector(dir, -lift) : g;
  };
  const corMat = vesselMat(0xff5563);
  const cor = (guesses, r) => { const pts = guesses.map((g) => onSurface(g)); const m = tube(smoothPts(pts, 90), r, corMat, false, 120); corG.add(m); return m; };
  const lmain = [[0.05, 0.28, 0.2], [0.35, 0.3, 0.5]];
  const lad = cor([...lmain, [0.5, 0.0, 0.8], [0.62, -0.5, 0.95], [0.85, -1.0, 0.95], [1.05, -1.45, 0.9], [1.22, -1.75, 0.8]], 0.04);
  const lcx = cor([...lmain, [0.7, 0.2, 0.3], [1.05, 0.0, -0.1], [1.15, -0.25, -0.55], [0.9, -0.5, -0.95]], 0.034);
  const diag = cor([[0.62, -0.5, 0.95], [1.0, -0.6, 0.6], [1.3, -0.8, 0.3]], 0.024);
  const rca = cor([[-0.2, 0.25, 0.3], [-0.55, 0.05, 0.62], [-0.95, -0.2, 0.62], [-1.3, -0.55, 0.35], [-1.35, -0.8, -0.1], [-1.0, -1.05, -0.55]], 0.04);
  const marg = cor([[-1.3, -0.55, 0.35], [-0.9, -1.1, 0.5], [-0.4, -1.5, 0.5]], 0.024);
  parts.coronary = corG; parts.cor = { lad, lcx, rca, diag, marg };
  corG.visible = o.coronary;

  // ---- pericardium: the thin sac around the heart
  const peri = new THREE.Mesh(eggGeometry([1.75, 2.05, 1.55], 0.12, 48), new THREE.MeshStandardMaterial({ color: 0xf4dcc8, transparent: true, opacity: 0.06, roughness: 0.6, depthWrite: false, side: THREE.FrontSide }));
  peri.position.set(0.12, -0.25, -0.2); peri.rotation.z = 0.35; root.add(peri);
  peri.visible = o.pericardium;
  parts.peri = peri;

  // ---- blood
  const flow = makeFlow(root);
  flow.mesh.visible = o.flow;

  // ---- labels
  const labels = [], minor = [];
  const L = (html, pos, parent, cls = '', main = false) => { const l = stage.label(html, pos, parent); tint(l, cls); labels.push(l); if (!main) minor.push(l); return l; };
  if (o.labels) {
    // Positions in heart space; each label rides with its part when the heart comes apart.
    const H = (g, x, y, z) => g.worldToLocal(root.localToWorld(new THREE.Vector3(x, y, z)));
    L('Right atrium', H(raG, -1.95, 0.15, 0.4), raG, 'blue', true);
    L('Left atrium', H(laG, 1.55, 0.95, -0.7), laG, 'red', true);
    L('Right ventricle', H(rvG, -0.55, -1.35, 1.0), rvG, 'blue', true);
    L('Left ventricle', H(lvG, 1.55, -1.1, 0.4), lvG, 'red', true);
    L('Aorta', H(aoG, 1.15, 2.7, -0.8), aoG, 'red', true);
    L('Pulmonary artery', H(ptG, 1.6, 1.8, -0.3), ptG, 'blue', true);
    L('Superior vena cava', H(raG, -1.95, 1.0, 0), raG, 'blue');
    L('Inferior vena cava', H(raG, -1.55, -1.35, -0.3), raG, 'blue');
    L('Pulmonary veins', H(laG, 2.2, -0.1, -0.9), laG, 'red');
    L('Tricuspid valve', H(rvG, -1.45, -0.62, 0.7), rvG, 'valve');
    L('Mitral valve', H(lvG, 1.35, 0.3, 0.2), lvG, 'valve');
    L('Pulmonary valve', H(ptG, 1.0, 0.72, 0.9), ptG, 'valve');
    L('Aortic valve', H(aoG, -0.62, 0.98, 0.7), aoG, 'valve');
    L('Coronary arteries', H(corG, 1.25, -1.72, 1.0), corG, '');
    L('Septum', H(lvG, 0.2, -0.95, 0.9), lvG, 'valve');
  }

  // ---- state
  const base = { lv: lv.scale.clone(), rv: rv.scale.clone() };
  let xr = 1;
  const api = {
    root, parts, valves, muscles, cavities, vessels, flow, labels, minor,
    groups: { vFrame, lvG, rvG, raG, laG, aoG, ptG, corG },
    meshes: { lv, rv, conus, ra, la, rAur, lAur, lvCav, rvCav, raCav, laCav },
    // 0 = solid, 1 = see-through
    setXray(k) {
      xr = k;
      muscles.forEach((m) => { m.material.opacity = lerp(1, 0.24, k); m.material.depthWrite = k < 0.5; m.renderOrder = 2; m.castShadow = k < 0.5; });
      vessels.forEach((m) => { m.material.opacity = lerp(1, 0.32, k); m.material.depthWrite = k < 0.5; m.renderOrder = 2; });
      cavities.forEach((m) => { m.visible = k > 0.05; m.material.opacity = 0.5 * k; m.renderOrder = 1; });
      corMat.opacity = lerp(1, 0.55, k);
      peri.material.opacity = lerp(0.06, 0.035, k);
    },
    // Pull the chambers apart (k 0 → 1).
    setExplode(k) {
      const e = k * k * (3 - 2 * k);
      lvG.position.set(0.85, -0.5, -0.25).multiplyScalar(e);
      rvG.position.set(-0.8, -0.35, 1.0).multiplyScalar(e);
      raG.position.set(-1.1, 0.35, 0.35).multiplyScalar(e);
      laG.position.set(0.9, 0.7, -0.9).multiplyScalar(e);
      aoG.position.set(-0.15, 1.3, -0.1).multiplyScalar(e);
      ptG.position.set(0.55, 1.05, 1.0).multiplyScalar(e);
      corG.visible = o.coronary && k < 0.05;
      peri.visible = o.pericardium && k < 0.4;
      peri.scale.setScalar(1 + e * 0.6);
      flow.mesh.visible = o.flow && k < 0.03;
    },
    // Beat: volumes (mL) of the left ventricle and left atrium drive the size of the chambers.
    // The wall keeps its volume, so as the cavity empties the wall gets thicker.
    setBeat({ vlv = 124, vla = 45, edv = 124, esv = 54 } = {}, mvOpen = 1, avOpen = 0) {
      const wall = 180;                                         // mL of LV muscle (≈ 190 g)
      const sOut = Math.cbrt((vlv + wall) / (edv + wall)), sCav = Math.cbrt(Math.max(8, vlv) / edv);
      lv.scale.set(base.lv.x * sOut, base.lv.y * Math.sqrt(sOut), base.lv.z * sOut);
      rv.scale.set(base.rv.x * sOut, base.rv.y * Math.sqrt(sOut), base.rv.z * sOut);
      lvCav.scale.set(sCav, Math.sqrt(sCav), sCav); rvCav.scale.set(sCav, Math.sqrt(sCav), sCav);
      const sa = Math.cbrt((vla + 40) / 90);
      ra.scale.setScalar(sa); la.scale.setScalar(sa); raCav.scale.setScalar(Math.cbrt(vla / 50)); laCav.scale.setScalar(Math.cbrt(vla / 50));
      tri.setOpen(mvOpen); mit.setOpen(mvOpen); pul.setOpen(avOpen); aor.setOpen(avOpen);
    },
    showLabels(on, narrow = false) { labels.forEach((l) => { l.visible = on; }); if (on && narrow) minor.forEach((l) => { l.visible = false; }); },
  };
  api.setXray(1); api.setExplode(0); api.setBeat();
  return api;
}

// ---------------------------------------------------------------- blood flow through the heart
// Blood dots follow the routes. Each route has an inlet (AV) valve and an outlet (semilunar)
// valve; a dot cannot pass a shut valve, so blood waits in the atria while the ventricles squeeze
// and waits in the ventricles until the outlet valves open, as it really does.
export function makeFlow(parent, perRoute = 34) {
  const list = [...ROUTES.right.map((r) => ({ ...r, side: 'R' })), ...ROUTES.left.map((r) => ({ ...r, side: 'L' }))].map((r) => {
    const path = pathOf(smoothPts(r.pts, 140));
    // Find the valve positions along the smoothed path.
    const near = (p) => { let best = 0, bd = 1e9; for (let i = 0; i < path.points.length; i++) { const d = path.points[i].distanceTo(p); if (d < bd) { bd = d; best = i; } } return path.uAt(best); };
    return { ...r, path, uAV: near(r.pts[r.av]), uSL: near(r.pts[r.sl]) };
  });
  const N = list.length * perRoute;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  parent.add(mesh);
  const dots = [];
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  list.forEach((r, ri) => { for (let k = 0; k < perRoute; k++) { const i = dots.length; dots.push({ r, u: (k + rnd(i)) / perRoute, gap: (0.03 + 0.3 * rnd(i + 7)) / r.path.total, j: [rnd(i + 3) - 0.5, rnd(i + 5) - 0.5, rnd(i + 9) - 0.5] }); mesh.setColorAt(i, new THREE.Color(r.side === 'R' ? BLUE : RED)); } });
  mesh.instanceColor.needsUpdate = true;
  const o = new THREE.Object3D(), p = new THREE.Vector3();
  return {
    mesh, dots,
    // q: { mv (0..1 inlet valves open), av (0..1 outlet valves open), fill (0..1 filling speed), eject (0..1) }
    step(dt, q, speed = 1) {
      dt = Math.max(0, dt) * speed;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i], r = d.r, L = r.path.total;
        let v;
        if (d.u < r.uAV) v = 0.35 + 1.4 * q.fill;                 // veins and atrium: steady inflow, faster while filling
        else if (d.u < r.uSL) v = q.av > 0.5 ? 3.2 * q.eject + 0.4 : 1.6 * q.fill;
        else v = 0.45 + 3.2 * q.eject;                           // arteries: surge on each beat, keep flowing between
        let u = d.u + (v * dt) / L;
        if (q.mv < 0.5 && d.u < r.uAV && u > r.uAV - d.gap) u = Math.max(d.u, r.uAV - d.gap);
        if (q.av < 0.5 && d.u >= r.uAV && d.u < r.uSL && u > r.uSL - d.gap * 0.6) u = Math.max(d.u, r.uSL - d.gap * 0.6);
        if (u >= 1) u -= 1;
        d.u = u;
        r.path.at(u, p);
        const spread = u > r.uAV && u < r.uSL ? 0.16 : 0.07;
        o.position.set(p.x + d.j[0] * spread, p.y + d.j[1] * spread, p.z + d.j[2] * spread);
        o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- beat driver
// Turns the pump model's beat into what the 3D heart needs at a moment in the cycle.
export function beatState(b, sample) {
  const qmvMax = Math.max(...b.samples.map((s) => s.qmv)) || 1, qavMax = Math.max(...b.samples.map((s) => s.qav)) || 1;
  return {
    vol: { vlv: sample.vlv, vla: sample.vla, edv: b.edv, esv: b.esv },
    flow: { mv: sample.mv ? 1 : 0, av: sample.av ? 1 : 0, fill: sample.qmv / qmvMax, eject: sample.qav / qavMax },
  };
}

// Smoothly animate valve opening towards a target (so leaflets swing rather than snap).
export function valveEase(cur, target, dt) { return approach(cur, target, 30, Math.max(0, dt)); }

// Colour a label's outline and text (blue for oxygen-poor, red for oxygen-rich, cream for valves).
const TINT = { blue: '#8fb0ff', red: '#ff8a94', valve: '#f3dfb4', side: '#8ef0ff', gold: '#ffd166' };
export function tint(l, cls) { const c = TINT[cls]; if (c) { l.element.style.borderColor = c; l.element.style.color = c; } return l; }

// ---------------------------------------------------------------- orientation marker
// A small floor sign so nobody mixes up left and right.
export function sideLabels(stage, parent, y = -2.3, x = 2.6) {
  return [
    tint(stage.label("← Patient's right", [-x, y, 0.6], parent), 'side'),
    tint(stage.label("Patient's left →", [x, y, 0.6], parent), 'side'),
  ];
}

// ---------------------------------------------------------------- heart sounds
// "Lub" (the AV valves shutting) and "dub" (the semilunar valves shutting): short, low thumps
// made with the Web Audio API, only when the viewer has switched them on.
let actx = null;
export function thump(kind, muted) {
  if (muted) return;
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  if (actx.state === 'suspended') actx.resume();
  const t = actx.currentTime, osc = actx.createOscillator(), g = actx.createGain();
  const lub = kind === 'lub';
  osc.type = 'sine';
  osc.frequency.setValueAtTime(lub ? 70 : 95, t); osc.frequency.exponentialRampToValueAtTime(lub ? 40 : 55, t + (lub ? 0.14 : 0.1));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lub ? 0.5 : 0.35, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + (lub ? 0.16 : 0.11));
  osc.connect(g).connect(actx.destination); osc.start(t); osc.stop(t + 0.2);
}

// ---------------------------------------------------------------- the beating driver
// Runs the heart through the pump model's cycle. params(s) returns the model options
// (heart rate etc.); speed slows time down for watching.
export function makeDriver(heart, { muted = () => true, onLub, onDub } = {}) {
  let t = 0, key = '', b = null, mvE = 1, avE = 0, lastMv = true, lastAv = false;
  const d = {
    get beat() { return b; }, get t() { return t; },
    sample: null, phase: null, q: null,
    update(dt, params, speed = 1, { flow = true, beatOn = true } = {}) {
      dt = Math.max(0, dt);
      const k = JSON.stringify(params);
      if (k !== key) { const f = b ? t / b.T : 0; key = k; b = beat(params); t = f * b.T; }
      if (beatOn) t = (t + dt * speed) % b.T;
      const smp = at(b, t / b.T), st = beatState(b, smp);
      d.sample = smp; d.q = st.flow; d.phase = phaseName(b, t);
      mvE = valveEase(mvE, beatOn ? st.flow.mv : 1, dt * speed * (beatOn ? 1 : 0) + (beatOn ? 0 : dt));
      avE = valveEase(avE, beatOn ? st.flow.av : 0, dt * speed * (beatOn ? 1 : 0) + (beatOn ? 0 : dt));
      heart.setBeat(beatOn ? st.vol : { vlv: b.edv, vla: 45, edv: b.edv, esv: b.esv }, mvE, avE);
      if (flow && heart.flow.mesh.visible) heart.flow.step(dt, beatOn ? st.flow : { mv: 0, av: 0, fill: 0, eject: 0 }, beatOn ? speed : 0);
      if (beatOn) {
        if (lastMv && !smp.mv) { onLub?.(); thump('lub', muted()); }
        if (lastAv && !smp.av) { onDub?.(); thump('dub', muted()); }
      }
      lastMv = smp.mv; lastAv = smp.av;
      return d;
    },
  };
  return d;
}
export { atRate };

// On a phone-width stage the readout covers the upper left, so the wide desktop framing
// (model pushed right) would cut the model off. Re-centre once, unless the viewer has orbited.
export function fitNarrow(stage, view) {
  let done = false;
  return () => {
    const narrow = stage.host.clientWidth < 560;
    if (narrow && !done && !stage.moved && !document.body.classList.contains('gb-reel')) { stage.setView(view.pos, view.target, 0.01); done = true; }
    return narrow;
  };
}

// On phones the readout box would cover most of the model, so keep only its headline and two rows.
export function compactReadout(stage, api) {
  const full = api.readout;
  if (!full) return api;
  api.readout = (s) => {
    const html = full(s);
    if (stage.host.clientWidth >= 560 || !html) return html;
    let rows = 0;
    return html.replace(/<small>[\s\S]*?<\/small>/g, '').replace(/<div class="row">[\s\S]*?<\/div>/g, (m) => (++rows <= 2 ? m : ''));
  };
  return api;
}
