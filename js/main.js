'use strict';

const App = {
  params: { t0: 80, uMin: 0.15, tE: 25, fs: 1, q: 0, s: 1.2 },
  sandboxParams: null,
  mode: 'sandbox',
  puzzle: null,
  t: 0,
  prevT: 0,
  playing: false,
  speed: 8,
  slots: null,
  model: null,
  data: null,
  meta: null,
  sysView: null,
  curveView: null,
  unlocked: new Set(),
  lastReadout: 0,
  lastFrame: 0,

  init() {
    UI.init({
      onChange: () => this.rebuild(),
      onRelease: () => this.rebuild(),
      onControl: (cmd, v) => this.control(cmd, v),
    });
    this.sysView = new SystemView(document.getElementById('system-canvas'));
    this.curveView = new CurveView(document.getElementById('curve-canvas'));
    this.findingView = new FindingChart(document.getElementById('finding-canvas'));
    try {
      const saved = JSON.parse(localStorage.getItem('microlensing-demo-save') || '[]');
      saved.forEach((id) => this.unlocked.add(id));
    } catch (e) { /* ignore */ }
    UI.setGalleryCount(this.unlocked.size, window.KNOWLEDGE_CARDS.length);
    UI.setSpeedUI(this.speed);
    UI.setPlayButton(this.playing);
    const badge = document.getElementById('app-ver');
    if (badge) badge.textContent = window.APP_VER;
    this.slots = window.MLPHYS.obsSlots(42);
    this.sandboxParams = { ...this.params };
    this.rebuild();
    UI.log(`🔍 诊断: ${window.APP_VER} · 画布 ${this.sysView.canvas.width}×${this.sysView.canvas.height} · t₀=${this.params.t0}天 u_min=${this.params.uMin} t_E=${this.params.tE}天 q=${this.params.q}`, 'sys');
    this.lastFrame = performance.now();
    requestAnimationFrame((ts) => this.loop(ts));
  },

  save() {
    try {
      localStorage.setItem('microlensing-demo-save', JSON.stringify([...this.unlocked]));
    } catch (e) { /* ignore */ }
  },

  rebuild() {
    this.params = UI.readParams();
    UI.updateParamLabels(this.params);
    if (this.params.fs < 0.9) this.unlock('ml-blending');
    if (this.params.q > 0) this.unlock('ml-caustic');
    const P = window.MLPHYS;
    if (this.mode === 'puzzle' && this.puzzle) {
      this.model = P.modelCurve(this.params);
      this.data = this.puzzle.data;
      this.meta = P.curveAnalytics(this.params);
      this.curveView.truthModel = this.puzzle.revealed ? P.modelCurve(this.puzzle.truth) : null;
      UI.showChi2(PUZZLE.chi2(this.params, this.puzzle.data));
    } else {
      this.model = P.modelCurve(this.params);
      this.data = P.buildObs(this.params, this.slots);
      this.meta = P.curveAnalytics(this.params);
      this.curveView.truthModel = null;
    }
    this.curveView.showLegend = this.mode === 'puzzle';
    this.curveView.setModel(this.params, this.model, this.data, this.meta);
  },

  control(cmd, v) {
    if (cmd === 'play') {
      this.playing = !this.playing;
      UI.setPlayButton(this.playing);
    } else if (cmd === 'rewind') {
      this.t = 0;
      this.prevT = 0;
    } else if (cmd === 'reseed') {
      this.slots = window.MLPHYS.obsSlots((Math.random() * 1e9) | 0);
      if (this.mode === 'puzzle' && this.puzzle) {
        this.puzzle.data = window.MLPHYS.buildObs(this.puzzle.truth, this.slots);
        UI.log('天气重新抽签：谜题观测数据已更新', 'sys');
      } else {
        UI.log('天气重新抽签：部分夜晚的观测点已重新生成', 'sys');
      }
      this.rebuild();
    } else if (cmd === 'full') {
      this.t = window.MLPHYS.SEASON_DAYS;
      this.prevT = this.t;
      this.playing = false;
      UI.setPlayButton(this.playing);
      UI.log('📷 切到完整事件视图——蓝色光标已到达末端，可看到事件从开始到结束的全部光变。', 'sys');
    } else if (cmd === 'speed') {
      this.speed = v;
      UI.setSpeedUI(v);
    } else if (cmd === 'puzzle') {
      this.togglePuzzle();
    } else if (cmd === 'reveal') {
      this.reveal();
    } else if (cmd === 'next') {
      this.newPuzzle();
    }
  },

  togglePuzzle() {
    if (this.mode === 'sandbox') {
      this.mode = 'puzzle';
      this.sandboxParams = { ...this.params };
      UI.setPuzzleUI(true);
      UI.log('🎯 进入谜题模式：夜空中藏着一个未知的透镜系统，用光变曲线找出它的全部参数！', 'sys');
      this.newPuzzle();
    } else {
      this.mode = 'sandbox';
      this.puzzle = null;
      this.curveView.truthModel = null;
      UI.setPuzzleUI(false);
      UI.setSliders(this.sandboxParams);
      UI.log('🔬 返回沙盒模式', 'sys');
      this.rebuild();
    }
  },

  newPuzzle() {
    const truth = window.PUZZLE.gen((Math.random() * 1e9) | 0);
    this.puzzle = { truth, data: window.MLPHYS.buildObs(truth, this.slots), revealed: false };
    this.curveView.truthModel = null;
    this.curveView.showLegend = true;
    UI.setSliders(window.PUZZLE.FIT_DEFAULTS);
    UI.setPuzzleUI(true);
    this.t = window.MLPHYS.SEASON_DAYS;
    this.prevT = this.t;
    this.rebuild();
    const hint = truth.q === 0 ? '单透镜' : '恒星 + 隐藏的行星/伴星';
    UI.log(`🕵️ 新谜题：${hint}。调整滑块让青色模型曲线贴合白色观测点，χ²/dof → 1 后公布答案。`, 'sys');
  },

  reveal() {
    if (!this.puzzle || this.puzzle.revealed) return;
    this.puzzle.revealed = true;
    const v = window.PUZZLE.verdict(this.puzzle.truth, this.params);
    UI.showVerdict(v);
    this.rebuild();
    if (v.allPass) {
      UI.log('🎉 完美破案！所有参数都在容差之内。', 'unlock');
      this.unlock('ml-planet');
    } else {
      UI.log('答案已公布：绿色虚线是真值曲线，对照看看差在哪里。', 'sys');
    }
  },

  unlock(id) {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    const card = window.KNOWLEDGE_MAP[id];
    if (card) {
      UI.toast(card);
      UI.log(`📜 解锁知识卡「${card.title}」`, 'unlock');
    }
    UI.setGalleryCount(this.unlocked.size, window.KNOWLEDGE_CARDS.length);
    this.save();
  },

  loop(ts) {
    const dt = Math.min(0.1, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    this.prevT = this.t;
    if (this.playing) {
      this.t += this.speed * dt;
      if (this.t > window.MLPHYS.SEASON_DAYS) {
        this.t = 0;
        this.prevT = 0;
      }
    }
    const P = window.MLPHYS;
    const displayP = (this.mode === 'puzzle' && this.puzzle && this.puzzle.revealed)
      ? this.puzzle.truth
      : this.params;
    const ev = P.evalLens(displayP, this.t);
    ev.p = displayP;

    this.sysView.setParams(displayP);
    this.sysView.draw(displayP, ev, this.playing ? ts : 0);
    this.findingView.draw(ev, displayP);
    this.curveView.draw({ t: this.t });

    if (ts - this.lastReadout > 150) {
      this.lastReadout = ts;
      UI.updateReadouts(ev, this.meta);
      UI.updateRegime(ev);
    }

    if (this.t > 1) this.unlock('ml-basics');
    if (ev.u < 0.5) this.unlock('ml-ring');
    if (this.prevT < this.params.t0 && this.t >= this.params.t0) this.unlock('ml-paczynski');
    if (ev.binary) {
      const smooth = P.paczynskiA(ev.u);
      if (ev.A > smooth * 1.05 + 0.05) this.unlock('ml-planet');
    }
    requestAnimationFrame((t2) => this.loop(t2));
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
