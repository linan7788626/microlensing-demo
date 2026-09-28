'use strict';

const APP_VER = 'v8';

const COL = {
  grid: '#1c2740',
  ring: '#8b9bb4',
  caustic: '#f472b6',
  crit: '#a78bfa',
  lens: '#cbd5e1',
  track: '#334155',
  source: '#fbbf24',
  image: '#60a5fa',
  model: '#38bdf8',
  truth: '#4ade80',
  data: '#e2e8f0',
  dataFuture: 'rgba(226,232,240,0.22)',
  now: '#fbbf24',
  ray: 'rgba(125,211,252,0.35)',
  text: '#94a3b8',
  textBright: '#cbd5e1',
  alert: '#f87171',
  silhouette: 'rgba(56,189,248,0.10)',
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
    this.trail = [];
    this.lastTau = null;
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
    const trajMax = Math.max(p.t0 / p.tE, (window.MLPHYS.SEASON_DAYS - p.t0) / p.tE);
    this.half = Math.min(12, Math.max(1.6, p.s + 1.2, p.uMin + 0.6, 2.2, trajMax + 1.2));
  }

  draw(p, evalRes, ts = 0) {
    const { ctx, w, h } = setupCanvas(this.canvas);
    const half = this.half;
    const cx = w / 2, cy = h / 2;
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
    const gStep = half > 4.5 ? 2 : 1;
    const gMax = Math.floor(half / gStep) * gStep;
    for (let g = -gMax; g <= gMax; g += gStep) {
      ctx.beginPath(); ctx.moveTo(X(g), 0); ctx.lineTo(X(g), h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, Y(g)); ctx.lineTo(w, Y(g)); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(251,191,36,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.fillStyle = 'rgba(251,191,36,0.4)';
    ctx.font = '10px sans-serif';
    ctx.fillText('光轴（视线）', cx + 4, 14);
    ctx.fillStyle = '#475569';
    ctx.fillText(APP_VER, w - 34, 16);

    const zeta = evalRes.zeta;
    const TX = (x) => X(zeta.re - x);
    const TY = (y) => Y(y - zeta.im);

    const src = { x: X(0), y: Y(0) };
    const lens = { x: TX(0), y: TY(0) };
    const obs = { x: cx, y: h - 16 };

    if (this.lastTau !== null && evalRes.tau < this.lastTau - 0.5) this.trail.length = 0;
    this.lastTau = evalRes.tau;
    const lastPt = this.trail[this.trail.length - 1];
    if (!lastPt || Math.hypot(lens.x - lastPt.x, lens.y - lastPt.y) > 1.5) {
      this.trail.push({ x: lens.x, y: lens.y });
      if (this.trail.length > 16) this.trail.shift();
    }

    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COL.ring;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lens.x, lens.y, k, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.text;
    ctx.font = '12px sans-serif';
    ctx.fillText('爱因斯坦环 R_E', Math.max(6, Math.min(lens.x + k * 0.55, w - 122)), lens.y - k * 0.78);

    if (p.q > 0 && this.causticCache && this.causticCache.segs.length) {
      ctx.strokeStyle = COL.caustic;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const s of this.causticCache.segs) {
        ctx.moveTo(TX(s.x1), TY(s.y1));
        ctx.lineTo(TX(s.x2), TY(s.y2));
      }
      ctx.stroke();
      ctx.fillStyle = COL.caustic;
      ctx.fillText('焦散线（源平面）', 12, 20);
    }

    if (p.q > 0 && this.causticCache && this.causticCache.critSegs.length) {
      ctx.strokeStyle = COL.crit;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const s of this.causticCache.critSegs) {
        ctx.moveTo(TX(s.x1), TY(s.y1));
        ctx.lineTo(TX(s.x2), TY(s.y2));
      }
      ctx.stroke();
      ctx.fillStyle = COL.crit;
      ctx.fillText('临界曲线（像平面 J=0）', 12, 36);
    }

    const trajY = TY(0);
    ctx.strokeStyle = 'rgba(71,85,105,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, trajY);
    ctx.lineTo(w, trajY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(100,116,139,0.9)';
    const ax = w - 34;
    ctx.beginPath();
    ctx.moveTo(ax, trajY - 4);
    ctx.lineTo(ax, trajY + 4);
    ctx.lineTo(ax + 9, trajY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COL.text;
    ctx.fillText(`透镜轨迹（u_min = ${p.uMin.toFixed(2)} R_E）`, 12, trajY - 8);

    ctx.strokeStyle = 'rgba(251,191,36,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(0), trajY - 7);
    ctx.lineTo(X(0), trajY + 7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(251,191,36,0.8)';
    ctx.font = '10.5px sans-serif';
    ctx.fillText('t₀ 峰值（透镜最近）', X(0) + 6, trajY + 17);

    const bendAmt = Math.max(0, Math.min(1, (2.2 - evalRes.u) / 1.2));
    const offPx = Math.min(1.05, 0.3 + 0.55 / Math.max(evalRes.u, 0.3)) * k;
    const dx = obs.x - src.x, dy = obs.y - src.y;
    const dl = Math.hypot(dx, dy) || 1;
    const px = -dy / dl, py = dx / dl;
    const mid = { x: (src.x + obs.x) / 2, y: (src.y + obs.y) / 2 };
    const rays = [];
    for (const side of [1, -1]) {
      const raw = { x: lens.x + px * offPx * side, y: lens.y + py * offPx * side };
      const c = { x: mid.x + (raw.x - mid.x) * bendAmt, y: mid.y + (raw.y - mid.y) * bendAmt };
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
    ctx.fillStyle = COL.textBright;
    ctx.font = '11px sans-serif';
    ctx.fillText(`u = ${evalRes.u.toFixed(2)}`, (src.x + lens.x) / 2 + 6, (src.y + lens.y) / 2 - 6);

    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trail[i];
      ctx.globalAlpha = ((i + 1) / this.trail.length) * 0.35;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = COL.lens;
    ctx.lineWidth = 1.8;
    const lx = lens.x, ly = lens.y, m = 6.5;
    ctx.beginPath();
    ctx.moveTo(lx - m, ly - m); ctx.lineTo(lx + m, ly + m);
    ctx.moveTo(lx - m, ly + m); ctx.lineTo(lx + m, ly - m);
    ctx.stroke();
    ctx.fillStyle = COL.textBright;
    ctx.font = '11px sans-serif';
    ctx.fillText('透镜', lx + 10, ly - 8);
    ctx.font = '10.5px sans-serif';
    ctx.fillText(`第 ${Math.round(p.t0 + evalRes.tau * p.tE)} 天`, Math.min(lx - 14, w - 48), ly + 20);
    ctx.fillStyle = COL.text;
    ctx.font = '12px sans-serif';
    ctx.fillText(p.q > 0 ? '透镜 = 恒星 + 行星（不可见，沿轨迹运动）' : '透镜恒星（不可见，沿轨迹运动）', 12, h - 30);

    for (const im of evalRes.images) {
      const r = 2.2 + Math.min(6.5, Math.log2(1 + im.mu) * 1.7);
      glowDot(ctx, TX(im.z.re), TY(im.z.im), r, COL.image);
    }
    ctx.fillStyle = COL.image;
    ctx.fillText(`像 ×${evalRes.images.length}`, 12, 52);

    glowDot(ctx, src.x, src.y, 6.5, COL.source);
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(src.x, src.y, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COL.source;
    ctx.font = '12px sans-serif';
    ctx.fillText('源星（固定于光轴中心）', src.x + 16, src.y - 12);
  }
}

class FindingChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.rng = mulberry32(20030827);
    this.stars = [];
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: this.rng(), y: this.rng(),
        r: 0.3 + Math.pow(this.rng(), 3) * 2.2,
        a: 0.15 + this.rng() * 0.55,
      });
    }
  }

  draw(uMin) {
    const { ctx, w, h } = setupCanvas(this.canvas);
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

    const cx = w / 2, cy = h / 2;
    const ringR = 32;

    ctx.strokeStyle = 'rgba(74,222,128,0.95)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = COL.source;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,191,36,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(74,222,128,0.85)';
    ctx.font = '10px sans-serif';
    ctx.fillText('源星', cx + ringR + 4, cy - 4);

    ctx.strokeStyle = 'rgba(125,211,252,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(8, cy); ctx.lineTo(w - 8, cy);
    ctx.moveTo(cx, 8); ctx.lineTo(cx, h - 8);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COL.text;
    ctx.font = '10px sans-serif';
    ctx.fillText('N', cx + 4, 12);
    ctx.fillText('S', cx + 4, h - 4);
    ctx.fillText('E', w - 14, cy + 4);
    ctx.fillText('W', 4, cy + 4);

    ctx.fillStyle = COL.textBright;
    ctx.font = '10.5px sans-serif';
    ctx.fillText('Finding Chart · 5″×5″ 视场', 8, h - 8);
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
    const SEASON = window.MLPHYS.SEASON_DAYS;
    const EPOCH = window.MLPHYS.EPOCH_HJD_OFFSET;
    const X = (t) => m.l + (t / SEASON) * (w - m.l - m.r);
    const XLabel = (t) => Math.round(t + EPOCH);
    const Y = (F) => h - m.b - (F / this.yMax) * (h - m.t - m.b);

    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 1;
    for (let F = 0; F <= this.yMax; F += this.yMax > 20 ? 10 : this.yMax > 6 ? 2 : 1) {
      ctx.beginPath(); ctx.moveTo(m.l, Y(F)); ctx.lineTo(w - m.r, Y(F)); ctx.stroke();
    }
    for (let d = 0; d <= SEASON; d += 30) {
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
    ctx.fillText(`HJD − ${EPOCH}（天）`, w - 110, h - 12);
    ctx.save();
    ctx.translate(13, m.t + 44);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('相对流量 F', 0, 0);
    ctx.restore();

    if (this.meta && this.meta.tEnd - this.meta.tStart > 4) {
      const sx = X(this.meta.tStart), ex = X(this.meta.tEnd);
      ctx.fillStyle = COL.silhouette;
      ctx.beginPath();
      ctx.moveTo(sx, Y(1));
      for (const c of this.model) {
        if (c.t < this.meta.tStart) continue;
        if (c.t > this.meta.tEnd) break;
        ctx.lineTo(X(c.t), Y(c.F));
      }
      ctx.lineTo(ex, Y(1));
      ctx.closePath();
      ctx.fill();

      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(251,191,36,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, m.t); ctx.lineTo(sx, h - m.b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, m.t); ctx.lineTo(ex, h - m.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(251,191,36,0.85)';
      ctx.font = '10.5px sans-serif';
      const startLabel = `事件开始 ★ HJD-${XLabel(this.meta.tStart)}`;
      const endLabel = `事件结束 HJD-${XLabel(this.meta.tEnd)}`;
      const sLabelX = Math.min(sx + 4, w - 140);
      const eLabelX = ex - ctx.measureText(endLabel).width - 4;
      ctx.fillText(startLabel, sLabelX, m.t + 10);
      ctx.fillText(endLabel, eLabelX, m.t + 10);
    }

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#64748b';
    ctx.beginPath(); ctx.moveTo(X(this.p.t0), m.t); ctx.lineTo(X(this.p.t0), h - m.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText('t₀', X(this.p.t0) + 4, m.t + 22);

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
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < this.model.length; i++) {
      const c = this.model[i];
      if (i === 0) ctx.moveTo(X(c.t), Y(c.F));
      else ctx.lineTo(X(c.t), Y(c.F));
    }
    ctx.stroke();

    for (const d of this.data) {
      const isFuture = d.t > state.t;
      const x = X(d.t), y = Y(d.Fo);
      ctx.strokeStyle = isFuture ? COL.dataFuture : 'rgba(226,232,240,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, Y(d.Fo - d.sig));
      ctx.lineTo(x, Y(d.Fo + d.sig));
      ctx.stroke();
      if (isFuture) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = COL.data;
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const age = state.t - d.t;
        const alpha = Math.min(1, age / 1.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COL.data;
        const pop = age < 0.5 ? 1.8 - age : 1;
        ctx.beginPath(); ctx.arc(x, y, 1.8 * pop, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    ctx.strokeStyle = 'rgba(148,163,184,0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(X(state.t), m.t); ctx.lineTo(X(state.t), h - m.b); ctx.stroke();
    const e = window.MLPHYS.evalLens(this.p, state.t);
    const Fnow = window.MLPHYS.modelFlux(this.p, e.A);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(X(state.t), Y(Fnow), 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(X(state.t), m.t); ctx.lineTo(X(state.t) - 4, m.t + 6); ctx.lineTo(X(state.t) + 4, m.t + 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.fillText(`HJD−${EPOCH}+${state.t.toFixed(0)}  A=${e.A.toFixed(2)}  F=${Fnow.toFixed(2)}`, Math.min(X(state.t) + 8, w - 200), m.t + 14);
    ctx.font = '10px sans-serif';
    ctx.fillText('当前时刻', Math.min(X(state.t) + 6, w - 46), Y(Fnow) - 8);

    if (this.meta && this.meta.tEnd - this.meta.tStart > 4) {
      const sx = X(this.meta.tStart);
      const sy = Y(Math.max(window.MLPHYS.modelFlux(this.p, this.meta.Amax), 2.6));
      ctx.fillStyle = COL.alert;
      ctx.beginPath();
      const pts = [
        { x: sx - 5, y: sy - 10 }, { x: sx - 3, y: sy - 4 }, { x: sx + 5, y: sy - 2 },
        { x: sx - 1, y: sy + 2 }, { x: sx + 3, y: sy + 10 }, { x: sx, y: sy + 4 },
        { x: sx - 5, y: sy + 2 }, { x: sx - 7, y: sy - 4 },
      ];
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.font = '10.5px sans-serif';
      ctx.fillStyle = COL.alert;
      ctx.fillText('★ 警报触发', sx + 8, sy + 4);
    }

    if (this.showLegend) {
      const lx = w - 172;
      ctx.font = '11px sans-serif';
      ctx.fillStyle = COL.model;
      ctx.fillText('— 你的模型', lx, m.t + 12);
      ctx.fillStyle = COL.truth;
      ctx.fillText('- - 真值', lx, m.t + 27);
      ctx.fillStyle = COL.data;
      ctx.fillText('· 已观测', lx, m.t + 42);
      ctx.fillStyle = COL.dataFuture;
      ctx.fillText('· 未观测', lx, m.t + 57);
    }
  }
}

window.SystemView = SystemView;
window.CurveView = CurveView;
window.FindingChart = FindingChart;
window.APP_VER = APP_VER;
