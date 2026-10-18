// 第 8 章財務系統 + 第 4 章 4.8 財務健康
import type { Game } from './game';
import type { InsKind, State } from './state';
import { clamp, interp, fmtMoney } from './util';
import { streamRng } from './rng';

// ---------- 保險 ----------
const AGE_MULT: [number, number][] = [[0, 1.14], [10, 0.76], [20, 0.8], [30, 1.0], [40, 1.25], [50, 1.85], [60, 2.96], [70, 4.77], [80, 7.99], [90, 8.83]];
export const ageMult = (a: number) => interp(AGE_MULT, a);
const SHARE: Record<InsKind, number> = { med: 0.3, ci: 0.4, acc: 0.1, life: 0.2 };
export function pct(level: number, age0: number) {
  const t = clamp((age0 - 18) / 32, 0, 1);
  return level === 1 ? 0.08 + 0.03 * t : level === 2 ? 0.12 + 0.06 * t : 0;
}
export function insActive(s: State, k: InsKind): boolean {
  const i = s.ins[k];
  if (!i.level) return false;
  if (k === 'life' && s.age > 70) return false;
  if (k === 'acc' && s.age > 75) return false;
  return true;
}
export function premiumOf(g: Game, k: InsKind, age = g.s.age, P = g.P): number {
  const s = g.s;
  const i = s.ins[k];
  if (!insActive(s, k)) return 0;
  // 投保月入上限 $40,000（2026 價），年齡倍數最多 ×4（避免高收入者老年保費失控）
  const s0 = Math.min(i.s0, 40000 * i.p0);
  let m = s0 * pct(i.level, i.age0) * SHARE[k] * Math.min(4, ageMult(age) / ageMult(i.age0)) * (P / i.p0) * 12;
  if (s.smoker) m *= 1.17;
  if (s.diseases.some((d) => d.kind === 'threeHigh') && (k === 'med' || k === 'life')) m *= 1.25;
  if (s.H < 30) m *= 1.2;
  return Math.round(m);
}
export function premiums(g: Game): number {
  return (['med', 'ci', 'acc', 'life'] as InsKind[]).reduce((a, k) => a + premiumOf(g, k), 0);
}
/** 新買 / 加保時用嘅投保月入 */
export function insureBase(g: Game): number {
  const s = g.s;
  const h = s.incomeHist.slice(-1)[0] ?? 0;
  if (s.status === 'work' && h > 0) return h / 12;
  return 23600 * g.W * 0.6;
}
export function canBuy(g: Game, k: InsKind): string | null {
  const s = g.s;
  const ci = s.diseases.some((d) => ['cancer', 'stroke', 'heart', 'kidney'].includes(d.kind));
  const maxAge = { med: 80, ci: 65, acc: 70, life: 65 }[k];
  if (s.age > maxAge) return '超過投保年齡';
  if (k === 'ci' && ci) return '核保唔通過';
  if (k === 'acc' && s.disabled) return '核保唔通過';
  if (k === 'life' && ci && !s.flags['ciOver5']) return '核保唔通過';
  return null;
}
export function setIns(g: Game, k: InsKind, level: 0 | 1 | 2) {
  const s = g.s;
  const cur = s.ins[k];
  if (level === cur.level) return;
  if (level > cur.level) {
    const why = canBuy(g, k);
    if (why) { g.ach('uninsurable'); return; }
  }
  if (level === 0) { s.ins[k] = { level: 0, a0: 0, s0: 0, p0: 1, age0: 0 }; return; }
  if (cur.level && level < cur.level) { s.ins[k] = { ...cur, level }; return; }
  const s0 = insureBase(g);
  s.ins[k] = { level, s0, a0: s0 * 12, p0: g.P, age0: s.age };
}

// ---------- 開支 ----------
const PUBLIC_RENT = [1600, 2000, 2600, 3200, 3800];
const SUBDIV_RENT = [5000, 6000, 6800, 7500, 8200];
const PRIVATE_RENT = [11000, 15000, 18000, 22000, 26000];
const VILLAGE_RENT = [8000, 10000, 12000, 14000, 16000];
const OWN_MGMT = [2000, 2500, 3000, 3500, 4000];
const LIVING = [9000, 15000, 20000, 25000, 30000];

export const rentFactor = (g: Game) => Math.pow(g.P, 0.55) * Math.pow(g.e.hpi, 0.45);

export function housingCostYear(g: Game): number {
  const s = g.s;
  const n = Math.min(5, g.householdSize()) - 1;
  const P = g.P;
  let m = 0;
  switch (s.home) {
    case 'parents': return 0; // 交家用另計
    case 'institution': return 0;
    case 'share': m = 6500 * rentFactor(g); break;
    case 'rent': m = (s.rentBase || PRIVATE_RENT[n]) * rentFactor(g); break;
    case 'village': m = VILLAGE_RENT[n] * rentFactor(g); break;
    case 'subdiv': m = SUBDIV_RENT[n] * rentFactor(g); break;
    case 'public': m = PUBLIC_RENT[n] * P * (s.flags['richTenant'] ? 1.5 : 1); break;
    case 'own': m = OWN_MGMT[n] * P + (s.prop && s.prop.monthsLeft > 0 ? s.prop.pmt : 0); break;
  }
  if (s.gba) m *= 0.5;
  return Math.round(m * 12);
}

export function kidCostYear(g: Game): number {
  const s = g.s;
  let t = 0;
  for (const k of s.kids) {
    if (k.age < 0 || k.away || k.job || k.emigrated) continue;
    let c = 0;
    if (k.age <= 2) c = 45000;
    else if (k.age <= 5) c = [60000, 110000, 180000][k.school];
    else if (k.age <= 11) c = [85000, 150000, 260000][k.school];
    else if (k.age <= 17) c = [110000, 180000, 320000][k.school];
    else if (k.age <= 21 && !k.married) c = k.overseas ? (k.age <= 20 ? 420000 : 0) : 110000;
    if (s.flags['kidClasses'] && k.age >= 4 && k.age <= 10) c *= Number(s.flags['kidClasses']);
    t += c;
  }
  const youngest = Math.min(99, ...s.kids.map((k) => k.age));
  if (youngest < 6) {
    if (s.childcare === 'helper') t += 90000;
    if (s.childcare === 'parents') t += 48000;
  }
  return Math.round(t * g.P);
}

export function supportCostYear(g: Game): number {
  const s = g.s;
  const alive = s.parents.filter((p) => p.alive).length;
  if (!s.support || !alive) return 0;
  const mod = (s.origin.parentCover === 2 ? 0.6 : 1) * (s.homeContrib >= 0.3 ? 0.8 : 1) * (s.flags['parentsHelpedHome'] ? 1.3 : 1);
  const inc = g.monthlyIncome();
  let m = 0;
  if (s.support === 'money') m = inc < 25000 * g.W ? 5000 : inc < 50000 * g.W ? 6500 : 8000;
  else if (s.support === 'live') m = 4000 * alive;
  else m = 14000 * alive;
  return Math.round(m * 12 * g.P * mod);
}

export function livingCostYear(g: Game): number {
  const s = g.s;
  const P = g.P;
  let adults = 1 + (s.partner && s.married && s.partner.alive ? 1 : 0) + (s.support === 'live' ? s.parents.filter((p) => p.alive).length : 0);
  let base = s.home === 'parents' ? 5000 : LIVING[Math.min(5, adults) - 1];
  base *= 12 * P;
  if (s.age >= 65) base *= 0.9;
  if (s.gba) base *= 0.7;
  if (s.flags['gbaJob']) base *= 0.8;
  const f = s.focus;
  const Y = g.income();
  if (f === '精打細算') base *= 0.9;
  if (f === '享受當下') base += Y * 0.12;
  if (f === '強身健體') base += 6000 * P;
  if (f === '培養嗜好') base += 8000 * P;
  if (f === '增值進修') base += clamp(Y * 0.08, 15000 * P, 60000 * P);
  if (f === '周遊列國') base += 60000 * P * (s.married && s.partner?.alive ? 1.7 : 1);
  if (f === '養生保健') base += 12000 * P;
  if (s.flags['lotterySplurge'] && Number(s.flags['splurgeUntil'] ?? 999) > s.age) base += Number(s.flags['lotterySplurge']);
  // 經常性開支旗標（2026 價 × P）
  for (const [k, v] of Object.entries(s.flags)) if (k.startsWith('recur_') && typeof v === 'number') base += v * P;
  if (s.partner && s.married && s.partner.alive) {
    if (s.partner.traits.includes('節儉')) base *= 0.92;
    if (s.partner.traits.includes('大使')) base *= 1.1;
  }
  return Math.round(base);
}

// ---------- 寵物（參考 MoneyHero 2024：每年約 $9,700–27,900） ----------
export const PET_INFO = {
  cat: { name: '貓', year: 13000, once: 3000, life: [12, 18] as [number, number], names: ['豆豆', '咪咪', '肥仔', '忌廉', '芝麻', '布甸', '橙仔', '雪糕'] },
  dog: { name: '狗', year: 18000, once: 5000, life: [10, 15] as [number, number], names: ['旺財', '波波', '豆腐', '啤啤', '旺旺', '小白', '朱古力', '多多'] },
};
export function petCostYear(g: Game): number {
  return Math.round(g.s.pets.reduce((a, p) => a + PET_INFO[p.kind].year, 0) * g.P);
}
export function petBlock(g: Game, kind: 'cat' | 'dog'): string | null {
  const s = g.s;
  if (s.age < 18) return '18 歲先可以自己養';
  if (s.pets.length >= 4) return '最多養 4 隻';
  if (kind === 'dog' && s.home === 'public') return '公屋唔准養狗';
  if (s.home === 'institution') return '院舍唔養得';
  return null;
}
/** 領養一隻寵物：一次過開支（絕育、針、用品），返回描述 */
export function adoptPet(g: Game, kind: 'cat' | 'dog'): string {
  const s = g.s;
  const info = PET_INFO[kind];
  const used = s.pets.map((p) => p.name);
  const r = streamRng(s.seed, 'pet', s.age * 10 + s.pets.length);
  const left = info.names.filter((n) => !used.includes(n));
  const name = left.length ? r.pick(left) : `${info.name}${s.pets.length + 1}號`;
  s.pets.push({ kind, name, age: kind === 'cat' ? 1 : 1, since: s.age });
  const t = payCost(g, g.p(info.once));
  g.add('J', 3);
  g.log(`領養咗一隻${info.name}，叫「${name}」。`, '生活日常', true);
  return `你領養咗一隻${info.name}，叫「${name}」。一次過開支約 ${fmtMoney(g.p(info.once))}${t}，之後每年約 ${fmtMoney(g.p(info.year))}。`;
}
/** 寵物每年：老一歲，有機會離開 */
export function petsYear(g: Game) {
  const s = g.s;
  if (!s.pets.length) return;
  const r = streamRng(s.seed, 'petyear', s.age);
  for (const p of [...s.pets]) {
    p.age++;
    const [a, b] = PET_INFO[p.kind].life;
    const die = p.age < a ? 0.01 : p.age >= b ? 0.6 : 0.08 + (0.4 * (p.age - a)) / (b - a);
    if (r() < die) {
      s.pets = s.pets.filter((x) => x !== p);
      g.add('J', -6, '寵物離開');
      g.log(`陪咗你 ${s.age - p.since} 年嘅${PET_INFO[p.kind].name}「${p.name}」離開咗。`, '生活日常', true);
    }
  }
  if (s.pets.length) g.add('J', Math.min(2, s.pets.length));
}

/** 每年必要開支（備用金計算用） */
export function needYear(g: Game): number {
  const s = g.s;
  if (s.status === 'child' || (s.status === 'study' && !s.everEmployed)) return familyNeedMonthly(g) * 12;
  const base = housingCostYear(g) + livingCostYear(g) * (s.focus === '享受當下' ? 0.8 : 1) + petCostYear(g) + kidCostYear(g) + supportCostYear(g) + premiums(g) + s.card * 0.36 + s.finco * 0.4;
  return Math.max(base + (s.home === 'parents' ? g.income() * s.homeContrib : 0), 1);
}

function familyNeedMonthly(g: Game): number {
  const s = g.s;
  const n = Math.min(5, 3 + s.siblings) - 1;
  const h = s.origin.housing;
  const hm = h === '公屋' || h === '寄養家庭' ? PUBLIC_RENT[n] : h === '劏房' ? SUBDIV_RENT[n] : h === '私樓租住' || h === '跨境' ? PRIVATE_RENT[n] : h === '村屋' ? VILLAGE_RENT[n] * 0.5 : OWN_MGMT[n] * 1.8;
  return (hm + LIVING[Math.min(4, 2 + s.siblings)]) * g.P;
}

// ---------- 資產 ----------
const PLAN_G: [number, number][] = [[0, 0], [1, 0.05], [2, 0.3], [3, 0.55], [4, 0.7], [5, 0.8], [6, 0.82], [7, 0.84], [8, 0.86], [10, 0.9], [15, 1.0], [20, 1.05], [25, 1.1], [30, 1.15], [60, 1.6]];
const PLAN_NG: [number, number][] = [[0, 0], [4, 0], [5, 0.02], [6, 0.08], [7, 0.12], [8, 0.14], [10, 0.18], [15, 0.3], [20, 0.55], [25, 0.85], [30, 1.25], [60, 3.5]];
export const planCV = (p: { paid: number; years: number; ng: number }) => p.paid * (interp(PLAN_G, p.years) + interp(PLAN_NG, p.years) * p.ng);
export const plansValue = (s: State) => s.plans.reduce((a, p) => a + planCV(p), 0);

export function propEquity(g: Game): number {
  const s = g.s;
  if (!s.prop) return 0;
  return propValue(g) - s.prop.mortgage;
}
export function propValue(g: Game): number {
  const s = g.s;
  if (!s.prop) return 0;
  return s.prop.price0 * (g.e.hpi / s.prop.hpi0);
}
export function liquidAssets(g: Game): number {
  const s = g.s;
  return s.cash + s.deposit + s.index + s.stock + s.crypto;
}
export function netWorth(g: Game): number {
  const s = g.s;
  return liquidAssets(g) + plansValue(s) + s.mpf + propEquity(g) - s.card - s.finco - (s.studentLoan?.bal ?? 0) - s.privateLoan;
}

// ---------- 付款瀑布（8.7.4） ----------
export function payCost(g: Game, amount: number, why = ''): string {
  const s = g.s;
  if (amount <= 0) return '';
  // 童年 / 讀書未出身：由家庭支付
  if (s.status === 'child' || (s.status === 'study' && !s.everEmployed && s.age < 23)) {
    const fs = Number(s.flags['familySavings']);
    s.flags['familySavings'] = fs - amount;
    return '';
  }
  let left = amount;
  const used: string[] = [];
  const take = (key: 'cash' | 'deposit' | 'index' | 'stock' | 'crypto', label: string) => {
    if (left <= 0 || s[key] <= 0) return;
    const t = Math.min(s[key], left);
    s[key] -= t;
    left -= t;
    if (key !== 'cash') used.push(`${label} ${fmtMoney(t)}`);
  };
  take('cash', '現金');
  take('deposit', '定存');
  take('index', '賣基金');
  take('stock', '賣股票');
  take('crypto', '賣加密貨幣');
  while (left > 0 && s.plans.length) {
    const p = s.plans.shift()!;
    const cv = planCV(p);
    const loss = p.paid - cv;
    used.push(`儲蓄計劃退保${loss > 0 ? `（蝕咗 ${fmtMoney(loss)}）` : ''}`);
    s.cash += cv;
    const t = Math.min(s.cash, left);
    s.cash -= t;
    left -= t;
  }
  if (left > 0) {
    const cardLimit = Math.max(30000 * g.P, g.monthlyIncome() * 6);
    const t = Math.min(left, Math.max(0, cardLimit - s.card));
    if (t > 0) { s.card += t; left -= t; used.push(`碌卡 ${fmtMoney(t)}`); }
  }
  if (left > 0) {
    const lim = Math.max(20000 * g.P, g.monthlyIncome() * 6);
    const t = Math.min(left, Math.max(0, lim - s.finco));
    if (t > 0) { s.finco += t; left -= t; used.push(`借財務公司 ${fmtMoney(t)}`); g.flag('usedFinco'); }
  }
  if (left > 0) { s.card += left; used.push(`欠債 ${fmtMoney(left)}`); left = 0; g.flag('overDebt'); }
  void why;
  return used.length ? `（${used.join('、')}）` : '';
}

// ---------- 稅 ----------
export function salaryTax(g: Game, income: number, mpfEE: number): number {
  const s = g.s;
  const sc = Math.min(1, g.W) * (g.s.year > 2026 ? g.P : 1); // 歷史年份按工資比率縮放
  const scale = g.s.year >= 2026 ? g.P : sc;
  const kids = s.kids.filter((k) => k.age < 22).length;
  const parentsSup = s.support ? s.parents.filter((p) => p.alive && p.age >= 60).length : 0;
  const allow = (s.married && s.partner?.alive && s.partner.income < 50000 ? 264000 : 132000) + kids * 130000 + parentsSup * (s.support === 'live' ? 100000 : 50000);
  const ded = Math.min(mpfEE, 18000 * scale) + (s.ins.med.level ? 8000 * scale : 0) + (s.prop ? Math.min(100000 * scale, s.prop.mortgage * s.prop.rate) : 0);
  const nci = Math.max(0, income - ded - allow * scale);
  const b = 50000 * scale;
  let tax = 0;
  let rest = nci;
  for (const r of [0.02, 0.06, 0.1, 0.14]) {
    const t = Math.min(rest, b);
    tax += t * r;
    rest -= t;
  }
  tax += rest * 0.17;
  const std = Math.max(0, income - ded) * 0.15;
  return Math.max(0, Math.round(Math.min(tax, std)));
}

// ---------- MPF ----------
export function mpfCaps(y: number): [number, number] {
  if (y < 2001) return [0, 0];
  if (y < 2012) return [1000, 5000];
  if (y < 2014) return [1250, 6500];
  return [1500, 7100];
}
export function mpfReturn(g: Game, fund: State['mpfFund'], age: number): number {
  const e = g.e;
  switch (fund) {
    case '保守': return Math.max(0, e.rdep - 0.003);
    case '均衡': return 0.5 * e.ridx + 0.02;
    case '增長': return 0.75 * e.ridx + 0.01;
    default: {
      if (age < 50) return 0.6 * e.ridx + 0.015;
      if (age >= 65) return 0.2 * e.ridx + 0.02;
      const sh = 0.6 - (0.4 * (age - 50)) / 15;
      return sh * e.ridx + 0.015 + (1 - sh / 0.6) * 0.005;
    }
  }
}

// ---------- 每年結算（每年流程 ②） ----------
export interface YearMoney { income: number; expense: number; cf: number; mpfEE: number; tax: number; lines: string[] }

export function settleYear(g: Game) {
  const s = g.s;
  const e = g.e;
  const P = g.P;
  const ir = streamRng(s.seed, 'invest', s.age);

  // 父母收入跟工資比率
  const wPrev = g.econ(s.year - 1).W;
  for (const p of s.parents) if (p.alive && p.working) p.income *= g.W / wPrev;

  // 童年：家庭財務
  const childMode = s.status === 'child' || (s.status === 'study' && !s.everEmployed);
  if (childMode) {
    const fi = s.parents.filter((p) => p.alive && p.working).reduce((a, p) => a + p.income, 0);
    s.flags['familyIncome'] = fi;
    const rate = { 困難: 0.02, 基層: 0.05, 小康: 0.08, 中產: 0.12, 富裕: 0.15 }[s.origin.wealthTier];
    let fs = Number(s.flags['familySavings']) * (1 + e.rdep * 0.7) + fi * 12 * rate;
    const classes = s.age <= 11 ? (s.hobbyClass === 1 ? 1500 : s.hobbyClass === 2 ? 2000 : 0) * 12 * P : 0;
    const tutor = s.age >= 14 && s.age <= 17 ? (s.tutoring === 1 ? 18000 : s.tutoring === 3 ? 48000 : 0) * P : 0;
    fs -= classes + tutor;
    if (s.study && s.age >= 17) {
      // 專上學費：家庭先付，唔夠就學貸
      const fee = s.study.fee * P;
      if (s.study.kind === '出國升學' || fs > fee * 1.5) fs -= fee;
      else {
        s.studentLoan = s.studentLoan ?? { bal: 0, mode: 'min', deferLeft: 0 };
        s.studentLoan.bal += fee;
      }
    }
    s.flags['familySavings'] = fs;
    // 兼職 / 利是
    if (s.age >= 6 && s.age <= 17) {
      const lai = (s.origin.family === '三代同堂' ? 1.5 : s.origin.family === '新移民' ? 0.7 : 1) * (s.origin.isBaoyou ? 500 / 3500 : 1) * 3500 * P * Math.pow(1.05, s.age - 6);
      if (s.age >= 8) {
        if (s.piggyMode === 0) s.piggy += lai;
        else if (s.piggyMode === 1) s.piggy += lai / 2;
      }
    }
    if (s.focus === '做兼職' && s.age >= 15) {
      const hourly = minWage(g);
      s.cash += hourly * (s.age >= 18 ? 16 : 12) * 40;
    }
    if (s.age === 18 && s.piggy > 0) { s.cash += s.piggy; g.tick(`錫錢罐轉做你嘅第一筆積蓄：${fmtMoney(s.piggy)}`); s.piggy = 0; }
    if (s.pets.length) payCost(g, petCostYear(g));
    s.incomeHist.push(0);
    s.budget = null;
    investReturns(g, ir);
    return;
  }

  const lines: string[] = [];
  // 收入
  const pay = Number(s.flags['yearPay'] ?? 0);
  const bonus = Number(s.flags['yearBonus'] ?? 0);
  let partTime = 0;
  if (s.status === 'retired' && s.focus === '退而不休' && s.age < 75 && s.H >= 30) {
    const k = s.H >= 60 ? 1 : s.H >= 40 ? 0.7 : 0.4;
    partTime = Math.min(s.lastSalary * 0.4, 15000 * P) * 12 * k;
  }
  if (s.focus === '做兼職' && s.status === 'study') partTime += minWage(g) * 16 * 40;
  let mpfDraw = 0;
  if (s.mpfMode === 'phased' && s.mpf > 0) { mpfDraw = s.mpf * 0.06; s.mpf -= mpfDraw; }
  const annuity = s.annuity * 12 + s.reverseMortgage * 12;
  // 伴侶淨收入
  let partnerNet = 0;
  const pt = s.partner;
  if (pt && s.married && pt.alive) {
    pt.income *= g.W / wPrev * 1.01;
    const quitting = s.childcare === 'quit' && s.flags['quitWho'] !== 'self' && Math.min(99, ...s.kids.map((k) => k.age)) < 4;
    if (pt.age >= 65) pt.income = 0;
    partnerNet = quitting ? 0 : pt.income * 0.85;
  }
  // 政府津貼
  let gov = 0;
  const liq = liquidAssets(g);
  if (s.age >= 65 && liq < 420000 * P && (pay + partTime) / 12 < 10800 * P) gov = Math.max(gov, 4300 * 12 * P);
  if (s.age >= 70) gov = Math.max(gov, 1700 * 12 * P);
  const ownIncome = pay + bonus + partTime;
  const csaLimit = (s.age >= 65 ? 60000 : 35000) * P;
  if (liq < csaLimit && ownIncome + partnerNet < 6000 * 12 * P && s.age >= 18 && s.status !== 'study') {
    gov = Math.max(gov, (s.age >= 65 ? 7000 : 6000) * 12 * P);
    if (!s.flags['cssa']) g.tick('你申請咗綜援，暫時有個底。');
    g.flag('cssa');
  }
  if (s.year === 2020 && s.age >= 18) { gov += 10000; lines.push('政府現金發放 $10,000'); }
  if (s.year === 2021 && s.age >= 18) gov += 5000;
  if (s.year === 2022 && s.age >= 18) gov += 10000;
  const deposits = s.deposit * e.rdep + s.cash * Math.min(0.003, e.rdep * 0.1);

  // MPF 供款
  const [cap, minInc] = mpfCaps(s.year);
  let mpfEE = 0;
  let mpfER = 0;
  if (cap && pay > 0) {
    const monthly = pay / 12;
    mpfER = Math.min(monthly * 0.05, cap) * 12;
    mpfEE = monthly < minInc ? 0 : Math.min(monthly * 0.05, cap) * 12;
  }
  s.mpf += mpfEE + mpfER;
  if (mpfEE + mpfER > 0) g.flag('hadMpf');

  const income = pay + bonus + partTime + partnerNet + gov + mpfDraw + annuity;

  // 開支
  const tax = s.taxDue;
  s.taxDue = 0;
  const housing = housingCostYear(g);
  const living = livingCostYear(g);
  const kids = kidCostYear(g);
  const support = supportCostYear(g);
  const prem = premiums(g);
  const homeC = s.home === 'parents' ? (pay + bonus) * s.homeContrib : 0;
  // 讀書（成年後自費）
  let study = 0;
  if (s.study && s.status === 'study') study = s.study.fee * P;
  // 學貸還款
  let loanPay = 0;
  if (s.studentLoan && s.studentLoan.bal > 0 && s.status !== 'study') {
    const sl = s.studentLoan;
    sl.bal *= 1.025;
    if (sl.mode === 'defer' && sl.deferLeft > 0) sl.deferLeft--;
    else {
      loanPay = Math.min(sl.bal, sl.mode === 'fast' ? sl.bal / 3 + 1 : Math.max(sl.bal / 10, 3000));
      sl.bal -= loanPay;
      if (sl.bal < 1) s.studentLoan = null;
    }
  }
  // 債務利息
  const cardInt = s.card * 0.3;
  const fincoInt = s.finco * 0.4;
  s.card += cardInt;
  s.finco += fincoInt;
  const privInt = s.privateLoan * 0.06;
  s.privateLoan += privInt;
  // 花錢面板
  const panel = Number(s.flags['panelCost'] ?? 0);
  s.flags['panelCost'] = 0;
  // 六星彩
  const lot = lotteryYear(g);
  // 儲蓄計劃供款
  let planPay = 0;
  for (const p of s.plans) if (p.years < 5) { planPay += p.annual; }

  const pets = petCostYear(g);
  const expense = tax + housing + living + pets + kids + support + prem + homeC + study + loanPay + panel + lot + planPay;
  const cf = income - mpfEE - expense;
  const items: [string, number][] = [
    [s.home === 'own' ? '供樓同管理費' : s.home === 'parents' ? '交家用' : '租金', s.home === 'parents' ? homeC : housing],
    ['食飯同日常', living], ['寵物', pets], ['仔女', kids], ['供養父母', support], ['保險', prem], ['交稅', tax],
    ['學費', study], ['還學債', loanPay], ['興趣同消遣', panel], ['六星彩', lot], ['儲蓄計劃', planPay], ['強積金（自己供）', mpfEE],
  ];
  s.budget = { income: Math.round(income), expense: Math.round(expense + mpfEE), cf: Math.round(cf), mpfEE: Math.round(mpfEE), items: items.filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v)]) };
  // 稅：今年入息，明年交
  if (pay + bonus > 0) s.taxDue = salaryTax(g, pay + bonus, mpfEE);

  // 儲蓄計劃更新（供款已計喺開支）
  for (const p of s.plans) {
    if (p.years < 5) p.paid += p.annual;
    p.years++;
    p.ng = clamp(p.ng * (1 + 0.15 * (e.ridx - 0.07)), 0.6, 1.2);
  }

  if (cf >= 0) allocateSurplus(g, cf);
  else {
    const t = payCost(g, -cf, '年度缺口');
    if (t) lines.push(`今年入不敷支 ${fmtMoney(-cf)}${t}`);
  }
  investReturns(g, ir);
  // MPF 回報
  s.mpf *= 1 + mpfReturn(g, s.mpfFund, s.age);
  if (s.prop && s.prop.monthsLeft > 0) amortize(g);

  // 收入紀錄（玩家個人稅前）
  const personal = pay + bonus + partTime;
  s.incomeHist.push(personal);
  s.earnReal += personal / P;
  s.maxIncomeReal = Math.max(s.maxIncomeReal, personal / P);
  g.flag('lastNeed', needYear(g));
  g.flag('lastCF', Math.round(cf));
  g.flag('lastSaveRate', pay + bonus > 0 ? (cf + mpfEE) / (pay + bonus) : 0);
  g.flag('lastExpense', Math.round(expense));
  g.flag('lastIncome', Math.round(income));
  if (s.card + s.finco > 100000 * P) g.ach('card_slave');
  if (s.card > g.monthlyIncome() * 3 && s.card > 0) g.add('J', -3, '卡數壓力');
  for (const l of lines) g.tick(l);
}

function minWage(g: Game): number {
  const y = g.s.year;
  if (y >= 2011) return y >= 2026 ? 43.1 * g.P : interp([[2011, 28], [2015, 32.5], [2019, 37.5], [2023, 40], [2025, 42.1]], y);
  return 42.1 * 0.7 * g.W;
}

function allocateSurplus(g: Game, cf: number) {
  const s = g.s;
  let left = cf;
  // 1. 還高息債
  for (const k of ['finco', 'card'] as const) {
    const t = Math.min(left, s[k]);
    s[k] -= t;
    left -= t;
  }
  if (s.privateLoan > 0) { const t = Math.min(left, s.privateLoan); s.privateLoan -= t; left -= t; }
  if (s.studentLoan && s.studentLoan.mode === 'fast') { const t = Math.min(left * 0.3, s.studentLoan.bal); s.studentLoan.bal -= t; left -= t; }
  // 2. 備用金
  const needM = needYear(g) / 12;
  const target = s.emergTarget * needM;
  const liq = s.cash + s.deposit;
  if (liq < target) {
    const t = Math.min(left, target - liq);
    s.cash += t;
    left -= t;
  }
  // 3. 投資
  if (s.investRatio > 0 && left > 0) {
    const want = Math.min(left, g.monthlyIncome() * 12 * s.investRatio);
    const a = s.alloc;
    const tot = a.deposit + a.plan + a.index + a.stock + (s.year >= 2013 ? a.crypto : 0) || 1;
    s.deposit += (want * a.deposit) / tot;
    s.index += (want * a.index) / tot;
    s.stock += (want * a.stock) / tot;
    if (s.year >= 2013) s.crypto += (want * a.crypto) / tot;
    const planAmt = (want * a.plan) / tot;
    if (planAmt > 0) {
      const paying = s.plans.some((p) => p.years < 5);
      if (!paying && s.plans.length < 3) { s.plans.push({ start: s.year, annual: Math.round(planAmt), paid: 0, years: 0, ng: 1 }); }
      else s.deposit += planAmt;
    }
    if (a.index + a.stock + a.plan + a.crypto > 0) g.flag('invested');
    if (s.age < 25 && !s.flags['investStart']) g.flag('investStart', s.age);
    left -= want;
  }
  // 4. 剩餘留現金；超過 3 個月開支轉定存
  s.cash += left;
  const over = s.cash - needM * 3;
  if (over > 0) { s.cash -= over; s.deposit += over; }
}

function investReturns(g: Game, ir: ReturnType<typeof streamRng>) {
  const s = g.s;
  const e = g.e;
  s.deposit *= 1 + e.rdep;
  if (s.index > 0) s.index *= 1 + e.ridx;
  if (s.stock > 0) {
    const u = ir();
    let R = 0.04 + 1.2 * (e.ridx - 0.07) + ir.normal(0, 0.28);
    if (u < 0.03) R = -0.7; else if (u < 0.06) R = 1.5;
    s.stock *= 1 + clamp(R, -0.95, 3);
  }
  if (s.crypto > 0) {
    const u = ir();
    let R = 0.15 + 0.7 * ir.normal();
    if (u < 0.1) R = -ir.uni(0.75, 0.9); else if (u < 0.12) { R = -1; g.tick('你用開嘅加密貨幣交易所倒閉，持倉歸零。'); }
    s.crypto *= 1 + clamp(R, -1, 4);
  }
  if (e.crash && s.index + s.stock > 20000) g.flag('crashYear', s.year);
}

function amortize(g: Game) {
  const p = g.s.prop!;
  const r = g.e.rmort;
  p.rate = r;
  const i = r / 12;
  for (let k = 0; k < 12 && p.monthsLeft > 0; k++) {
    const int = p.mortgage * i;
    p.mortgage = Math.max(0, p.mortgage - (p.pmt - int));
    p.monthsLeft--;
  }
  if (p.monthsLeft > 0) p.pmt = pmtOf(p.mortgage, r, p.monthsLeft);
  if (p.monthsLeft <= 0 || p.mortgage < 1) {
    p.mortgage = 0; p.monthsLeft = 0; p.pmt = 0;
    g.ach('mortgage_free');
    g.tick('你終於供完層樓！');
  }
}

export function pmtOf(L: number, r: number, n: number): number {
  const i = r / 12;
  if (i <= 0) return L / n;
  return (L * i) / (1 - Math.pow(1 + i, -n));
}

function lotteryYear(g: Game): number {
  const s = g.s;
  if (!s.lottery || s.age < 18) return 0;
  const n = s.lottery === 1 ? 50 : 750;
  const price = s.year < 2010 ? 5 : g.P >= 2 ? 20 : 10;
  const mult = s.year < 2010 ? 0.5 : g.P >= 2 ? 2 : 1;
  const cost = n * price;
  s.lotterySpent += cost;
  s.lotteryTickets += n;
  const r = streamRng(s.seed, 'lottery', s.age);
  // 逐級抽中獎注數（二項近似）
  const draw = (p: number) => { let c = 0; const lam = n * p; let L = Math.exp(-lam), k = 0, q = 1; do { k++; q *= r(); } while (q > L); c = k - 1; return c; };
  const wins = [draw(1 / 61), draw(1 / 812), draw(1 / 1083), draw(1 / 22197), draw(1 / 55491), draw(1 / 2330636)];
  let prize = wins[0] * 40 * mult + wins[1] * 320 * mult + wins[2] * 640 * mult + wins[3] * 9600 * mult;
  prize += wins[4] * r.uni(40000, 120000) * (s.year < 2010 ? 0.6 : 1) * Math.max(1, g.P);
  prize += wins[5] * r.uni(600000, 2500000) * (s.year < 2010 ? 0.6 : 1) * Math.max(1, g.P);
  const jackpot = r() < 1 - Math.pow(1 - 1 / 13983816, n);
  if (jackpot) g.flag('jackpotYear', s.year);
  s.lotteryWon += prize;
  s.cash += prize;
  if (prize > 0) g.tick(`今年六星彩中咗 ${wins.reduce((a, b) => a + b, 0)} 次獎，共 ${fmtMoney(prize)}（買咗 ${fmtMoney(cost)}）。`);
  if (s.lotterySpent >= 100000) g.ach('lottery_vs_fund');
  return cost;
}

// ---------- 財務健康 F（4.8） ----------
export function insScore(g: Game): number {
  const s = g.s;
  const lv = (k: InsKind) => (insActive(s, k) ? [0, 60, 100][s.ins[k].level] : 0);
  let med = lv('med');
  if (s.status === 'work' && s.job && med < 60) med = 60;
  let ci = lv('ci');
  if (s.diseases.some((d) => ['cancer', 'stroke', 'heart', 'kidney'].includes(d.kind))) ci = Math.min(ci, 60);
  const deps = (s.married && s.partner?.alive && s.partner.income < 100000 * g.W) || s.kids.some((k) => k.age < 22) || s.support === 'money' || s.support === 'live';
  const lifeW = deps || (s.prop && s.prop.mortgage > 0) ? 25 : 0;
  return (30 * med + 35 * ci + 10 * lv('acc') + lifeW * lv('life')) / (75 + lifeW);
}

export function computeF(g: Game) {
  const s = g.s;
  const fp = s.fParts;
  const childMode = s.status === 'child' || (s.status === 'study' && !s.everEmployed);
  if (childMode) {
    if (s.origin.isBaoyou && s.origin.baoyouBranch !== '被領養') { fp.E = 40; fp.P = 60; }
    else {
      const need = familyNeedMonthly(g);
      const fs = Number(s.flags['familySavings']);
      fp.E = clamp(fs / need / 6, 0, 1) * 100;
      fp.P = [0, 60, 100][s.origin.parentCover];
      fp.m = Math.max(0, fs / need);
    }
    s.F = Math.round(clamp(0.6 * fp.E + 0.4 * fp.P, 0, 100));
    return;
  }
  const needY = needYear(g);
  const needM = needY / 12;
  const liq = s.cash + s.deposit + s.index * 0.8 + s.stock * 0.6;
  fp.m = Math.max(0, liq / needM);
  fp.E = Math.min(fp.m / 6, 1) * 100;
  fp.P = insScore(g);
  fp.gap = 100 - fp.P;
  const Y = g.income() || needY;
  const hi = s.card + s.finco;
  let D = Math.min(30, (60 * hi) / Math.max(Y, 1));
  if (s.prop && propEquity(g) < 0) D += 10;
  if (s.prop && s.prop.pmt * 12 > 0.5 * Math.max(Y, 1)) D += 5;
  fp.D = Math.min(30, D);
  if (s.status === 'retired') {
    const usable = liquidAssets(g) + plansValue(s) + s.mpf;
    const fixed = s.annuity * 12 + s.reverseMortgage * 12 + Number(s.flags['govLast'] ?? 0) + (s.focus === '退而不休' ? Math.min(s.lastSalary * 0.4, 15000 * g.P) * 12 : 0);
    const exp = Number(s.flags['lastExpense'] ?? needY);
    const gapY = exp - fixed;
    const target = Math.max(3, 95 - s.age);
    const Yr = gapY <= 0 ? 99 : usable / gapY;
    fp.L = gapY <= 0 ? 100 : Math.min(Yr / target, 1) * 100;
    fp.untilAge = s.age + Math.floor(Math.min(Yr, 60));
    s.F = Math.round(clamp(0.25 * fp.E + 0.45 * fp.L + 0.3 * fp.P - fp.D + s.HB, 0, 100));
  } else {
    if (s.age < 25) {
      const sr = Number(s.flags['lastSaveRate'] ?? 0);
      fp.T = clamp(sr / 0.2, 0, 1) * 100;
      fp.r = fp.T / 100;
    } else {
      const h = s.incomeHist.slice(-3).filter((x) => x > 0);
      const avg = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 23600 * 12 * g.W;
      const G = avg * 0.7 * 20;
      const f = Math.max(0.03, Math.pow(Math.min(1, (s.age - 22) / 43), 1.5));
      const A = s.mpf + s.index + s.stock + s.crypto + plansValue(s) + s.annuity * 12 * 15 + Math.max(0, propEquity(g)) * 0.3;
      fp.r = A / (G * f);
      fp.T = Math.min(fp.r, 1) * 100;
    }
    s.F = Math.round(clamp(0.3 * fp.E + 0.4 * fp.T + 0.3 * fp.P - fp.D + s.HB, 0, 100));
  }
}

/** 估計呢一刻退休資產 */
export function retireAssets(g: Game): number {
  const s = g.s;
  return s.mpf + s.index + s.stock + s.crypto + plansValue(s) + Math.max(0, propEquity(g)) * 0.3;
}
