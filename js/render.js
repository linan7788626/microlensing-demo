'use strict';

const COL = {
  grid: '#1c2740',
  ring: '#8b9bb4',
  caustic: '#f472b6',
  lens: '#cbd5e1',
  track: '#334155',
  source: '#fbbf24',
  image: '#60a5fa',
  model: '#38bdf8',
  truth: '#4ade80',
  data: '#e2e8f0',
  now: '#fbbf24',
  ray: 'rgba(125,211,252,0.35)',
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

function glowDot(ctx, x, y, r, color, glowScale = 3) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * glowScale);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + 'aa');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * glowScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function qbez(p0, c, p1, t) {
  const s = 1 - t;
  return {
    x: s * s * p0.x + 2 * s * t * c.x + t * t * p1.x,
    y: s * s * p0.y + 2 * s * t * c.y + t * t * p1.y,
  };
}

class SystemView {
  constructor(canvas) {
    this.canvas = canvas;
    this.causticCache = null;
    this.causticKey = '';
    const rng = mulberry32(20260927);
    this.stars = [];
    for (let i = 0; i < 110; i++) {
      this.stars.push({
        x: rng(), y: rng(),
        r: 0.4 + rng() * 1.1,
        a: 0.12 + rng() * 0.4,
      });
    }
  }

  setParams(p) {
    const key = `${p.q}|${p.s}`;
    if (key !== this.causticKey) {
      this.causticKey = key;
      this.causticCache = window.MLPHYS.causticSegments(p, 220);
    }
    this.half = Math.max(1.6, p.s + 1.2, p.uMin + 0.6, 2.2);
  }

  draw(p, evalRes, ts = 0) {
    const { ctx, w, h } = setupCanvas(this.canvas);
    const half = this.half;
    const cx = w / 2, cy = h * 0.44;
    const k = Math.min(w, h) / (2 * half);
    const X = (x) => cx + x * k;
    const Y = (y) => cy - y * k;

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);
    for (const st of this.stars) {
      ctx.globalAlpha = st.a;
      ctx.fillStyle = '#dbeafe';
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(30,41,64,0.6)';
    ctx.lineWidth = 1;
    for (let g = -Math.ceil(half); g <= Math.ceil(half); g++) {
      ctx.beginPath(); ctx.moveTo(X(g), 0); ctx.lineTo(X(g), h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, Y(g)); ctx.lineTo(w, Y(g)); ctx.stroke();
    }

    const src = { x: X(evalRes.zeta.re), y: Y(evalRes.zeta.im) };
    const lens = { x: X(0), y: Y(0) };
    const obs = { x: cx, y: h - 16 };

    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COL.ring;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lens.x, lens.y, k, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.text;
    ctx.font = '12px sans-serif';
    ctx.fillText('爱因斯坦环 R_E', lens.x + k * 0.7, lens.y - k * 0.74);

    if (p.q > 0 && this.causticCache && this.causticCache.segs.length) {
      ctx.strokeStyle = COL.caustic;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const s of this.causticCache.segs) {
        ctx.moveTo(X(s.x1), Y(s.y1));
        ctx.lineTo(X(s.x2), Y(s.y2));
      }
      ctx.stroke();
      ctx.fillStyle = COL.caustic;
      ctx.fillText('焦散线', 12, 20);
    }

    const tauMin = -cx / k, tauMax = (w - cx) / k;
    ctx.strokeStyle = 'rgba(71,85,105,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X(tauMin), Y(p.uMin));
    ctx.lineTo(X(tauMax), Y(p.uMin));
    ctx.stroke();
    ctx.fillStyle = COL.text;
    ctx.fillText('源轨迹', 12, h - 52);

    const offPx = Math.min(1.05, 0.3 + 0.55 / Math.max(evalRes.u, 0.3)) * k;
    const dx = obs.x - src.x, dy = obs.y - src.y;
    const dl = Math.hypot(dx, dy) || 1;
    const px = -dy / dl, py = dx / dl;
    const rays = [];
    for (const side of [1, -1]) {
      const c = { x: lens.x + px * offPx * side, y: lens.y + py * offPx * side };
      rays.push({ p0: src, c, p1: obs });
      ctx.strokeStyle = COL.ray;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.quadraticCurveTo(c.x, c.y, obs.x, obs.y);
      ctx.stroke();
    }
    for (let i = 0; i < rays.length; i++) {
      const r = rays[i];
      for (let j = 0; j < 2; j++) {
        const t = ((ts / 900) + i * 0.5 + j * 0.25) % 1;
        const pos = qbez(r.p0, r.c, r.p1, t);
        const fade = Math.sin(t * Math.PI);
        ctx.globalAlpha = 0.35 + 0.6 * fade;
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    ctx.font = '16px sans-serif';
    ctx.fillText('🔭', obs.x - 9, obs.y + 6);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = COL.text;
    ctx.fillText('观测者', obs.x + 14, obs.y + 2);

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(lens.x, lens.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COL.lens;
    ctx.lineWidth = 1.6;
    const lx = lens.x, ly = lens.y, m = 5;
    ctx.beginPath();
    ctx.moveTo(lx - m, ly - m); ctx.lineTo(lx + m, ly + m);
    ctx.moveTo(lx - m, ly + m); ctx.lineTo(lx + m, ly - m);
    ctx.stroke();
    ctx.fillStyle = COL.text;
    ctx.fillText(p.q > 0 ? '透镜 = 恒星 + 行星（不可见）' : '透镜恒星（不可见）', 12, h - 30);

    for (const im of evalRes.images) {
      const r = 2.2 + Math.min(6.5, Math.log2(1 + im.mu) * 1.7);
      glowDot(ctx, X(im.z.re), Y(im.z.im), r, COL.image);
    }
    ctx.fillStyle = COL.image;
    ctx.fillText(`像 ×${evalRes.images.length}`, 12, 38);

    glowDot(ctx, src.x, src.y, 5.5, COL.source);
    ctx.strokeStyle = 'rgba(251,191,36,0.35)';
    ctx.beginPath(); ctx.arc(src.x, src.y, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COL.source;
    ctx.fillText('源星', src.x + 10, src.y - 8);
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

    if (this.yMax > 2.4) {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(148,163,184,0.5)';
      ctx.beginPath(); ctx.moveTo(m.l, Y(1)); ctx.lineTo(w - m.r, Y(1)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.text;
      ctx.font = '11px sans-serif';
      ctx.fillText('基线 F=1', m.l + 4, Y(1) - 4);
    }

    ctx.strokeStyle = '#475569';
    ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, h - m.b); ctx.lineTo(w - m.r, h - m.b); ctx.stroke();

    ctx.fillStyle = COL.text;
    ctx.font = '11px sans-serif';
    ctx.fillText('t (天)', w - 40, h - 12);
    ctx.save();
    ctx.translate(13, m.t + 44);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('相对流量 F', 0, 0);
    ctx.restore();

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#64748b';
    ctx.beginPath(); ctx.moveTo(X(this.p.t0), m.t); ctx.lineTo(X(this.p.t0), h - m.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText('t₀', X(this.p.t0) + 4, m.t + 12);

    if (this.truthModel) {
      ctx.strokeStyle = COL.truth;
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

    ctx.strokeStyle = COL.model;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < this.model.length; i++) {
      const c = this.model[i];
      if (i === 0) ctx.moveTo(X(c.t), Y(c.F));
      else ctx.lineTo(X(c.t), Y(c.F));
    }
    ctx.stroke();

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
    ctx.fillText(`第 ${state.t.toFixed(0)} 天  A=${e.A.toFixed(2)}  F=${Fnow.toFixed(2)}`, Math.min(X(state.t) + 8, w - 160), m.t + 14);

    if (this.meta) {
      ctx.fillStyle = COL.textBright;
      ctx.fillText(`A_max=${this.meta.Amax.toFixed(1)} @ t₀=${this.p.t0.toFixed(0)}d   t_FWHM≈${this.meta.tFwhm.toFixed(1)}d   t_E=${this.p.tE}d`, m.l + 6, h - 12);
    }

    if (this.showLegend) {
      const lx = w - 172;
      ctx.font = '11px sans-serif';
      ctx.fillStyle = COL.model;
      ctx.fillText('— 你的模型', lx, m.t + 12);
      ctx.fillStyle = COL.truth;
      ctx.fillText('- - 真值', lx, m.t + 27);
      ctx.fillStyle = COL.data;
      ctx.fillText('· 观测数据', lx, m.t + 42);
    }
  }
}

window.SystemView = SystemView;
window.CurveView = CurveView;
