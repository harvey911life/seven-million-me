// 第 10 章 健康同死亡：疾病、意外、情緒病、吸煙、死亡判定
import type { Game } from './game';
import type { Disease } from './state';
import { clamp, Mneg, Mpos, interp, fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, type Card, type EventDef } from './cards';
import { insActive } from './finance';

// 10.2.2 生命表（每 5 歲一行）：[年齡下限, 男, 女, 背景比例]
const LIFE: [number, number, number, number][] = [
  [0, 0.0016, 0.00136, 0.85], [1, 0.00012, 0.0001, 0.85], [5, 0.00006, 0.00005, 0.85], [10, 0.00007, 0.00006, 0.85],
  [15, 0.00018, 0.00009, 0.55], [20, 0.00028, 0.00013, 0.55], [25, 0.00032, 0.00016, 0.55], [30, 0.00042, 0.00023, 0.55],
  [35, 0.00062, 0.00034, 0.55], [40, 0.00098, 0.00054, 0.55], [45, 0.0016, 0.00088, 0.35], [50, 0.0026, 0.00135, 0.35],
  [55, 0.0042, 0.0021, 0.35], [60, 0.0064, 0.00307, 0.35], [65, 0.0098, 0.00461, 0.4], [70, 0.0158, 0.00758, 0.4],
  [75, 0.027, 0.01404, 0.5], [80, 0.047, 0.02726, 0.5], [85, 0.085, 0.0561, 0.65], [90, 0.15, 0.111, 0.65],
  [95, 0.245, 0.2009, 0.65], [100, 0.36, 0.3168, 0.65], [105, 0.48, 0.4416, 0.65],
];
function lifeRow(a: number) { let row = LIFE[0]; for (const r of LIFE) if (a >= r[0]) row = r; return row; }
export const qHK = (a: number, sex: 'M' | 'F') => (a >= 110 ? 1 : lifeRow(a)[sex === 'M' ? 1 : 2]);
const rBg = (a: number) => lifeRow(a)[3];

// 10.4.1 發病率（% / 年）：癌 中風 心 腎 三高 盲腸 骨折 膽石 白內障 關節 認知障礙
const INC: [number, number[]][] = [
  [0, [0.015, 0.002, 0, 0.001, 0.02, 0.1, 0.25, 0, 0, 0, 0]],
  [15, [0.02, 0.005, 0.002, 0.003, 0.15, 0.14, 0.25, 0.02, 0, 0, 0]],
  [25, [0.05, 0.01, 0.01, 0.006, 0.6, 0.1, 0.15, 0.08, 0.005, 0, 0]],
  [35, [0.12, 0.04, 0.05, 0.012, 1.4, 0.07, 0.15, 0.15, 0.02, 0.005, 0]],
  [45, [0.28, 0.12, 0.15, 0.025, 2.4, 0.05, 0.2, 0.25, 0.15, 0.03, 0.01]],
  [55, [0.55, 0.3, 0.3, 0.05, 3.0, 0.04, 0.3, 0.3, 0.6, 0.15, 0.08]],
  [65, [1.0, 0.65, 0.55, 0.08, 2.6, 0.03, 0.55, 0.35, 2.0, 0.35, 0.4]],
  [75, [1.5, 1.3, 0.9, 0.1, 1.8, 0.03, 1.2, 0.35, 4.0, 0.5, 1.8]],
  [85, [1.8, 2.0, 1.3, 0.1, 1.0, 0.03, 2.0, 0.3, 5.0, 0.4, 5.0]],
];
const DIS = ['cancer', 'stroke', 'heart', 'kidney', 'threeHigh', 'appendix', 'fracture', 'gallstone', 'cataract', 'joint', 'dementia'] as const;
type DisKey = (typeof DIS)[number];
function inc(a: number, k: DisKey) { let row = INC[0][1]; for (const r of INC) if (a >= r[0]) row = r[1]; return row[DIS.indexOf(k)] / 100; }

function sexMult(g: Game, k: DisKey) {
  const s = g.s; const a = s.age; const m = s.gender === 'M';
  switch (k) {
    case 'cancer': return m ? (a >= 20 && a < 50 ? 0.7 : a >= 50 ? 1.15 : 1) : (a >= 20 && a < 50 ? 1.3 : a >= 50 ? 0.85 : 1);
    case 'stroke': return m ? 1.3 : 0.8;
    case 'heart': return m ? 1.5 : a < 55 ? 0.4 : 0.7;
    case 'kidney': return m ? 1.3 : 0.8;
    case 'gallstone': return m ? 0.6 : 1.8;
    case 'fracture': return m ? (a < 65 ? 1.3 : 0.6) : (a < 65 ? 0.7 : 1.6);
    case 'cataract': return m ? 0.9 : 1.1;
    case 'dementia': return m ? 0.85 : 1.2;
    default: return 1;
  }
}
const has3H = (g: Game) => g.s.diseases.some((d) => d.kind === 'threeHigh');
function risk(g: Game, k: DisKey) {
  const s = g.s;
  let r = 1;
  const fit = s.focus === '強身健體' || s.focus === '養生保健';
  const ot = s.overtime || s.focus === '事業衝刺';
  const tbl: Partial<Record<DisKey, [number, number, number, number]>> = { // 吸煙 三高 健身 超時
    cancer: [1.8, 1, 0.9, 1], stroke: [1.6, 1.8, 0.85, 1.15], heart: [2, 2, 0.85, 1.15], kidney: [1.3, 3, 1, 1],
    threeHigh: [1.2, 1, 0.8, 1.15], cataract: [1.3, 1.2, 1, 1], dementia: [1.3, 1.3, 0.9, 1],
  };
  const t = tbl[k];
  if (t) {
    if (s.smoker) r *= t[0];
    if (has3H(g)) r *= t[1] * (s.flags['3hIgnored'] ? 1.5 : s.flags['3hPrivate'] ? 0.9 : 1);
    if (fit) r *= t[2];
    if (ot) r *= t[3];
  }
  if (k === 'threeHigh' && s.K > 70) r *= 0.9;
  if (k === 'dementia' && s.K > 70) r *= 0.8;
  return r;
}
export function onsetP(g: Game, k: DisKey) {
  const s = g.s;
  return inc(s.age, k) * sexMult(g, k) * clamp(Mneg(s.H) * risk(g, k), 0.25, 3);
}

// ---------- 保險賠償 ----------
/** 醫療保險賠私家帳單；返回賠償 */
export function medClaim(g: Game, bill: number, drug = false): number {
  const s = g.s;
  if (!insActive(s, 'med') || bill <= 0) return 0;
  const lv = s.ins.med.level;
  if (drug && lv < 2) return 0;
  const pay = Math.min(bill * (lv === 2 ? 0.95 : 0.7), (lv === 2 ? 3_000_000 : 400_000) * g.P);
  recordClaim(g, pay);
  return pay;
}
export function ciClaim(g: Game): number {
  const s = g.s;
  if (!insActive(s, 'ci')) return 0;
  const last = Number(s.flags['ciPaidYear'] ?? -99);
  if (s.ins.ci.level === 1 && last > 0) return 0;
  if (s.year - last < 3) return 0;
  const pay = s.ins.ci.a0 * (s.ins.ci.level === 2 ? 4 : 1.5);
  s.flags['ciPaidYear'] = s.year;
  recordClaim(g, pay);
  return pay;
}
export function accClaim(g: Game, bill: number, lostIncome: number, disabled = false): number {
  const s = g.s;
  if (!insActive(s, 'acc')) return 0;
  const lv = s.ins.acc.level;
  let pay = Math.min(bill * (lv === 2 ? 1 : 0.8), (lv === 2 ? 300_000 : 100_000) * g.P) + lostIncome * (lv === 2 ? 0.8 : 0.5);
  if (disabled) pay += s.ins.acc.a0 * (lv === 2 ? 5 : 2);
  recordClaim(g, pay);
  return pay;
}
function recordClaim(g: Game, pay: number) {
  if (pay <= 0) return;
  g.s.claims++;
  g.s.claimTotal += pay;
}
/** 事件損失 vs 賠償 → 保費冇白交 */
function checkPaidOff(g: Game, loss: number, paid: number) {
  if (paid > 0) g.tick(`保險賠咗 ${fmtMoney(paid)}。`);
  if (paid > 0 && paid >= loss * 0.5 && g.s.F >= 30) g.ach('premium_paid_off');
}
const monthlyPay = (g: Game) => (g.s.status === 'work' && g.s.job ? g.s.job.salary : 0);

function addDisease(g: Game, d: Disease) {
  g.s.diseases.push(d);
  if (['cancer', 'stroke', 'heart', 'kidney'].includes(d.kind)) g.flag('hadCI');
}

// ---------- 重病卡 ----------
function cancerCard(g: Game): Card {
  const s = g.s;
  const r = streamRng(s.seed, 'cancer', s.age);
  const early = s.checkupUntil >= s.age;
  const x = r();
  const stage = early ? (x < 0.55 ? 0 : x < 0.85 ? 1 : 2) : x < 0.35 ? 0 : x < 0.7 ? 1 : 2;
  const SN = ['早期', '中期', '晚期'];
  const pub = [35000, 55000, 55000][stage] * g.P;
  const priv = [450000, 900000, 1150000][stage] * g.P * (early ? 0.8 : 1);
  const lump = insActive(s, 'ci') ? s.ins.ci.a0 * (s.ins.ci.level === 2 ? 4 : 1.5) : 0;
  const medCov = insActive(s, 'med') ? Math.min(priv * (s.ins.med.level === 2 ? 0.95 : 0.7), (s.ins.med.level === 2 ? 3e6 : 4e5) * g.P) : 0;
  const self = priv - medCov;
  const liq = g.liquid;
  const c = mkCard('C-AN-01', '確診重病', `醫生話你患上${SN[stage]}癌症。${lump > 0 ? `危疾保障會賠你 ${fmtMoney(lump)}。` : ''}點樣治療？`, [
    { label: '公立醫院輪候', note: `約 ${fmtMoney(pub)}`, fx: { J: -20 } },
    { label: '私家治療', note: `自付約 ${fmtMoney(self)}${self > liq + lump ? `（你要借 ${fmtMoney(self - liq - lump)}）` : ''}`, fx: { J: -15 } },
    { label: '唔治療', money: -Math.round(10000 * g.P), note: '止痛同檢查', fx: { J: -25 } },
  ], (g2, i) => {
    const t = g2.s;
    const ci = ciClaim(g2);
    if (ci > 0) { t.cash += ci; }
    const S = [[0.85, 0.52, 0.15], [0.9, 0.6, 0.2], [0.3, 0.08, 0.02]][i][stage] + (early && i < 2 ? 0.05 : 0) + (Math.sqrt(Mpos(t.H)) - 1) * 0.1;
    const d: Disease = { kind: 'cancer', stage, years: 0, d: 1 - Math.pow(clamp(S, 0.01, 0.99), 0.2), status: 'treating', treat: (['public', 'private', 'none'] as const)[i] };
    addDisease(g2, d);
    const hHit = [25, 35, 45][stage] * (early ? 0.7 : 1);
    g2.add('H', -hHit, '患癌');
    g2.add('J', [-20, -15, -25][i], '患癌');
    if (t.R >= 70 && i < 2) g2.add('R', 3);
    let paid = ci;
    let note = '';
    if (i === 0) note = g2.spend(pub, '治療');
    if (i === 1) { const m = medClaim(g2, priv); paid += m; note = g2.spend(priv - m, '治療'); }
    if (i === 2) note = g2.spend(Math.round(10000 * g2.P), '止痛');
    const off = i === 2 ? (stage === 2 ? 12 : 0) : [[6, 12, 21], [4, 10, 18]][i][stage];
    g2.flag('offMonths', Math.min(12, off));
    checkPaidOff(g2, (i === 1 ? priv : pub) + monthlyPay(g2) * off, paid);
    if (stage >= 1 && i < 2) g2.pushCard(drugCard(g2, d), true);
    g2.flag('cancerYear', t.year);
    g2.flag('cancerLiq', g2.liquid);
    return ['排期要等幾個月，你每日都喺度擔心。', '你可以專心養病。', '你唔想拖累屋企人。'][i] + note;
  }, { pri: 900, def: 0, cat: '健康', scene: 'hospital' });
  c.def = insActive(s, 'med') || liq >= self * 1.5 ? 1 : 0;
  c.auto = c.def;
  c.agui = lump > 0 || insActive(s, 'med') ? 1 : 0;
  return c;
}

function drugCard(g: Game, d: Disease): Card {
  const s = g.s;
  const yearCost = 450000 * g.P;
  const cov = insActive(s, 'med') && s.ins.med.level === 2 ? 0.95 : 0;
  const self = yearCost * 2 * (1 - cov);
  const need = Number(s.flags['lastNeed'] ?? 1e5) / 12;
  const c = mkCard('C-AN-02', '醫生建議自費藥', `標靶藥可以提高存活機會，每年約 ${fmtMoney(yearCost)}，用兩年。${cov ? '你嘅醫療保障包自費藥。' : ''}`, [
    { label: '用', note: `自付約 ${fmtMoney(self)}` },
    { label: '唔用' },
    { label: '用一半療程', note: `自付約 ${fmtMoney(self / 4)}` },
  ], (g2, i) => {
    if (i === 1) return '醫生話標準治療都有效，只係機會低啲。';
    const bill = i === 0 ? yearCost * 2 : yearCost / 2;
    const m = medClaim(g2, bill, true);
    const note = g2.spend(bill - m, '自費藥');
    const S = Math.pow(1 - d.d, 5) + (i === 0 ? 0.1 : 0.04);
    d.d = 1 - Math.pow(clamp(S, 0.01, 0.99), 0.2);
    return (i === 0 ? '標靶藥一個月兩萬五，好彩有積蓄頂住。' : '用完一半，戶口已經見底。') + note;
  }, { pri: 899, cat: '健康', scene: 'hospital' });
  const liq = g.liquid;
  c.def = liq - self >= need * 3 ? 0 : liq - self / 4 >= need * 3 ? 2 : 1;
  c.auto = c.def;
  c.agui = c.def;
  return c;
}

function strokeHeartCard(g: Game, kind: 'stroke' | 'heart' | 'kidney'): Card {
  const s = g.s;
  const T = { stroke: ['中風', '你突然半邊身冇晒力，送咗入醫院。'], heart: ['心臟病發', '你心口劇痛，救護車送你入醫院。'], kidney: ['腎衰竭', '醫生話你嘅腎功能已經到末期，要洗腎。'] }[kind];
  const pub = { stroke: 20000, heart: 15000, kidney: 10000 }[kind] * g.P;
  const priv = { stroke: 275000, heart: 200000, kidney: 325000 }[kind] * g.P;
  const lump = insActive(s, 'ci') ? s.ins.ci.a0 * (s.ins.ci.level === 2 ? 4 : 1.5) : 0;
  const opt = { stroke: ['公立復康', '私家復康', '唔做復康'], heart: ['公立治療', '私家通波仔', '只食藥'], kidney: ['公立洗腎', '私家洗腎', '唔治療'] }[kind];
  const c = mkCard('C-AN-01' + kind, T[0], `${T[1]}${lump > 0 ? `危疾保障會賠你 ${fmtMoney(lump)}。` : ''}`, [
    { label: opt[0], note: `約 ${fmtMoney(pub)}` }, { label: opt[1], note: `約 ${fmtMoney(priv)}${kind === 'kidney' ? ' / 年' : ''}` }, { label: opt[2] },
  ], (g2, i) => {
    const t = g2.s;
    const ci = ciClaim(g2);
    if (ci) t.cash += ci;
    let paid = ci;
    let note = '';
    if (i === 0) note = g2.spend(pub);
    if (i === 1) { const m = medClaim(g2, priv); paid += m; note = g2.spend(priv - m); }
    const treat = (['public', 'private', 'none'] as const)[i];
    if (kind === 'stroke') {
      const r = g2.er();
      const full = [0.4, 0.5, 0.2][i];
      const care = [0.25, 0.15, 0.4][i];
      g2.add('H', -30, '中風'); g2.add('J', -20, '中風');
      if (r < care) { t.disabled = true; addDisease(g2, { kind, stage: 2, years: 0, d: 0.06, status: 'chronic', treat }); g2.flag('offMonths', 12); g2.flag('needCareSelf'); }
      else if (r < 1 - full) { addDisease(g2, { kind, stage: 1, years: 0, d: 0.02, status: 'chronic', treat }); g2.flag('offMonths', 4); }
      else addDisease(g2, { kind, stage: 0, years: 0, d: 0, status: 'remission', treat });
    } else if (kind === 'heart') {
      g2.add('H', -25, '心臟病'); g2.add('J', -15, '心臟病');
      addDisease(g2, { kind, stage: 0, years: 0, d: [0.03, 0.025, 0.08][i], status: 'chronic', treat });
      g2.flag('offMonths', i === 1 ? 2 : 3);
    } else {
      addDisease(g2, { kind, stage: 0, years: 0, d: [0.09, 0.07, 0.6][i], status: 'chronic', treat });
      g2.add('J', -5, '洗腎');
      g2.flag('kidneyCost', i === 0 ? 10000 : i === 1 ? 325000 : 0);
    }
    checkPaidOff(g2, (i === 1 ? priv : pub) + monthlyPay(g2) * 3, paid);
    return note;
  }, { pri: 900, def: 0, cat: '健康', scene: 'hospital' });
  c.def = insActive(s, 'med') || g.liquid > priv * 1.5 ? 1 : 0;
  c.auto = c.def;
  c.agui = lump > 0 || insActive(s, 'med') ? 1 : 0;
  return c;
}

function minorCard(g: Game, k: 'appendix' | 'fracture' | 'gallstone' | 'cataract' | 'joint'): Card {
  const s = g.s;
  const T = {
    appendix: ['急性盲腸炎', '你肚痛到彎晒腰，醫生話係盲腸炎。', 1300, 90000, ['公立急症', '私家醫院', '拖住唔睇']],
    fracture: ['骨折要做手術', '你跌親，骨折要做手術。', 4000, 140000, ['公立醫院', '私家醫院', '保守治療']],
    gallstone: ['膽石要做手術', '醫生話你有膽石，要切膽。', 3500, 100000, ['公立輪候', '私家手術', '唔治療']],
    cataract: ['白內障要做手術', '你開始睇嘢矇矇哋，醫生話係白內障。', 2000, 80000, ['公立輪候', '私家手術', '唔治療']],
    joint: ['關節要更換', '膝頭痛到行唔到路，醫生建議換人工關節。', 8000, 200000, ['公立輪候', '私家手術', '食止痛藥頂住']],
  }[k] as [string, string, number, number, string[]];
  const pub = T[2] * g.P;
  const priv = T[3] * g.P;
  const cov = insActive(s, 'med') ? Math.min(priv * (s.ins.med.level === 2 ? 0.95 : 0.7), 4e5 * g.P) : 0;
  const wait = k === 'gallstone' || k === 'cataract' || k === 'joint';
  const c = mkCard('M-' + k, T[0], T[1], [
    { label: T[4][0], note: `${fmtMoney(pub)}${wait ? '，要等一至幾年' : ''}` },
    { label: T[4][1], note: `自付 ${fmtMoney(priv - cov)}` },
    { label: T[4][2] },
  ], (g2, i) => {
    let note = '';
    const accCause = k === 'fracture' && g2.er() < 0.5;
    if (i === 0) { note = g2.spend(pub); g2.add('H', wait ? -4 : -8); if (wait) { g2.add('J', -3, '等手術'); } }
    if (i === 1) {
      const m = accCause ? accClaim(g2, priv, 0) : medClaim(g2, priv);
      note = g2.spend(priv - m);
      g2.add('H', -5);
      checkPaidOff(g2, priv, m);
    }
    if (i === 2) { g2.add('H', -15, T[0]); g2.add('J', -5); if (k === 'appendix' && g2.er() < 0.4 * 0.03) g2.flag('fatalMinor'); }
    return note;
  }, { pri: 450, def: 0, cat: '健康', scene: 'hospital' });
  c.def = insActive(s, 'med') ? 1 : 0;
  c.auto = c.def;
  c.agui = c.def;
  return c;
}

function threeHighCard(g: Game): Card {
  return mkCard('C-3H', '三高確診', '身體檢查報告話你血壓、血糖同膽固醇都偏高。點樣處理？', [
    { label: '公立覆診', note: `每年約 ${fmtMoney(g.p(3000))}` },
    { label: '私家覆診', note: `每年約 ${fmtMoney(g.p(22000))}，控制好啲` },
    { label: '唔理', note: '健康每年 −2' },
  ], (g2, i) => {
    addDisease(g2, { kind: 'threeHigh', stage: 0, years: 0, d: 0, status: 'chronic', treat: (['public', 'private', 'none'] as const)[i] });
    g2.add('J', -3);
    if (i === 0) { g2.flag('recur_3h', 3000); g2.flag('3hControlled'); }
    if (i === 1) { g2.flag('recur_3h', 22000); g2.flag('3hControlled'); g2.flag('3hPrivate'); }
    if (i === 2) g2.flag('3hIgnored');
    return ['你每三個月去普通科門診覆診。', '私家醫生幫你調好啲藥。', '你話服自己：「冇咩事嘅。」'][i];
  }, { pri: 450, def: 0, auto: 0, agui: 0, cat: '健康', scene: 'hospital' });
}

function dementiaCard(g: Game): Card {
  return mkCard('C-DEM', '認知障礙', '屋企人發覺你成日唔記得嘢，醫生確診你有初期認知障礙。', [
    { label: '公立記憶診所', note: `每年約 ${fmtMoney(g.p(3000))}` },
    { label: '私家評估 + 日間中心', note: `每年約 ${fmtMoney(g.p(130000))}` },
    { label: '唔理' },
  ], (g2, i) => {
    addDisease(g2, { kind: 'dementia', stage: 0, years: 0, d: 0, status: 'chronic', treat: (['public', 'private', 'none'] as const)[i] });
    g2.flag('recur_dem', [3000, 130000, 0][i]);
    g2.add('J', -5, '認知障礙');
    g2.flag('incapStart', g2.s.age);
    return g2.s.epa ? '你一早簽咗持久授權書，屋企人可以幫你處理財務。' : '你冇簽持久授權書，之後屋企人處理你啲錢會好麻煩。';
  }, { pri: 890, def: 0, auto: 0, agui: 0, cat: '健康', scene: 'hospital' });
}

export function mentalCard(g: Game): Card {
  const s = g.s;
  const anx = s.F < 30;
  const priv = (anx ? 45000 : 75000) * g.P;
  return mkCard('C-AN-03', '你最近好難提起勁', '你成日瞓唔著，對以前鍾意嘅嘢都冇晒興趣。醫生話你有情緒病。', [
    { label: '公立精神科', note: `每年約 ${fmtMoney(g.p(2000))}，新症要等` },
    { label: '私家輔導', note: `每年約 ${fmtMoney(priv)}` },
    { label: '唔理' },
  ], (g2, i) => {
    g2.s.mental = { years: 0, treat: (['public', 'private', 'none'] as const)[i] };
    g2.flag('recur_mental', [2000, priv / g2.P, 0][i]);
    g2.flag('hadMental');
    return ['新症要等，期間你同社工傾咗幾次。', '每星期同輔導員傾一個鐘，你開始瞓得著。', '你話服自己：「過吓就好。」'][i];
  }, { pri: 880, def: 0, auto: priv <= (s.cash + s.deposit) * 0.5 ? 1 : 0, agui: 1, cat: '健康', hotline: true, scene: 'home' });
}

function accidentCard(g: Game): Card {
  const s = g.s;
  const pub = 10000 * g.P;
  const priv = 350000 * g.P;
  return mkCard('E-ACC', '交通意外', '你過馬路時被車撞到，傷勢唔輕。', [
    { label: '公立醫院', note: fmtMoney(pub) },
    { label: '私家醫院', note: `約 ${fmtMoney(priv)}` },
  ], (g2, i) => {
    const t = g2.s;
    const bill = i === 0 ? pub : priv;
    const off = g2.er() < 0.5 ? 3 : 8;
    const dis = g2.er() < 0.05;
    const lost = monthlyPay(g2) * off;
    const m = accClaim(g2, bill, lost, dis) + (i === 1 ? 0 : 0);
    const note = g2.spend(bill);
    t.cash += m;
    g2.add('H', -25, '交通意外'); g2.add('J', -15, '交通意外');
    g2.flag('offMonths', off);
    if (dis) { t.disabled = true; g2.add('J', -20, '永久傷殘'); g2.tick('醫生話你嘅傷會留低永久後遺。'); g2.flag('childAdv', 0); }
    checkPaidOff(g2, bill + lost, m);
    return note;
  }, { pri: 900, def: insActive(s, 'acc') ? 1 : 0, auto: insActive(s, 'acc') || insActive(s, 'med') ? 1 : 0, agui: 0, cat: '健康', scene: 'hospital' });
}

// ---------- 每年健康進程（抽事件之前） ----------
export function healthYear(g: Game) {
  const s = g.s;
  const r = streamRng(s.seed, 'health', s.age);
  for (const d of s.diseases) {
    d.years++;
    if (d.kind === 'cancer' && d.status === 'treating' && d.years >= 5) {
      d.status = 'remission'; d.d = 0;
      g.tick('醫生話你嘅癌症已經康復！');
      if (s.F >= 60) g.ach('cancer_survivor');
      g.flag('ciOver5');
    }
    if (d.kind === 'cancer' && d.status === 'remission' && d.years <= 10 && r() < 0.015) { d.status = 'treating'; d.years = 0; d.d = 0.12; g.tick('癌症復發，你又要再接受治療。'); g.add('J', -10, '癌症復發'); }
    if (d.kind === 'dementia' && r() < 0.25 * (d.treat !== 'none' ? 0.8 : 1) && d.stage < 2) { d.stage++; g.tick(d.stage === 1 ? '你嘅認知障礙去到中度。' : '你嘅認知障礙已經好嚴重，要人全天照顧。'); }
    if (d.kind === 'threeHigh' && (s.focus === '強身健體' || s.focus === '養生保健') && r() < 0.1) { d.status = 'remission'; g.tick('你堅持運動，三高指數返晒正常！'); }
  }
  s.diseases = s.diseases.filter((d) => !(d.kind === 'threeHigh' && d.status === 'remission'));
  if (s.flags['kidneyCost']) g.spend(Number(s.flags['kidneyCost']) * g.P);
  // 情緒病康復
  if (s.mental) {
    s.mental.years++;
    let p = s.mental.treat === 'public' ? (s.mental.years <= 1 ? 0.15 : 0.35) : s.mental.treat === 'private' ? 0.45 : 0.12;
    if (s.focus === '強身健體') p += 0.1;
    if (s.R > 50) p += 0.05;
    if (s.focus === '家庭優先') p += 0.05;
    if (r() < p) { s.mental = null; delete s.flags['recur_mental']; g.tick('你嘅情緒慢慢好返，又開始期待明天。'); g.flag('mentalRecovered', s.year); }
  }
  if (s.smoker) g.add('H', -1);
  if (s.flags['drinker']) g.add('H', -0.5);
  if (s.diseases.some((d) => d.kind === 'kidney' && d.status !== 'remission') && s.H > 60) s.H = 60;
  if (s.diseases.some((d) => d.kind === 'stroke' && d.stage === 1) && s.H > 85) s.H = 85;
  if (s.flags['needCareSelf'] && s.H > 50) s.H = 50;
  if (s.flags['3hIgnored']) g.add('H', -2, '三高冇控制');
}

// ---------- 死亡判定 ----------
export function deathCheck(g: Game): boolean {
  const s = g.s;
  const r = streamRng(s.seed, 'death', s.age);
  const a = s.age;
  if (a >= 110) return die(g, '壽終正寢');
  let Fl = (s.smoker ? 1.5 : 1) * (s.flags['drinker'] ? 1.15 : 1) * (s.focus === '養生保健' ? 0.9 : s.focus === '強身健體' ? 0.95 : 1);
  const dem = s.diseases.find((d) => d.kind === 'dementia');
  if (dem) Fl *= [1.2, 1.5, 3][dem.stage];
  if (s.flags['longevityTech']) Fl *= 0.9;
  const qbg = Math.min(0.95, qHK(a, s.gender) * rBg(a) * Mneg(s.H) * Fl);
  const comps: [string, number][] = [[a >= 85 ? '壽終正寢' : '急病離世', qbg]];
  for (const d of s.diseases) {
    let dd = d.d;
    if (d.years === 0 && d.kind === 'stroke') dd = Math.max(dd, 0.15);
    if (d.years === 0 && d.kind === 'heart') dd = Math.max(dd, 0.1);
    if (d.kind === 'heart' && s.focus === '強身健體') dd *= 0.8;
    if (dd > 0) comps.push([{ cancer: '病逝（癌症）', stroke: '病逝（中風）', heart: '心臟病離世', kidney: '病逝（腎衰竭）', threeHigh: '病逝', dementia: '病逝' }[d.kind], dd]);
  }
  // v1.1：幼年因病離世（白血病、先天心臟病、嚴重感染等），連原有病逝合共約 1%
  if (a <= 12) comps.push(['病逝（兒童重病）', a <= 4 ? 0.001 : 0.0004]);
  if (s.flags['accFatal'] === s.year) comps.push(['意外離世', 1]);
  if (s.flags['fatalMinor']) { comps.push(['急病離世', 0.5]); delete s.flags['fatalMinor']; }
  // v1.6：專科排公立 / 去深圳，可能延誤治療（細字有寫）
  if (Number(s.flags['specRiskTo'] ?? 0) >= s.year) comps.push(['病逝', Number(s.flags['specRiskQ'] ?? 0)]);
  if (s.H <= 0) comps.push(['急病離世', 0.4]); else if (s.H <= 5) comps.push(['急病離世', 0.1]);
  const surv = comps.reduce((p, [, q]) => p * (1 - q), 1);
  const q = 1 - surv;
  if (q >= 0.15 && !s.flags['warned']) { g.tick('醫生話要有心理準備。'); g.flag('warned'); }
  if (r() >= q) return false;
  // 揀死因
  const tot = comps.reduce((x, [, v]) => x + v, 0);
  let y = r() * tot;
  for (const [c, v] of comps) { y -= v; if (y < 0) return die(g, c); }
  return die(g, comps[0][0]);
}

export function die(g: Game, cause: string): boolean {
  const s = g.s;
  s.alive = false;
  s.deathCause = cause;
  s.deathKind = s.age < 18 ? 'minor' : 'normal';
  if (s.age < 40) g.ach('died_young');
  return true;
}

// ---------- 事件 ----------
const ill = (k: DisKey) => (g: Game) => (g.s.diseases.some((d) => d.kind === k && d.status !== 'remission') ? 0 : onsetP(g, k));

export const HEALTH_EVENTS: EventDef[] = [
  { id: 'D-cancer', pri: 900, once: false, cool: 5, cat: '健康', when: ill('cancer'), make: cancerCard },
  { id: 'D-stroke', pri: 900, once: false, cool: 3, cat: '健康', when: ill('stroke'), make: (g) => strokeHeartCard(g, 'stroke') },
  { id: 'D-heart', pri: 900, once: false, cool: 3, cat: '健康', when: ill('heart'), make: (g) => strokeHeartCard(g, 'heart') },
  { id: 'D-kidney', pri: 900, cat: '健康', when: ill('kidney'), make: (g) => strokeHeartCard(g, 'kidney') },
  {
    id: 'D-3h', pri: 450, cat: '健康',
    when: (g) => {
      if (has3H(g)) return 0;
      const p = onsetP(g, 'threeHigh');
      return p;
    },
    make: (g) => {
      // 有身體檢查即時發現；冇就潛伏，每年 30% 自己發現（之前每年健康 −1）
      if (g.s.checkupUntil >= g.s.age || g.er() < 0.3) return threeHighCard(g);
      g.flag('hidden3H');
      return null;
    },
  },
  { id: 'D-3hfound', pri: 450, cat: '健康', when: (g) => (g.s.flags['hidden3H'] && !has3H(g) ? (g.s.checkupUntil >= g.s.age ? 1 : 0.3) : 0), make: (g) => { delete g.s.flags['hidden3H']; return threeHighCard(g); } },
  { id: 'D-dem', pri: 890, cat: '健康', ages: [45, 120], when: (g) => (g.s.diseases.some((d) => d.kind === 'dementia') ? 0 : onsetP(g, 'dementia')), make: dementiaCard },
  ...(['appendix', 'fracture', 'gallstone', 'cataract', 'joint'] as const).map((k): EventDef => ({ id: 'M-' + k, pri: 450, once: false, cool: 8, cat: '健康', when: (g) => onsetP(g, k), make: (g) => minorCard(g, k) })),
  {
    id: 'E-ACC', pri: 900, once: false, cool: 5, cat: '健康',
    when: (g) => {
      const s = g.s;
      const jid = s.job?.id ?? '';
      const m = (['J37', 'J38', 'J39'].includes(jid) ? 3 : jid === 'J41' && s.year >= 2015 ? 4 : 1) * (s.age >= 15 && s.age <= 24 ? 1.5 : 1) * (s.age >= 75 ? 2 : 1);
      return 0.0003 * m;
    },
    make: accidentCard,
  },
  {
    id: 'E-ACCL', pri: 100, once: false, cool: 2, cat: '健康',
    when: (g) => (g.s.age >= 65 ? (g.s.age >= 75 ? 0.035 : 0.015) : 0.004 * (g.s.focus === '強身健體' ? 2 : 1)),
    tick: (g) => { const s = g.s; const c = g.p(s.age >= 65 ? 3000 : 2500); g.spend(c); g.add('H', s.age >= 65 ? -5 : -3, '受傷'); return s.age >= 65 ? `你喺屋企跌親，休養咗幾個星期（${fmtMoney(c)}）。` : `你行山扭傷腳，休息咗一個星期（${fmtMoney(c)}）。`; },
  },
  {
    id: 'E-ACCF', pri: 100, once: false,
    when: (g) => 0.000015 * (['J35', 'J36'].includes(g.s.job?.id ?? '') ? 3 : 1) * (g.s.age >= 75 ? 2 : 1),
    tick: (g) => { g.flag('accFatal', g.s.year); return ''; },
  },
  {
    id: 'C-AN-03', pri: 880, once: false, cool: 3, ages: [13, 120], cat: '健康',
    when: (g) => {
      const s = g.s;
      if (s.mental) return 0;
      const lows = [s.H, s.J, s.R].filter((v) => v < 30);
      if (!lows.length) return 0;
      let p = 1 - lows.reduce((acc, v) => acc * (1 - (0.04 + 0.12 * (30 - v) / 30)), 1);
      if (s.F < 30 && s.age >= 18) p *= 1.3;
      if (s.status === 'unemp') p *= 1.3;
      if (s.flags['tragedyYear'] === s.year || s.flags['divorceYear'] === s.year) p *= 1.5;
      if (s.focus === '強身健體' || s.focus === '培養嗜好') p *= 0.7;
      if (s.focus === '家庭優先') p *= 0.85;
      if (Number(s.flags['mentalRecovered'] ?? -99) >= s.year - 3) p *= 0.5;
      return Math.min(0.4, p);
    },
    make: mentalCard,
  },
  {
    id: 'E-SMOKE', pri: 200, ages: [15, 25], cat: '生活日常',
    when: (g) => 0.03 * Math.sqrt(Mpos(g.s.R)) * (g.s.origin.father && g.s.birthYear < 1990 ? 1.5 : 1),
    make: () => mkCard('E-SMOKE', '朋友遞煙', '朋友遞咗支煙俾你：「試吓啦，冇事嘅。」', [{ label: '試一口' }, { label: '唔要' }], (g2, i) => {
      if (i === 1) { g2.flag('noSmoke', g2.s.age); return '你搖搖頭，朋友都冇再迫你。'; }
      if (g2.er() < 0.6) { g2.s.smoker = true; g2.flag('recur_smoke', 28000); return '一支變一包，你開始食煙。'; }
      return '你咳到眼淚都出埋，之後冇再試。';
    }, { def: 1, auto: 1, agui: 1 }),
  },
  {
    id: 'E-QUIT', pri: 200, once: false, cool: 2, cat: '生活日常',
    when: (g) => (g.s.smoker ? (g.s.flags['hadCI'] ? 0.6 : 0.08) : 0),
    make: () => mkCard('E-QUIT', '戒煙機會', '醫生同屋企人都叫你戒煙。', [{ label: '即刻戒' }, { label: '慢慢減' }, { label: '唔戒' }], (g2, i) => {
      const ok = g2.er() < [0.5, 0.3, 0][i];
      if (ok) { g2.s.smoker = false; delete g2.s.flags['recur_smoke']; g2.add('J', 2); if (g2.s.age < 40) g2.flag('quitYoung', g2.s.age); return '你成功戒咗煙！'; }
      return i === 2 ? '你照食。' : '戒咗幾個月，又食返。';
    }, { def: 0, auto: 0, agui: 0 }),
  },
  {
    id: 'E-DRINK', pri: 100, ages: [25, 55], cat: '生活日常',
    when: (g) => (g.s.flags['drinker'] ? 0 : ['J14', 'J18', 'J19', 'J29'].includes(g.s.job?.id ?? '') || g.s.focus === '事業衝刺' ? 0.04 : 0),
    tick: (g) => { g.flag('drinker'); g.flag('recur_drink', 15000); return '應酬多咗，你開始經常飲酒。'; },
  },
  {
    id: 'E-DRINKQ', pri: 100, once: false, cat: '生活日常',
    when: (g) => (g.s.flags['drinker'] && (has3H(g) || g.s.focus === '養生保健') ? 0.3 : 0),
    tick: (g) => { delete g.s.flags['drinker']; delete g.s.flags['recur_drink']; return '你戒咗酒。'; },
  },
];

export const lifeExpectHint = (h: number) => Math.round(interp([[0, 79], [25, 82.5], [50, 85.5], [75, 89], [100, 92]], h));
