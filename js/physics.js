'use strict';

const Z0 = { re: 0, im: 0 };

function cadd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function csub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cdiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
function cconj(a) { return { re: a.re, im: -a.im }; }
function cabs(a) { return Math.hypot(a.re, a.im); }
function cabs2(a) { return a.re * a.re + a.im * a.im; }
function cinv(a) { return cdiv({ re: 1, im: 0 }, a); }
function cscale(a, s) { return { re: a.re * s, im: a.im * s }; }
function caddC(a, s) { return { re: a.re + s, im: a.im }; }

function polyEval(c, z) {
  let r = c[c.length - 1];
  for (let k = c.length - 2; k >= 0; k--) r = cadd(cmul(r, z), c[k]);
  return r;
}

function solvePoly(c) {
  let n = c.length - 1;
  while (n > 0 && cabs(c[n]) < 1e-14) n--;
  if (n < 1) return [];
  const lead = c[n];
  const mon = [];
  for (let k = 0; k <= n; k++) mon.push(cdiv(c[k], lead));
  const roots = [];
  const g = { re: 0.4, im: 0.9 };
  let cur = { re: 1, im: 0 };
  for (let k = 0; k < n; k++) {
    cur = cmul(cur, g);
    roots.push({ re: cur.re, im: cur.im });
  }
  const dc = [];
  for (let k = 0; k < n; k++) dc.push(cscale(mon[k + 1], k + 1));
  for (let iter = 0; iter < 200; iter++) {
    let maxd = 0;
    for (let k = 0; k < n; k++) {
      const p = polyEval(mon, roots[k]);
      let den = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        den = cmul(den, csub(roots[k], roots[j]));
      }
      if (cabs2(den) < 1e-30) continue;
      const d = cdiv(p, den);
      roots[k] = csub(roots[k], d);
      const ad = cabs(d);
      if (ad > maxd) maxd = ad;
    }
    if (maxd < 1e-12) break;
  }
  const polished = roots.map((z) => {
    for (let i = 0; i < 40; i++) {
      const pv = polyEval(mon, z);
      const dp = polyEval(dc, z);
      if (!isFinite(pv.re + pv.im) || cabs(dp) < 1e-300) break;
      const step = cdiv(pv, dp);
      z = csub(z, step);
      if (cabs(step) < 1e-14 * (1 + cabs(z))) break;
    }
    return z;
  });
  const uniq = [];
  for (const z of polished) {
    if (!uniq.some((u) => cabs(csub(u, z)) < 1e-7 * (1 + cabs(z)))) uniq.push(z);
  }
  return uniq;
}

function paczynskiA(u) {
  const u2 = u * u;
  return (u2 + 2) / (u * Math.sqrt(u2 + 4));
}

function singleLensImages(zeta) {
  const u = cabs(zeta);
  if (u < 1e-8) u = 1e-8;
  const u2 = u * u;
  const sq = u * Math.sqrt(u2 + 4);
  const rp = (u2 + 2 + sq) / 2;
  const rm = (u2 + 2 - sq) / 2;
  const zc = cconj(zeta);
  void zc;
  const zp = { re: ((rp - 1) * zeta.re) / (u * u), im: ((rp - 1) * zeta.im) / (u * u) };
  const zm = { re: ((rm - 1) * zeta.re) / (u * u), im: ((rm - 1) * zeta.im) / (u * u) };
  const mup = rp * rp / Math.abs(rp * rp - 1);
  const mum = rm * rm / Math.abs(rm * rm - 1);
  return { images: [{ z: zp, mu: mup }, { z: zm, mu: mum }], A: mup + mum };
}

function lensSystemParams(p) {
  const q = Math.max(p.q, 0);
  const m1 = 1 / (1 + q);
  const m2 = q / (1 + q);
  const s = p.s;
  return { m1, m2, z1: -s * m2, z2: s * m1 };
}

function binaryCoeffs(zeta, m1, m2, z1, z2) {
  const w = cconj(zeta);
  const al = { re: w.re - z1, im: w.im };
  const be = { re: w.re - z2, im: w.im };
  const e1 = z1 + z2;
  const e2 = z1 * z2;
  const c1 = m1 * z2 + m2 * z1;
  const D2 = [e2 * e2, -2 * e1 * e2, e1 * e1 + 2 * e2, -2 * e1, 1];
  const ND = [-e2 * c1, e2 + e1 * c1, -(e1 + c1), 1];
  const N2 = [c1 * c1, -2 * c1, 1];
  const ab = cmul(al, be);
  const as = cadd(al, be);
  const mb = cadd(cscale(be, m1), cscale(al, m2));
  const P = [], Q = [];
  for (let k = 0; k < 5; k++) {
    P.push(cadd(cscale(ab, D2[k] || 0), cadd(cscale(as, ND[k] || 0), { re: N2[k] || 0, im: 0 })));
    Q.push(cadd(cscale(mb, D2[k] || 0), { re: ND[k] || 0, im: 0 }));
  }
  const c = new Array(6).fill(0).map(() => ({ re: 0, im: 0 }));
  c[5] = P[4];
  for (let k = 0; k < 5; k++) {
    c[k] = csub(c[k], cmul(zeta, P[k]));
    c[k] = csub(c[k], Q[k]);
    if (k >= 1) c[k] = cadd(c[k], P[k - 1]);
  }
  return c;
}

function lensEqNewton(z, zeta, m1, m2, z1, z2, iters = 25) {
  const h = 1e-7;
  const f = (zz) => {
    const zb = cconj(zz);
    const d1 = csub(zb, { re: z1, im: 0 });
    const d2 = csub(zb, { re: z2, im: 0 });
    if (cabs(d1) < 1e-12 || cabs(d2) < 1e-12) return null;
    return csub(csub(csub(zz, cdiv({ re: m1, im: 0 }, d1)), cdiv({ re: m2, im: 0 }, d2)), zeta);
  };
  for (let i = 0; i < iters; i++) {
    const fv = f(z);
    if (!fv || !isFinite(fv.re + fv.im)) return z;
    const f1 = f(cadd(z, { re: h, im: 0 }));
    const f2 = f(csub(z, { re: h, im: 0 }));
    const f3 = f(cadd(z, { re: 0, im: h }));
    const f4 = f(csub(z, { re: 0, im: h }));
    if (!f1 || !f2 || !f3 || !f4) return z;
    const j11 = (f1.re - f2.re) / (2 * h);
    const j21 = (f1.im - f2.im) / (2 * h);
    const j12 = (f3.re - f4.re) / (2 * h);
    const j22 = (f3.im - f4.im) / (2 * h);
    const det = j11 * j22 - j12 * j21;
    if (!isFinite(det) || Math.abs(det) < 1e-30) return z;
    const dx = (-fv.re * j22 + fv.im * j12) / det;
    const dy = (-fv.im * j11 + fv.re * j21) / det;
    z = { re: z.re + dx, im: z.im + dy };
    if (Math.hypot(dx, dy) < 1e-15 * (1 + cabs(z))) break;
  }
  return z;
}

function binaryImages(zeta, m1, m2, z1, z2) {
  const c = binaryCoeffs(zeta, m1, m2, z1, z2);
  const roots = solvePoly(c);
  const images = [];
  const tol = 1e-5 * (1 + cabs(zeta));
  const cap = 1e-3 * (1 + cabs(zeta));
  for (const z of roots) {
    if (!isFinite(z.re + z.im) || cabs(z) > 200) continue;
    let zp = z;
    const zp0 = lensEqNewton(z, zeta, m1, m2, z1, z2);
    if (isFinite(zp0.re + zp0.im) && cabs(csub(zp0, z)) < cap) zp = zp0;
    const zb = cconj(zp);
    const d1 = csub(zb, { re: z1, im: 0 });
    const d2 = csub(zb, { re: z2, im: 0 });
    if (cabs(d1) < 1e-9 || cabs(d2) < 1e-9) continue;
    const calc = csub(csub(zp, cdiv({ re: m1, im: 0 }, d1)), cdiv({ re: m2, im: 0 }, d2));
    const resid = cabs(csub(calc, zeta));
    if (!isFinite(resid) || resid > tol) continue;
    if (images.some((im) => cabs(csub(im.z, zp)) < 1e-7 * (1 + cabs(zp)))) continue;
    const g1 = cinv(cmul(d1, d1));
    const g2 = cinv(cmul(d2, d2));
    const gam = cadd(cscale(g1, -m1), cscale(g2, -m2));
    const J = 1 - cabs2(gam);
    if (!isFinite(J)) continue;
    const mu = 1 / Math.max(Math.abs(J), 1e-10);
    images.push({ z: zp, mu });
  }
  let A = 0;
  for (const im of images) A += im.mu;
  return { images, A: Math.min(A, 1000) };
}

function evalLens(p, t) {
  const tau = (t - p.t0) / p.tE;
  if (!p.q || p.q <= 0) {
    const zeta = { re: tau, im: p.uMin };
    const r = singleLensImages(zeta);
    return { tau, zeta, u: cabs(zeta), A: r.A, images: r.images, binary: false };
  }
  const { m1, m2, z1, z2 } = lensSystemParams(p);
  const zeta = { re: tau, im: p.uMin };
  const r = binaryImages(zeta, m1, m2, z1, z2);
  return { tau, zeta, u: cabs(zeta), A: r.A, images: r.images, binary: true };
}

function modelFlux(p, A) {
  return p.fs * A + (1 - p.fs);
}

const SEASON_DAYS = 180;
const EPOCH_HJD_OFFSET = 2452848;
const EVENT_THRESHOLD = 1.2;

function modelCurve(p, n = 360) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * SEASON_DAYS;
    const e = evalLens(p, t);
    pts.push({ t, A: e.A, F: modelFlux(p, e.A) });
  }
  return pts;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const OBS_CADENCE = 0.4;
const OBS_GAP_P = 0.18;
const OBS_SIGMA = 0.02;

function obsSlots(seed = 42) {
  const rng = mulberry32(seed);
  const slots = [];
  for (let t = 0; t <= SEASON_DAYS + 1e-9; t += OBS_CADENCE) {
    slots.push({ t, gap: rng() < OBS_GAP_P, g: gauss(rng) });
  }
  return slots;
}

function buildObs(p, slots) {
  const pts = [];
  for (const s of slots) {
    if (s.gap) continue;
    const e = evalLens(p, s.t);
    const F = modelFlux(p, e.A);
    const sig = OBS_SIGMA * Math.sqrt(Math.max(F, 0.01));
    pts.push({ t: s.t, F, Fo: F + s.g * sig, sig });
  }
  return pts;
}

function curveAnalytics(p) {
  const curve = modelCurve(p, 720);
  let Amax = 1, tPeak = p.t0;
  for (const c of curve) {
    if (c.A > Amax) { Amax = c.A; tPeak = c.t; }
  }
  const half = (Amax + 1) / 2;
  let t1 = null, t2 = null;
  let tStart = null, tEnd = null;
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1], b = curve[k];
    if (t1 === null && a.A < half && b.A >= half) t1 = a.t + (half - a.A) / (b.A - a.A) * (b.t - a.t);
    if (t1 !== null && a.A >= half && b.A < half) { t2 = a.t + (a.A - half) / (a.A - b.A) * (b.t - a.t); break; }
  }
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1], b = curve[k];
    if (tStart === null && a.A < EVENT_THRESHOLD && b.A >= EVENT_THRESHOLD) tStart = a.t + (EVENT_THRESHOLD - a.A) / (b.A - a.A) * (b.t - a.t);
    if (tStart !== null && a.A >= EVENT_THRESHOLD && b.A < EVENT_THRESHOLD) { tEnd = a.t + (a.A - EVENT_THRESHOLD) / (a.A - b.A) * (b.t - a.t); break; }
  }
  if (tStart === null) tStart = 0;
  if (tEnd === null) tEnd = SEASON_DAYS;
  const tFwhm = t1 !== null && t2 !== null ? t2 - t1 : SEASON_DAYS;
  const tDuration = tEnd - tStart;
  const Fmax = modelFlux(p, Amax);
  return { Amax, tPeak, tFwhm, tStart, tEnd, tDuration, Fmax };
}

function lensJ(z, m1, m2, z1, z2) {
  const zb = cconj(z);
  const d1 = csub(zb, { re: z1, im: 0 });
  const d2 = csub(zb, { re: z2, im: 0 });
  const a1 = cabs2(d1), a2 = cabs2(d2);
  if (a1 < 1e-12 || a2 < 1e-12) return -1e9;
  const g1 = cdiv(d1, { re: a1 * a1, im: 0 });
  const g2 = cdiv(d2, { re: a2 * a2, im: 0 });
  const gam = cadd(cscale(g1, -m1), cscale(g2, -m2));
  return 1 - cabs2(gam);
}

function lensMap(z, m1, m2, z1, z2) {
  const zb = cconj(z);
  return csub(csub(z, cdiv({ re: m1, im: 0 }, csub(zb, { re: z1, im: 0 }))), cdiv({ re: m2, im: 0 }, csub(zb, { re: z2, im: 0 })));
}

const MS_TABLE = {
  1: [[3, 2]], 2: [[1, 2]], 3: [[3, 1]], 4: [[0, 1]], 5: [[0, 1], [2, 3]],
  6: [[0, 2]], 7: [[0, 3]], 8: [[0, 3]], 9: [[0, 2]], 10: [[0, 3], [1, 2]],
  11: [[0, 1]], 12: [[3, 1]], 13: [[1, 2]], 14: [[3, 2]],
};

function causticSegments(p, res = 240) {
  if (!p.q || p.q <= 0) return { segs: [], critSegs: [], half: 2 };
  const { m1, m2, z1, z2 } = lensSystemParams(p);
  const half = Math.max(1.6, p.s + 1.2);
  const vals = new Float64Array(res * res);
  for (let j = 0; j < res; j++) {
    const y = -half + (2 * half * j) / (res - 1);
    for (let i = 0; i < res; i++) {
      const x = -half + (2 * half * i) / (res - 1);
      vals[i + j * res] = lensJ({ re: x, im: y }, m1, m2, z1, z2);
    }
  }
  const segs = [];
  const critSegs = [];
  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res - 1; i++) {
      const va = vals[i + j * res], vb = vals[i + 1 + j * res];
      const vc = vals[i + 1 + (j + 1) * res], vd = vals[i + (j + 1) * res];
      const idx = (va > 0 ? 8 : 0) | (vb > 0 ? 4 : 0) | (vc > 0 ? 2 : 0) | (vd > 0 ? 1 : 0);
      const pairs = MS_TABLE[idx];
      if (!pairs) continue;
      const pos = { 0: [i, j], 1: [i + 1, j], 2: [i + 1, j + 1], 3: [i, j + 1] };
      const val = { 0: va, 1: vb, 2: vc, 3: vd };
      const pt = (e) => {
        const cA = e[0], cB = e[1];
        const pa = pos[cA], pb = pos[cB];
        const vA = val[cA], vB = val[cB];
        const t = Math.min(1, Math.max(0, vA / (vA - vB)));
        return {
          re: -half + (2 * half * (pa[0] + t * (pb[0] - pa[0]))) / (res - 1),
          im: -half + (2 * half * (pa[1] + t * (pb[1] - pa[1]))) / (res - 1),
        };
      };
      for (const e of pairs) {
        const q1 = pt(e), q2 = pt([e[1], e[0]]);
        critSegs.push({ x1: q1.re, y1: q1.im, x2: q2.re, y2: q2.im });
        const p1 = lensMap(q1, m1, m2, z1, z2);
        const p2 = lensMap(q2, m1, m2, z1, z2);
        segs.push({ x1: p1.re, y1: p1.im, x2: p2.re, y2: p2.im });
      }
    }
  }
  return { segs, critSegs, half };
}

window.MLPHYS = {
  Z0, cadd, csub, cmul, cdiv, cconj, cabs, cabs2, cinv, cscale, polyEval, solvePoly,
  paczynskiA, singleLensImages, lensSystemParams, binaryCoeffs, binaryImages, lensEqNewton,
  evalLens, modelFlux, SEASON_DAYS, EPOCH_HJD_OFFSET, EVENT_THRESHOLD, modelCurve, mulberry32, gauss,
  OBS_CADENCE, OBS_GAP_P, OBS_SIGMA, obsSlots, buildObs, curveAnalytics,
  lensJ, lensMap, causticSegments,
};
