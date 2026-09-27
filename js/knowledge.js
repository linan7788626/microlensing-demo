'use strict';

const KNOWLEDGE_CARDS = [
  {
    id: 'ml-basics',
    icon: '🔍',
    title: '引力微透镜',
    body: '前景天体（透镜）经过背景恒星（源）前方时，引力使光线弯曲，源的像分裂并整体增亮。像间距仅约毫角秒、无法分辨，我们看到的只是亮度随时间的变化——光变曲线。事件一次性、不可重复，且与源的颜色无关。',
    ref: 'Paczyński 1996, ARA&A 34, 419',
  },
  {
    id: 'ml-ring',
    icon: '⭕',
    title: '爱因斯坦环与两个像',
    body: '当源几乎正对透镜（u→0）时，两个像趋于合并成半径 θ_E 的爱因斯坦环。θ_E ≈ 0.3 mas × √(M/0.3 M☉)，对应投影半径 R_E ~ 2–4 AU。透镜星本身通常太暗而不可见——我们只能从曲线反推它。',
    ref: 'Einstein 1936; Paczyński 1996',
  },
  {
    id: 'ml-paczynski',
    icon: '📈',
    title: 'Paczyński 曲线',
    body: '单透镜光变曲线仅由三个参数决定：t₀（峰值时刻）、u_min（最小角间距，峰高 A_max ≈ 1/u_min）、t_E（爱因斯坦时间，事件时标）。放大率 A(u) = (u²+2)/(u·√(u²+4))，曲线对称且无色差。',
    ref: 'Paczyński 1986, ApJ 304, 1',
  },
  {
    id: 'ml-blending',
    icon: '🌗',
    title: '混光 Blending',
    body: '望远镜分辨率不足时，源的光与邻近恒星混在一起：F = f_s·A + (1−f_s)，f_s 是源占基线总流量的比例。混光让峰"变矮"，与拉大 u_min 的效果简并——这是微透镜拟合中最主要的简并之一。',
    ref: 'Di Stefano & Esin 1995; Woźniak & Paczyński 1997',
  },
  {
    id: 'ml-caustic',
    icon: '✳️',
    title: '焦散线 Caustic',
    body: '透镜为双星/恒星+行星时，源平面出现焦散线——像的数目在 3↔5 之间变化的区域，点源放大率在焦散线上发散。源扫过焦散线时，光变曲线出现尖锐的双峰或扰动。此时透镜方程是五次复多项式。',
    ref: 'Erdl & Schneider 1993; Mao & Paczyński 1991',
  },
  {
    id: 'ml-planet',
    icon: '🪐',
    title: '用微透镜找行星',
    body: '行星在 Paczyński 曲线上叠加一个只持续数小时到数天的扰动，幅度与时标给出行星/恒星质量比 q 和投影分离度 s。微透镜对寒冷的、远离恒星的行星尤其灵敏，是探测自由漂浮行星的独特手段。',
    ref: 'Mao & Paczyński 1991; Gould & Loeb 1992',
  },
];

const KNOWLEDGE_MAP = {};
for (const c of KNOWLEDGE_CARDS) KNOWLEDGE_MAP[c.id] = c;

window.KNOWLEDGE_CARDS = KNOWLEDGE_CARDS;
window.KNOWLEDGE_MAP = KNOWLEDGE_MAP;
