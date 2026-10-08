'use strict';

const APP_VER = 'v22';

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
  if (canvas._lw === undefined) {
    canvas._lw = canvas.width;
    canvas._lh = canvas.height;
  }
  if (canvas._dpr !== dpr) {
    canvas._dpr = dpr;
    canvas.width = Math.round(canvas._lw * dpr);
    canvas.height = Math.round(canvas._lh * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas._lw, canvas._lh);
  return { ctx, w: canvas._lw, h: canvas._lh };
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
    const cx = w / 2;
    const srcY = 95, lensY = 330, obsY = 588;
    const src = { x: cx, y: srcY };
    const obs = { x: cx, y: obsY };

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

    ctx.fillStyle = '#475569';
    ctx.font = '10px sans-serif';
    ctx.fillText(APP_VER, w - 34, 16);

    // 视线（光轴）：源 → 观测者，虚线即无透镜时的直线路径
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(251,191,36,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, srcY + 24); ctx.lineTo(cx, obsY - 30); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(251,191,36,0.75)';
    ctx.font = '10.5px sans-serif';
    ctx.fillText('视线（光轴）＝无透镜时的直线路径', cx + 6, srcY + 40);

    // 透镜平面
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(71,85,105,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(10, lensY); ctx.lineTo(w - 10, lensY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.text;
    ctx.font = '11px sans-serif';
    ctx.fillText('透镜平面', 12, lensY - 8);

    const tau = evalRes.tau;
    const maxSpan = Math.max(p.t0 / p.tE, (window.MLPHYS.SEASON_DAYS - p.t0) / p.tE) + 0.5;
    const kSide = Math.min(55, (w / 2 - 36) / maxSpan);
    const lensX = cx + tau * kSide;

    // 运动拖尾
    if (this.lastTau !== null && tau < this.lastTau - 0.5) this.trail.length = 0;
    this.lastTau = tau;
    const lastPt = this.trail[this.trail.length - 1];
    if (!lastPt || Math.hypot(lensX - lastPt.x, lensY - lastPt.y) > 1.5) {
      this.trail.push({ x: lensX, y: lensY });
      if (this.trail.length > 16) this.trail.shift();
    }
    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trail[i];
      ctx.globalAlpha = ((i + 1) / this.trail.length) * 0.3;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // u 与 θ_E 标尺
    const ruler = (x1, x2, y, color, label, below) => {
      if (Math.abs(x2 - x1) < 4) return;
      const a = Math.min(x1, x2), b = Math.max(x1, x2);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a, y - 4); ctx.lineTo(a, y + 4);
      ctx.moveTo(b, y - 4); ctx.lineTo(b, y + 4);
      ctx.stroke();
      ctx.font = '10.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, (a + b) / 2, below ? y + 15 : y - 6);
      ctx.textAlign = 'start';
    };
    ruler(cx, lensX, lensY - 14, 'rgba(251,191,36,0.75)', `u = ${evalRes.u.toFixed(2)} R_E`, false);
    ruler(lensX - kSide, lensX + kSide, lensY + 18, 'rgba(139,155,180,0.9)', '爱因斯坦半径 θ_E', true);

    // 透镜 ×
    ctx.strokeStyle = COL.lens;
    ctx.lineWidth = 1.8;
    const m = 6.5;
    ctx.beginPath();
    ctx.moveTo(lensX - m, lensY - m); ctx.lineTo(lensX + m, lensY + m);
    ctx.moveTo(lensX - m, lensY + m); ctx.lineTo(lensX + m, lensY - m);
    ctx.stroke();
    ctx.fillStyle = COL.textBright;
    ctx.font = '11px sans-serif';
    ctx.fillText('透镜（不可见）', lensX + 10, lensY + 3);
    ctx.font = '10.5px sans-serif';
    ctx.fillText(`第 ${Math.round(p.t0 + tau * p.tE)} 天`, Math.min(lensX - 14, w - 48), lensY + 48);

    // 光线偏折：沿放大率最高的两个像画折线路径
    // 折点偏移 = τ 轴分量（−z.re，远离对齐）与 u 轴分量（z.im，对齐附近）的平滑混合，
    // 透镜方程保证折角恒指向透镜；对齐时两折点分居透镜两侧、连续无跳变
    const imgs = [...evalRes.images].sort((a, b) => b.mu - a.mu).slice(0, 2);
    const wBlend = Math.abs(tau) / (Math.abs(tau) + 0.06);
    const rays = imgs.map((im, idx) => {
      const offRe = -im.z.re * kSide * wBlend;
      const offIm = Math.sign(im.z.im || 1) * Math.abs(im.z.im) * kSide * (1 - wBlend) * 0.4;
      const off = Math.max(-250, Math.min(250, offRe + offIm));
      const kx = Math.max(6, Math.min(w - 6, lensX + off));
      return { kx, mu: im.mu };
    });

    // 线宽 ∝ 对应像的放大率 μ（亮度信息编码在粗细里）
    const muMax = Math.max(...rays.map(r => r.mu), 1e-6);
    rays.forEach((r, idx) => {
      const kink = { x: r.kx, y: lensY };
      const extT = (srcY - lensY) / (obsY - lensY);
      const wRay = Math.max(0.55, Math.min(4.6, 3.4 * r.mu / muMax));
      ctx.strokeStyle = COL.ray;
      ctx.lineWidth = wRay;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(kink.x, kink.y);
      ctx.lineTo(obs.x, obs.y);
      ctx.stroke();
      // 到达光线的反向延长线 → 像的视位置
      const appX = kink.x + extT * (cx - kink.x);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(125,211,252,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(kink.x, kink.y);
      ctx.lineTo(appX, srcY);
      ctx.stroke();
      ctx.setLineDash([]);
      if (appX > 10 && appX < w - 10) {
        ctx.fillStyle = idx === 0 ? '#7dd3fc' : 'rgba(125,211,252,0.65)';
        ctx.beginPath(); ctx.arc(appX, srcY, 3, 0, Math.PI * 2); ctx.fill();
        ctx.font = '10.5px sans-serif';
        ctx.fillText(`像${idx === 0 ? '₁' : '₂'}（视位置）μ=${r.mu.toFixed(2)}`, appX + 6, srcY + (idx === 0 ? -7 : 14));
      }
      if (idx === 0) {
        ctx.fillStyle = 'rgba(125,211,252,0.85)';
        ctx.font = '10.5px sans-serif';
        ctx.fillText('光线偏折', kink.x + 8, kink.y - 8);
      }
    });

    // 光子动画（沿折线）
    const polyAt = (pts, s) => {
      const segs = [];
      let L = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        segs.push(d); L += d;
      }
      let target = s * L;
      for (let i = 0; i < segs.length; i++) {
        if (target <= segs[i] || i === segs.length - 1) {
          const t = segs[i] ? target / segs[i] : 0;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
        }
        target -= segs[i];
      }
    };
    rays.forEach((r, idx) => {
      const pts = [{ x: src.x, y: src.y }, { x: r.kx, y: lensY }, { x: obs.x, y: obs.y }];
      const kPhoton = 0.6 + 0.4 * (r.mu / muMax);
      for (let j = 0; j < 2; j++) {
        const s = ((ts / 1200) + idx * 0.5 + j * 0.25) % 1;
        const pos = polyAt(pts, s);
        ctx.globalAlpha = 0.35 + 0.6 * Math.sin(s * Math.PI);
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 2.2 * kPhoton, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    ctx.font = '16px sans-serif';
    ctx.fillText('🔭', obs.x - 9, obsY + 8);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = COL.text;
    ctx.fillText('观测者（地球）', obs.x + 14, obsY + 4);

    ctx.fillStyle = COL.image;
    ctx.fillText(`像 ×${evalRes.images.length}`, 12, 38);

    // 源星光变效果：大小与亮度随放大率 A(t) 显著变化（半径∝√流量，白热核心+双层光环）
    const srcF = Math.max(0.05, window.MLPHYS.modelFlux(p, evalRes.A));
    const glowK = Math.min(3.4, Math.sqrt(srcF));
    glowDot(ctx, src.x, src.y, 6.5 * glowK, COL.source);
    ctx.strokeStyle = `rgba(251,191,36,${Math.min(0.85, 0.25 * glowK).toFixed(2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(src.x, src.y, 11 * glowK, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(251,191,36,${Math.min(0.5, 0.14 * glowK).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(src.x, src.y, 20 * glowK, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255, 252, 235, ${Math.min(1, 0.25 + 0.3 * glowK).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(src.x, src.y, 6.5 * glowK * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.source;
    ctx.font = '12px sans-serif';
    ctx.fillText(`源星（背景恒星）· A=${evalRes.A.toFixed(2)}`, src.x + 16, src.y - 12);
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

  draw(evalRes, p) {
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

    // ── 静态 mock 层：爱因斯坦环参考位置 + 源星标记 ──
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.85)';
    ctx.font = '10px sans-serif';
    ctx.fillText('爱因斯坦环参考位置', cx + 36, cy - 28);
    glowDot(ctx, cx, cy, 6, COL.source);
    ctx.fillStyle = COL.source;
    ctx.fillText('源星', cx + 13, cy + 18);

    const tau = evalRes.tau, uMin = p.uMin;
    const maxSpan = Math.max(Math.abs(p.t0 / p.tE), Math.abs((window.MLPHYS.SEASON_DAYS - p.t0) / p.tE)) + 0.6;
    const kM = (w / 2 - 14) / maxSpan;
    const lensX = cx + tau * kM;
    const lensY = cy + uMin * kM;

    // 光轴（源-观测者连线，即无透镜时的直线路径）
    ctx.strokeStyle = 'rgba(125,211,252,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(8, cy); ctx.lineTo(w - 8, cy);
    ctx.moveTo(cx, 8); ctx.lineTo(cx, h - 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // 透镜轨迹
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.8)';
    ctx.beginPath(); ctx.moveTo(10, lensY); ctx.lineTo(w - 10, lensY); ctx.stroke();

    // 爱因斯坦环（围绕透镜，对齐时套住源）
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(139, 155, 180, 0.8)';
    ctx.beginPath(); ctx.arc(lensX, lensY, kM, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // u 连线（源 → 透镜）
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lensX, lensY); ctx.stroke();
    ctx.setLineDash([]);

    // 透镜 ×
    ctx.strokeStyle = COL.lens;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lensX - 5, lensY - 5); ctx.lineTo(lensX + 5, lensY + 5);
    ctx.moveTo(lensX - 5, lensY + 5); ctx.lineTo(lensX + 5, lensY - 5);
    ctx.stroke();
    ctx.fillStyle = COL.textBright;
    ctx.font = '10px sans-serif';
    ctx.fillText('透镜', lensX + 7, lensY + 3);

    // 像（蓝点，大小∝放大率；相对源的位置 = (τ−z.re, z.im−uMin) 的镜像）
    for (const im of evalRes.images) {
      const px = cx + (tau - im.z.re) * kM;
      const py = cy - (im.z.im - uMin) * kM;
      ctx.fillStyle = COL.image;
      ctx.beginPath(); ctx.arc(px, py, 1.6 + Math.min(2.6, Math.sqrt(im.mu)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = COL.image;
    ctx.font = '10px sans-serif';
    ctx.fillText(`像 ×${evalRes.images.length}`, 8, 14);

    ctx.fillStyle = COL.text;
    ctx.font = '10px sans-serif';
    ctx.fillText('N', cx + 4, 12);
    ctx.fillText('S', cx + 4, h - 4);
    ctx.fillText('E', w - 14, cy + 4);
    ctx.fillText('W', 4, cy + 4);

    ctx.fillStyle = COL.textBright;
    ctx.font = '10.5px sans-serif';
    ctx.fillText('Finding Chart · mock＋动态投影 · 5″×5″ 视场', 8, h - 8);
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
