// 第 2 章 2.7 出身抽籤
import {
  DISTRICTS, HOUSING6, eraHousingMult, HOUSING_MOD, FAMILY_BASE, FAMILY_HOUSING_MULT, FAMILY_MOD, shuangfeiP,
  JOBCATS, CAT_BASE_F, CAT_BASE_M, CAT_MEDIAN, CAT_HOUSING_MULT, catEraMult, NEWIMM_MULT, PARENT_JOBS, PARENT_CAT_MOD,
  SAVE_MONTHS, FAMILY_SAVE, priceIncomeRatio, WEALTH_MOD, COVER_TABLE, WEALTH_DIFF, siblingsTable, parentAgeParams,
  SURNAMES, OTHER_SURNAMES, GIVEN,
  type Housing, type Family, type JobCat, type WealthTier,
} from '../data/origin';
import { streamRng, type RNG } from './rng';
import { clamp } from './util';
import type { Market } from './market';

export interface ParentInfo {
  role: '父' | '母';
  status: '工作' | '失業' | '主婦' | '已退休' | '唔喺身邊';
  cat?: JobCat; job?: string; income: number; // 出生年份價格，月入
}

export interface Origin {
  birthYear: number; birthDay: number; gender: 'M' | 'F';
  isBaoyou: boolean; baoyouBranch?: '院舍家庭' | '寄養家庭' | '被領養';
  district: string; subArea: string; housing: Housing | '保幼局院舍' | '寄養家庭';
  family?: Family; father?: ParentInfo; mother?: ParentInfo;
  fatherAge: number; motherAge: number; siblings: number; birthOrder: number;
  familyIncome: number; savings: number; propertyEquity: number; debt: number;
  wealthTier: WealthTier; parentCover: 0 | 1 | 2;
  H: number; J: number; K: number; R: number;
  difficulty: number; name: string;
  hard?: { dv: boolean; cong: boolean }; // 困難人生模式：家暴、先天長期病患（保幼局用 isBaoyou）
}

function pickRow(r: RNG, names: string[], weights: number[]): string {
  const w: Record<string, number> = {};
  names.forEach((n, i) => (w[n] = weights[i]));
  return r.weighted(w);
}

export const PERIODS: Record<string, [number, number]> = {
  隨機時段: [1975, 2015], 七十年代尾: [1975, 1979], 八十年代: [1980, 1989], 九十年代: [1990, 1999],
  千禧年代: [2000, 2015], 新生代: [2016, 2025], 未來世代: [2026, 2040],
};

/** force：平行人生用，同玩家同年同日出世，其餘照抽 */
export function rollOrigin(seed: number, market: Market, period: string | null, force?: { year: number; day: number }): Origin {
  const r = streamRng(seed, 'origin');
  const [y0, y1] = PERIODS[period ?? '隨機時段'] ?? [1975, 2015];
  let birthYear = r.int(y0, y1);
  let birthDay = r.int(1, 365);
  if (force) { birthYear = force.year; birthDay = force.day; }
  const gender: 'M' | 'F' = r() < 0.515 ? 'M' : 'F';
  const isBaoyou = r() < 0.001;
  const baoyouBranch = isBaoyou ? r.weighted({ 院舍家庭: 50, 寄養家庭: 30, 被領養: 20 }) : undefined;

  const dNames = Object.keys(DISTRICTS);
  let district = pickRow(r, dNames, dNames.map((d) => DISTRICTS[d].pop));
  let housing: Origin['housing'];
  if (!isBaoyou) {
    const m = eraHousingMult(birthYear);
    housing = pickRow(r, HOUSING6, DISTRICTS[district].housing.map((v, i) => v * m[i])) as Housing;
  } else housing = baoyouBranch === '寄養家庭' ? '寄養家庭' : '保幼局院舍';
  let subArea = pickRow(r, DISTRICTS[district].sub.map((s) => s[0]), DISTRICTS[district].sub.map((s) => s[1]));

  const o: Origin = {
    birthYear, birthDay, gender, isBaoyou, baoyouBranch, district, subArea, housing,
    fatherAge: 0, motherAge: 0, siblings: 0, birthOrder: 1, familyIncome: 0, savings: 0, propertyEquity: 0, debt: 0,
    wealthTier: '基層', parentCover: 0, H: 50, J: 50, K: 15, R: 50, difficulty: 50, name: '',
  };
  const W = market.get(birthYear).W;
  const mods: [number, number, number, number][] = [DISTRICTS[district].mod];

  if (!isBaoyou) {
    let family: Family;
    if (r() < shuangfeiP(birthYear)) {
      family = '雙非';
      o.housing = '跨境';
      district = r() < 0.95
        ? r.weighted({ 北區: 55, 元朗區: 15, 屯門區: 10, 大埔區: 10, 沙田區: 5 })
        : r.pick(dNames);
      o.district = district;
      o.subArea = district === '北區' ? (r() < 0.6 ? '上水' : '粉嶺') : DISTRICTS[district].sub[0][0];
      mods[0] = DISTRICTS[district].mod;
    } else {
      const hi = HOUSING6.indexOf(o.housing as Housing);
      const names = Object.keys(FAMILY_BASE) as Exclude<Family, '雙非'>[];
      family = pickRow(r, names, names.map((f) => FAMILY_BASE[f] * FAMILY_HOUSING_MULT[f][hi])) as Family;
    }
    o.family = family;
    const h = o.housing as Housing;

    // 父母工作狀態
    const rollCat = (base: number[], extra: number[] | null) => {
      const hm = CAT_HOUSING_MULT[h];
      const em = catEraMult(birthYear);
      return pickRow(r, JOBCATS, base.map((b, i) => b * hm[i] * em[i] * (extra ? extra[i] : 1))) as JobCat;
    };
    const parentIncome = (cat: JobCat): [string, number] => {
      const jobs = PARENT_JOBS[cat];
      const jobName = r.weighted(Object.fromEntries(jobs.map((j) => [j[0], j[1]])));
      const jm = jobs.find((j) => j[0] === jobName)!;
      const sigma = jm[3] ? 0.45 : 0.25;
      const noise = clamp(Math.exp(r.normal(0, sigma)), 0.6, 1.8);
      let inc = CAT_MEDIAN[JOBCATS.indexOf(cat)] * jm[2] * noise;
      if (family === '雙非') inc *= 0.8;
      return [jobName, Math.round((inc * W) / 100) * 100];
    };
    const mk = (role: '父' | '母', status: ParentInfo['status'], extra: number[] | null = null): ParentInfo => {
      if (status !== '工作') return { role, status, income: 0 };
      let st: ParentInfo['status'] = '工作';
      if (r() < 0.03) st = '失業';
      const cat = rollCat(role === '父' ? CAT_BASE_F : CAT_BASE_M, extra);
      const [job, income] = parentIncome(cat);
      return { role, status: st, cat, job, income: st === '工作' ? income : 0 };
    };
    let fs: ParentInfo['status'] = '工作';
    let ms: ParentInfo['status'] = '工作';
    let newImmMother = false;
    if (family === '單職家庭' || (family === '三代同堂' && r() < 0.4)) {
      if (r() < 0.85) ms = '主婦'; else fs = '主婦';
    } else if (family === '單親') {
      if (r() < 0.8) fs = '唔喺身邊'; else ms = '唔喺身邊';
    } else if (family === '新移民') {
      newImmMother = true;
      if (r() >= 0.4) ms = '主婦';
    } else if (family === '隔代照顧' && r() < 0.15) {
      if (r() < 0.5) fs = '唔喺身邊'; else ms = '唔喺身邊';
    }
    o.father = mk('父', fs);
    const spouseExtra = JOBCATS.map((c) => {
      const fc = o.father!.cat;
      if ((fc === '經理及行政級' || fc === '專業人員') && (c === '經理及行政級' || c === '專業人員')) return 1.5;
      if ((fc === '服務及銷售' || fc === '非技術工人') && (c === '服務及銷售' || c === '非技術工人')) return 1.4;
      return 1;
    });
    o.mother = mk('母', ms, newImmMother ? spouseExtra.map((v, i) => v * NEWIMM_MULT[i]) : spouseExtra);
    if (family === '單親') {
      const p = o.father!.status === '唔喺身邊' ? o.mother! : o.father!;
      if (p.status === '工作' && r() < 0.25) { p.status = '失業'; p.income = 0; }
    }
    const [fm, fsd, mm, msd] = parentAgeParams(birthYear);
    o.fatherAge = clamp(Math.round(r.normal(fm, fsd)), 20, 55);
    o.motherAge = clamp(Math.round(r.normal(mm, msd)), 18, 45);
    if (o.father!.status === '工作' && o.fatherAge >= 50 && family !== '雙職家庭' && r() < 0.2) {
      o.father!.status = '已退休'; o.father!.income = 0;
    }
    const sib = siblingsTable(birthYear);
    o.siblings = Number(pickRow(r, ['0', '1', '2', '3'], sib));
    o.birthOrder = r.int(1, o.siblings + 1);

    // 家庭財富
    const I = o.father!.income + o.mother!.income;
    o.familyIncome = I;
    const [sm, debtP] = FAMILY_SAVE[family];
    o.savings = Math.round(I * SAVE_MONTHS[h] * sm * r.uni(0.5, 1.5));
    if (o.father!.status === '已退休') o.savings = Math.round(o.savings * 1.5);
    let equity = 0;
    const owns = h === '私樓自置' || h === '資助出售' || (h === '村屋' && r() < 0.6);
    if (owns) {
      const hc = h === '私樓自置' ? 1 : h === '資助出售' ? 0.55 : 0.7;
      const value = Math.max(I, 6000 * W) * 12 * priceIncomeRatio(birthYear) * hc * DISTRICTS[district].prop;
      const ltv = r() < 0.15 ? 0 : r.uni(0.3, 0.8);
      equity = Math.round(value * (1 - ltv));
    }
    o.propertyEquity = equity;
    const dp = debtP + (h === '劏房' ? 0.1 : 0);
    o.debt = r() < dp ? Math.round(I * r.uni(1, 4)) : 0;
    const medianHH = 30000 * W;
    const ratio = (o.savings + equity - o.debt) / (medianHH * 12);
    o.wealthTier = ratio < 0.25 ? '困難' : ratio < 1 ? '基層' : ratio < 3 ? '小康' : ratio < 8 ? '中產' : '富裕';
    const ct = [...COVER_TABLE[o.wealthTier]];
    if (birthYear < 1990) {
      const add = 15;
      const rest = ct[1] + ct[2];
      ct[1] -= (add * ct[1]) / rest; ct[2] -= (add * ct[2]) / rest; ct[0] += add;
    }
    o.parentCover = Number(pickRow(r, ['0', '1', '2'], ct)) as 0 | 1 | 2;

    mods.push(HOUSING_MOD[h], FAMILY_MOD[family]);
    for (const p of [o.father!, o.mother!]) {
      const key = p.status === '工作' ? p.cat! : p.status;
      mods.push(PARENT_CAT_MOD[key]);
    }
    mods.push(WEALTH_MOD[o.wealthTier]);
  } else {
    const b = { 院舍家庭: [0, -8, -2, -8], 寄養家庭: [0, -5, -1, -5], 被領養: [0, -3, 0, -3] }[baoyouBranch!] as [number, number, number, number];
    mods.push(b);
    o.wealthTier = baoyouBranch === '被領養' ? '小康' : '困難';
    o.parentCover = 1;
    o.fatherAge = 35; o.motherAge = 33;
    o.familyIncome = baoyouBranch === '被領養' ? Math.round(45000 * W) : 0;
  }

  initStats(o, mods, r, 0);
  o.name = rollName(seed, birthYear, gender);
  return o;
}

function initStats(o: Origin, mods: [number, number, number, number][], r: RNG, extra: number) {
  const sum = [0, 0, 0, 0];
  for (const m of mods) for (let i = 0; i < 4; i++) sum[i] += m[i];
  o.H = clamp(50 + sum[0] + r.int(-5, 5), 15, 85);
  o.J = clamp(50 + sum[1] + r.int(-5, 5), 15, 85);
  o.K = clamp(15 + sum[2] + r.int(-5, 5), 5, 30);
  o.R = clamp(50 + sum[3] + r.int(-5, 5), 15, 85);
  const modTotal = sum.reduce((a, b) => a + b, 0);
  let special = (o.isBaoyou ? 25 : 0) + extra;
  if (o.father?.status === '失業' || o.mother?.status === '失業') special += 5;
  o.difficulty = clamp(50 - 1.2 * modTotal + (o.isBaoyou ? 0 : WEALTH_DIFF[o.wealthTier]) + special, 0, 100);
}

function rollName(seed: number, birthYear: number, gender: 'M' | 'F'): string {
  const rn = streamRng(seed, 'name');
  const sur = rn() < 0.665
    ? rn.weighted(Object.fromEntries(SURNAMES))
    : OTHER_SURNAMES[Math.floor(rn() * OTHER_SURNAMES.length)];
  const era = birthYear < 1990 ? 0 : birthYear < 2010 ? 1 : 2;
  return sur + rn.pick(GIVEN[gender][era]);
}

// 困難人生模式：出身一定最差（地區、住屋、家庭、父母、債務），再抽 1–2 樣額外困難。
// 用獨立 rng 'hard' 喺普通出身之上改寫，普通模式完全唔受影響；年份、性別、名照用普通抽籤。
const HARD_DISTRICTS: Record<string, [string, number][]> = {
  深水埗區: [['深水埗 / 長沙灣', 1]], 觀塘區: [['觀塘 / 秀茂坪', 1]], 葵青區: [['葵涌', 1]], 元朗區: [['天水圍', 1]],
  油尖旺區: [['旺角 / 大角咀', 0.6], ['油麻地 / 佐敦', 0.4]], 黃大仙區: [['黃大仙 / 慈雲山', 1]], 九龍城區: [['土瓜灣 / 紅磡', 1]], 屯門區: [['屯門市中心', 1]],
};
const HARD_DW: Record<string, number> = { 深水埗區: 25, 觀塘區: 15, 葵青區: 12, 元朗區: 14, 油尖旺區: 14, 黃大仙區: 6, 九龍城區: 8, 屯門區: 6 };

export function hardenOrigin(o: Origin, seed: number, market: Market): Origin {
  const r = streamRng(seed, 'hard');
  const W = market.get(o.birthYear).W;
  // 額外困難：保幼局約一成（可以再加先天病）；其餘家暴、先天病或兩樣都有
  const baoyou = r() < 0.1;
  let dv = false, cong = false;
  if (baoyou) cong = r() < 0.3;
  else {
    const k = r();
    if (k < 0.45) dv = true; else if (k < 0.75) cong = true; else { dv = true; cong = true; }
  }
  o.hard = { dv, cong };
  o.district = r.weighted(HARD_DW);
  o.subArea = r.weighted(Object.fromEntries(HARD_DISTRICTS[o.district]));
  o.propertyEquity = 0;
  o.wealthTier = '困難';
  const mods: [number, number, number, number][] = [DISTRICTS[o.district].mod];
  if (baoyou) {
    o.isBaoyou = true;
    o.baoyouBranch = r() < 0.6 ? '院舍家庭' : '寄養家庭';
    o.housing = o.baoyouBranch === '寄養家庭' ? '寄養家庭' : '保幼局院舍';
    o.family = undefined; o.father = undefined; o.mother = undefined;
    o.siblings = 0; o.birthOrder = 1; o.familyIncome = 0; o.savings = 0; o.debt = 0;
    o.parentCover = 1; o.fatherAge = 35; o.motherAge = 33;
    mods.push(o.baoyouBranch === '院舍家庭' ? [0, -8, -2, -8] : [0, -5, -1, -5]);
  } else {
    o.isBaoyou = false; o.baoyouBranch = undefined;
    o.housing = '劏房';
    const family = r.pick(['單親', '隔代照顧', '新移民'] as Family[]);
    o.family = family;
    const jobs = PARENT_JOBS['非技術工人'];
    const work = (role: '父' | '母'): ParentInfo => {
      const jobName = r.weighted(Object.fromEntries(jobs.map((j) => [j[0], j[1]])));
      const jm = jobs.find((j) => j[0] === jobName)!;
      const inc = CAT_MEDIAN[JOBCATS.indexOf('非技術工人')] * jm[2] * r.uni(0.75, 1.05);
      return { role, status: '工作', cat: '非技術工人', job: jobName, income: Math.round((inc * W) / 100) * 100 };
    };
    const jobless = (role: '父' | '母'): ParentInfo => ({ role, status: '失業', income: 0 });
    const away = (role: '父' | '母'): ParentInfo => ({ role, status: '唔喺身邊', income: 0 });
    const either = (role: '父' | '母', pJob: number) => (r() < pJob ? work(role) : jobless(role));
    if (family === '單親') {
      const fatherAway = r() < 0.8;
      o.father = fatherAway ? away('父') : either('父', 0.6);
      o.mother = fatherAway ? either('母', 0.6) : away('母');
    } else if (family === '隔代照顧') {
      o.father = either('父', 0.7);
      o.mother = r() < 0.3 ? away('母') : either('母', 0.7);
    } else {
      o.father = either('父', 0.7);
      o.mother = r() < 0.5 ? { role: '母', status: '主婦', income: 0 } : work('母');
    }
    // 至少有一個人返工，唔係就冇收入
    if (o.father.status !== '工作' && o.mother.status !== '工作') {
      if (o.father.status === '失業') o.father = work('父'); else o.mother = work('母');
    }
    o.siblings = r() < 0.5 ? 2 : 3;
    o.birthOrder = r.int(1, o.siblings + 1);
    o.familyIncome = o.father.income + o.mother.income;
    o.savings = Math.round(o.familyIncome * r.uni(0, 0.5));
    o.debt = Math.round(r.uni(50000, 200000) * W);
    o.parentCover = 0;
    mods.push(HOUSING_MOD['劏房'], FAMILY_MOD[family]);
    for (const p of [o.father, o.mother]) mods.push(PARENT_CAT_MOD[p.status === '工作' ? p.cat! : p.status]);
    mods.push(WEALTH_MOD['困難']);
  }
  if (dv) mods.push([0, -3, 0, -3]);
  if (cong) mods.push([-12, 0, 0, 0]);
  initStats(o, mods, r, (dv ? 8 : 0) + (cong ? 8 : 0));
  return o;
}
