// HeartClear's physiology: a small, honest model of the left heart and the arteries,
// plus the standard numbers the chapters quote. Pure JavaScript (no three.js), so it can
// be tested on its own with node.
//
// Sources for the reference numbers (textbook values for a healthy resting adult):
//  [G]  Hall JE, Hall ME. Guyton and Hall Textbook of Medical Physiology, 14th ed. (2021),
//       ch. 9 (heart muscle, cardiac cycle), 10 (rhythmical excitation), 11 (ECG),
//       14–15 (circulation, pressures, compliance), 20–21 (cardiac output, coronary flow), 41 (O2 transport).
//  [NHLBI] National Heart, Lung, and Blood Institute, "How the Heart Works"
//       https://www.nhlbi.nih.gov/health/heart
//  [AHA] American Heart Association, "Understanding Blood Pressure Readings"
//       https://www.heart.org/en/health-topics/high-blood-pressure
//  [MP] MedlinePlus, "Pulse" and "Blood pressure" https://medlineplus.gov/ency/article/003399.htm
//  [S96] Stergiopulos N, Meister JJ, Westerhof N. Determinants of stroke volume and systolic
//       and diastolic aortic pressure. Am J Physiol 270:H2050–H2059 (1996): the time-varying
//       elastance heart with a three-element windkessel used below.

export const REF = {
  hrRest: 70,            // bpm; normal resting range 60–100 [MP], [G ch. 10: SA node 70–80/min]
  sv: 70,                // mL stroke volume at rest [G ch. 9: about 70 mL]
  edv: 120,              // mL end-diastolic volume [G ch. 9: 110–120 mL]
  esv: 50,               // mL end-systolic volume [G ch. 9: 40–50 mL]
  ef: [55, 70],          // % normal ejection fraction (AHA / British Society of Echocardiography: ≥ 55%)
  co: 5,                 // L/min cardiac output at rest [G ch. 20: about 5 L/min in a resting adult]
  bloodVolume: 5,        // L in an average adult [G ch. 14/33: about 5 L, 7% of body weight]
  bp: [120, 80],         // mmHg normal adult brachial pressure [AHA]
  paP: [25, 8],          // mmHg pulmonary artery systolic/diastolic [G ch. 39]
  rvP: [25, 1],          // mmHg right ventricle [G ch. 39]
  raP: [0, 5],           // mmHg right atrium [G ch. 9/39]
  laP: [2, 12],          // mmHg left atrium, mean about 7–8 [G ch. 39]
  sao2: 98,              // % arterial O2 saturation [G ch. 41: about 97–98%]
  svo2: 75,              // % mixed venous O2 saturation at rest [G ch. 41: about 75%]
  hb: 15,                // g/dL haemoglobin (typical adult) [G ch. 41]
  vo2Rest: 250,          // mL O2/min used at rest [G ch. 41]
  coronaryFlow: 225,     // mL/min at rest, about 4–5% of cardiac output [G ch. 21]
  avDelay: 0.13,         // s total delay from AV node through the bundle [G ch. 10]
  prInterval: 0.16,      // s [G ch. 11]
  qrs: 0.08,             // s, normal 0.06–0.10 [G ch. 11]
};

// Share of each beat spent in systole. Guyton [G ch. 9]: "at a normal heart rate of 72 beats/min,
// systole is about 0.4 of the entire cycle; at three times normal heart rate, systole is about 0.65".
export const systoleFraction = (hr) => Math.min(0.7, 0.4 + ((hr - 72) * 0.25) / 144);

// ---------------------------------------------------------------- the pump model
// Left atrium and left ventricle are elastic chambers whose stiffness (elastance, mmHg/mL) rises
// when the muscle contracts: P = E(t) · (V − V0). The ventricular activation curve is the
// normalised "double Hill" shape of [S96]. Blood comes from the pulmonary veins (a steady
// pressure source), passes the mitral valve, and leaves through the aortic valve into a
// three-element windkessel: characteristic impedance Zc, arterial compliance Ca, and the
// systemic resistance Rs of the small arteries. Valves are one-way: each opens when the pressure
// behind it is higher than the pressure in front, and shuts when that reverses. The blood in the
// aortic valve has a little inertia (Lav), so it keeps moving for a moment as the pressures cross.
//
// Constants were tuned so a resting adult gives about 120/80 mmHg, SV ≈ 70 mL, EDV ≈ 120 mL,
// EF ≈ 58% and CO ≈ 5 L/min, the textbook values in REF.
export const BASE = {
  Emax: 2.9, Emin: 0.075, V0: 12,         // LV end-systolic stiffness, relaxed stiffness, dead volume
  EaMax: 0.28, EaMin: 0.16, Va0: 10,      // LA
  Ppv: 8.6, Rpv: 0.012,                   // pulmonary veins: pressure, resistance
  Rmv: 0.004, Rav: 0.004, Lav: 0.0003,    // valves: mitral, aortic resistance and inertance
  Zc: 0.03, Ca: 2.0, Rs: 1.12, Pven: 4,   // arteries: impedance, compliance (mL/mmHg), resistance, venous pressure
};

const hill = (tn) => {
  // [S96] normalised elastance, peak 1 at tn = 1
  const a = Math.pow(tn / 0.7, 1.9), b = Math.pow(tn / 1.17, 21.9);
  return (1.553 * (a / (1 + a))) / (1 + b);
};

// Simulate until the beat repeats, then return one beat sampled every dtOut seconds.
// opts: hr (bpm), and any BASE overrides (e.g. Ca for stiff arteries, Emax for exercise).
export function simulateBeat(opts = {}) {
  const p = { ...BASE, ...opts };
  const hr = opts.hr ?? REF.hrRest, T = 60 / hr;
  // Systole shortens as the heart speeds up. Weissler's regression for electromechanical systole
  // (QRS start to aortic valve closure): QS2 ≈ 546 − 2.1·HR ms (Weissler, Harris & Schoenfeld,
  // Circulation 37:149, 1968). Peak stiffness comes at about 80% of it.
  const Tmax = 0.8 * (0.546 - 0.0021 * hr);         // ≈ 0.32 s at 70 bpm, 0.13 s at 180 bpm
  // The beat clock starts when the SA node fires (the ECG's P wave). The atria squeeze a moment
  // later; the ventricles start one PR interval (plus a short electromechanical delay) after that.
  const PR = ecgTimes(hr).PR, tA = 0.04, tV = PR + 0.03;
  const Ta = Math.min(0.14, 0.17 * T);               // atrial contraction length
  const dt = 0.0002, out = [];
  let Vla = 45, Vlv = 120, Pc = 90, Q = 0, open = false;
  const beats = 12, Nout = 200;
  let next = 0, edv = 0, esv = 1e9, wasMv = true, wasAv = false;
  const trans = { mvOpen: [], mvClose: [], avOpen: null, avClose: null };
  for (let b = 0; b < beats; b++) {
    const last = b === beats - 1;
    for (let t = 0; t < T; t += dt) {
      const tv = (t - tV + T) % T, ta = (t - tA + T) % T;   // ventricular and atrial clocks
      const Elv = p.Emin + (p.Emax - p.Emin) * hill(tv / Tmax);
      const ea = ta < Ta ? 0.5 * (1 - Math.cos((2 * Math.PI * ta) / Ta)) : 0;
      const Ela = p.EaMin + (p.EaMax - p.EaMin) * ea;
      const Pla = Ela * (Vla - p.Va0), Plv = Elv * (Vlv - p.V0);
      const Qpv = (p.Ppv - Pla) / p.Rpv;
      const Qmv = Pla > Plv ? (Pla - Plv) / p.Rmv : 0;
      if (!open && Plv > Pc) open = true;
      if (open) {
        Q += (dt * (Plv - Pc - (p.Rav + p.Zc) * Q)) / p.Lav;
        if (Q < -15) { Q = 0; open = false; }        // a tiny backflow snaps the valve shut
      } else Q = 0;
      const Pao = Pc + p.Zc * Q;
      const Qs = (Pc - p.Pven) / p.Rs;
      Vla += dt * (Qpv - Qmv); Vlv += dt * (Qmv - Q); Pc += (dt * (Q - Qs)) / p.Ca;
      // Between the atrial kick and the ventricle's squeeze the mitral leaflets float half shut with
      // almost no flow; they only slam shut (the first heart sound) once the ventricle contracts.
      const mv = Qmv > 0 || (t >= tA && t < tV), av = open;
      if (last) {
        // The beat repeats, so every valve event happens once somewhere in the last beat.
        if (wasMv !== mv) (mv ? trans.mvOpen : trans.mvClose).push(t);
        if (!wasAv && av) trans.avOpen = t;
        if (wasAv && !av) trans.avClose = t;
        edv = Math.max(edv, Vlv); esv = Math.min(esv, Vlv);
        if (t >= next) { out.push({ t, plv: Plv, pao: Pao, pla: Pla, vlv: Vlv, vla: Vla, qmv: Qmv, qav: Math.max(0, Q), av: open, mv, ea, ev: hill(tv / Tmax) }); next += T / Nout; }
      }
      wasMv = mv; wasAv = av;
    }
  }
  // The mitral valve shuts just before the aortic valve opens, and reopens just after it shuts.
  const since = (a, b) => (((a - b) % T) + T) % T;
  const pick = (list, ref, after) => list.reduce((best, x) => (best === null || (after ? since(x, ref) < since(best, ref) : since(ref, x) < since(ref, best)) ? x : best), null);
  const avOpenT = trans.avOpen ?? tV + 0.05, avCloseT = trans.avClose ?? tV + 0.3;
  const mvClose = pick(trans.mvClose, avOpenT, false) ?? tV, mvOpen = pick(trans.mvOpen, avCloseT, true) ?? avCloseT + 0.06;
  const pao = out.map((o) => o.pao);
  const sv = edv - esv;
  return {
    hr, T, samples: out, sv, edv, esv, ef: (sv / edv) * 100, co: (sv * hr) / 1000,
    sys: Math.max(...pao), dia: Math.min(...pao), map: pao.reduce((a, b) => a + b, 0) / pao.length,
    events: { atrial: tA, atrialEnd: tA + Ta, vOn: tV, mvClose, avOpen: avOpenT, avClose: avCloseT, mvOpen, Tmax, systole: systoleFraction(hr) * T },
  };
}

// Exercise: the nervous system raises heart rate, strengthens each squeeze (Emax), tightens the
// veins so more blood returns (filling pressure), and opens the muscles' small arteries (lower Rs).
// k runs 0 (rest) → 1 (hard exercise, HR ≈ 170). Targets from [G ch. 20–21]: in a young adult,
// cardiac output rises from about 5 to about 20 L/min, and systolic pressure rises while
// diastolic changes little.
export function exerciseParams(k) {
  return {
    hr: 70 + 100 * k,
    Emax: BASE.Emax * (1 + 1.0 * k),
    Ppv: BASE.Ppv + 6 * k,
    Rs: BASE.Rs / (1 + 2 * k),
    EaMax: BASE.EaMax * (1 + 1 * k),
  };
}

// The heart-rate slider: above resting rate the same nerves that speed the heart also make it
// squeeze harder, so we follow the exercise path; below it, only the rate changes.
export function atRate(hr) {
  const k = Math.max(0, Math.min(1, (hr - 70) / 100));
  return { ...exerciseParams(k), hr };
}

// Cache beats so sliders stay smooth.
const cache = new Map();
export function beat(opts = {}) {
  const key = JSON.stringify(opts, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v));
  if (!cache.has(key)) { if (cache.size > 80) cache.clear(); cache.set(key, simulateBeat(opts)); }
  return cache.get(key);
}

// Sample a beat at phase ph (0 → 1), linearly interpolated.
export function at(b, ph) {
  const S = b.samples, n = S.length, x = (((ph % 1) + 1) % 1) * n;
  const i = Math.floor(x) % n, j = (i + 1) % n, k = x - Math.floor(x);
  const A = S[i], B = S[j], o = {};
  for (const key in A) o[key] = typeof A[key] === 'number' ? A[key] + (B[key] - A[key]) * k : A[key];
  return o;
}

// Name the phase of the cardiac cycle at time t (s) into the beat: the most recent valve or
// atrial event, going round the cycle (at fast rates some phases wrap past the end of the beat).
const PHASES = {
  fill: { name: 'Filling', note: 'The inlet valves are open. Blood pours into the relaxed ventricles.' },
  kick: { name: 'Atrial kick', note: 'The atria squeeze a last push of blood into the ventricles.' },
  iso: { name: 'Isovolumetric contraction', note: 'All four valves are shut. Pressure builds, volume stays the same.' },
  eject: { name: 'Ejection', note: 'The outflow valves are open. Blood rushes into the aorta and pulmonary artery.' },
  relax: { name: 'Isovolumetric relaxation', note: 'All four valves are shut again while the muscle relaxes.' },
};
export function phaseName(b, t) {
  const e = b.events, T = b.T;
  const list = [['kick', e.atrial], ['iso', e.mvClose], ['eject', e.avOpen], ['relax', e.avClose], ['fill', e.mvOpen]];
  let best = null, bd = 1e9;
  for (const [id, te] of list) { const d = (((t - te) % T) + T) % T; if (d < bd) { bd = d; best = id; } }
  return { id: best, ...PHASES[best] };
}

// ---------------------------------------------------------------- ECG
// A textbook lead II trace built from its standard waves: P (atria depolarise), QRS (ventricles
// depolarise) and T (ventricles repolarise). Durations from [G ch. 11]: P ≈ 0.08–0.10 s,
// PR ≈ 0.16 s, QRS ≈ 0.08 s. QT shortens with heart rate following Bazett: QT = QTc·√RR,
// QTc ≈ 0.40 s. Amplitudes in millivolts are typical for lead II (R ≈ 1.2 mV, T ≈ 0.3 mV).
// t = 0 is the SA node firing.
export function ecgTimes(hr) {
  // PR shortens a little at fast rates: about 0.16 s at 70 bpm, 0.12 s at 180 bpm.
  const RR = 60 / hr, PR = Math.max(0.12, Math.min(0.17, 0.16 - (0.04 * (hr - 70)) / 110));
  const QT = 0.4 * Math.sqrt(RR);
  return { RR, PR, QT, pOn: 0.02, pDur: 0.09, qrsOn: PR, qrsDur: 0.08, tPeak: PR + QT - 0.09, tEnd: PR + QT };
}
// Filling time: from the inlet valves opening to them shutting, going round the cycle.
export function fillTime(b) {
  const e = b.events;
  return ((e.mvClose - e.mvOpen) % b.T + b.T) % b.T;
}
const g = (t, m, s) => Math.exp(-0.5 * ((t - m) / s) ** 2);
export function ecg(t, hr) {
  const e = ecgTimes(hr);
  t = ((t % e.RR) + e.RR) % e.RR;
  const q = e.qrsOn;
  return 0.15 * g(t, e.pOn + e.pDur / 2, 0.022)
    - 0.1 * g(t, q + 0.012, 0.008) + 1.2 * g(t, q + 0.035, 0.0095) - 0.25 * g(t, q + 0.06, 0.01)
    + 0.3 * g(t, e.tPeak, 0.045);
}

// ---------------------------------------------------------------- oxygen
// O2 content (mL O2 per dL blood) = 1.34 · Hb · saturation + 0.003 · PO2  [G ch. 41].
// Mixed venous saturation from Fick: SvO2 = SaO2 − VO2 / (CO · 10 · 1.34 · Hb).
export function venousSat(coLmin, vo2) {
  return Math.max(0.15, REF.sao2 / 100 - vo2 / (coLmin * 10 * 1.34 * REF.hb));
}
