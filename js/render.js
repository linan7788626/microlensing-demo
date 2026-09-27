'use strict';

const COL = {
  grid: '#1c2740',
  ring: '#475569',
  caustic: '#f472b6',
  lens: '#94a3b8',
  track: '#334155',
  source: '#fde047',
  image: '#7dd3fc',
  model: '#38bdf8',
  data: '#e2e8f0',
  now: '#fbbf24',
  text: '#94a3b8',
  textBright: '#cbd5e1',
};

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width, h = canvas.height;
  if (canvas._dpr !== dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas._dpr = dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

class SystemView {
  constructor(canvas) {
    this.canvas = canvas;
    this.causticCache = null;
    this.causticKey = '';
  }

  setParams(p) {
    const key = `${p.q}|${p.s}`;
    if (key !== this.causticKey) {
      this.causticKey = key;
      this.causticCache = window.MLPHYS.causticSegments(p, 220);
    }
    this.half = Math.max(1.6, p.s + 1.2, p.uMin + 0.6, 2.2);
  }

  draw(p, evalRes) {
    const { ctx, w, h } = setupCanvas(this.canvas);
    const half = this.half;
    const cx = w / 2, cy = h / 2;
    const k = Math.min(w, h) / (2 * half);
    const X = (x) => cx + x * k;
    const Y = (y) => cy - y * k;

    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 1;
    for (let g = -Math.ceil(half); g <= Math.ceil(half); g++) {
      ctx.beginPath(); ctx.moveTo(X(g), 0); ctx.lineTo(X(g), h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, Y(g)); ctx.lineTo(w, Y(g)); ctx.stroke();
    }

    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COL.ring;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(X(0), Y(0), k, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.text;
    ctx.font = '11px sans-serif';
    ctx.fillText('爱因斯坦环 R_E', X(0) + k * 0.72, Y(0) - k * 0.72);

    if (p.q > 0 && this.causticCache) {
      ctx.strokeStyle = COL.caustic;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const s of this.causticCache.segs) {
        ctx.moveTo(X(s.x1), Y(s.y1));
        ctx.lineTo(X(s.x2), Y(s.y2));
      }
      ctx.stroke();
      ctx.fillStyle = COL.caustic;
      ctx.fillText('焦散线', 10, 18);
    }

    const { z1, z2 } = window.MLPHYS.lensSystemParams(p);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = COL.lens;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(X(z1), Y(0), 7, 0, Math.PI * 2); ctx.stroke();
    if (p.q > 0) {
      ctx.beginPath(); ctx.arc(X(z2), Y(0), 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = COL.lens;
    ctx.fillText(p.q > 0 ? '透镜（恒星+行星，不可见）' : '透镜恒星（不可见）', X(0) - 46, h - 10);

    const tauMin = -X(0) / k, tauMax = (w - X(0)) / k;
    const tStart = p.t0 + tauMin * p.tE;
    const tEnd = p.t0 + tauMax * p.tE;
    ctx.strokeStyle = COL.track;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(X(tauMin), Y(p.uMin));
    ctx.lineTo(X(tauMax), Y(p.uMin));
    ctx.stroke();
    ctx.fillStyle = COL.text;
    ctx.fillText('源轨迹', 10, h - 28);

    for (const im of evalRes.images) {
      const r = 2 + Math.min(6, Math.log2(1 + im.mu) * 1.6);
      ctx.fillStyle = COL.image;
      ctx.beginPath(); ctx.arc(X(im.z.re), Y(im.z.im), r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = COL.image;
    ctx.fillText(`像 ×${evalRes.images.length}`, 10, 34);

    ctx.fillStyle = COL.source;
    ctx.beginPath(); ctx.arc(X(evalRes.zeta.re), Y(evalRes.zeta.im), 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(253,224,71,0.35)';
    ctx.beginPath(); ctx.arc(X(evalRes.zeta.re), Y(evalRes.zeta.im), 9, 0, Math.PI * 2); ctx.stroke();
  }
}

class CurveView {
  constructor(canvas) {
    this.canvas = canvas;
    this.m = { l: 52, r: 14, t: 16, b: 34 };
    this.model = null;
    this.data = null;
    this.meta = null;
    this.truthModel = null;
    this.showLegend = false;
  }

  setModel(p, model, data, meta) {
    this.p = p;
    this.model = model;
    this.data = data;
    this.meta = meta;
    this.yMax = 1;
    for (const c of model) if (c.F > this.yMax) this.yMax = c.F;
    if (this.truthModel) {
      for (const c of this.truthModel) if (c.F > this.yMax) this.yMax = c.F;
    }
    this.yMax *= 1.12;
  }

  draw(state) {
    const { ctx, w, h } = setupCanvas(this.canvas);
    const m = this.m;
    const X = (t) => m.l + (t / window.MLPHYS.SEASON_DAYS) * (w - m.l - m.r);
    const Y = (F) => h - m.b - (F / this.yMax) * (h - m.t - m.b);

    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 1;
    for (let F = 0; F <= this.yMax; F += this.yMax > 20 ? 10 : this.yMax > 6 ? 2 : 1) {
      ctx.beginPath(); ctx.moveTo(m.l, Y(F)); ctx.lineTo(w - m.r, Y(F)); ctx.stroke();
    }
    for (let d = 0; d <= 180; d += 30) {
      ctx.beginPath(); ctx.moveTo(X(d), m.t); ctx.lineTo(X(d), h - m.b); ctx.stroke();
    }

    ctx.strokeStyle = '#475569';
    ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, h - m.b); ctx.lineTo(w - m.r, h - m.b); ctx.stroke();

    ctx.fillStyle = COL.text;
    ctx.font = '11px sans-serif';
    ctx.fillText('t (天)', w - 40, h - 12);
    ctx.save();
    ctx.translate(13, m.t + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('相对流量 F', 0, 0);
    ctx.restore();

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#64748b';
    ctx.beginPath(); ctx.moveTo(X(this.p.t0), m.t); ctx.lineTo(X(this.p.t0), h - m.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText('t₀', X(this.p.t0) + 4, m.t + 12);

    ctx.strokeStyle = COL.model;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < this.model.length; i++) {
      const c = this.model[i];
      if (i === 0) ctx.moveTo(X(c.t), Y(c.F));
      else ctx.lineTo(X(c.t), Y(c.F));
    }
    ctx.stroke();

    if (this.truthModel) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      for (let i = 0; i < this.truthModel.length; i++) {
        const c = this.truthModel[i];
        if (i === 0) ctx.moveTo(X(c.t), Y(c.F));
        else ctx.lineTo(X(c.t), Y(c.F));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const d of this.data) {
      if (d.t > state.t) continue;
      const age = state.t - d.t;
      const alpha = Math.min(1, age / 1.5);
      const x = X(d.t), y = Y(d.Fo);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(226,232,240,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, Y(d.Fo - d.sig));
      ctx.lineTo(x, Y(d.Fo + d.sig));
      ctx.stroke();
      const pop = age < 0.5 ? 1.8 - age : 1;
      ctx.fillStyle = COL.data;
      ctx.beginPath(); ctx.arc(x, y, 1.8 * pop, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = COL.now;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(X(state.t), m.t); ctx.lineTo(X(state.t), h - m.b); ctx.stroke();
    const e = window.MLPHYS.evalLens(this.p, state.t);
    const Fnow = window.MLPHYS.modelFlux(this.p, e.A);
    ctx.fillStyle = COL.now;
    ctx.beginPath(); ctx.arc(X(state.t), Y(Fnow), 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '12px sans-serif';
    ctx.fillText(`第 ${state.t.toFixed(0)} 天  A=${e.A.toFixed(2)}  F=${Fnow.toFixed(2)}`, Math.min(X(state.t) + 8, w - 150), m.t + 14);

    if (this.meta) {
      ctx.fillStyle = COL.textBright;
      ctx.fillText(`A_max=${this.meta.Amax.toFixed(1)} @ t₀=${this.p.t0.toFixed(0)}d   t_FWHM≈${this.meta.tFwhm.toFixed(1)}d   t_E=${this.p.tE}d`, m.l + 6, h - 12);
    }

    if (this.showLegend) {
      const lx = w - 168;
      ctx.font = '11px sans-serif';
      ctx.fillStyle = COL.model;
      ctx.fillText('— 你的模型', lx, m.t + 12);
      ctx.fillStyle = '#4ade80';
      ctx.fillText(this.truthModel ? '- - 真值' : '- - 真值（待公布）', lx, m.t + 27);
      ctx.fillStyle = COL.data;
      ctx.fillText('· 观测数据', lx, m.t + 42);
    }
  }
}

window.SystemView = SystemView;
window.CurveView = CurveView;
