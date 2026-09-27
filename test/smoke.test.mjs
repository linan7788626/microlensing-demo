import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const dir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

const src = fs.readFileSync(path.join(root, 'js/physics.js'), 'utf8');
const srcPuzzle = fs.readFileSync(path.join(root, 'js/puzzle.js'), 'utf8');
const fakeWindow = {};
new Function('window', src + '\n;\n' + srcPuzzle + '\n;')(fakeWindow);
const P = fakeWindow.MLPHYS;
const PUZZLE = fakeWindow.PUZZLE;

let pass = 0;
let fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ' — ' + extra : ''}`); }
}
function close(a, b, rel) {
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
}

console.log('== Paczyński 单透镜 ==');
ok(close(P.paczynskiA(1), 3 / Math.sqrt(5), 1e-12), 'A(1) = 3/√5', P.paczynskiA(1).toFixed(6));
ok(close(P.paczynskiA(0.1), 10.0374, 1e-4), 'A(0.1) ≈ 10.037', P.paczynskiA(0.1).toFixed(4));
ok(close(P.paczynskiA(2), P.paczynskiA(2), 0) && P.paczynskiA(2) > 1.06 && P.paczynskiA(2) < 1.071, 'A(2) ≈ 1.067（单调递减段）', P.paczynskiA(2).toFixed(4));

const r1 = P.singleLensImages({ re: 1, im: 0 });
ok(close(r1.images[0].z.re, (1 + Math.sqrt(5)) / 2, 1e-9), 'u=1 主像位于 (1+√5)/2', r1.images[0].z.re.toFixed(6));
ok(close(r1.images[1].z.re, (1 - Math.sqrt(5)) / 2, 1e-9), 'u=1 次像位于 (1−√5)/2', r1.images[1].z.re.toFixed(6));
ok(close(r1.A, 3 / Math.sqrt(5), 1e-9), '两像放大率之和 = A(1)');
const r2 = P.singleLensImages({ re: 0, im: 0.3 });
ok(close(r2.A, P.paczynskiA(0.3), 1e-9), '非实轴源位置一致（ζ=i·0.3）');
ok(Math.abs(r2.images[0].z.im) > 0 && Math.sign(r2.images[0].z.im) === 1, '主像与源同侧');

console.log('\n== 五次方程求解器 ==');
const c5 = [
  { re: -120, im: 0 }, { re: 274, im: 0 }, { re: -225, im: 0 },
  { re: 85, im: 0 }, { re: -15, im: 0 }, { re: 1, im: 0 },
];
const roots5 = P.solvePoly(c5).sort((a, b) => a.re - b.re);
let quinticOK = true;
[1, 2, 3, 4, 5].forEach((v, i) => {
  if (Math.abs(roots5[i].re - v) > 1e-6 || Math.abs(roots5[i].im) > 1e-6) quinticOK = false;
});
ok(quinticOK, '(z−1)(z−2)(z−3)(z−4)(z−5) 根全部恢复');

console.log('\n== 双透镜极限 ==');
{
  const zeta = { re: 1.2, im: 0.4 };
  const single = P.paczynskiA(P.cabs(zeta));
  const bin = P.binaryImages(zeta, 0.5, 0.5, -1e-6, 1e-6);
  ok(close(bin.A, single, 1e-5), 's→0 极限：等质量双星退化为单透镜', `${bin.A.toFixed(6)} vs ${single.toFixed(6)}`);
}
{
  const m2 = 1e-8, m1 = 1 - m2, s = 1.3;
  const z1 = -s * m2, z2 = s * m1;
  let worst = 0;
  for (const tau of [-2.0, -0.8, 0.2, 1.5]) {
    const zeta = { re: tau, im: 0.3 };
    const single = P.paczynskiA(P.cabs(zeta));
    const bin = P.binaryImages(zeta, m1, m2, z1, z2);
    worst = Math.max(worst, Math.abs(bin.A - single) / single);
  }
  ok(worst < 1e-4, 'q→0 极限：行星质量→0 回到 Paczyński', `worst rel err = ${worst.toExponential(2)}`);
}
{
  const p = { t0: 90, uMin: 0.3, tE: 30, fs: 1, q: 0, s: 1 };
  const a1 = P.evalLens(p, 90).A;
  p.q = 1e-9; p.s = 1.3;
  const a2 = P.evalLens(p, 90).A;
  ok(close(a1, a2, 1e-5), 'evalLens 调度一致：q=0 与 q=1e-9', `${a1.toFixed(4)} vs ${a2.toFixed(4)}`);
}

console.log('\n== 像数与残差过滤 ==');
{
  const m1 = 2 / 3, m2 = 1 / 3, s = 0.9;
  const z1 = -s * m2, z2 = s * m1;
  const inside = P.binaryImages({ re: 0.02, im: 0.02 }, m1, m2, z1, z2);
  ok(inside.images.length === 5, '源在共振焦散线内 → 5 个像', inside.images.length);
  const far = P.binaryImages({ re: 2.5, im: 2.5 }, m1, m2, z1, z2);
  ok(far.images.length === 3, '源远离透镜 → 3 个像', far.images.length);
  let maxResid = 0;
  for (const zeta of [{ re: 0.02, im: 0.02 }, { re: 2.5, im: 2.5 }, { re: -1.1, im: 0.3 }, { re: 0.6, im: -0.2 }]) {
    const r = P.binaryImages(zeta, m1, m2, z1, z2);
    for (const im of r.images) {
      const zb = P.cconj(im.z);
      const calc = P.csub(P.csub(im.z, P.cdiv({ re: m1, im: 0 }, P.csub(zb, { re: z1, im: 0 }))), P.cdiv({ re: m2, im: 0 }, P.csub(zb, { re: z2, im: 0 })));
      maxResid = Math.max(maxResid, P.cabs(P.csub(calc, zeta)));
    }
  }
  ok(maxResid < 1e-7, '所有保留的根满足原始透镜方程（假根已过滤）', maxResid.toExponential(2));
}

console.log('\n== 焦散线 ==');
{
  const p = { t0: 90, uMin: 0.3, tE: 30, fs: 1, q: 0.5, s: 0.9 };
  const { segs } = P.causticSegments(p, 200);
  ok(segs.length > 50, '焦散线提取出足够多的线段', segs.length);
  let finite = true;
  for (const s2 of segs) {
    if (!isFinite(s2.x1) || !isFinite(s2.y1) || !isFinite(s2.x2) || !isFinite(s2.y2)) finite = false;
  }
  ok(finite, '焦散线顶点全部有限');
  const single = P.causticSegments({ ...p, q: 0 }, 100);
  ok(single.segs.length === 0, '单透镜无焦散线');
}

console.log('\n== 光变曲线与观测模拟 ==');
{
  const p = { t0: 90, uMin: 0.3, tE: 30, fs: 1, q: 0, s: 1 };
  const meta = P.curveAnalytics(p);
  ok(close(meta.Amax, P.paczynskiA(0.3), 1e-3), 'A_max = A(u_min) = 3.445', meta.Amax.toFixed(4));
  ok(Math.abs(meta.tPeak - 90) < 0.6, '峰值时刻 ≈ t₀', meta.tPeak.toFixed(2));
  ok(meta.tFwhm > 10 && meta.tFwhm < 40, 't_FWHM 量级合理（~20 天）', meta.tFwhm.toFixed(2));

  const slots = P.obsSlots(42);
  const gapFrac = slots.filter((s) => s.gap).length / slots.length;
  ok(gapFrac > 0.1 && gapFrac < 0.3, '天气缺数率在合理区间', gapFrac.toFixed(3));
  const obs = P.buildObs(p, slots);
  ok(obs.every((d) => isFinite(d.Fo) && isFinite(d.sig) && d.Fo > 0), '观测点全部有限且为正');
  let maxSig = 0;
  for (const d of obs) maxSig = Math.max(maxSig, Math.abs(d.Fo - d.F) / d.sig);
  ok(maxSig < 4.5, '噪声偏差 < 4.5σ', maxSig.toFixed(2));

  const pb = { ...p, q: 0.01, s: 1.1 };
  const curveB = P.modelCurve(pb, 100);
  ok(curveB.every((c) => isFinite(c.A) && c.A >= 1 - 1e-9), '双透镜光变曲线有限且 A ≥ 1');
}

console.log('\n== 谜题模式 ==');
{
  let rangesOK = true;
  for (let seed = 1; seed <= 50; seed++) {
    const tr = PUZZLE.gen(seed * 7919);
    if (!(tr.t0 >= 50 && tr.t0 <= 130)) rangesOK = false;
    if (!(tr.uMin >= 0.02 && tr.uMin <= 0.8)) rangesOK = false;
    if (!(tr.tE >= 10 && tr.tE <= 60)) rangesOK = false;
    if (!(tr.fs >= 0.6 && tr.fs <= 1)) rangesOK = false;
    if (tr.q !== 0 && !(tr.q >= 1e-4 && tr.q <= 0.7)) rangesOK = false;
    if (tr.q > 0 && !(tr.s >= 0.6 && tr.s <= 2)) rangesOK = false;
    if (tr.q === 0 && tr.s !== 1) rangesOK = false;
  }
  ok(rangesOK, 'gen: 50 个随机谜题参数全部在设定范围内');

  const truth = PUZZLE.gen(12345);
  const slots = P.obsSlots(7);
  const data = P.buildObs(truth, slots);
  const selfFit = PUZZLE.chi2(truth, data);
  ok(selfFit.red < 4, '真值自拟合 χ²/dof ≈ 1（噪声水平）', selfFit.red.toFixed(2));
  const wrong = { ...truth, uMin: Math.min(1.5, truth.uMin + 0.4), q: truth.q === 0 ? 0.01 : truth.q * 20 };
  const badFit = PUZZLE.chi2(wrong, data);
  ok(badFit.red > selfFit.red * 5, '错误参数 χ² 显著更大', `${badFit.red.toFixed(1)} vs ${selfFit.red.toFixed(1)}`);

  const vSelf = PUZZLE.verdict(truth, truth);
  ok(vSelf.allPass, 'verdict: 真值 vs 真值 → 全部通过');
  const vWrong = PUZZLE.verdict(truth, wrong);
  ok(!vWrong.allPass, 'verdict: 错误参数 → 不通过');
  const single = { t0: 90, uMin: 0.3, tE: 30, fs: 1, q: 0, s: 1 };
  ok(PUZZLE.verdict(single, single).allPass, 'verdict: 单透镜谜题自检通过');
  ok(!PUZZLE.verdict(single, { ...single, q: 0.01 }).allPass, 'verdict: 单透镜 vs 带行星 → 判否');
  const bin = { t0: 90, uMin: 0.3, tE: 30, fs: 1, q: 0.01, s: 1.2 };
  ok(PUZZLE.verdict(bin, { ...bin, q: 0.02 }).allPass, 'verdict: q 在 2.5 倍容差内 → 通过');
  ok(!PUZZLE.verdict(bin, { ...bin, q: 0.05 }).allPass, 'verdict: q 超 2.5 倍容差 → 判否');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
