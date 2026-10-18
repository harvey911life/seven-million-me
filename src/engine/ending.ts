// 第 12 章 結局：家人壓力指數、退休成績表、蜘蛛網圖、人生排行榜十項計分
import type { Game } from './game';
import { clamp, interp } from './util';
import { liquidAssets, plansValue, kidCostYear, supportCostYear, propValue } from './finance';
import { ACH_BY_ID, SPECIAL_ACH, aRet } from './achievements';

export interface FPIResult { fpi: number; band: '低' | '中' | '高'; debtF: number; depF: number; gapRatio: number; lifePayout: number; text: string[] }
export interface RetireReport { aRet65: number | null; monthly65: number | null; M: number; grade: 'A' | 'B' | 'C' | 'D' | 'E'; comment: string; leftover: number }
export interface Spider { H: number; J: number; K: number; R: number; F: number }
export interface ScoreItem { key: string; name: string; v: number }
export interface Ending {
  age: number; cause: string; year: number;
  fpi: FPIResult; retire: RetireReport; spider: Spider; items: ScoreItem[]; wonder: number; total: number; nine: number;
  earnReal: number; achPts: number; knowledge: number; od: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 50);

// ---------- 家人壓力指數（12.4.4） ----------
export function computeFPI(g: Game): FPIResult {
  const s = g.s;
  const P = g.P;
  const p = s.married && s.partner?.alive ? s.partner : null;
  const lifeIns = s.ins.life;
  const lifePayout = s.ins.life.level && s.age <= 70 ? (lifeIns.level === 2 ? 8 : 3) * lifeIns.a0 * (P / lifeIns.p0) : 0;
  const accPayout = s.ins.acc.level && s.deathCause === '意外離世' ? 5 * s.ins.acc.a0 * (P / s.ins.acc.p0) : 0;
  const liquid = Math.max(0, liquidAssets(g));
  const mortgage = s.prop?.mortgage ?? 0;
  const personal = s.card + s.finco + s.privateLoan + (s.studentLoan?.bal ?? 0);
  const debtW = mortgage + 0.5 * personal;
  const spend = Math.max(Number(s.flags['lastExpense'] ?? 0), 1);
  const uncovered = Math.max(0, debtW - liquid - lifePayout - accPayout);
  const debtF = clamp(uncovered / Math.max(spend * 3, 1), 0, 1);
  // 受供養人
  const deps: { c: number; n: number; w: number }[] = [];
  const kids = s.kids.filter((k) => k.age < 22 && !k.away && !k.job);
  const kidC = kids.length ? kidCostYear(g) / kids.length : 0;
  for (const k of kids) deps.push({ c: kidC, n: 22 - k.age, w: k.age < 18 ? 1 : 0.5 });
  if (p && p.income < 100000 * g.W) deps.push({ c: spend * 0.35, n: clamp(85 - p.age, 3, 25), w: p.income <= 0 ? 1 : 0.5 });
  const supported = s.support ? s.parents.filter((x) => x.alive) : [];
  for (const x of supported) deps.push({ c: supportCostYear(g) / Math.max(1, supported.length), n: clamp(90 - x.age, 3, 15), w: 0.5 });
  const kidsAndOthers = deps.reduce((a, d) => a + d.c * d.n, 0);
  const longest = Math.max(0, ...deps.map((d) => d.n));
  const livingGap = Math.max(0, kidsAndOthers - (p ? p.income * 0.4 * longest : 0));
  const need = debtW + livingGap + 50000 * P;
  const res = liquid + s.mpf + lifePayout + accPayout;
  const gapRatio = need > 0 ? Math.max(0, need - res) / need : 0;
  const sumW = deps.reduce((a, d) => a + d.w, 0);
  const depF = clamp(sumW / 3, 0, 1) * (0.3 + 0.7 * gapRatio);
  const estate = (liquid + s.mpf + (s.prop ? propValue(g) - mortgage : 0)) / P;
  const heirs = (p ? 1 : 0) + s.kids.length;
  let willAdj = 0;
  if (s.will) willAdj = -8;
  else if (estate >= 1_000_000 && heirs >= 2) willAdj = 8;
  const incap = !!s.flags['incapStart'];
  const epaAdj = incap ? (s.epa ? -4 : 6) : 0;
  const fpi = clamp(40 * debtF + 25 * depF + 35 * gapRatio + willAdj + epaAdj, 0, 100);
  const band = fpi < 30 ? '低' : fpi <= 70 ? '中' : '高';
  const text: string[] = [];
  if (lifePayout > 0 && sumW > 0) text.push('你嘅人壽保險令家人可以繼續原本嘅生活。');
  if (lifePayout === 0 && sumW > 0) text.push('你冇買人壽，屋企人要自己頂起之後嘅開支。');
  if (debtF > 0.3) text.push('仲有一筆債要家人處理。');
  if (willAdj > 0) text.push('你冇立遺囑，屋企人為分遺產傷咗和氣。');
  if (willAdj < 0) text.push('你早已立好遺囑，家人唔使手忙腳亂。');
  if (!sumW && debtF === 0) text.push('冇人要靠你生活，你走得乾手淨腳。');
  return { fpi, band, debtF, depF, gapRatio, lifePayout, text };
}

// ---------- 退休成績表（12.6） ----------
export function retireReport(g: Game): RetireReport {
  const s = g.s;
  const P = g.P;
  const a65 = s.flags['aRet65'] !== undefined ? Number(s.flags['aRet65']) : null;
  let M: number;
  if (s.flags['brokeAt']) M = Number(s.flags['brokeAt']);
  else if (s.age < 60 && s.status !== 'retired') M = s.age;
  else {
    const exp = Number(s.flags['lastExpense'] ?? 0);
    const fixed = (s.annuity + s.reverseMortgage) * 12 + (s.age >= 70 ? 1700 * 12 * P : 0);
    const gapY = exp - fixed;
    const usable = Math.max(0, aRet(g));
    M = gapY <= 0 ? 100 : Math.min(100, s.age + Math.floor(usable / gapY));
  }
  const grade = M >= 95 ? 'A' : M >= 85 ? 'B' : M >= 75 ? 'C' : M > 65 ? 'D' : 'E';
  const comment = { A: '錢夠用到最後，仲有餘裕。', B: '大致夠用，長壽就要小心。', C: '退休頭十年過得去，之後要慳。', D: '退休冇幾耐就要靠人。', E: '未退休錢已經唔夠。' }[grade];
  return { aRet65: a65, monthly65: a65 !== null ? (Math.max(0, a65) * 0.041639) / 12 : null, M, grade, comment, leftover: liquidAssets(g) + s.mpf + plansValue(s) };
}

// ---------- 知識分（12.8.8） ----------
export function knowledgeScore(g: Game): number {
  const s = g.s;
  const quiz = s.quizTotal ? (s.quizCorrect / s.quizTotal) * 100 : 50;
  if (s.examCorrect === null) return quiz;
  let edu = [35, 35, 35, 50, 60, 80, 95][s.edu] ?? 35;
  if (s.edu === 5 && s.overseas) edu = 85;
  if (s.edu <= 1 && s.age >= 18) edu = 35;
  edu = Math.min(100, edu + Math.min(10, 3 * Number(s.flags['retrained'] ? 1 : 0)));
  if (s.study && s.study.years > 0) edu = Math.min(edu + 5 * s.study.years, 95);
  return 0.5 * edu + 0.3 * (s.examCorrect / 8) * 100 + 0.2 * quiz;
}

const EARN_TABLE: [number, number][] = [[0, 0], [3_500_000, 10], [6_500_000, 25], [10_500_000, 50], [17_000_000, 75], [28_000_000, 90], [40_000_000, 95], [90_000_000, 99], [200_000_000, 100]];
function earnScore(earn: number, age: number, minor: boolean): number {
  if (minor) return 50;
  if (earn <= 0) return 0;
  return interp(EARN_TABLE, earn);
  void age;
}

export function spiderOf(g: Game): Spider {
  const s = g.s;
  const h = s.hist;
  const fN = Number(s.flags['fN'] ?? 0);
  return {
    H: avg(h.map((x) => x.H)),
    J: avg(h.map((x) => x.J)),
    K: knowledgeScore(g),
    R: avg(h.map((x) => x.R)),
    F: fN ? Number(s.flags['fSum']) / fN : avg(h.filter((x) => x.age >= 18).map((x) => x.F)),
  };
}

/** 結局計分；agui 係同一個 seed 嘅阿規人生（可選） */
export function computeEnding(g: Game, agui?: Ending): Ending {
  const s = g.s;
  const minor = s.age < 18;
  const fpi = computeFPI(g);
  const ret = retireReport(g);
  const sp = spiderOf(g);
  // 1. 理財
  let Rr: number;
  if (minor) Rr = 50;
  else if (s.status === 'retired' || s.age >= 65) Rr = clamp((ret.M - 65) / 30, 0, 1) * 100;
  else Rr = s.fParts.T;
  const Pbar = s.pAvg.P.length ? avg(s.pAvg.P) : 50;
  const Ebar = s.pAvg.E.length ? avg(s.pAvg.E) : 50;
  const fin = 0.5 * Rr + 0.3 * Pbar + 0.2 * Ebar;
  // 4. 健康
  const life = clamp((s.age - 40) / 55, 0, 1) * 100;
  const health = 0.6 * sp.H + 0.4 * life;
  // 5. 賺錢
  const earn = earnScore(s.earnReal, s.age, minor);
  // 6. 成就
  const achPts = s.ach.filter((id) => !SPECIAL_ACH.has(id)).reduce((a, id) => a + (ACH_BY_ID[id]?.pts ?? 0), 0);
  const achScore = Math.min(100, (achPts / 25) * 100);
  // 8. 身後安排
  const after = minor ? 50 : fpi.band === '低' ? 100 : fpi.band === '中' ? 50 : 15;
  // 9. 逆境翻身
  const od = clamp(s.origin.difficulty + Math.min(20, s.childAdversity * 10), 0, 100);
  const os = (fin + earn + sp.K + sp.J) / 4;
  const comeback = clamp(os * (0.5 + od / 100), 0, 100);
  // 10. 回饋社會
  const target = minor ? 60 * clamp((s.age - 15) / 60, 0.1, 1) : 60;
  const give = clamp(s.GP / target, 0, 1) * 100;
  const items: ScoreItem[] = [
    { key: 'fin', name: '理財', v: fin },
    { key: 'J', name: '幸福度', v: sp.J },
    { key: 'R', name: '人際', v: sp.R },
    { key: 'H', name: '健康', v: health },
    { key: 'earn', name: '賺錢', v: earn },
    { key: 'ach', name: '成就', v: achScore },
    { key: 'K', name: '知識', v: sp.K },
    { key: 'after', name: '身後安排', v: after },
    { key: 'comeback', name: '逆境翻身', v: comeback },
    { key: 'give', name: '回饋社會', v: give },
  ];
  const wonder = s.wonder ? 20 : 0;
  const sum = items.reduce((a, b) => a + b.v, 0);
  const nine = sum - achScore;
  const e: Ending = {
    age: s.age, cause: s.deathCause ?? '', year: s.year, fpi, retire: ret, spider: sp, items, wonder,
    total: Math.round(sum + wonder), nine, earnReal: s.earnReal, achPts, knowledge: sp.K, od,
  };
  return e;
}

/** 結局時先判定嘅成就；返回新解鎖 */
export function endAchievements(g: Game, e: Ending, agui?: Ending): string[] {
  const s = g.s;
  const before = new Set(s.ach);
  if (s.status === 'retired' && !s.flags['brokeAt'] && liquidAssets(g) > 0) g.ach('enough_forever');
  if (s.retiredAt !== null && s.retiredAt <= 54 && e.retire.M >= s.age) g.ach('early_retire');
  if (s.age >= 18 && !s.flags['invested'] && (s.mpfFund === '保守' || !s.flags['hadMpf'])) g.ach('miser');
  if (s.insuredYears >= 10 && s.claims === 0) g.ach('peace_whole_life');
  if (e.fpi.band === '低' && s.age >= 18) g.ach('family_at_ease');
  const jm = Number(s.flags['jMarN'] ?? 0);
  if (s.kids.length && jm && Number(s.flags['jMarSum']) / jm >= 80) g.ach('happy_family');
  if (s.marriedAt === null && !s.divorces && !s.widowed && s.age >= 40 && e.spider.J > 70) g.ach('happy_single');
  const sp = e.spider;
  if (sp.H > 70 && sp.J > 70 && sp.K > 70 && sp.R > 70 && sp.F > 70) g.ach('pentagon');
  if (agui && e.nine > agui.nine) g.ach('beat_agui');
  return s.ach.filter((id) => !before.has(id));
}

/** 蜘蛛網圖總評句（12.7.3） */
export function spiderLine(me: Spider, ag: Spider): string {
  const N: Record<keyof Spider, string> = { H: '健康', J: '快樂', K: '知識', R: '人際', F: '財務健康' };
  const ks = Object.keys(N) as (keyof Spider)[];
  const d = ks.map((k) => ({ k, d: me[k] - ag[k], r: me[k] / Math.max(ag[k], 1) }));
  const best = d.reduce((a, b) => (b.d > a.d ? b : a));
  const worst = d.reduce((a, b) => (b.d < a.d ? b : a));
  if (d.every((x) => Math.abs(x.d) < 5)) return '你同阿規幾乎一樣，原來你都係一個有規劃嘅人。';
  if (best.d >= 5 && worst.d <= -5) {
    const r = worst.r;
    const w = r < 0.35 ? '三成' : r < 0.45 ? '四成' : r < 0.55 ? '一半' : r < 0.65 ? '六成' : r < 0.75 ? '七成' : r < 0.85 ? '八成' : '九成';
    return `你嘅${N[best.k]}比阿規高，但${N[worst.k]}只有佢${w}。`;
  }
  if (d.every((x) => x.d >= -5)) return `你喺每一方面都唔輸阿規，${N[best.k]}仲贏佢 ${Math.round(best.d)} 分。`;
  return `阿規喺每一方面都贏你少少，最大分別係${N[worst.k]}。`;
}
