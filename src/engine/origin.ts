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

  // 初始指標
  const sum = [0, 0, 0, 0];
  for (const m of mods) for (let i = 0; i < 4; i++) sum[i] += m[i];
  o.H = clamp(50 + sum[0] + r.int(-5, 5), 15, 85);
  o.J = clamp(50 + sum[1] + r.int(-5, 5), 15, 85);
  o.K = clamp(15 + sum[2] + r.int(-5, 5), 5, 30);
  o.R = clamp(50 + sum[3] + r.int(-5, 5), 15, 85);
  const modTotal = sum.reduce((a, b) => a + b, 0);
  let special = isBaoyou ? 25 : 0;
  if (o.father?.status === '失業' || o.mother?.status === '失業') special += 5;
  o.difficulty = clamp(50 - 1.2 * modTotal + (isBaoyou ? 0 : WEALTH_DIFF[o.wealthTier]) + special, 0, 100);

  // 隨機名
  const rn = streamRng(seed, 'name');
  const sur = rn() < 0.665
    ? rn.weighted(Object.fromEntries(SURNAMES))
    : OTHER_SURNAMES[Math.floor(rn() * OTHER_SURNAMES.length)];
  const era = birthYear < 1990 ? 0 : birthYear < 2010 ? 1 : 2;
  o.name = sur + rn.pick(GIVEN[gender][era]);
  return o;
}
