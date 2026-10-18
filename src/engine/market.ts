// 經濟模型：1975–2025 用歷史表，2026 後按 seed 生成（第 7、8 章）
import { CPI_PI, WAGE_TABLE, R_IDX, HPI_D, rDepHist, rMortHist, unempHist } from '../data/economy';
import { clamp, interp } from './util';
import { streamRng } from './rng';

export const Y0 = 1960;
export const Y1 = 2160;

export interface YearEcon {
  pi: number; // 當年通脹
  P: number; // 物價指數（2026 = 1）
  W: number; // 工資比率（2026 = 1）
  ridx: number; // 指數總回報
  hpiD: number; // 樓價年變幅
  hpi: number; // 樓價指數（2026 = 1）
  rdep: number;
  rmort: number;
  u: number; // 失業率 %
  crisis?: boolean; // 2026 後金融危機年
  crash?: boolean; // 股災年（指數跌 ≥ 20%）
}

export class Market {
  years = new Map<number, YearEcon>();

  constructor(seed: number) {
    const r = streamRng(seed, 'market');
    const pi: Record<number, number> = {};
    for (let y = Y0; y <= Y1; y++) {
      if (y < 1975) pi[y] = 0.06;
      else if (y <= 2025) pi[y] = CPI_PI[y];
      else pi[y] = r.uni(0.02, 0.05);
    }
    // 物價指數
    const P: Record<number, number> = { 2026: 1 };
    for (let y = 2025; y >= Y0; y--) P[y] = P[y + 1] / (1 + pi[y + 1]);
    for (let y = 2027; y <= Y1; y++) P[y] = P[y - 1] * (1 + pi[y]);
    // 工資比率
    const W: Record<number, number> = {};
    for (let y = Y0; y <= 2026; y++) W[y] = y < 1975 ? 0.04 : interp(WAGE_TABLE, y);
    for (let y = 2027; y <= Y1; y++) W[y] = W[y - 1] * (1 + pi[y] + 0.005);

    // 未來：利率、失業、指數、樓價
    let rdep = 0.023;
    let u = 3.8;
    let crisisAfter = 0; // 危機後反彈狀態
    const out: Record<number, Partial<YearEcon>> = {};
    for (let y = Y0; y <= Y1; y++) {
      const e: Partial<YearEcon> = {};
      if (y <= 2026) {
        e.rdep = rDepHist(y);
        e.rmort = rMortHist(y);
        e.u = unempHist(y);
        e.ridx = R_IDX[y] ?? 0.07 + 0.15 * r.normal();
        e.hpiD = HPI_D[y] ?? (y >= 1985 ? 0.18 : 0.1);
      } else {
        rdep = clamp(rdep + 0.3 * (0.025 - rdep) + r.normal(0, 0.006), 0.001, 0.06);
        let shock = 0;
        let ridx: number;
        let hpiD = pi[y] + r.normal(0.01, 0.09);
        const crisis = r() < 0.03; // 新一輪金融危機（每年 3%，估算）
        if (crisis) {
          ridx = r.uni(-0.5, -0.3);
          shock = r.uni(2.5, 4);
          hpiD = -r.uni(0.15, 0.25);
          rdep = Math.max(0.001, rdep - 0.01);
          crisisAfter = 2;
          e.crisis = true;
        } else if (crisisAfter === 2) {
          ridx = r() < 0.6 ? r.uni(0.2, 0.5) : r.uni(-0.2, 0);
          shock = -1;
          crisisAfter = 1;
        } else {
          const uu = r();
          if (uu < 0.04) ridx = 0.07 - r.uni(0.4, 0.6);
          else if (uu < 0.07) ridx = 0.07 + r.uni(0.3, 0.5);
          else ridx = 0.07 + 0.2 * r.normal();
          if (crisisAfter === 1) { shock = -1; crisisAfter = 0; }
        }
        if (y >= 2040) hpiD -= 0.005;
        u = clamp(u + 0.3 * (3.5 - u) + r.normal(0, 0.4) + shock, 2, 12);
        e.ridx = clamp(ridx, -0.6, 1.2);
        e.hpiD = clamp(hpiD, -0.35, 0.3);
        e.rdep = rdep;
        e.rmort = Math.max(0.015, rdep + 0.013);
        e.u = u;
      }
      out[y] = e;
    }
    // 樓價指數：2026 = 1
    const hpi: Record<number, number> = { 2026: 1 };
    for (let y = 2025; y >= Y0; y--) hpi[y] = hpi[y + 1] / (1 + out[y + 1].hpiD!);
    for (let y = 2027; y <= Y1; y++) hpi[y] = hpi[y - 1] * (1 + out[y].hpiD!);

    for (let y = Y0; y <= Y1; y++) {
      const o = out[y];
      this.years.set(y, {
        pi: pi[y], P: P[y], W: W[y], ridx: o.ridx!, hpiD: o.hpiD!, hpi: hpi[y],
        rdep: o.rdep!, rmort: o.rmort!, u: o.u!, crisis: o.crisis, crash: o.ridx! <= -0.2,
      });
    }
  }

  get(y: number): YearEcon {
    return this.years.get(clamp(y, Y0, Y1))!;
  }
}
