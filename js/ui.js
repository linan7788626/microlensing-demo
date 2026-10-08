'use strict';

const UI = {
  els: {},
  onChange: null,
  onRelease: null,
  onControl: null,

  init(handlers) {
    this.onChange = handlers.onChange;
    this.onRelease = handlers.onRelease;
    this.onControl = handlers.onControl;
    const ids = ['slider-t0', 'slider-umin', 'slider-te', 'slider-fs', 'slider-q', 'slider-s',
      'val-t0', 'val-umin', 'val-te', 'val-fs', 'val-q', 'val-s',
      'btn-play', 'btn-reset', 'btn-rewind', 'btn-full', 'btn-gallery', 'btn-gallery-close',
      'speed-group', 'readout-u', 'readout-a', 'readout-nimg', 'readout-params',
      'regime-text', 'event-log', 'toast-area', 'modal-gallery', 'gallery-list',
      'gallery-count', 'row-s', 'btn-puzzle', 'puzzle-bar', 'btn-reveal', 'btn-next',
      'chi2-readout', 'verdict-box', 'event-meta'];
    for (const id of ids) this.els[id] = document.getElementById(id);

    for (const s of ['t0', 'umin', 'te', 'fs', 'q', 's']) {
      const el = this.els['slider-' + s];
      el.addEventListener('input', () => this.onChange());
      el.addEventListener('change', () => this.onRelease());
    }

    this.els['btn-play'].onclick = () => this.onControl('play');
    this.els['btn-rewind'].onclick = () => this.onControl('rewind');
    this.els['btn-full'].onclick = () => this.onControl('full');
    this.els['btn-reset'].onclick = () => this.onControl('reseed');
    this.els['btn-puzzle'].onclick = () => this.onControl('puzzle');
    this.els['btn-reveal'].onclick = () => this.onControl('reveal');
    this.els['btn-next'].onclick = () => this.onControl('next');
    this.els['btn-gallery'].onclick = () => { this.renderGallery(); this.show('modal-gallery'); };
    this.els['btn-gallery-close'].onclick = () => this.hide('modal-gallery');
    this.els['modal-gallery'].addEventListener('click', (e) => {
      if (e.target === this.els['modal-gallery']) this.hide('modal-gallery');
    });
    this.els['speed-group'].querySelectorAll('.speed').forEach((b) => {
      b.onclick = () => this.onControl('speed', Number(b.dataset.v));
    });
  },

  readParams() {
    const qv = Number(this.els['slider-q'].value);
    return {
      t0: Number(this.els['slider-t0'].value),
      uMin: Number(this.els['slider-umin'].value),
      tE: Number(this.els['slider-te'].value),
      fs: Number(this.els['slider-fs'].value),
      q: qv === 0 ? 0 : Math.pow(10, -4 + 4 * qv),
      s: Number(this.els['slider-s'].value),
    };
  },

  setSliders(p) {
    this.els['slider-t0'].value = p.t0;
    this.els['slider-umin'].value = p.uMin;
    this.els['slider-te'].value = p.tE;
    this.els['slider-fs'].value = p.fs;
    this.els['slider-q'].value = p.q === 0 ? 0 : (Math.log10(p.q) + 4) / 4;
    this.els['slider-s'].value = p.s;
    this.updateParamLabels(p);
  },

  setPuzzleUI(on) {
    this.els['puzzle-bar'].classList.toggle('hidden', !on);
    this.els['btn-puzzle'].textContent = on ? '🔬 返回沙盒' : '🎯 谜题挑战（高级）';
    this.els['btn-puzzle'].classList.toggle('active', on);
    if (!on) {
      this.els['verdict-box'].innerHTML = '';
      this.els['chi2-readout'].textContent = '—';
      this.els['chi2-readout'].className = 'chi2';
    }
  },

  showChi2(c) {
    const q = window.PUZZLE.quality(c.red);
    const el = this.els['chi2-readout'];
    el.textContent = `χ²/dof = ${c.red.toFixed(1)}（${c.n} 个数据点）— ${q.label}`;
    el.className = 'chi2 ' + q.cls;
  },

  showVerdict(v) {
    const box = this.els['verdict-box'];
    const head = v.allPass
      ? '<div class="v-head pass">🎉 完美破案！你就是微透镜侦探</div>'
      : '<div class="v-head">🕵️ 答案公布（绿线为真值曲线）</div>';
    const rows = v.rows.map((r) =>
      `<div class="v-row ${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} ${r.label}：真值 <b>${r.tv}</b> · 你的拟合 <b>${r.fv}</b></div>`
    ).join('');
    box.innerHTML = head + rows;
  },

  updateParamLabels(p) {
    this.els['val-t0'].textContent = `${p.t0.toFixed(0)} 天`;
    this.els['val-umin'].textContent = p.uMin.toFixed(2) + ' R_E';
    this.els['val-te'].textContent = `${p.tE} 天`;
    this.els['val-fs'].textContent = p.fs.toFixed(2);
    this.els['val-q'].textContent = p.q === 0 ? '单透镜' : (p.q < 0.01 ? p.q.toExponential(1) : p.q.toFixed(3));
    this.els['val-s'].textContent = p.q === 0 ? '—' : p.s.toFixed(2) + ' R_E';
    this.els['row-s'].classList.toggle('disabled', p.q === 0);
  },

  updateReadouts(ev, meta) {
    this.els['readout-u'].textContent = ev.u.toFixed(3);
    this.els['readout-a'].textContent = ev.A.toFixed(2);
    this.els['readout-nimg'].textContent = `${ev.images.length} 个`;
    this.els['readout-params'].innerHTML =
      `A_max ≈ ${meta.Amax.toFixed(1)}（≈ 1/u_min = ${(1 / Math.max(ev.p.uMin, 1e-6)).toFixed(1)}）<br>` +
      `t_FWHM ≈ ${meta.tFwhm.toFixed(1)} 天　|　t₀ = ${ev.p.t0.toFixed(0)} 天　|　t_E = ${ev.p.tE} 天`;

    if (this.els['event-meta'] && meta) {
      const dur = meta.tEnd - meta.tStart;
      const EPOCH = window.MLPHYS.EPOCH_HJD_OFFSET;
      const items = [
        { label: '持续', value: `≈ ${dur.toFixed(1)} 天` },
        { label: '峰值', value: `F=${meta.Fmax.toFixed(2)} @ HJD-${EPOCH + Math.round(meta.tPeak)}` },
        { label: '放大', value: `≈ ${meta.Amax.toFixed(1)}×` },
        { label: 'FWHM', value: `≈ ${meta.tFwhm.toFixed(1)} 天` },
        { label: '开始', value: `HJD-${EPOCH + Math.round(meta.tStart)}` },
        { label: '结束', value: `HJD-${EPOCH + Math.round(meta.tEnd)}` },
      ];
      this.els['event-meta'].innerHTML =
        items.map((it) => `<div class="em-cell"><span>${it.label}</span><b>${it.value}</b></div>`).join('');
    }

    if (this.els['ring-arcsec']) {
      const thetaE = Math.sqrt(ev.p.uMin) * 1;
      const arc = (thetaE * 3600 * (180 / Math.PI) * 0.5).toFixed(2);
      this.els['ring-arcsec'].textContent = `≈ ${arc}″（示意）`;
    }
  },

  updateRegime(ev) {
    const p = ev.p;
    let txt;
    if (!ev.binary) {
      txt = '<b>单透镜（1L1S）：</b>前景恒星从源星前方经过，光线弯折成两个像——主像在环外、次像在环内，两者合起来的亮度就是 Paczyński 曲线。' +
        '当前 u = ' + ev.u.toFixed(2) + '，A = ' + ev.A.toFixed(2) + '。峰高只由 u_min 决定（A_max ≈ 1/u_min），宽度由 t_E 决定。';
      if (Math.abs(ev.tau) < 0.25) txt += ' <b>此刻源几乎正对透镜——两个像正趋于合并成爱因斯坦环！</b>';
    } else {
      txt = '<b>双透镜（1L2S）：</b>透镜是"恒星+行星/伴星"。透镜方程变成五次复多项式，像最多 5 个，源平面上出现焦散线（品红色）。' +
        '当前共 ' + ev.images.length + ' 个像，A = ' + ev.A.toFixed(2) + '。';
      const smooth = window.MLPHYS.paczynskiA(ev.u);
      if (ev.A > smooth * 1.05 + 0.05) {
        txt += ' <b>源正在焦散线附近/内部——放大率出现尖锐扰动，这正是发现系外行星的信号！</b>';
      } else if (ev.tau > 1) {
        txt += ' 提示：把 u_min 调小、时间播放到峰值附近，或扫过 ±(s−1/s) 附近的行星焦散线，观察扰动。';
      }
    }
    this.els['regime-text'].innerHTML = txt;
  },

  log(msg, cls = '') {
    const div = document.createElement('div');
    div.className = 'log-line ' + cls;
    div.textContent = msg;
    this.els['event-log'].prepend(div);
    while (this.els['event-log'].children.length > 30) this.els['event-log'].lastChild.remove();
  },

  toast(card) {
    const area = this.els['toast-area'];
    const div = document.createElement('div');
    div.className = 'toast';
    div.innerHTML = `<span class="t-icon">${card.icon}</span><span><b>解锁知识卡：${card.title}</b><br><small>${card.body.slice(0, 46)}…（见图鉴）</small></span>`;
    area.appendChild(div);
    setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 400); }, 3600);
  },

  setGalleryCount(n, total) {
    this.els['gallery-count'].textContent = `${n} / ${total}`;
  },

  renderGallery(unlocked) {
    const list = this.els['gallery-list'];
    list.innerHTML = '';
    for (const c of window.KNOWLEDGE_CARDS) {
      const has = unlocked.has(c.id);
      const div = document.createElement('div');
      div.className = 'card' + (has ? '' : ' locked');
      div.innerHTML = has
        ? `<div class="card-head">${c.icon} <b>${c.title}</b></div><div class="card-body">${c.body}</div><div class="card-ref">出处：${c.ref}</div>`
        : `<div class="card-head">🔒 <b>？？？</b></div><div class="card-body">调整参数、播放观测即可解锁。</div>`;
      list.appendChild(div);
    }
  },

  show(id) { this.els[id].classList.remove('hidden'); },
  hide(id) { this.els[id].classList.add('hidden'); },

  setPlayButton(playing) {
    this.els['btn-play'].textContent = playing ? '⏸ 暂停' : '▶ 播放观测';
  },

  setSpeedUI(v) {
    this.els['speed-group'].querySelectorAll('.speed').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.v) === v);
    });
  },
};

window.UI = UI;
