// 遊戲核心：狀態 + 每年流程（第 3 章 3.2、第 4 章 4.4）
import { Market, type YearEcon } from './market';
import { rollOrigin, type Origin } from './origin';
import type { ParallelLife } from './parallel';
import { streamRng, type RNG } from './rng';
import { clamp, fmtMoney } from './util';
import type { State, StatKey, Cat, LogEntry } from './state';
import { settleYear, computeF, payCost, netWorth, liquidAssets, propEquity, petsYear } from './finance';
import { focusEffects, naturalChanges, panelEffects } from './yearly';
import { drawEvents } from './events';
import { capOptions, type Card } from './cards';
import { deathCheck } from './health';
import { scheduleQuizzes } from './quiz';
import { checkAchievementsYear } from './achievements';
import { updateFamilyYear, buyCard } from './family';
import { careerYear } from './career';
import { rollRewrites } from './history';

export interface YearStart { cards: Card[]; ticker: string[]; stageChange?: string; needFocus?: boolean }
export interface YearEnd { dead: boolean; summary: string; deltas: Record<StatKey, number>; saved: number }

export const P2026 = 1;

export class Game {
  s: State;
  m: Market;
  er!: RNG; // 今年事件隨機流
  ticker: string[] = [];
  queue: Card[] = [];
  interactiveUsed = 0;
  yearDeltas: Record<StatKey, number> = { H: 0, J: 0, K: 0, R: 0 };
  yearReasons: Partial<Record<StatKey, string>> = {};
  cashStart = 0;
  autoPick = false;
  parallel: ParallelLife[] | null = null; // 平行人生（開局後喺背景行好）
  parMinor = { y: -99 };

  constructor(seed: number, period: string | null = null, force?: { year: number; day: number }) {
    this.m = new Market(seed);
    const o = rollOrigin(seed, this.m, period, force);
    this.s = initState(seed, o, this.m);
    this.s.rewritten = rollRewrites(seed, o.birthYear, this.m);
    scheduleQuizzes(this);
    this.er = streamRng(seed, 'events', 0);
    computeF(this);
    this.snapshot();
  }

  // ---- 方便函數 ----
  get e(): YearEcon { return this.m.get(this.s.year); }
  get P(): number { return this.m.get(this.s.year).P; }
  get W(): number { return this.m.get(this.s.year).W; }
  econ(y: number) { return this.m.get(y); }

  add(k: StatKey, v: number, reason?: string) {
    if (!v) return;
    const before = this.s[k];
    this.s[k] = clamp(before + v, 0, 100);
    this.yearDeltas[k] += this.s[k] - before;
    if (reason && Math.abs(v) >= 1) this.yearReasons[k] = reason;
  }
  fx(d: Partial<Record<StatKey, number>>, reason?: string) {
    for (const k of Object.keys(d) as StatKey[]) this.add(k, d[k]!, reason);
  }
  log(text: string, cat?: Cat, big = false) {
    const e: LogEntry = { age: this.s.age, year: this.s.year, text, cat, big };
    this.s.log.push(e);
  }
  tick(text: string) { this.ticker.push(text); }
  ach(id: string) {
    if (!this.s.ach.includes(id)) { this.s.ach.push(id); this.s.achNew.push(id); }
  }
  flag(k: string, v: number | boolean | string = true) { this.s.flags[k] = v; }
  has(k: string) { return !!this.s.flags[k]; }
  cooldown(k: string, years: number) { this.s.cool[k] = this.s.age + years; }
  cooling(k: string) { return (this.s.cool[k] ?? -1) > this.s.age; }
  /** 扣錢（事件開支），唔夠就行缺口填補；返回描述 */
  spend(amount: number, why = ''): string { return payCost(this, Math.round(amount), why); }
  gain(amount: number) { this.s.cash += Math.round(amount); }
  money(n: number) { return fmtMoney(n); }
  /** 2026 價錢換算當年 */
  p(n: number) { return Math.round(n * this.P); }
  get adult() { return this.s.age >= 18; }
  get liquid() { return liquidAssets(this); }
  get net() { return netWorth(this); }
  income(): number { return this.s.incomeHist[this.s.incomeHist.length - 1] ?? 0; }
  monthlyIncome(): number { return this.s.job && this.s.status === 'work' ? this.s.job.salary : this.income() / 12; }
  householdSize(): number {
    const s = this.s;
    let n = 1;
    if (s.partner && s.married && s.partner.alive) n++;
    n += s.kids.filter((k) => k.age < 22 && !k.married).length;
    if (s.support === 'live') n += s.parents.filter((p) => p.alive).length;
    return n;
  }

  snapshot() {
    const s = this.s;
    s.hist.push({ age: s.age, year: s.year, H: s.H, J: s.J, K: s.K, R: s.R, F: s.F, net: netWorth(this), income: this.income(), P: this.P });
  }

  // ---- 每年流程 ----
  startYear(): YearStart {
    const s = this.s;
    this.ticker = [];
    this.queue = [];
    this.interactiveUsed = 0;
    this.yearDeltas = { H: 0, J: 0, K: 0, R: 0 };
    this.yearReasons = {};
    s.achNew = [];
    // ① 年齡 +1
    s.age += 1;
    s.year += 1;
    this.er = streamRng(s.seed, 'events', s.age);
    let stageChange: string | undefined;
    if (s.age === 6) { s.status = 'study'; s.focusStage = 'student'; stageChange = 'student'; }
    this.cashStart = s.cash + s.deposit;
    // ② 收支結算（包括事業、家庭年度更新）
    careerYear(this);
    updateFamilyYear(this);
    petsYear(this);
    settleYear(this);
    computeF(this);
    // ③ 焦點 + 花錢面板
    focusEffects(this);
    panelEffects(this);
    // ④ 自然變化
    naturalChanges(this);
    // ⑤ 抽事件
    drawEvents(this);
    // 花錢面板揀咗「想買樓」：之後兩年每年都有買樓選項
    const wantTill = Number(s.flags['wantHomeUntil'] ?? 0);
    if (wantTill && (s.prop || s.age > wantTill)) delete s.flags['wantHomeUntil'];
    else if (wantTill && s.age >= 18 && !s.saveForHome && !this.queue.some((c) => c.id === 'C-FM-03')) this.pushCard(buyCard(this));
    const needFocus = !!stageChange || (s.focus === null && s.age >= 6) || s.flags['needFocus'] === true;
    if (needFocus) { delete s.flags['needFocus']; stageChange = stageChange ?? s.focusStage; }
    return { cards: this.queue, ticker: this.ticker, stageChange, needFocus };
  }

  /** 玩家揀咗某張卡嘅選項 */
  choose(card: Card, idx: number): string {
    const opt = card.options[idx];
    const before = { ...this.yearDeltas };
    const text = card.run(this, idx) ?? '';
    const after = this.yearDeltas;
    card.resultDeltas = { H: after.H - before.H, J: after.J - before.J, K: after.K - before.K, R: after.R - before.R };
    if (card.kind !== 'quiz' && card.kind !== 'exam') {
      const label = opt ? `「${opt.label}」` : '';
      this.log(`${card.title}：${label}${text ? ' ' + text : ''}`, card.cat, card.kind !== 'system');
    } else if (text) this.log(`${card.title}：${text}`, card.cat);
    return text;
  }

  endYear(): YearEnd {
    const s = this.s;
    // ⑦ 死亡判定；未死就睇有冇破產（負債過多 → 強制結算）
    const dead = deathCheck(this) || bankruptCheck(this);
    // ⑧ 總結
    computeF(this);
    checkAchievementsYear(this);
    const saved = s.cash + s.deposit - this.cashStart;
    let summary = '';
    if (!dead) summary = buildSummary(this, saved);
    this.snapshot();
    return { dead, summary, deltas: { ...this.yearDeltas }, saved };
  }

  pushCard(c: Card, front = false) {
    c = capOptions(c, this.er);
    if (front) this.queue.unshift(c); else this.queue.push(c);
  }
}

/** 負債過多：第一次先彈「財困」卡（縮皮 / 債務重組 / 唔理）；有寬限期，寬限期後仍然資不抵債就破產，遊戲強制結算 */
export function debtOver(g: Game): number {
  const s = g.s;
  // 65 歲以上有綜援同長者津貼保障，唔會被入稟破產
  if (s.age < 18 || s.age >= 65 || s.flags['planner']) return 0;
  const debt = s.card + s.finco + s.privateLoan + (s.biz?.loan ?? 0);
  const minPay = s.card * 0.36 + s.finco / 3 + s.privateLoan / 5;
  const over = debt > 300000 * g.P && debt > liquidAssets(g) + propEquity(g) + 4 * Math.max(0, householdIncomeY(g)) && s.cash + s.deposit < minPay;
  return over ? debt : 0;
}
const householdIncomeY = (g: Game) => g.income() + (g.s.partner && g.s.married && g.s.partner.alive ? g.s.partner.income * 0.85 : 0);
function bankruptCheck(g: Game): boolean {
  const s = g.s;
  const debt = debtOver(g);
  if (!debt) {
    // 脫離財困兩年之後，下次再欠債會重新警告
    if (s.flags['debtWarned'] && s.age >= Number(s.flags['debtGrace'] ?? 0) + 2) delete s.flags['debtWarned'];
    return false;
  }
  const grace = Number(s.flags['debtGrace'] ?? 0);
  if (!s.flags['debtWarned']) {
    s.flags['debtWarned'] = true;
    s.flags['debtGrace'] = s.age + 1;
    g.flag('debtCardDue');
    g.log(`負債警告：你欠落 ${fmtMoney(debt)}，連最低還款都俾唔起。`, '財務衝擊', true);
    return false;
  }
  if (s.age < grace) return false;
  s.alive = false;
  s.flags['bankrupt'] = true;
  s.deathCause = '破產';
  s.deathKind = 'normal';
  g.log(`你欠落 ${fmtMoney(debt)}，債權人入稟，你被頒令破產。人生遊戲提早結算。`, '財務衝擊', true);
  return true;
}

function buildSummary(g: Game, saved: number): string {
  const s = g.s;
  const parts: string[] = [];
  const names: Record<StatKey, string> = { H: '健康', J: '快樂', K: '知識', R: '人際' };
  if (s.age >= 18 && s.status !== 'study') {
    parts.push(saved >= 0 ? `儲蓄 +${fmtMoney(saved)}` : `動用咗 ${fmtMoney(-saved)} 積蓄`);
  }
  const big = (Object.keys(g.yearDeltas) as StatKey[])
    .filter((k) => Math.abs(g.yearDeltas[k]) >= 1)
    .sort((a, b) => Math.abs(g.yearDeltas[b]) - Math.abs(g.yearDeltas[a]))
    .slice(0, 2)
    .map((k) => {
      const v = Math.round(g.yearDeltas[k]);
      const why = g.yearReasons[k];
      return `${names[k]} ${v > 0 ? '+' : ''}${v}${why ? `（${why}）` : ''}`;
    });
  parts.push(...big);
  return parts.length ? parts.join('。') + '。' : '平穩嘅一年。';
}

function initState(seed: number, o: Origin, m: Market): State {
  const W = m.get(o.birthYear).W;
  const parents = [
    { role: '父' as const, age: o.fatherAge, alive: o.father?.status !== '唔喺身邊' || true, working: o.father?.status === '工作', income: o.father?.income ?? 0, health: 60, needsCare: false, job: o.father?.job ?? '' },
    { role: '母' as const, age: o.motherAge, alive: true, working: o.mother?.status === '工作', income: o.mother?.income ?? 0, health: 62, needsCare: false, job: o.mother?.job ?? '' },
  ];
  if (o.isBaoyou && o.baoyouBranch !== '被領養') { parents[0].alive = false; parents[1].alive = false; }
  const homeMap: Record<string, State['home']> = { 公屋: 'public', 資助出售: 'own', 私樓自置: 'own', 私樓租住: 'rent', 劏房: 'subdiv', 村屋: 'village', 跨境: 'rent', 保幼局院舍: 'institution', 寄養家庭: 'public' };
  const ins0 = () => ({ level: 0 as const, a0: 0, s0: 0, p0: 1, age0: 0 });
  return {
    seed, name: o.name, gender: o.gender, birthYear: o.birthYear, origin: o,
    age: 0, year: o.birthYear, alive: true,
    H: o.H, J: o.J, K: o.K, R: o.R, F: 50,
    fParts: { E: 0, T: 0, P: 0, D: 0, L: 0, m: 0, r: 0, gap: 100, untilAge: 0 },
    FL: 0, IP: 0, CP: 0, GP: 0, GR: 0, HB: 0,
    focus: null, focusStage: 'child', focusYears: {},
    panel: [], panelStreak: {}, panelCool: {}, travelPick: '本地遊', givePick: '義工',
    edu: 0, overseas: false, study: null, tutoring: 0, hobbyClass: 0,
    quizAges: [], quizCorrect: 0, quizTotal: 0, quizTimeouts: 0, quizPerfectAll: true, seenQ: [],
    examCorrect: null, examTries: 0, piggy: 0, piggyMode: 1, movedSchoolNet: false,
    cash: 0, deposit: 0, index: 0, stock: 0, crypto: 0, plans: [],
    mpf: 0, mpfFund: '均衡', mpfMode: 'none', annuity: 0,
    card: 0, finco: 0, studentLoan: null, privateLoan: 0,
    investRatio: 0, alloc: { deposit: 0, plan: 0, index: 100, stock: 0, crypto: 0 },
    emergTarget: 0, lottery: 0, lotterySpent: 0, lotteryWon: 0, lotteryTickets: 0,
    ins: { med: ins0(), ci: ins0(), acc: ins0(), life: ins0() }, claims: 0, claimTotal: 0, insuredYears: 0,
    taxDue: 0, lastTaxable: 0, scamWatch: null,
    home: homeMap[o.housing] ?? 'rent', rentBase: 0, prop: null, publicWait: null, saveForHome: false, gba: false, reverseMortgage: 0,
    status: 'child', job: null, unempYears: 0, yearsWorked: 0, catExp: {},
    lastSalary: 0, retirePlan: 65, retiredAt: null, partTime: 0,
    incomeHist: [], earnReal: 0, maxIncomeReal: 0, homeContrib: 0, everEmployed: false, expatLeft: 0, aiSkill: false, overtime: false,
    partner: null, married: false, marriedAt: null, datingYears: 0, proposeAt: 0, proposeTries: 0,
    divorces: 0, widowed: false, kids: [], babyPlan: null, babyAskAge: 0, childcare: null,
    parents, support: null, supportedAtDeath: 0, parentsDeadBefore18: 0, siblings: o.siblings,
    diseases: [], mental: null, smoker: false, checkupUntil: 0, disabled: false, earlyDetect: false,
    flags: {
      familySavings: o.savings + 0, familyIncome: o.familyIncome, familyDebt: o.debt, familyEquity: o.propertyEquity,
      familyWBase: W,
    },
    cool: {}, once: [], tragedies: 0, childAdversity: 0,
    will: false, epa: false, emigrated: false,
    log: [], hist: [], ach: [], achNew: [],
    wonder: null, pendingFixed: [], pAvg: { P: [], E: [] }, netMinEver: 0, pets: [], budget: null, biz: null, biz0: 0, mpfGain: 0, investGain: 0, rewritten: [],
  };
}
