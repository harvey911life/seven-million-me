// 第 7 章 7.9 創業（簡化版）：六種生意，每年擲賺 / 持平 / 蝕，有機會倒閉或者被收購
import type { Game } from './game';
import { clamp, Mneg, Mpos, fmtMoney } from './util';
import { streamRng, type RNG } from './rng';
import { mkCard, type Card, type EventDef } from './cards';
import { retireNow } from './career';
import { payCost } from './finance';

export interface BizDef {
  id: string; name: string; cap: number; turnover: number;
  p: [number, number, number]; // 賺 / 持平 / 蝕
  win: [number, number]; flat: [number, number]; lose: [number, number];
  wk: number; wr: number; close: number; acq: number; val: (r: RNG, turnover: number) => number; hp: number;
  need?: (g: Game) => string | null; // 唔可以開嘅原因
  weak?: (g: Game) => number; // 唔符合「冇懲罰」條件時嘅賺錢機率乘數
}

const degreeOr = (k: number) => (g: Game) => (g.s.edu >= 5 || g.s.K >= k ? 1 : 0.6);
export const BIZ: BizDef[] = [
  { id: 'cafe', name: '茶餐廳', cap: 1_200_000, turnover: 4_000_000, p: [0.35, 0.35, 0.3], win: [200_000, 600_000], flat: [-50_000, 150_000], lose: [-500_000, -150_000], wk: 0.5, wr: 1, close: 0.08, acq: 0.003, val: (r, t) => t * r.uni(0.5, 1), hp: -1.5 },
  { id: 'shop', name: '網店', cap: 80_000, turnover: 800_000, p: [0.4, 0.3, 0.3], win: [60_000, 400_000], flat: [-20_000, 60_000], lose: [-150_000, -30_000], wk: 1, wr: 0.5, close: 0.12, acq: 0.005, val: (r, t) => t * r.uni(1, 2), hp: -0.5 },
  { id: 'reno', name: '裝修公司', cap: 300_000, turnover: 3_000_000, p: [0.4, 0.35, 0.25], win: [250_000, 800_000], flat: [-50_000, 200_000], lose: [-400_000, -100_000], wk: 0.6, wr: 1, close: 0.06, acq: 0.002, val: (r, t) => t * r.uni(0.3, 0.6), hp: -1.5,
    weak: (g) => ((g.s.catExp['工藝及機器操作'] ?? 0) >= 3 || g.s.track === '建造' || g.s.track === '電機' ? 1 : 0.7) },
  { id: 'tutor', name: '補習社', cap: 400_000, turnover: 1_500_000, p: [0.4, 0.35, 0.25], win: [150_000, 500_000], flat: [-30_000, 150_000], lose: [-300_000, -80_000], wk: 1.2, wr: 0.6, close: 0.07, acq: 0.005, val: (r, t) => t * r.uni(1, 1.5), hp: -1,
    need: (g) => (g.s.edu >= 5 || g.s.K >= 60 ? null : '要有學士或者知識 ≥ 60') },
  { id: 'tech', name: '科技初創', cap: 1_500_000, turnover: 2_000_000, p: [0.2, 0.25, 0.55], win: [500_000, 5_000_000], flat: [-200_000, 200_000], lose: [-1_500_000, -300_000], wk: 1.5, wr: 0.7, close: 0.18, acq: 0.03, val: (r) => Math.exp(r.uni(Math.log(5e6), Math.log(8e7))), hp: -2, weak: degreeOr(70) },
  { id: 'trade', name: '進出口貿易', cap: 600_000, turnover: 6_000_000, p: [0.35, 0.35, 0.3], win: [200_000, 900_000], flat: [-50_000, 200_000], lose: [-700_000, -150_000], wk: 0.6, wr: 1.2, close: 0.07, acq: 0.004, val: (r, t) => t * r.uni(0.5, 1), hp: -1 },
];
export const BIZ_BY_ID: Record<string, BizDef> = Object.fromEntries(BIZ.map((b) => [b.id, b]));
export const bizName = (g: Game, id: string) => (id === 'shop' && g.s.year < 2000 ? '街市檔' : BIZ_BY_ID[id].name);

const LOAN_RATE = 0.07;

/** 而家可唔可以開呢盤生意；返回原因或者 null */
export function bizBlock(g: Game, d: BizDef): string | null {
  const s = g.s;
  if (s.age < 18) return '18 歲先可以創業';
  if (s.biz) return '你已經有一盤生意';
  if (s.status === 'study' || s.status === 'child' || s.status === 'retired') return s.status === 'retired' ? '已經退休' : '未出嚟做嘢';
  if (s.flags['bankrupt']) return '破產期間唔可以創業';
  const why = d.need?.(g);
  if (why) return why;
  const own = s.cash + s.deposit + s.index + s.stock;
  if (own < g.p(d.cap) * 0.3) return `最少要有三成本錢 ${fmtMoney(g.p(d.cap) * 0.3)}`;
  return null;
}

/** 開業：自己錢先，唔夠就借銀行（最多七成，年息 7%，5 年還） */
export function startBiz(g: Game, id: string): string {
  const s = g.s;
  const d = BIZ_BY_ID[id];
  const cap = g.p(d.cap);
  const own = Math.min(cap, s.cash + s.deposit + s.index + s.stock);
  const loan = Math.max(0, cap - own);
  payCost(g, own, '創業本錢');
  if (s.job) s.lastSalary = s.job.salary;
  s.job = null;
  s.status = 'biz';
  s.overtime = false;
  s.biz = { id, years: 0, scale: 1, lossStreak: 0, profitStreak: 0, loan, loanYears: loan > 0 ? 5 : 0, cap, lastProfit: 0, half: false, diluted: false, count: (s.biz0 ?? 0) + 1 };
  s.biz0 = (s.biz0 ?? 0) + 1;
  g.ach('biz_start');
  const t = `你開咗${bizName(g, id)}，落咗本錢 ${fmtMoney(own)}${loan > 0 ? `，問銀行借咗 ${fmtMoney(loan)}` : ''}。`;
  g.log(t, '人生抉擇', true);
  return t;
}

/** 結業：生財工具賣返一成，銀行貸款變私人債務 */
export function closeBiz(g: Game, why: string, sold = 0): string {
  const s = g.s;
  const b = s.biz;
  if (!b) return '';
  const d = BIZ_BY_ID[b.id];
  const left = sold > 0 ? sold : b.id === 'shop' ? 0 : b.cap * 0.1;
  s.cash += left;
  s.privateLoan += b.loan;
  s.biz = null;
  s.status = 'unemp';
  if (!sold) { g.add('J', -15, '生意結業'); g.add('R', -5); g.flag('bizClosed', s.age); }
  const t = `${why}${left > 0 ? `${sold ? '收到' : '執笠後賣生財工具收返'} ${fmtMoney(left)}` : ''}${b.loan > 0 ? `；仲欠銀行 ${fmtMoney(b.loan)}` : ''}。`;
  g.log(`${bizName(g, d.id)}：${t}`, '人生抉擇', true);
  return t;
}

/** 每年生意結算（喺 careerYear 度代替打工） */
export function bizYear(g: Game) {
  const s = g.s;
  const b = s.biz!;
  const d = BIZ_BY_ID[b.id];
  const r = streamRng(s.seed, 'biz', s.age);
  const e = g.e;
  if ((s.retirePlan === 60 && s.age >= 60) || (s.retirePlan === 65 && s.age >= 65) || (s.age >= 75)) {
    closeBiz(g, '你決定收山，將盤生意頂咗俾人，', g.p(d.cap) * 0.3 * b.scale);
    retireNow(g, '你收咗盤生意，正式退休。');
    return;
  }
  // ① 機率
  const Ip = clamp(Math.pow(Mpos(s.K), d.wk) * Math.pow(Mpos(s.R), d.wr), 0.25, 3);
  const In = clamp(Math.pow(Mneg(s.K), d.wk) * Math.pow(Mneg(s.R), d.wr), 0.25, 3);
  const crisis = e.u >= 5;
  const covid = s.year >= 2020 && s.year <= 2022 && !s.rewritten.includes('2020');
  let Ep = crisis ? 0.7 : 1, El = crisis ? 1.4 : 1;
  if (covid && (b.id === 'cafe' || b.id === 'tutor')) { Ep *= 0.4; El *= 2.5; }
  if (covid && b.id === 'shop') { Ep *= 1.4; El *= 0.7; }
  const Ff = s.focus === '事業衝刺' ? 1.2 : s.focus === '享受當下' ? 0.85 : 1;
  const Fx = Math.min(1.1, 1 + 0.02 * b.years) * (b.count > 1 ? 1.03 : 1);
  let pP = d.p[0] * Ip * Ep * Ff * Fx * (d.weak?.(g) ?? 1);
  let pL = d.p[2] * In * El;
  if (pP + pL > 0.9) { const k = 0.9 / (pP + pL); pP *= k; pL *= k; }
  const x = r();
  const W = g.W * b.scale * (b.half ? 0.5 : 1);
  let profit: number;
  if (x < pP) { profit = r.uni(d.win[0], d.win[1]) * W; b.profitStreak++; b.lossStreak = 0; }
  else if (x < pP + pL) { profit = r.uni(d.lose[0], d.lose[1]) * W; b.lossStreak++; b.profitStreak = 0; }
  else { profit = r.uni(d.flat[0], d.flat[1]) * W; }
  b.years++;
  b.lastProfit = Math.round(profit);
  if (b.profitStreak >= 2 && b.profitStreak % 2 === 0) b.scale = Math.min(3, b.scale * 1.1);
  if (b.lossStreak >= 2 && b.lossStreak % 2 === 0) b.scale = Math.max(0.5, b.scale * 0.9);
  // ② 收入 / 蝕錢
  if (profit >= 0) { s.flags['yearPay'] = Math.round(profit); s.lastSalary = Math.round(profit / 12); }
  else { payCost(g, -profit, '生意蝕錢'); g.add('J', -3, '生意蝕錢'); }
  g.tick(`${bizName(g, b.id)}今年${profit >= 50000 * g.P ? `賺咗 ${fmtMoney(profit)}` : profit >= 0 ? `只係賺到 ${fmtMoney(profit)}` : `蝕咗 ${fmtMoney(-profit)}`}。`);
  // ③ 還銀行貸款
  if (b.loan > 0 && b.loanYears > 0) {
    const principal = b.loan / b.loanYears;
    payCost(g, principal + b.loan * LOAN_RATE, '還創業貸款');
    b.loan = Math.max(0, b.loan - principal);
    b.loanYears--;
  }
  g.add('H', d.hp * 0.5, '做生意好忙');
  s.yearsWorked++;
  s.catExp['經理及行政級'] = (s.catExp['經理及行政級'] ?? 0) + 0.5;
  // ④ 倒閉
  const pClose = clamp(d.close * (1 + 0.5 * b.lossStreak) * El * Math.sqrt(In), 0, 0.8) * (b.lossStreak ? 1 : 0.4);
  if (r() < pClose || (profit < 0 && s.cash + s.deposit + s.index + s.stock <= 0)) {
    closeBiz(g, `${bizName(g, b.id)}捱唔住，執笠收場`);
    return;
  }
  // ⑤ 連續蝕兩年 → 問撐唔撐；連續賺 → 可能有人收購
  if (b.lossStreak === 2) g.pushCard(bizStruggleCard(g));
  else if (b.profitStreak >= 2 && r() < Math.min(0.15, d.acq * Mpos(s.K) * (1 + 0.2 * b.profitStreak) * (b.id === 'tech' ? 1 : 2))) g.pushCard(bizBuyoutCard(g, r));
}

function bizStruggleCard(g: Game): Card {
  const b = g.s.biz!;
  const add = Math.round(b.cap * 0.2);
  return mkCard('BIZ-STRUGGLE', '生意連蝕兩年', `${bizName(g, b.id)}已經連續蝕咗兩年，你點做？`, [
    { label: '繼續撐', note: '睇吓會唔會好轉' },
    { label: '結業', note: '止蝕，返去打工' },
    { label: '再注資', note: `再落 ${fmtMoney(add)}，規模大返啲`, money: -add },
  ], (g2, i) => {
    const bb = g2.s.biz;
    if (!bb) return '';
    if (i === 1) return closeBiz(g2, '你決定止蝕，結束盤生意');
    if (i === 2) { payCost(g2, add, '注資'); bb.scale = Math.min(3, bb.scale * 1.15); bb.lossStreak = 0; return '你再落咗一筆錢，希望可以起死回生。'; }
    return '你咬實牙關，繼續撐落去。';
  }, { pri: 860, def: 1, auto: 1, agui: 1, cat: '人生抉擇', scene: 'office' });
}

function bizBuyoutCard(g: Game, r: RNG): Card {
  const s = g.s;
  const b = s.biz!;
  const d = BIZ_BY_ID[b.id];
  const value = Math.round(d.val(r, d.turnover) * g.W * b.scale * (b.half ? 0.5 : 1) * (b.diluted ? 0.7 : 1));
  return mkCard('BIZ-BUYOUT', '有人想收購你盤生意', `有間大公司出價 ${fmtMoney(value)} 收購${bizName(g, b.id)}。`, [
    { label: '賣盤', note: `一筆過收 ${fmtMoney(value)}` },
    { label: '唔賣，繼續做' },
    { label: '賣一半股份', note: `收 ${fmtMoney(value / 2)}，之後利潤減半`, disabled: b.half ? '已經賣過一半' : undefined },
  ], (g2, i) => {
    const bb = g2.s.biz;
    if (!bb) return '';
    if (i === 0) { g2.ach('biz_exit'); g2.add('J', 8, '賣盤'); return closeBiz(g2, '你簽咗賣盤合約，', value); }
    if (i === 2) { g2.s.cash += value / 2; bb.half = true; g2.add('J', 4); return `你賣咗一半股份，收到 ${fmtMoney(value / 2)}。`; }
    return '你覺得盤生意仲有得做大。';
  }, { pri: 860, def: 1, auto: 0, agui: 0, cat: '人生抉擇', scene: 'office' });
}

/** 打工定創業：25–45 歲隨機一年（有本錢先會問） */
export const BIZ_EVENTS: EventDef[] = [
  {
    // v0.7：25–40 歲之間最少問一次（按 seed 抽一個歲數；嗰年唔啱就順延，40 歲一定問）；問過之後每年 6% 再有機會
    id: 'BIZ-OFFER', pri: 500, ages: [25, 45], once: false, cool: 3, fixed: true, cat: '人生抉擇',
    when: (g) => {
      const s = g.s;
      if (s.biz || s.status === 'retired' || s.flags['bankrupt']) return 0;
      if (!s.flags['bizAsked']) {
        if (s.biz0) return 0; // 自己喺花錢頁開過舖，當已經有過機會
        const due = streamRng(s.seed, 'bizask', 0).int(25, 38);
        if (s.age >= 40 && s.status !== 'study') return 1;
        return s.age >= due && (s.status === 'work' || s.status === 'unemp') ? 1 : 0;
      }
      if (s.biz0 || s.status !== 'work') return 0;
      return BIZ.some((d) => !bizBlock(g, d)) ? 0.06 : 0;
    },
    make: (g) => {
      const s = g.s;
      if (!s.flags['bizAsked']) g.flag('bizAsked', s.age);
      const r = streamRng(s.seed, 'bizoffer', s.age);
      // 夠錢開嘅排先；唔夠錢都照列出嚟，灰色寫明差幾多
      const ok = BIZ.filter((d) => !bizBlock(g, d));
      const no = BIZ.filter((d) => bizBlock(g, d) && !d.need?.(g));
      const pick: BizDef[] = [];
      while (pick.length < 3 && ok.length) pick.push(ok.splice(Math.floor(r() * ok.length), 1)[0]);
      no.sort((a, b) => a.cap - b.cap);
      while (pick.length < 3 && no.length) pick.push(no.shift()!);
      const work = s.status === 'work';
      return mkCard('BIZ-OFFER', '打工定創業？', `舊同學搵你一齊做生意，話而家係好時機。你想唔想自己做老闆？（自己出最少三成本錢，其餘借銀行，年息 7%）`, [
        { label: work ? '繼續打工' : '唔創業', note: work ? '穩定有人工' : '繼續搵工' },
        ...pick.map((d) => ({ label: `開${bizName(g, d.id)}`, disabled: bizBlock(g, d) ?? undefined, note: `本錢約 ${fmtMoney(g.p(d.cap))}${g.p(d.cap) > s.cash + s.deposit + s.index + s.stock ? `，要借銀行約 ${fmtMoney(g.p(d.cap) - (s.cash + s.deposit + s.index + s.stock))}` : ''}` })),
      ], (g2, i) => (i === 0 ? '你決定唔做生意，夢想留返第日先。' : startBiz(g2, pick[i - 1].id)), { pri: 500, def: 0, auto: 0, agui: 0, cat: '人生抉擇', scene: 'office' });
    },
  },
];
