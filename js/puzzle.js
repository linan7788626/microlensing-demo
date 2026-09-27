'use strict';

const PUZZLE = {
  FIT_DEFAULTS: { t0: 90, uMin: 0.3, tE: 30, fs: 1, q: 0, s: 1 },

  gen(seed) {
    const rng = window.MLPHYS.mulberry32(seed >>> 0);
    const r = () => rng();
    const q = r() < 0.35 ? 0 : Math.pow(10, -4 + r() * (Math.log10(0.7) + 4));
    return {
      t0: Math.round((50 + r() * 80) * 2) / 2,
      uMin: Math.pow(10, -1.6 + r() * 1.5),
      tE: Math.round(10 + r() * 50),
      fs: Math.round((0.6 + r() * 0.4) * 100) / 100,
      q,
      s: q > 0 ? Math.round((0.6 + r() * 1.4) * 100) / 100 : 1,
    };
  },

  chi2(params, data) {
    let s2 = 0, n = 0;
    for (const d of data) {
      const e = window.MLPHYS.evalLens(params, d.t);
      const F = window.MLPHYS.modelFlux(params, e.A);
      const r = d.Fo - F;
      s2 += (r * r) / (d.sig * d.sig);
      n++;
    }
    const dof = Math.max(1, n - 6);
    return { chi2: s2, n, dof, red: s2 / dof };
  },

  quality(red) {
    if (red <= 2) return { label: '几乎吻合！', cls: 'good' };
    if (red <= 6) return { label: '很接近了', cls: 'good' };
    if (red <= 20) return { label: '方向对了', cls: 'mid' };
    return { label: '还差得远', cls: 'bad' };
  },

  verdict(truth, fit) {
    const rows = [];
    rows.push({
      label: 't₀ 峰值时刻',
      tv: `${truth.t0.toFixed(1)} 天`, fv: `${fit.t0.toFixed(1)} 天`,
      pass: Math.abs(truth.t0 - fit.t0) <= 2,
    });
    rows.push({
      label: 't_E 爱因斯坦时间',
      tv: `${truth.tE} 天`, fv: `${fit.tE} 天`,
      pass: Math.abs(truth.tE - fit.tE) <= 0.1 * truth.tE,
    });
    rows.push({
      label: 'u_min 最小间距',
      tv: truth.uMin.toFixed(3), fv: fit.uMin.toFixed(3),
      pass: Math.abs(truth.uMin - fit.uMin) <= Math.max(0.02, 0.15 * truth.uMin),
    });
    rows.push({
      label: 'f_s 源流量占比',
      tv: truth.fs.toFixed(2), fv: fit.fs.toFixed(2),
      pass: Math.abs(truth.fs - fit.fs) <= 0.1,
    });
    const qs = (v) => (v === 0 ? '单透镜' : v < 0.01 ? v.toExponential(1) : v.toFixed(3));
    let qPass;
    if (truth.q === 0 && fit.q === 0) qPass = true;
    else if (truth.q === 0 || fit.q === 0) qPass = false;
    else qPass = fit.q / truth.q >= 0.4 && fit.q / truth.q <= 2.5;
    rows.push({ label: 'q 质量比', tv: qs(truth.q), fv: qs(fit.q), pass: qPass });
    if (truth.q > 0) {
      rows.push({
        label: 's 投影分离度',
        tv: truth.s.toFixed(2), fv: fit.s.toFixed(2),
        pass: Math.abs(truth.s - fit.s) <= 0.15,
      });
    }
    return { rows, allPass: rows.every((r) => r.pass) };
  },
};

window.PUZZLE = PUZZLE;
