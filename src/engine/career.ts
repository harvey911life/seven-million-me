// 第 7 章 職業同收入：搵工、加薪、升職、裁員、失業、退休
import type { Game } from './game';
import { JOBS, JOB_BY_ID, capOf, jobDisplayName, industryFactor, LEVEL_NAME, type Job } from '../data/jobs';
import { clamp, Mneg, Mpos, fmtMoney } from './util';
import { streamRng, type RNG } from './rng';
import { mkCard, firstEnabled, type Card, type EventDef } from './cards';
import { studyYear } from './education';
import { insActive, premiumOf } from './finance';
import { bizYear } from './biz';

export const jobOf = (g: Game) => (g.s.job ? JOB_BY_ID[g.s.job.id] : null);
export const jobName = (g: Game, id: string) => jobDisplayName(JOB_BY_ID[id], g.s.year);

// ---------- 搵工 ----------
export function eduOk(g: Game, j: Job, entry = true): boolean {
  const s = g.s;
  if (j.promoteOnly && entry) return false;
  if (s.edu < j.minEdu) return false;
  if (j.majors || j.tracks) {
    const okM = !!(j.majors && s.major && s.edu >= 5 && j.majors.includes(s.major));
    const okT = !!(j.tracks && s.track && j.tracks.includes(s.track));
    if (!okM && !okT) return false;
  }
  if (j.id === 'J22' && s.IP < 2 && s.track !== '設計') return false;
  if (j.minK && s.K < j.minK) return false;
  if (j.minH && s.H < j.minH) return false;
  if (j.minAge && s.age < j.minAge) return false;
  if (entry && j.maxAgeEntry && s.age > j.maxAgeEntry) return false;
  if (j.needIP && s.IP < j.needIP) return false;
  if (s.disabled && j.hours <= -1.5) return false;
  return true;
}

function fEdu(g: Game, j: Job): number {
  const s = g.s;
  if (s.edu >= 6) return 1.15;
  if (s.overseas && s.edu >= 5) return 1.15;
  return s.edu > j.minEdu ? 1.1 : 1;
}

export function pHire(g: Game, j: Job, newCat = false): number {
  const s = g.s;
  const fk = 0.6 + (0.8 * s.K) / 100;
  const sales = ['J18', 'J19', 'J30', 'J44'].includes(j.id);
  const fi = clamp(Math.pow(Mpos(s.R), sales ? 1.5 : 1), 0.25, 3);
  const fInd = clamp(fk * fi, 0.25, 3);
  const fu = Math.pow(3.8 / Math.max(1, g.e.u), 0.7);
  const a = s.age;
  const fa = a < 40 ? 1 : a < 50 ? 0.85 : a < 60 ? 0.65 : 0.45;
  const exp = s.catExp[j.cat] ?? 0;
  const fx = exp >= 3 ? 1.2 : newCat && s.CP < 2 ? 0.6 : 1;
  const ff = s.focus === '事業衝刺' ? 1.15 : s.focus === '增值進修' ? 1.1 : 1;
  return clamp(j.bhire * fEdu(g, j) * fInd * fu * fa * fx * ff * (s.flags['summerJob'] ? 1.1 : 1), 0.03, 0.95);
}

export function startSalary(g: Game, j: Job, level = 1, r: RNG): number {
  const s = g.s;
  let f = 1;
  if (s.edu >= 6) f = 1.08;
  else if (s.overseas && s.edu >= 5) f = 1.05;
  else if (s.edu > j.minEdu && j.minEdu >= 2) f = 1.05;
  if (s.edu === 3 && j.tracks && s.track && j.tracks.includes(s.track)) f = 1.08;
  const L = [0, 1, 1.25, 1.6, 2.2][level];
  let sal = j.start * g.W * f * L * r.uni(0.92, 1.08);
  if (s.focus === '事業衝刺') sal *= 1.03;
  sal = Math.min(sal, capOf(j, level) * g.W);
  if (level === 1) sal = Math.min(sal, entryCap(g, j) * g.W);
  return Math.max(Math.round(sal), minMonthly(g));
}

/** 入職起薪上限（2026 年幣值）：中學或以下 $15,000；職業 / 副學位 $20,000；學士 / 碩士 $32,000；醫生、藥劑師除外 */
export function entryCap(g: Game, j: Job): number {
  const e = g.s.edu;
  if (e <= 2) return 15000;
  if (e <= 4) return 20000;
  if (j.majors?.some((m) => m === '醫科' || m === '藥劑')) return Infinity;
  return 32000;
}

export function minMonthly(g: Game): number {
  const y = g.s.year;
  if (y < 2011) return 0;
  const h = y >= 2026 ? 43.1 * g.P : y >= 2025 ? 42.1 : y >= 2023 ? 40 : y >= 2019 ? 37.5 : y >= 2017 ? 34.5 : y >= 2015 ? 32.5 : y >= 2013 ? 30 : 28;
  return Math.round(h * 190);
}

export function setJob(g: Game, id: string, salary: number, level = 1, firstType?: 'hard' | 'promo' | 'ontime') {
  const s = g.s;
  const prevCat = s.job ? JOB_BY_ID[s.job.id].cat : null;
  s.job = { id, level, salary, years: 0, levelYears: 0, firstType, firstYears: 0, hopCool: 0, promoBoost: 1, promoBoostYears: 0 };
  s.status = 'work';
  s.unempYears = 0;
  if (!s.everEmployed) {
    s.everEmployed = true;
    g.ach('first_salary');
    if (s.focusStage !== 'work') { s.focusStage = 'work'; g.flag('needFocus'); }
    scheduleYoungAdult(g);
  }
  const cat = JOB_BY_ID[id].cat;
  if (prevCat && prevCat !== cat) {
    g.flag('switchAt', s.age);
    g.flag('switchCat', cat);
  }
}

/** 入職之後嘅問題（強積金、保險、交家用、學貸、搬出去住）分散喺 18–25 歲唔同年份隨機出現，每年最多一條 */
export const YA_KEYS = ['ya_mpf', 'ya_ins', 'ya_home', 'ya_loan', 'ya_move'] as const;
function scheduleYoungAdult(g: Game) {
  const s = g.s;
  const r = streamRng(s.seed, 'ya', s.age);
  const from = Math.max(18, s.age + 1);
  const slots: number[] = [];
  for (let a = from; a <= Math.max(25, from + YA_KEYS.length - 1); a++) slots.push(a);
  const pick = [...slots];
  for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
  YA_KEYS.forEach((k, i) => { s.flags[k] = pick[i]; });
}
export const yaDue = (g: Game, k: (typeof YA_KEYS)[number]) => g.s.flags[k] === undefined || g.s.age >= Number(g.s.flags[k]);

/** 揀出可以申請、並且擲中 P_hire 嘅職業 */
function tryJobs(g: Game, pool: Job[], r: RNG, tries = 3, newCat = false): Job | null {
  for (let t = 0; t < tries && pool.length; t++) {
    const j = r.pick(pool);
    if (r() < pHire(g, j, newCat)) return j;
  }
  return null;
}

const FALLBACK = ['J25', 'J29', 'J30', 'J40'];

export function firstJobCard(g: Game): Card {
  const s = g.s;
  const r = streamRng(s.seed, 'firstjob', s.age);
  const cands = JOBS.filter((j) => eduOk(g, j));
  const by = (f: (j: Job) => number) => [...cands].sort((a, b) => f(b) - f(a));
  const top = (arr: Job[]) => arr.slice(0, Math.max(1, Math.ceil(arr.length * 0.25)));
  const fb = () => JOB_BY_ID[r.pick(FALLBACK.filter((id) => eduOk(g, JOB_BY_ID[id])).concat(['J40']))];
  const A = tryJobs(g, top(by((j) => j.start)), r) ?? fb();
  const B = tryJobs(g, top(by((j) => j.promo)), r) ?? fb();
  const C = tryJobs(g, cands.filter((j) => j.hours >= -0.5), r) ?? fb();
  const picks: [Job, 'hard' | 'promo' | 'ontime', number][] = [
    [A, 'hard', Math.round(Math.min(startSalary(g, A, 1, r) * 1.12, Math.max(entryCap(g, A) * g.W, minMonthly(g))))],
    [B, 'promo', startSalary(g, B, 1, r)],
    [C, 'ontime', startSalary(g, C, 1, r)],
  ];
  const names = ['人工高但辛苦', '有晉升前途', '準時放工'];
  const allFb = [A, B, C].every((j) => FALLBACK.includes(j.id));
  const fi = Mpos(s.R);
  const reason = allFb ? '今年搵工好難，暫時只搵到呢幾份。' : fi >= 1.4 ? '因為你嘅人脈廣，老同學介紹你入工。' : 0.6 + (0.8 * s.K) / 100 >= 1.25 ? '面試官對你嘅知識印象深刻。' : g.e.u >= 5.5 ? '今年經濟差，好多公司凍結請人。' : '畢業後你寄出咗幾十份履歷。';
  return mkCard('C-YA-01', '第一份工', '你終於要出嚟社會做嘢。有三份工請你，你揀邊份？', picks.map(([j, , sal], i) => ({
    label: `${names[i]}：${jobDisplayName(j, s.year)}`,
    note: `月薪 ${fmtMoney(sal)}`,
    fx: i === 0 ? { H: -2 } : i === 2 ? { J: 2 } : {},
  })), (g2, i) => {
    const [j, type, sal] = picks[i];
    setJob(g2, j.id, sal, 1, type);
    if (type === 'hard') g2.add('H', -2, '工作辛苦');
    if (type === 'ontime') g2.add('J', 2);
    // 強積金同保險唔再即刻問，分散喺之後幾年（scheduleYoungAdult）
    return `你成為咗${jobDisplayName(j, g2.s.year)}，第一份人工 ${fmtMoney(sal)}。`;
  }, { pri: 870, def: 1, auto: 1, agui: 1, reason, scene: 'office' });
}

// ---------- 理財關口：保險同 MPF（系統停頓） ----------
export function insuranceGateCard(g: Game, why: 'first' | 'marry' | 'baby' | 'age40' | 'retire'): Card {
  const s = g.s;
  const T: Record<string, [string, string]> = {
    first: ['第一份保險', '有咗第一份人工，你諗緊要唔要買保險（醫療、危疾、意外、人壽）。之後隨時可以喺「理財」入面逐項調。'],
    marry: ['人生關口：結婚', '結咗婚，責任多咗。要唔要檢討吓保障？'],
    baby: ['人生關口：生仔', '有咗 BB，你諗到如果自己有咩事……'],
    age40: ['人生關口：40 歲', '40 歲，保費開始貴，身體亦開始有啲小毛病。'],
    retire: ['退休後保費', '退休冇咗人工，但保費會隨年齡越嚟越貴。'],
  };
  const [title, text] = T[why];
  const deps = (s.married && s.partner?.alive) || s.kids.some((k) => k.age < 22) || !!s.support || !!(s.prop && s.prop.mortgage > 0);
  const opts = why === 'first'
    ? [{ label: '暫時唔買' }, { label: '基本保障', note: '醫療、危疾、意外各一份基本' }, { label: '充足保障', note: '醫療、危疾充足，意外基本' }]
    : why === 'retire'
      ? [{ label: '繼續交' }, { label: '減保', note: '每種降一級' }, { label: '停保', note: '之後有病全部自己頂' }]
      : [{ label: '加保', note: '每種升一級（用而家年齡計保費）' }, { label: '維持' }, { label: '減保慳錢', note: '每種降一級' }];
  const apply = (g2: Game, i: number) => {
    const kinds = ['med', 'ci', 'acc', 'life'] as const;
    if (why === 'first') {
      if (i === 1) { for (const k of ['med', 'ci', 'acc'] as const) setInsQuick(g2, k, 1); if (deps) setInsQuick(g2, 'life', 1); }
      if (i === 2) { setInsQuick(g2, 'med', 2); setInsQuick(g2, 'ci', 2); setInsQuick(g2, 'acc', 1); if (deps) setInsQuick(g2, 'life', 1); }
    } else if (why === 'retire') {
      for (const k of kinds) if (i === 1) setInsQuick(g2, k, Math.max(0, g2.s.ins[k].level - 1) as 0 | 1 | 2); else if (i === 2) setInsQuick(g2, k, 0);
    } else {
      for (const k of kinds) {
        if (k === 'life' && !deps) continue;
        if (i === 0) setInsQuick(g2, k, Math.min(2, g2.s.ins[k].level + 1) as 0 | 1 | 2);
        if (i === 2) setInsQuick(g2, k, Math.max(0, g2.s.ins[k].level - 1) as 0 | 1 | 2);
      }
    }
  };
  // v0.7：每個選項顯示之後每年保費（試算完還原）
  const yearly = (i: number) => {
    const keep = { ins: JSON.parse(JSON.stringify(s.ins)), ach: [...s.ach], achNew: [...s.achNew] };
    apply(g, i);
    const t = (['med', 'ci', 'acc', 'life'] as const).reduce((a, k) => a + premiumOf(g, k), 0);
    s.ins = keep.ins; s.ach = keep.ach; s.achNew = keep.achNew;
    return t;
  };
  opts.forEach((o: { label: string; note?: string }, i) => { const t = yearly(i); o.note = `${o.note ? o.note + '；' : ''}每年保費約 ${fmtMoney(t)}`; });
  const run = (g2: Game, i: number) => {
    const kinds = ['med', 'ci', 'acc', 'life'] as const;
    apply(g2, i);
    if (kinds.every((k) => g2.s.ins[k].level === 2)) g2.ach('full_armor');
    if (g2.s.age < 25 && kinds.every((k) => g2.s.ins[k].level >= 1)) g2.ach('buy_early');
  };
  // 自動揀：保費 ≤ 收入 12% 先買基本
  const Y = Math.max(1, g.income() || g.monthlyIncome() * 12);
  const auto = why === 'first' ? (Y > 0 ? 1 : 0) : why === 'retire' ? (Number(s.flags['lastExpense'] ?? 0) * 0.25 < premiumEstimate(g) ? 1 : 0) : (s.F >= 50 ? 0 : 1);
  const agui = why === 'first' ? (g.s.age >= 25 ? 1 : 0) : why === 'retire' ? 1 : why === 'marry' || why === 'baby' ? 0 : 1;
  return mkCard(`INS-${why}`, title, text, opts, run, { kind: 'system', pri: 880, def: why === 'first' ? 0 : why === 'retire' ? 0 : 1, auto, agui, scene: 'bank' });
}

function premiumEstimate(g: Game) {
  return (g.s.flags['lastPremium'] as number) ?? 0;
}

function setInsQuick(g: Game, k: 'med' | 'ci' | 'acc' | 'life', level: 0 | 1 | 2) {
  // 動態 import 會令打包變複雜，直接寫喺度
  const s = g.s;
  const cur = s.ins[k];
  if (level === cur.level) return;
  if (level === 0) { s.ins[k] = { level: 0, a0: 0, s0: 0, p0: 1, age0: 0 }; return; }
  if (level > cur.level) {
    const ci = s.diseases.some((d) => ['cancer', 'stroke', 'heart', 'kidney'].includes(d.kind));
    const maxAge = { med: 80, ci: 65, acc: 70, life: 65 }[k];
    if (s.age > maxAge || (k === 'ci' && ci) || (k === 'acc' && s.disabled) || (k === 'life' && ci)) { g.ach('uninsurable'); return; }
  }
  if (cur.level && level < cur.level) { s.ins[k] = { ...cur, level }; return; }
  const h = s.incomeHist.slice(-1)[0] ?? 0;
  const s0 = s.status === 'work' && s.job ? s.job.salary : h > 0 ? h / 12 : 23600 * g.W * 0.6;
  s.ins[k] = { level, s0, a0: s0 * 12, p0: g.P, age0: s.age };
}

export function mpfCard(g: Game): Card {
  return mkCard('C-YA-05', '強積金基金', '公司寄咗強積金基金選擇表嚟：你同老闆每月各供人工 5%，暫時放喺預設嘅均衡基金。你想揀邊種？（遊戲模擬，不構成投資建議）', [
    { label: '保守', note: '穩陣，長期追唔上通脹' },
    { label: '均衡', note: '股債各半，有升有跌' },
    { label: '增長', note: '波幅大，長線回報較高' },
  ], (g2, i) => {
    g2.s.mpfFund = (['保守', '均衡', '增長'] as const)[i];
    if (i === 0) g2.flag('mpfConservativeEver');
  }, { kind: 'system', pri: 879, def: 1, auto: g.s.age < 50 ? 2 : 1, agui: g.s.age < 50 ? 2 : g.s.age < 60 ? 1 : 0, scene: 'bank' });
}

// ---------- 每年事業結算 ----------
export function careerYear(g: Game) {
  const s = g.s;
  const r = streamRng(s.seed, 'career', s.age);
  s.flags['yearPay'] = 0;
  s.flags['yearBonus'] = 0;
  if (s.status === 'study') { studyYear(g); return; }
  if (s.status === 'child' || s.status === 'retired') return;
  if (s.flags['mpfPending'] && s.year >= 2001 && s.status === 'work') { delete s.flags['mpfPending']; g.pushCard(mpfCard(g)); }

  // 進修中（被裁後進修轉行 / 創業前進修）：今年冇收入
  if (s.flags['retrainYear'] === s.year) { s.status = 'unemp'; return; }

  if (s.status === 'biz' && s.biz) { bizYear(g); return; }
  if (s.status === 'unemp') { unempYear(g, r); return; }
  const job = s.job!;
  const j = JOB_BY_ID[job.id];
  const e = g.e;
  // ① 今年收入
  let months = 12;
  let pay = 0;
  const mult = (s.overtime ? 1.1 : 1) * (s.expatLeft > 0 ? 1.4 : 1) * emigrantMult(g) * (s.disabled ? 0.5 : 1) * (s.diseases.some((d) => d.kind === 'kidney' && d.status !== 'remission') ? 0.7 : 1) * (s.flags['gbaJob'] ? 1.1 : 1);
  if (j.commission) {
    const LF = [0, 0.6, 0.85, 1.15, 1.5][job.level];
    const mkt = job.id === 'J18' ? 0.8 * e.hpiD : job.id === 'J19' ? 0.5 * e.ridx : 0;
    const mu = 0.4 * Math.log(Mpos(s.R)) + 0.2 * Math.log(Mpos(s.K)) + mkt;
    pay = Math.max(Math.min(12 * j.median * g.W * LF * Math.exp(r.normal(mu, 0.35)), 12 * j.top * g.W), minMonthly(g) * 12 || 8000 * g.W * 12);
    job.salary = Math.round(pay / 12);
  } else pay = job.salary * 12;
  // 病假 / 停工
  const offM = Number(s.flags['offMonths'] ?? 0);
  if (offM > 0) {
    months = Math.max(0, 12 - offM);
    delete s.flags['offMonths'];
  }
  // ② 裁員 / AI / 辭職
  const laid = layoffRoll(g, r);
  if (laid) {
    const m = r.int(2, 11);
    months = Math.min(months, m);
    pay = pay * months / 12;
    const sev = severance(g);
    s.cash += sev;
    s.status = 'unemp';
    s.lastSalary = job.salary;
    g.flag('laidOffYear', s.year);
    const lm = Number(s.flags['lastNeed'] ?? 1) / 12;
    const mo = (s.cash + s.deposit) / Math.max(1, lm);
    if (mo >= 6) { g.add('J', -2.5, '被裁'); g.ach('layoff_ready'); }
    else if (mo < 1) { g.add('J', -12, '被裁，冇乜積蓄'); }
    else g.add('J', -5, '被裁');
    g.tick(`${laid}${sev > 0 ? `，收到遣散費 ${fmtMoney(sev)}` : ''}。`);
    g.pushCard(laidOffCard(g, laid));
    s.flags['yearPay'] = Math.round(pay * mult);
    return;
  }
  if (s.age >= 18 && r() < 0.02 * Math.pow(Mneg(s.J), 1.5) * (s.mental ? 1.5 : 1) && s.age < 60) {
    pay = pay * r.int(3, 10) / 12;
    s.status = 'unemp';
    s.lastSalary = job.salary;
    g.tick('你頂唔順，遞咗信辭職。');
    s.flags['yearPay'] = Math.round(pay * mult);
    return;
  }
  pay = pay * months / 12;
  // ③ 花紅
  let bonusM = 0;
  const recession = e.u >= 5;
  if (job.id === 'J14') bonusM = clamp(3 * (1 + e.ridx) * Mpos(s.K), 0, 6);
  else if (j.civil) bonusM = 0;
  else if (j.cat === '經理及行政級' || j.cat === '專業人員') bonusM = recession ? r.uni(0, 1) : r.uni(1, 2);
  else bonusM = r() < 0.5 ? 1 : 0;
  const bonus = j.commission ? 0 : job.salary * bonusM * months / 12;
  s.flags['yearPay'] = Math.round(pay * mult);
  s.flags['yearBonus'] = Math.round(bonus * mult);
  s.lastSalary = job.salary;
  if (s.expatLeft > 0) { s.expatLeft--; g.add('R', s.married ? -3 : -2, '外派'); if (s.expatLeft === 0) { g.tick('外派完咗，你返到香港。'); job.promoBoost = 1.3; job.promoBoostYears = 2; } }
  if (s.flags['gbaJob']) { s.flags['gbaYears'] = Number(s.flags['gbaYears'] ?? 0) + 1; g.add('R', -2); if (Number(s.flags['gbaYears']) >= 5) g.ach('gba_5y'); }
  if (s.flags['gbaCommute']) { g.add('H', -1); g.add('J', -1); g.add('R', -1); s.flags['gbaYears'] = Number(s.flags['gbaYears'] ?? 0) + 1; if (Number(s.flags['gbaYears']) >= 5) g.ach('gba_5y'); }

  // ④ 年資、經驗
  job.years++;
  job.levelYears++;
  job.firstYears++;
  if (job.hopCool > 0) job.hopCool--;
  s.yearsWorked++;
  s.catExp[j.cat] = (s.catExp[j.cat] ?? 0) + 1;
  if (s.flags['switchAt'] && Number(s.flags['switchAt']) >= 40 && job.years >= 2) g.ach('lifelong_learner');
  const realY = (pay + bonus) / g.P;
  if (realY >= 1_000_000) { g.ach('million_salary'); if (s.edu < 5) g.ach('self_made'); }

  // ⑤ 加薪：每年 0%–2.5% 隨機（經濟差嗰年凍薪），唔超過職級上限
  if (!j.commission) {
    // 通脹高過 2.5% 嗰啲年（例如九十年代）先額外追返通脹，其餘年份都係 0%–2.5%
    let nom = recession ? 0 : r.uni(0, 0.025) + Math.max(0, e.pi - 0.025);
    if (s.age >= 60 && s.retirePlan === 99) nom = 0;
    if (s.flags['foreignLabour'] && Number(s.flags['foreignLabour']) >= s.year) nom = Math.min(nom, 0.01);
    const cap = Math.max(job.salary, capOf(j, job.level) * g.W);
    job.salary = Math.max(minMonthly(g), Math.round(Math.min(job.salary * (1 + nom), cap)));
  }

  // ⑥ 升職
  promoteRoll(g, r);
  if (job.promoBoostYears > 0) { job.promoBoostYears--; if (!job.promoBoostYears) job.promoBoost = 1; }

  // ⑦ 健康強制退休 / 做到做唔到為止
  if (s.age >= 55 && s.H < 20 && r() < 0.3) retireNow(g, '身體頂唔順，唯有退休。');
  else if (s.retirePlan === 65 && s.age >= 65) retireNow(g, '你做到 65 歲，正式退休。');
  else if (s.retirePlan === 60 && s.age >= 60) retireNow(g, '你喺 60 歲退休。');
  else if (s.retirePlan === 99 && (s.age >= 75 || s.H < 40) && s.age >= 60) retireNow(g, s.age >= 75 ? '75 歲，終於放低工作。' : '身體開始頂唔順，你決定退休。');
}

function emigrantMult(g: Game) {
  const s = g.s;
  if (!s.emigrated) return 1;
  const y = s.year - Number(s.flags['emigratedYear'] ?? s.year);
  return y < 3 ? 0.7 : 0.9;
}

function severance(g: Game): number {
  const s = g.s;
  const j = s.job!;
  if (j.years < 2) return 0;
  let sev = Math.min(j.salary, 22500 * Math.min(1, g.W / 1)) * (2 / 3) * j.years;
  sev = Math.min(sev, 390000 * Math.min(1, g.W));
  if (s.year < 2025) sev *= 0.5;
  return Math.round(sev);
}

function layoffRoll(g: Game, r: RNG): string | null {
  const s = g.s;
  const job = s.job!;
  const j = JOB_BY_ID[job.id];
  const e = g.e;
  const Et = e.u / 3.8;
  const Eind = industryFactor(j.id, s.year) * (e.crisis && ['經理及行政級', '專業人員'].includes(j.cat) ? 2 : 1);
  const Fperf = clamp(Math.sqrt(Mneg(s.J) * Mneg(s.H)), 0.6, 1.6);
  const a = s.age;
  const Fage = a < 30 ? 1 : a < 45 ? 0.9 : a < 55 ? 1.2 : a < 60 ? 1.5 : 1.8;
  const Flv = [1, 1.1, 1, 0.9, 1][job.level];
  const newbie = job.years === 0 && s.flags['hopped'] === s.year - 1 ? 1.2 : 1;
  let p = clamp(0.038 * j.cjob * Et * Eind * Fperf * Fage * Flv * newbie, 0, 0.5);
  const y = s.year;
  const A = y <= 2022 ? 0 : y <= 2026 ? 0.01 : y <= 2035 ? 0.015 + ((y - 2027) * 0.035) / 8 : 0.06;
  let ai = j.ai;
  if (j.id === 'J37' && y < 2030) ai = 0;
  let pai = ai * A * Mneg(s.K) * (s.aiSkill || s.focus === '增值進修' ? 0.5 : 1);
  if (r() < p) return '公司裁員，你收到大信封';
  if (r() < pai) return '公司引入 AI，你嘅職位被取代';
  return null;
}

function promoteRoll(g: Game, r: RNG) {
  const s = g.s;
  const job = s.job!;
  const j = JOB_BY_ID[job.id];
  if (job.level >= 4 && !['J28', 'J15', 'J14', 'J29', 'J24', 'J43'].includes(j.id)) return;
  const Ften = job.levelYears < 2 ? 0 : job.levelYears < 4 ? 1 : 1.2;
  if (!Ften) return;
  const Fi = clamp(Mpos(s.J) * Math.sqrt(Mpos(s.K)), 0.25, 3);
  let Ff = s.focus === '事業衝刺' ? 1.5 : s.focus === '家庭優先' ? 0.7 : s.flags['studiedLast'] === s.year - 1 ? 1.1 : 1;
  if (job.firstType === 'promo' && job.firstYears <= 5) Ff *= 1.3;
  if (job.firstType === 'ontime') Ff *= 0.8;
  if (s.mental) Ff *= 0.7;
  const FeP = job.level === 3 ? (s.edu >= 5 ? 1 : s.edu === 4 ? 0.6 : s.edu >= 2 ? 0.4 : 0) : 1;
  const Ep = (g.e.u >= 5 ? 0.5 : 1) * (s.year >= 2023 && ['J14', 'J11', 'J15', 'J07'].includes(j.id) ? 0.85 : 1) * (Number(s.flags['talentComp'] ?? 0) >= s.year ? 0.8 : 1);
  const p = clamp(j.promo * Ften * Fi * Ff * FeP * Ep * job.promoBoost, 0, 0.6);
  // 跳去經理類
  const toMgr = (target: string, k: number) => {
    if (r() < p * k) {
      const t = JOB_BY_ID[target];
      const sal = Math.min(Math.round(job.salary * r.uni(1.08, 1.15)), capOf(t, 1) * g.W * 1.2);
      const old = jobDisplayName(j, s.year);
      setJob(g, target, Math.max(sal, Math.round(t.start * g.W)), 1);
      g.add('J', 5, '升職');
      g.tick(`你由${old}升做${jobDisplayName(t, s.year)}！`);
      return true;
    }
    return false;
  };
  if (['J28', 'J15', 'J14'].includes(j.id) && job.level >= 3 && s.edu >= 5 && toMgr('J02', 0.5)) return;
  if (j.cat === '專業人員' && job.level >= 3 && s.edu >= 5 && s.K >= 60 && toMgr('J01', 0.5)) return;
  if (['J29', 'J24'].includes(j.id) && job.level >= 2 && toMgr('J03', 0.8)) return;
  if (j.id === 'J43' && job.level >= 2 && toMgr('J24', 1)) return;
  if (job.level >= 4) return;
  if (r() < p) {
    job.level++;
    job.levelYears = 0;
    job.salary = Math.round(Math.min(job.salary * r.uni(1.08, 1.15), Math.max(job.salary, capOf(j, job.level) * g.W)));
    g.add('J', 5, '升職');
    g.tick(`你升咗做${LEVEL_NAME[job.level]}${jobDisplayName(j, s.year)}，人工加到 ${fmtMoney(job.salary)}。`);
  }
}

function unempYear(g: Game, r: RNG) {
  const s = g.s;
  if (s.age >= 65 && s.retirePlan !== 99) { retireNow(g, '你冇再搵工，正式退休。'); return; }
  const prev = s.job ? JOB_BY_ID[s.job.id] : null;
  const pool = JOBS.filter((j) => eduOk(g, j) && (!prev || j.cat === prev.cat || s.flags['retrained']));
  const pool2 = pool.length ? pool : JOBS.filter((j) => eduOk(g, j));
  const target = pool2.sort((a, b) => b.median - a.median).slice(0, 5);
  const j = r.pick(target.length ? target : [JOB_BY_ID['J40']]);
  const pm = clamp(pHire(g, j, !!s.flags['retrained'] === false && !!prev && j.cat !== prev.cat) * 0.45 * (s.flags['retrained'] ? 1.3 : 1), 0.05, 0.6);
  let D = 1;
  while (D <= 12 && r() >= pm) D++;
  s.unempYears++;
  if (D > 12) {
    g.add('J', -2, '失業');
    if (s.age >= 55 && s.age < 65) g.pushCard(earlyRetireCard(g));
    g.tick('今年都搵唔到工。');
    return;
  }
  let sal: number;
  if (s.flags['retrained']) {
    sal = Math.round(Math.max(j.start * g.W * (1 + Math.min(0.2, 0.02 * s.yearsWorked)), s.lastSalary * 0.9));
    delete s.flags['retrained'];
  } else sal = s.lastSalary > 0 ? Math.round(s.lastSalary * r.uni(0.85, 1)) : startSalary(g, j, 1, r);
  sal = Math.min(sal, capOf(j, 4) * g.W);
  const level = prev && prev.cat === j.cat ? Math.max(1, (s.job?.level ?? 1) - 1) : 1;
  setJob(g, j.id, sal, level);
  s.flags['yearPay'] = Math.round(sal * (12 - D) / 12 * emigrantMult(g));
  g.tick(`失業 ${D} 個月後，你搵到新工：${jobDisplayName(j, s.year)}，月薪 ${fmtMoney(sal)}。`);
}

export function retireNow(g: Game, text: string) {
  const s = g.s;
  if (s.status === 'retired') return;
  if (s.job) s.lastSalary = s.job.salary;
  s.status = 'retired';
  s.retiredAt = s.age;
  s.focusStage = 'retired';
  s.focus = null;
  s.overtime = false;
  g.flag('needFocus');
  g.tick(text);
  g.log(text, '人生抉擇', true);
  if (s.age >= 60 && s.mpf > 0 && s.mpfMode === 'none') g.pushCard(mpfDrawCard(g));
  if ((['med', 'ci', 'acc', 'life'] as const).some((k) => insActive(s, k))) g.pushCard(insuranceGateCard(g, 'retire'));
  g.flag('retireWhereAt', s.age + 1);
}

// ---------- 抉擇卡 ----------
function laidOffCard(g: Game, why: string): Card {
  const s = g.s;
  const canRetire = s.age >= 50 || s.F >= 70;
  const c = mkCard('C-MA-04', '被裁之後', `${why}。下一步點算？`, [
    { label: '即刻搵工', note: '可能要接受減薪' },
    { label: '進修轉行', note: `1 年冇收入；學費 ${fmtMoney(g.p(40000))}`, fx: { K: 4 } },
    { label: '提早退休', disabled: canRetire ? undefined : '50 歲或財務健康 70 以上先可以', fx: { J: 2 } },
  ], (g2, i) => {
    if (i === 1) {
      g2.spend(g2.p(40000), '進修');
      g2.add('K', 4, '進修');
      g2.s.CP = Math.min(5, g2.s.CP + 2);
      g2.flag('retrained');
      g2.flag('retrainYear', g2.s.year + 1);
      return '你報咗一年轉行課程。';
    }
    if (i === 2) { g2.add('J', 2); retireNow(g2, '你決定唔再返工，開始新生活。'); return '你提早退休。'; }
    return '你開始寄履歷。';
  }, { pri: 760, def: 0, auto: 0, agui: 0, cat: '財務衝擊' });
  return c;
}

function earlyRetireCard(g: Game): Card {
  return mkCard('C-RT-EARLY', '搵唔到工', '搵咗成年工都搵唔到。不如提早退休？', [
    { label: '繼續搵' }, { label: '提早退休', fx: { J: 2 } },
  ], (g2, i) => { if (i === 1) retireNow(g2, '你決定提早退休。'); }, { pri: 700, def: 0, auto: g.s.F >= 60 ? 1 : 0, agui: 0 });
}

export function mpfDrawCard(g: Game): Card {
  const s = g.s;
  return mkCard('C-RT-02', '強積金點提', `你嘅強積金有 ${fmtMoney(s.mpf)}。點樣提取？`, [
    { label: '一筆過提取', fx: { J: 2 }, note: '之後親友借錢機率會高啲' },
    { label: '分期提取', note: '每年提 6%，其餘繼續投資' },
    { label: '轉做終身年金', note: `每月約 ${fmtMoney(s.mpf / 1e6 * 5500)}` },
  ], (g2, i) => {
    const t = g2.s;
    if (i === 0) { t.cash += t.mpf; t.mpf = 0; t.mpfMode = 'lump'; g2.add('J', 2); g2.flag('mpfLumpYear', t.year); }
    else if (i === 1) t.mpfMode = 'phased';
    else { t.annuity += Math.round(t.mpf / 1e6 * 5500); t.mpf = 0; t.mpfMode = 'annuity'; }
  }, { kind: 'system', pri: 878, def: 1, auto: 1, agui: 2, scene: 'bank' });
}

export const CAREER_EVENTS: EventDef[] = [
  { // 第一份工
    id: 'C-YA-01', pri: 870, fixed: true, once: false,
    when: (g) => (g.s.flags['needFirstJob'] ? 1 : 0),
    make: (g) => { delete g.s.flags['needFirstJob']; return firstJobCard(g); },
  },
  { // 強積金基金（入職後隨機一年）
    id: 'YA-MPF', pri: 845, fixed: true,
    when: (g) => (g.s.flags['ya_mpf'] !== undefined && yaDue(g, 'ya_mpf') && g.s.status === 'work' && g.s.year >= 2001 ? 1 : 0),
    make: (g) => { delete g.s.flags['ya_mpf']; return mpfCard(g); },
  },
  { // 第一份保險（入職後隨機一年）
    id: 'YA-INS', pri: 844, fixed: true,
    when: (g) => (g.s.flags['ya_ins'] !== undefined && yaDue(g, 'ya_ins') && (g.s.status === 'work' || g.s.status === 'biz') ? 1 : 0),
    make: (g) => { delete g.s.flags['ya_ins']; return insuranceGateCard(g, 'first'); },
  },
  { // 交家用
    id: 'C-YA-03', pri: 840, fixed: true,
    when: (g) => (yaDue(g, 'ya_home') && g.s.status === 'work' && g.s.home === 'parents' && g.s.parents.some((p) => p.alive) && (g.s.job?.years ?? 0) >= 1 ? 1 : 0),
    make: (g) => mkCard('C-YA-03', '交家用', '出嚟做嘢，屋企人都等緊你交家用。你俾幾多？', [
      { label: '人工 1 成', note: `每月約 ${fmtMoney((g.s.job?.salary ?? 0) * 0.1)}`, fx: { R: 0.5 } },
      { label: '人工 3 成', note: `每月約 ${fmtMoney((g.s.job?.salary ?? 0) * 0.3)}`, fx: { R: 3 } },
      { label: '唔交', fx: { J: 1, R: -3 } },
    ], (g2, i) => {
      const s = g2.s;
      s.homeContrib = [0.1, 0.3, 0][i];
      if (i === 1) g2.add('R', 3, '交家用');
      if (i === 2) { g2.add('J', 1); g2.add('R', -3, '唔交家用'); }
      return ['阿媽收咗信封，叫你自己留多啲。', '阿爸話：「你大個仔喇。」', '屋企冇講出口，但飯枱上靜咗好多。'][i];
    }, { def: 0, auto: 0, agui: 0, pri: 840 }),
  },
  { // 學貸
    id: 'C-YA-07', pri: 835, fixed: true,
    when: (g) => (yaDue(g, 'ya_loan') && g.s.studentLoan && g.s.studentLoan.bal > 0 && g.s.status === 'work' && (g.s.job?.years ?? 0) >= 1 ? 1 : 0),
    make: (g) => {
      const s = g.s;
      const low = g.monthlyIncome() < 23600 * g.W;
      return mkCard('C-YA-07', '學貸', `你仲欠學貸 ${fmtMoney(s.studentLoan!.bal)}。點樣還？`, [
        { label: '快啲還清', note: '3 年還清，每年快樂 −1' },
        { label: '最低還款', note: '10 年慢慢還' },
        { label: '延遲還款', disabled: low ? undefined : '月入低過全港中位數先可以', fx: { J: 1 } },
      ], (g2, i) => {
        const sl = g2.s.studentLoan!;
        sl.mode = (['fast', 'min', 'defer'] as const)[i];
        if (i === 2) { sl.deferLeft = 2; g2.add('J', 1); }
      }, { def: 1, auto: 1, agui: 1 });
    },
  },
  { // 跳槽機會
    id: 'C-YA-08', pri: 420, once: false, ages: [22, 54],
    when: (g) => {
      const s = g.s;
      if (s.status !== 'work' || !s.job || s.job.hopCool > 0 || s.expatLeft > 0) return 0;
      return 0.1 * Math.sqrt(Mpos(s.K) * Mpos(s.R)) * (s.flags['jobhunt'] === s.year - 1 ? 2.5 : 1);
    },
    make: (g) => hopCard(g),
  },
  { // 工作假期
    id: 'C-YA-09W', pri: 400, ages: [18, 30], years: [2001, 2200],
    when: (g) => (g.s.status === 'work' && !g.s.married && !g.s.prop ? 0.08 * (g.s.flags['exchange'] ? 1.2 : 1) : 0),
    make: (g) => mkCard('C-YA-09W', '工作假期', '朋友話去澳洲做工作假期，一年咁快。你去唔去？', [
      { label: '去一年', money: -g.p(30000), fx: { J: 6, R: 2, K: 1 } },
      { label: '唔去' },
    ], (g2, i) => {
      if (i !== 0) return '你覺得而家唔係時候。';
      g2.spend(g2.p(30000), '工作假期');
      g2.fx({ J: 6, R: 2, K: 1 }, '工作假期');
      const s = g2.s;
      if (s.job) { s.lastSalary = s.job.salary; }
      s.status = 'unemp';
      g2.flag('retrainYear', s.year + 1);
      return '你喺墨爾本咖啡店打工，學識咗拉花。';
    }, { def: 1, auto: 1, agui: 1, cat: '國際都會' }),
  },
  { // 外派
    id: 'C-YA-09E', pri: 400, ages: [25, 45],
    when: (g) => {
      const s = g.s;
      const j = jobOf(g);
      if (s.status !== 'work' || !j || s.K < 60 || !['經理及行政級', '專業人員'].includes(j.cat)) return 0;
      return 0.04 * Math.sqrt(Mpos(s.K)) * (j.id === 'J14' ? 1.5 : 1);
    },
    make: (g) => mkCard('C-YA-09E', '公司外派', '公司想派你去新加坡做三年，人工加四成。', [
      { label: '去三年', note: '人工 ×1.4', fx: { J: 1, R: -2 } },
      { label: '唔去' },
    ], (g2, i) => {
      if (i !== 0) return '你覺得而家唔係時候。';
      g2.s.expatLeft = 3;
      g2.add('J', 1);
      g2.ach('expat');
      return '新加坡三年，返嚟你已經係區域經理。';
    }, { def: 1, auto: 0, agui: 1, cat: '國際都會' }),
  },
  { // 上司叫你習慣就好
    id: 'E-OT', pri: 200, ages: [18, 40],
    when: (g) => (g.s.status === 'work' && !g.s.overtime ? 0.08 * Math.sqrt(Mneg(g.s.K)) * (g.s.focus === '事業衝刺' ? 1.5 : 1) * (g.s.job?.firstType === 'hard' ? 2 : 1) : 0),
    make: (g) => mkCard('E-OT', '每日超時 3 個鐘', '上司叫你「習慣就好」，你已經連續三個月晚晚 10 點先走。', [
      { label: '忍住做', note: '收入 +10%，健康每年 −2' },
      { label: '同上司傾' },
      { label: '搵新工' },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 0) { s.overtime = true; return '你決定忍住。'; }
      if (i === 1) {
        if (g2.er() < 0.5 * (s.R >= 60 ? 1.3 : 1)) { g2.add('J', 1); return '上司竟然肯減你啲工作量。'; }
        if (s.job) s.job.promoBoost = 0.8, s.job.promoBoostYears = 2;
        return '傾唔掂，上司仲覺得你冇承擔。';
      }
      g2.flag('jobhunt', s.year);
      return '你開始留意招聘廣告。';
    }, { def: 0, auto: 2, agui: 1, cat: '生活日常' }),
  },
  { // 公司搬去大灣區
    id: 'C-MA-07', pri: 380, ages: [30, 60], years: [2019, 2200],
    when: (g) => {
      const j = jobOf(g);
      return g.s.status === 'work' && j && ['文書支援', '專業人員', '經理及行政級'].includes(j.cat) ? 0.03 : 0;
    },
    make: (g) => mkCard('C-MA-07', '公司搬去大灣區', '公司宣佈將部門搬去深圳。你點揀？', [
      { label: '跟去', note: '人工 +10%，生活開支 ×0.8', fx: { J: -1, R: -2 } },
      { label: '辭職', fx: { J: 1 } },
      { label: '每星期兩地走', note: `交通每年約 ${fmtMoney(g.p(18000))}；每年健康、快樂、人際 −1` },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 0) { g2.flag('gbaJob'); g2.add('J', -1); return '深圳嘅新辦公室好大，但夜晚得你一個。'; }
      if (i === 1) { s.lastSalary = s.job?.salary ?? 0; s.status = 'unemp'; g2.add('J', 1); return '你揀咗留喺屋企附近搵工。'; }
      g2.flag('gbaCommute');
      g2.spend(g2.p(18000), '交通');
      return '星期一早上 6 點，你又喺口岸排隊。';
    }, { def: 2, auto: 2, agui: 2, cat: '政策衍生' }),
  },
  { // 幾時退休
    id: 'C-RT-01', pri: 850, fixed: true, ages: [60, 60],
    when: (g) => (g.s.status === 'work' || g.s.status === 'unemp' ? 1 : 0),
    make: (g) => mkCard('C-RT-01', '幾時退休', '你 60 歲喇。幾時退休？', [
      { label: '而家退休', fx: { J: 3 } },
      { label: '做到 65 歲' },
      { label: '做到做唔到為止', note: '65 歲後人工 ×0.85' },
    ], (g2, i) => {
      const s = g2.s;
      s.retirePlan = ([60, 65, 99] as const)[i];
      if (i === 0) { g2.add('J', 3); retireNow(g2, '最後一日返工，同事送咗你一束花。'); }
      return ['你決定退休。', '再做多五年。', '返工令你覺得自己仲有用。'][i];
    }, { def: 1, auto: 1, agui: 1 }),
  },
  { // 提早退休版本
    id: 'C-RT-01E', pri: 600, ages: [50, 59],
    when: (g) => (g.s.status === 'work' && g.s.F >= 70 && g.s.fParts.r >= 1 ? 0.3 : 0),
    make: (g) => mkCard('C-RT-01E', '提早退休？', '你計過條數，原來啲錢已經夠用。要唔要提早退休？', [
      { label: '而家退休', fx: { J: 3 } }, { label: '繼續做' },
    ], (g2, i) => { if (i === 0) { g2.add('J', 3); retireNow(g2, '你決定提早退休。'); } }, { def: 1, auto: 1, agui: 1 }),
  },
  { // 退休住邊
    id: 'C-RT-03', pri: 830, fixed: true,
    when: (g) => (g.s.status === 'retired' && Number(g.s.flags['retireWhereAt'] ?? 999) <= g.s.age ? 1 : 0),
    make: (g) => {
      const s = g.s;
      const rm = s.home === 'own' && s.prop && s.prop.mortgage <= 0 && s.age >= 60;
      const value = s.prop ? s.prop.price0 * (g.e.hpi / s.prop.hpi0) : 0;
      const monthly = Math.round(value * (0.0028 + Math.max(0, s.age - 65) * 0.0001));
      return mkCard('C-RT-03', '退休住邊', '退休咗，你諗緊之後喺邊度生活。', [
        { label: '留港' },
        { label: '去大灣區養老', note: '生活開支 ×0.7、住屋 ×0.5', money: -g.p(50000), fx: { R: -3 } },
        { label: '做反向按揭', disabled: rm ? undefined : '要有冇按揭嘅自住物業', note: `每月 ${fmtMoney(monthly)}` },
      ], (g2, i) => {
        if (i === 1) { g2.spend(g2.p(50000), '搬遷'); g2.s.gba = true; g2.add('R', -3); return '中山嘅單位大一倍，但你掛住香港嘅茶樓。'; }
        if (i === 2) { g2.s.reverseMortgage = monthly; return '層樓變咗你嘅長糧，你照住喺度。'; }
        return '呢度有你嘅朋友同回憶。';
      }, { def: 0, auto: 0, agui: 0 });
    },
  },
];

function hopCard(g: Game): Card {
  const s = g.s;
  const job = s.job!;
  const j = JOB_BY_ID[job.id];
  const r = streamRng(s.seed, 'hop', s.age);
  // v0.7：轉工加幅調低（8%–15%；之前搵緊工嘅 12%–18%）
  const [lo, hi] = s.flags['jobhunt'] === s.year - 1 ? [0.12, 0.18] : [0.08, 0.15];
  const rise = r.uni(lo, hi);
  const canSwitch = s.CP >= 2 || s.K >= 60;
  const others = JOBS.filter((x) => x.cat !== j.cat && eduOk(g, x) && x.median > j.median * 0.9).sort((a, b) => b.median - a.median);
  const target = others[0];
  const c = mkCard('C-YA-08', '跳槽機會', '獵頭打嚟，話有間公司想請你。', [
    { label: '跳槽加人工', note: `人工 +${Math.round(rise * 100)}%（月薪約 ${fmtMoney(job.salary * (1 + rise))}）`, fx: { J: 1 } },
    { label: '留低等升職', fx: { R: 1 } },
    { label: target ? `轉行做${jobDisplayName(target, s.year)}` : '轉行', disabled: !canSwitch ? '要讀過進修課程或知識 60 以上' : !target ? '暫時冇合適嘅新行業' : undefined, fx: { K: 2 } },
  ], (g2, i) => {
    const t = g2.s;
    if (!t.job || t.status !== 'work') return '你已經冇再打工，呢個機會放棄咗。';
    const jb = t.job;
    if (i === 0) {
      const sal = Math.round(jb.salary * (1 + rise));
      setJob(g2, jb.id, sal, jb.level, jb.firstType);
      t.job!.firstYears = jb.firstYears;
      t.job!.hopCool = 2;
      g2.flag('hopped', t.year);
      g2.add('J', 1);
      return `新公司月薪 ${fmtMoney(sal)}。`;
    }
    if (i === 1) { jb.promoBoost = 1.3; jb.promoBoostYears = 2; g2.add('R', 1); return '老細話明年有位，你決定等多陣。'; }
    const sal = Math.round(Math.min(Math.max(target.start * g2.W, jb.salary * 0.9), capOf(target, 2) * g2.W));
    setJob(g2, target.id, sal, 1);
    t.job!.hopCool = 2;
    t.CP = 0;
    g2.add('K', 2, '轉行');
    return `你轉咗做${jobDisplayName(target, t.year)}，月薪 ${fmtMoney(sal)}。`;
  }, { def: 1, auto: 0, agui: 1, pri: 420, cat: '人生抉擇' });
  c.auto = firstEnabled(c, 0);
  return c;
}
