// v1.0 投資物業：除咗自住，可以再買樓收租（最多 3 層）
import type { Game } from './game';
import { fmtMoney } from './util';
import { streamRng } from './rng';

export interface Rental { price0: number; hpi0: number; mortgage: number; monthsLeft: number; pmt: number; boughtYear: number }

export const MAX_RENTALS = 3;
const LTV = 0.5; // 非自住物業按揭成數
const YIELD = 0.032; // 租金回報（毛）

/** 印花稅：辣招年代（2010–2023）額外重 */
const stampRate = (y: number) => (y >= 2013 && y < 2024 ? 0.15 : y >= 2010 && y < 2013 ? 0.085 : 0.0375);
const pmtOf = (L: number, r: number, n: number) => (r <= 0 ? L / n : (L * (r / 12)) / (1 - Math.pow(1 + r / 12, -n)));

export const rentalValue = (g: Game, r: Rental) => r.price0 * (g.e.hpi / r.hpi0);
export const rentalsEquity = (g: Game) => (g.s.rentals ?? []).reduce((a, r) => a + rentalValue(g, r) - r.mortgage, 0);
export const rentalMonthlyRent = (g: Game, r: Rental) => (rentalValue(g, r) * YIELD) / 12;

export function rentalQuote(g: Game) {
  const s = g.s;
  const price = Math.round(3_600_000 * g.e.hpi);
  const years = Math.max(10, Math.min(25, 70 - s.age));
  const loan = price * LTV;
  const stamp = price * stampRate(s.year);
  const upfront = price * (1 - LTV) + stamp + price * 0.015; // 首期 + 印花稅 + 佣金律師費
  const pmt = pmtOf(loan, g.e.rmort, years * 12);
  const rent = (price * YIELD) / 12;
  const liq = s.cash + s.deposit + s.index + s.stock;
  const income = s.job && s.status === 'work' ? s.job.salary : 0;
  let why: string | null = null;
  if (s.age < 21) why = '21 歲先可以買';
  else if ((s.rentals ?? []).length >= MAX_RENTALS) why = `最多 ${MAX_RENTALS} 層收租樓`;
  else if (s.flags['bankrupt']) why = '破產紀錄未清';
  else if (liq < upfront) why = `首期同使費要 ${fmtMoney(upfront)}`;
  else if (income + rent * 0.7 < pmt * 2) why = '入息唔夠，銀行唔批按揭';
  return { price, years, loan, stamp, upfront, pmt, rent, why };
}

export function buyRental(g: Game): string {
  const s = g.s;
  const q = rentalQuote(g);
  if (q.why) return q.why;
  g.spend(Math.round(q.upfront), '買收租樓');
  s.rentals = [...(s.rentals ?? []), { price0: q.price, hpi0: g.e.hpi, mortgage: q.loan, monthsLeft: q.years * 12, pmt: q.pmt, boughtYear: s.year }];
  g.log(`買咗一層收租樓，樓價 ${fmtMoney(q.price)}，每月供 ${fmtMoney(q.pmt)}，預計月租 ${fmtMoney(q.rent)}。`, '人生抉擇', true);
  return `買咗！每月供 ${fmtMoney(q.pmt)}，預計月租 ${fmtMoney(q.rent)}。`;
}

export function sellRental(g: Game, i: number): string {
  const s = g.s;
  const r = s.rentals?.[i];
  if (!r) return '';
  const v = rentalValue(g, r);
  const net = Math.round(v * 0.985 - r.mortgage);
  s.rentals = s.rentals!.filter((_, k) => k !== i);
  if (net >= 0) s.cash += net; else g.spend(-net, '賣樓補差價');
  g.log(`賣咗收租樓，成交 ${fmtMoney(v)}，還清按揭${net >= 0 ? `後袋 ${fmtMoney(net)}` : `仲要補 ${fmtMoney(-net)}`}。`, '人生抉擇', true);
  return net >= 0 ? `賣咗，袋 ${fmtMoney(net)}。` : `賣咗，但要補 ${fmtMoney(-net)}。`;
}

/** 每年收租同開支（喺 settleYear 計）：返回 [租金收入, 開支（供款 + 差餉管理費 + 物業稅 + 維修）] */
export function rentalYear(g: Game): [number, number] {
  const s = g.s;
  let rent = 0, cost = 0;
  for (const [k, r] of (s.rentals ?? []).entries()) {
    const v = rentalValue(g, r);
    const vacant = streamRng(s.seed, 'vacancy', s.age, k)() < 0.15 ? 2 : 0; // 間中吉咗兩個月
    const gross = (v * YIELD) * (12 - vacant) / 12;
    rent += gross;
    cost += v * 0.006 + gross * 0.12 + r.pmt * (r.monthsLeft > 0 ? Math.min(12, r.monthsLeft) : 0);
    // 攤還按揭
    const i = g.e.rmort / 12;
    for (let m = 0; m < 12 && r.monthsLeft > 0; m++) {
      r.mortgage = Math.max(0, r.mortgage - (r.pmt - r.mortgage * i));
      r.monthsLeft--;
    }
    if (r.monthsLeft > 0) r.pmt = pmtOf(r.mortgage, g.e.rmort, r.monthsLeft);
    else { r.mortgage = 0; r.pmt = 0; }
  }
  return [rent, cost];
}
