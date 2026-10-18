// 第 9 章 家庭系統：父母、拍拖、結婚、離婚、生育、子女、住屋
import type { Game } from './game';
import type { Kid, Partner, State } from './state';
import { clamp, interp, Mneg, Mpos, fmtMoney } from './util';
import { streamRng, type RNG } from './rng';
import { mkCard, type Card, type EventDef } from './cards';
import { insuranceGateCard, yaDue } from './career';
import { qHK } from './health';
import { pmtOf, propEquity, liquidAssets, PRIVATE_RENT, PUBLIC_RENT, rentFactor } from './finance';
import { tragedyHit } from './yearly';
import { GIVEN } from '../data/origin';

// ---------- 小工具 ----------
const alivePartner = (g: Game) => (g.s.partner && g.s.partner.alive ? g.s.partner : null);
const spouse = (g: Game) => (g.s.married ? alivePartner(g) : null);
/** 女方年齡（生育用） */
const femaleAge = (g: Game) => (g.s.gender === 'F' ? g.s.age : g.s.partner?.age ?? 99);
/** 家庭每月收入（玩家 + 配偶） */
export function householdMonthly(g: Game): number {
  const p = spouse(g);
  return g.monthlyIncome() + (p ? p.income / 12 : 0);
}
const apart = (g: Game) => g.s.expatLeft > 0 || !!g.s.flags['gbaCommute'] || !!g.s.flags['astronaut'];
const youngest = (g: Game) => Math.min(99, ...g.s.kids.filter((k) => !k.away).map((k) => k.age));
const pName = (g: Game) => g.s.partner?.name ?? '另一半';

// ---------- 伴侶生成（9.4） ----------
const TRAITS: [string, number][] = [
  ['節儉', 12], ['大使', 10], ['顧家', 12], ['事業型', 10], ['樂天', 10], ['緊張大師', 8],
  ['孝順', 10], ['投資狂熱', 6], ['浪漫', 8], ['冷靜', 8], ['好客', 8], ['愛運動', 8],
];
const PJOBS: [number, string, number][] = [
  [3, '專業人員', 50000], [3, '經理', 48800], [2, '輔助專業人員', 28600],
  [1, '文書人員', 18000], [1, '銷售員', 16500], [1, '技工', 22000], [0, '服務員', 15300], [0, '清潔工', 14300],
];
const AGE_CURVE: [number, number][] = [[20, 0.7], [25, 0.85], [30, 1], [40, 1.15], [50, 1.15], [60, 1]];
const eduTier = (e: number) => (e >= 5 ? 3 : e === 4 ? 2 : e >= 2 ? 1 : 0);

export function makePartner(g: Game, r: RNG, teen = false): Partner {
  const s = g.s;
  const sex: 'M' | 'F' = s.gender === 'M' ? 'F' : 'M';
  const off = r.normal(2, 3);
  let age = Math.round(teen ? s.age + r.int(-1, 1) : s.gender === 'M' ? s.age - off : s.age + off);
  age = clamp(age, Math.max(20, s.age - 12), s.age + 12);
  const abroad = s.expatLeft > 0 || s.overseas && s.age <= 24;
  const origin = r.weighted(abroad ? { 本地: 40, 內地: 20, 外國: 40 } : { 本地: 85, 內地: 10, 外國: 5 }) as Partner['origin'];
  const t0 = eduTier(s.edu);
  const x = r();
  const tier = clamp(x < 0.6 ? t0 : x < 0.85 ? t0 + (r() < 0.5 ? 1 : -1) : r.int(0, 3), 0, 3);
  const pool = PJOBS.filter((j) => j[0] === tier);
  const job = r.pick(pool.length ? pool : PJOBS);
  const traits: string[] = [];
  while (traits.length < 2) {
    const w: Record<string, number> = {};
    for (const [k, v] of TRAITS) if (!traits.includes(k)) w[k] = v;
    traits.push(r.weighted(w));
  }
  let income = job[2] * Math.exp(r.normal(0, 0.25)) * interp(AGE_CURVE, age) * g.W * 12 * (traits.includes('事業型') ? 1.1 : 1);
  if (r() < 0.02) income = 0;
  const era = s.birthYear < 1990 ? 0 : s.birthYear < 2010 ? 1 : 2;
  const smokeP = sex === 'M' ? (s.year < 2000 ? 0.25 : 0.12) : 0.04;
  return {
    name: r.pick(GIVEN[sex][era]), age, job: job[1], income: Math.round(income), rel: clamp(55 + r.normal(0, 8), 30, 80),
    traits, health: clamp(r.normal(60, 12), 20, 95) + (traits.includes('愛運動') ? 5 : 0), alive: true,
    sex, ins: r() < 0.4 ? 0 : 1, smoker: r() < smokeP, debt: r() < 0.1 ? Math.round(job[2] * g.W * r.uni(1, 6)) : 0, origin,
  };
}

function partnerDesc(p: Partner) {
  return `${p.name}，${p.age} 歲，${p.job}，${p.traits[0]}`;
}

// ---------- 每年家庭更新（每年流程 ②） ----------
export function updateFamilyYear(g: Game) {
  const s = g.s;
  const r = streamRng(s.seed, 'family', s.age);
  // 出嚟做嘢：由「父母屋企」開始計（之前住屋開支由家庭負擔）
  if (s.everEmployed && !s.flags['adultHome']) {
    g.flag('adultHome');
    if (s.home === 'institution') { s.home = 'share'; g.tick('你離開院舍，同朋友夾租咗一個房。'); }
    else if (s.home !== 'own' || !s.prop) s.home = s.parents.some((p) => p.alive) ? 'parents' : 'share';
  }
  parentsYear(g, r);
  if (s.age >= 13 && s.age <= 22) teenLoveYear(g, r);
  partnerYear(g, r);
  kidsYear(g, r);
  pregnancyYear(g, r);
  homeYear(g, r);
  selfCarerYear(g);
}

// 父母（9.12）
const NEED_CARE: [number, number][] = [[64, 0], [65, 0.015], [74, 0.015], [75, 0.03], [79, 0.03], [80, 0.06], [84, 0.06], [85, 0.1], [89, 0.1], [90, 0.15]];
function parentIllP(a: number) { return a < 40 ? 0 : a < 50 ? 0.004 : a < 60 ? 0.009 : a < 70 ? 0.018 : a < 80 ? 0.03 : 0.045; }

function parentsYear(g: Game, r: RNG) {
  const s = g.s;
  const before = s.parents.filter((p) => p.alive).length;
  for (const p of s.parents) {
    if (!p.alive) continue;
    p.age++;
    p.health = clamp(p.health + (p.age < 60 ? -0.5 : p.age < 75 ? -1 : -1.5) + (s.support === 'live' ? 0.5 : 0), 0, 100);
    if (p.working && p.age >= 65) { p.working = false; p.income = 0; }
    const illKey = `parentIll_${p.role}`;
    const illYear = Number(s.flags[illKey] ?? -99);
    // 重病
    if (s.year - illYear > 3 && r() < parentIllP(p.age) * Mneg(p.health)) {
      s.flags[illKey] = s.year;
      p.health = Math.max(5, p.health - 15);
      p.working = false; p.income = 0;
      const who = p.role === '父' ? '阿爸' : '阿媽';
      if (s.age >= 22 && s.status !== 'study') {
        const share = s.origin.parentCover === 2 ? 0 : (s.origin.parentCover === 1 ? 0.4 : 1) * r.uni(50000, 300000) / (s.siblings + 1);
        const note = share > 0 ? g.spend(g.p(share), '父母醫療') : '';
        g.tick(`${who}確診重病。${share > 0 ? `你分擔醫療費 ${fmtMoney(g.p(share))}${note}` : '佢早年買咗醫療保障，你唔使夾錢。'}`);
      } else g.tick(`${who}確診重病，屋企氣氛好沉重。`);
      g.add('J', -4, `${who}患病`);
      if (r() < 0.3) p.needsCare = true;
    }
    if (!p.needsCare && r() < interp(NEED_CARE, p.age) * Mneg(p.health)) {
      p.needsCare = true;
      g.tick(`${p.role === '父' ? '阿爸' : '阿媽'}上個月喺屋企跌咗一跤，之後行動唔方便。`);
    }
    if (p.needsCare && s.age >= 22 && !s.support && !s.emigrated) g.flag('needSupportCard');
    // 死亡
    let fIll = (s.year - illYear <= 2 ? 4 : 1) * (p.needsCare ? 2 : 1);
    fIll = Math.min(6, fIll);
    const q = Math.min(0.95, qHK(p.age, p.role === '父' ? 'M' : 'F') * Mneg(p.health) * 0.85 * fIll);
    if (p.age >= 110 || r() < q) parentDies(g, r, p);
  }
  const after = s.parents.filter((p) => p.alive).length;
  if (before > 0 && after === 0) inheritance(g, r);
  if (after === 0) s.support = null;
}

function parentDies(g: Game, r: RNG, p: Game['s']['parents'][number]) {
  const s = g.s;
  p.alive = false;
  const who = p.role === '父' ? '阿爸' : '阿媽';
  tragedyHit(g, s.age <= 22 ? 30 : 25);
  g.add('R', -5);
  g.flag('tragedyYear', s.year);
  if (s.age < 18) { s.parentsDeadBefore18++; s.childAdversity++; }
  if (s.age >= 22 && s.status !== 'study') g.spend(g.p(r.uni(50000, 80000) / (s.siblings + 1)), '喪禮');
  if (p.needsCare && s.support) { s.supportedAtDeath++; g.ach('filial'); s.GP += 2; }
  g.log(`${who}離開咗（${p.age} 歲）。`, '悲劇', true);
  g.tick(`${who}離開咗，享年 ${p.age} 歲。`);
}

function inheritance(g: Game, r: RNG) {
  const s = g.s;
  if (s.origin.isBaoyou) return;
  const fs = Math.max(0, Number(s.flags['familySavings'] ?? 0));
  const eq0 = Math.max(0, Number(s.flags['familyEquity'] ?? 0));
  const eq = eq0 * g.e.hpi / Math.max(0.01, g.econ(s.birthYear).hpi);
  let estate = Math.max(0, fs + eq - Number(s.flags['parentsGave'] ?? 0));
  if (estate < 10000 || s.age < 22) return;
  let share = estate / (s.siblings + 1);
  if (s.siblings >= 1 && estate >= 1_000_000 * g.P && r() < 0.75 * 0.25 * Mneg(s.R)) {
    share *= 0.8;
    g.add('R', -10, '爭遺產');
    g.add('J', -5);
    g.tick('父母冇立遺囑，兄弟姊妹為遺產鬧上律師樓。');
  }
  share = Math.round(share);
  s.cash += share;
  g.flag('inherited', share);
  g.tick(`你繼承咗父母留低嘅 ${fmtMoney(share)}。`);
  g.log(`繼承父母遺產 ${fmtMoney(share)}`, '人生抉擇');
  estate = 0;
}

// 青春戀愛（9.3.1）
function teenLoveYear(g: Game, r: RNG) {
  const s = g.s;
  if (!s.flags['teenLove']) {
    if (s.age <= 21 && Number(s.flags['crushCount'] ?? 0) < 2 && r() < 0.06) {
      s.flags['crushCount'] = Number(s.flags['crushCount'] ?? 0) + 1;
      g.tick(r() < 0.5 ? '班上有人偷偷寫咗張心意卡俾你。' : '你暗戀咗隔離班一個同學，但始終冇講出口。');
    }
    return;
  }
  if (s.age === 22) {
    delete s.flags['teenLove'];
    if (r() < 0.3 && !s.partner) {
      s.partner = makePartner(g, r, true);
      s.datingYears = 4;
      g.tick(`你同中學開始一齊嘅${s.partner.name}，畢業後仍然拍緊拖。`);
    } else g.tick('大學畢業各有各忙，你哋和平分開。');
    return;
  }
  g.add('J', 2); g.add('R', 1);
  if (s.focus !== '發奮圖強') g.add('K', -1);
  if (r() < 0.35) { delete s.flags['teenLove']; g.add('J', -5, '分手'); g.tick('你同初戀分咗手，喊咗成個星期。'); }
}

// 伴侶（9.3.3、9.6、9.7）
function partnerYear(g: Game, r: RNG) {
  const s = g.s;
  const p = alivePartner(g);
  if (!p) return;
  p.age++;
  p.health = clamp(p.health + (p.age < 40 ? 0 : p.age < 60 ? -0.4 : -1) + (p.smoker ? -0.5 : 0), 0, 100);
  // 關係值
  let d = 2 + (s.focus === '家庭優先' ? 3 : 0) + (s.focus === '事業衝刺' ? -3 : 0) + (s.F < 30 && s.age >= 22 ? -3 : 0) + (apart(g) ? -5 : 0) + (s.mental ? -3 : 0);
  const match = (s.focus === '精打細算' && p.traits.includes('節儉')) || (s.focus === '家庭優先' && p.traits.includes('顧家')) || (s.focus === '強身健體' && p.traits.includes('愛運動'));
  const clash = (s.focus === '享受當下' && p.traits.includes('節儉')) || (s.focus === '事業衝刺' && p.traits.includes('顧家'));
  d += match ? 2 : clash ? -2 : 0;
  if (s.married && s.marriedAt !== null && s.age - s.marriedAt > 3) d -= 1.5; // 婚後熱情慢慢退
  p.rel = clamp(p.rel + d + r.normal(0, 3), 0, 100);
  if (p.traits.includes('樂天')) g.add('J', 1);
  if (p.traits.includes('大使')) g.add('J', 1);
  if (p.traits.includes('好客')) g.add('R', 1);

  if (!s.married) {
    s.datingYears++;
    const b = s.datingYears <= 1 ? 0.25 : s.datingYears === 2 ? 0.18 : 0.15;
    let pb = b * clamp(Mneg(p.rel) * Math.sqrt(Mneg(s.J)), 0.25, 3);
    if (s.flags['waitPenalty'] === s.year) pb += 0.1;
    if (r() < pb) {
      g.add('J', -8, '分手'); g.add('R', -2);
      g.tick(`你同${p.name}分咗手。`);
      g.log(`同${p.name}分手`, '人生抉擇');
      s.partner = null; s.datingYears = 0;
      g.flag('brokeYear', s.year);
    }
    return;
  }

  // 已婚：伴侶患病、死亡
  if (!p.ill && r() < (p.age < 40 ? 0.002 : p.age < 60 ? 0.008 : 0.02) * Mneg(p.health)) {
    p.ill = s.year;
    p.health = Math.max(5, p.health - 20);
    const bill = p.ins >= 1 ? 0 : g.p(r.uni(80000, 250000));
    const note = bill ? g.spend(bill, '伴侶醫療') : '';
    g.add('J', -6, `${p.name}患病`);
    g.tick(`${p.name}確診重病。${bill ? `醫療費 ${fmtMoney(bill)}${note}` : '幸好佢有醫療保障，費用唔使你擔心。'}`);
  } else if (p.ill && s.year - p.ill >= 3) p.ill = 0;
  const q = Math.min(0.95, qHK(p.age, p.sex) * Mneg(p.health) * 0.85 * (p.smoker ? 1.5 : 1) * (p.ill ? 4 : 1));
  if (p.age >= 110 || r() < q) { widow(g, r); return; }

  // 你出軌 / 曖昧（9.6.4 A）
  const af = s.flags['affair'];
  if (af === 'flirt') {
    if (r() < 0.15) discovered(g);
    else if (r() < 0.3) { s.flags['affair'] = 'on'; g.tick('曖昧慢慢變咗質。'); }
  } else if (af === 'on') {
    g.spend(g.p(r.uni(20000, 60000)), '約會');
    if (r() < 0.35) discovered(g);
    else if (r() < 0.25) { delete s.flags['affair']; g.add('J', -3); g.tick('段關係完咗。'); }
  }
  // 另一半再犯
  if (s.flags['partnerForgiven'] && r() < 0.2) { delete s.flags['partnerForgiven']; g.flag('partnerAffairAgain'); }
  // 輔導失敗 → 今年協議離婚
  if (s.flags['divorceNext'] === s.year) { delete s.flags['divorceNext']; divorce(g, r, 'agree', null); }
}

function discovered(g: Game) {
  delete g.s.flags['affair'];
  g.flag('crisisSelf');
  g.flag('crisisPending');
}

function widow(g: Game, r: RNG) {
  const s = g.s;
  const p = s.partner!;
  p.alive = false;
  tragedyHit(g, 30);
  g.add('R', -10); g.add('H', -5);
  g.flag('tragedyYear', s.year);
  const yearInc = p.income;
  const payout = p.ins ? yearInc * 3 : 0; // v0.9：伴侶保險只分有冇，唔再有第二級
  if (payout > 0) s.cash += payout;
  g.spend(g.p(r.uni(50000, 80000)), '喪禮');
  const mine = g.monthlyIncome() * 12;
  if (yearInc >= 0.6 * (yearInc + mine) && yearInc > 0) g.tick('家中經濟支柱離世，家庭收入即時少咗一大截。');
  for (const k of s.kids) if (!k.away) { k.rel = clamp(k.rel + 5, 0, 100); k.acad = clamp(k.acad - 5, 0, 100); }
  g.log(`${p.name}離開咗你（${p.age} 歲）。${payout ? `人壽賠償 ${fmtMoney(payout)}。` : ''}`, '悲劇', true);
  g.tick(`${p.name}離開咗。${payout ? `佢嘅人壽保險賠咗 ${fmtMoney(payout)}，至少屋企唔使即刻擔心錢。` : '佢冇買人壽，屋企收入一下子少咗。'}`);
  s.widowed = true;
  s.married = false;
  s.partner = null;
  s.childcare = s.childcare === 'quit' ? null : s.childcare;
  g.flag('meetCoolUntil', s.age + 2);
  g.flag('exPartner', p.name);
  for (const k of ['affair', 'crisisPending', 'crisisSelf', 'partnerForgiven', 'partnerAffairAgain', 'tryBaby', 'recur_affair'] as const) delete s.flags[k];
}

/** 離婚（9.6.3） */
export function divorce(g: Game, r: RNG, mode: 'agree' | 'fight', fault: 'self' | 'partner' | null): string {
  const s = g.s;
  const p = s.partner;
  if (!p) return '';
  const fee = g.p(mode === 'agree' ? r.uni(30000, 50000) : r.uni(150000, 400000));
  g.spend(fee, '律師費');
  const share = mode === 'agree' ? 0.5 : r.uni(0.4, 0.6);
  // 婚後累積嘅流動資產分俾對方
  const since = Math.max(0, liquidAssets(g) - Number(s.flags['liqAtMarriage'] ?? 0));
  let give = since * (1 - share);
  let propNote = '';
  if (s.prop) {
    const eq = propEquity(g);
    if (eq > 0 && s.prop.boughtYear >= (s.year - (s.age - (s.marriedAt ?? s.age)))) {
      if (s.cash + s.deposit >= eq * (1 - share)) { give += eq * (1 - share); propNote = '你買斷咗對方嗰份業權。'; }
      else {
        s.cash += eq * 0.98;
        give += eq * 0.98 * (1 - share);
        s.prop = null; s.home = 'rent'; s.rentBase = 0;
        propNote = '層樓要賣咗分錢。';
      }
    }
  }
  if (give > 0) g.spend(Math.round(give), '分身家');
  // 撫養權
  const minors = s.kids.filter((k) => k.age < 18 && !k.away);
  let custody = true;
  if (minors.length) {
    let pc = mode === 'agree' ? 0.6 : s.gender === 'F' ? 0.65 : 0.35;
    pc += Math.min(0.2, 0.03 * (s.focusYears['家庭優先'] ?? 0));
    if (fault === 'self') pc -= 0.1;
    if (fault === 'partner') pc += 0.1;
    custody = r() < pc;
    if (!custody) {
      for (const k of minors) k.away = true;
      const sup = Math.min(3, minors.length) * 0.1 * g.monthlyIncome() * 12 / g.P;
      g.flag('recur_childSupport', Math.round(sup));
    }
  }
  const hit = fault === 'partner' ? 15 : s.flags['counselled'] ? 15 : 20;
  g.add('J', -hit, '離婚'); g.add('R', fault === 'self' ? -15 : -10); g.add('H', -5);
  for (const k of s.kids) k.rel = clamp(k.rel - 10 - (fault === 'self' ? 10 : 0), 0, 100);
  s.divorces++;
  s.married = false;
  s.partner = null;
  s.marriedAt = null;
  s.childcare = null;
  g.flag('divorceYear', s.year);
  g.flag('meetCoolUntil', s.age + 1);
  for (const k of ['affair', 'crisisPending', 'crisisSelf', 'partnerForgiven', 'partnerAffairAgain', 'tryBaby', 'counselUntil', 'astronaut', 'recur_affair', 'recur_astronaut'] as const) delete s.flags[k];
  if (s.home === 'public' && !custody) s.home = 'rent';
  const t = `你同${p.name}離咗婚。${give > 0 ? `分咗 ${fmtMoney(give)} 身家俾對方。` : ''}${propNote}${minors.length ? (custody ? '仔女跟你住。' : '仔女跟對方住，你每月俾撫養費。') : ''}記得更新人壽受益人同遺囑。`;
  g.log(t, '人生抉擇', true);
  return t;
}

// 子女（9.11）
/** 而家仲同父母住（細個、未出嚟做嘢、或者揀咗留喺屋企） */
export function atFamilyHome(s: State): boolean {
  if (s.home === 'institution' || s.emigrated || s.study?.kind === '出國升學') return false;
  return s.age < 18 || s.home === 'parents' || !s.flags['adultHome'];
}
/** 兄弟姊妹仲同你住 */
export const sibsAtHome = (s: State) => s.siblings > 0 && atFamilyHome(s) && !s.flags['sibOut'];
/** 仔女仲同你住 */
export const kidAtHome = (k: Kid) => !k.away && !k.emigrated && !k.married && !k.out;

function kidsYear(g: Game, r: RNG) {
  const s = g.s;
  // v1.0：同住嘅人離開一定交代（唔再突然消失）
  if (sibsAtHome(s) && s.age >= 20 + (streamRng(s.seed, 'sibOut', 0).int(2, 9))) {
    g.flag('sibOut');
    g.tick(s.siblings > 1 ? '兄弟姊妹陸續結婚、搬出去住，屋企靜咗好多。' : '兄弟姊妹搬咗出去自己住，屋企靜咗好多。');
  }
  for (const k of s.kids) {
    k.age++;
    if (kidAtHome(k) && k.age >= streamRng(s.seed, 'kidOut', k.name).int(24, 32)) {
      k.out = true;
      g.tick(`${k.name}搬咗出去自己住，間中返嚟食飯。`);
    }
    if (k.age >= 6 && k.age <= 17) {
      k.acad += 1.5 + [0, 0.8, 1][k.school] + 0.02 * (s.K - 50) + (s.focus === '家庭優先' || (s.childcare === 'quit') ? 0.5 : 0) - (s.F < 15 && s.age >= 18 ? 2 : 0) + r.normal(0, 2);
      if (s.flags['kidTutor']) k.acad += Number(s.flags['kidTutor']);
    }
    if (!k.away) {
      k.rel += (s.focus === '家庭優先' ? 3 : 0) - (s.focus === '事業衝刺' ? 2 : 0) + (s.childcare === 'quit' && k.age < 6 ? 2 : 0) - (apart(g) ? 4 : 0) - 0.5 - (k.age >= 13 && k.age <= 17 ? 2 : 0);
      if (s.focus === '培養嗜好') k.rel += 1;
    } else k.rel -= 1;
    k.acad = clamp(k.acad, 0, 100);
    k.rel = clamp(k.rel, 0, 100);
    // 17 歲公開試
    if (k.age === 17 && !k.path) {
      const pu = k.acad >= 80 ? 0.85 : k.acad >= 60 ? 0.5 : k.acad >= 40 ? 0.15 : 0.03;
      const x = r();
      k.path = x < pu ? '大學' : k.acad >= 40 && x < pu + 0.5 ? '副學位' : '就業';
      g.tick(`${k.name}考完公開試：${k.path === '大學' ? '入到大學！' : k.path === '副學位' ? '讀副學位。' : '決定出嚟做嘢。'}`);
      if (k.path === '大學') g.add('J', 2);
    }
    // 出身
    const workAge = k.path === '大學' ? 22 : k.path === '出國' ? 22 : k.path === '副學位' ? 20 : 18;
    if (k.path && !k.job && k.age >= workAge) {
      k.job = true;
      if (k.path === '出國' && r() < 0.3) { k.emigrated = true; g.tick(`${k.name}畢業後留咗喺外國發展。`); }
      else g.tick(`${k.name}出嚟做嘢喇。`);
    }
    if (!k.job || k.emigrated) {
      if (k.job && k.emigrated) { /* 外國工作：唔俾家用 */ }
    } else if (k.rel >= 60 && !k.away && s.age >= 50) {
      const kidInc = 20000 * g.W * 12 * (k.path === '大學' ? 1.4 : 1);
      const give = kidInc * (k.rel >= 80 ? 0.15 : 0.1) * (k.married ? 0.5 : 1);
      s.cash += give;
      s.flags['kidAllowance'] = Number(s.flags['kidAllowance'] ?? 0) + give;
    }
    // 移民
    if (k.age >= 22 && !k.emigrated && r() < (s.year >= 2020 && s.year <= 2024 ? 0.03 : 0.005) * (k.rel < 50 ? 1.5 : 1)) {
      k.emigrated = true;
      g.add('R', -5); g.add('J', -5, `${k.name}移民`);
      g.tick(`${k.name}決定移民，機場送機嗰日你忍住冇喊。`);
    }
    // 結婚、抱孫
    if (!k.married && k.age >= 25 && k.age <= 40 && r() < 0.08) {
      k.married = true;
      g.flag('kidWedding', k.name);
    }
    if (k.married && (k.grandkids ?? 0) < 2 && k.age <= 42 && r() < 0.15) {
      k.grandkids = (k.grandkids ?? 0) + 1;
      g.add('J', 5, '抱孫'); g.add('R', 1);
      g.ach('grandparent');
      g.tick(`${k.name}生咗BB，你升級做${s.gender === 'M' ? '爺爺 / 公公' : '嫲嫲 / 婆婆'}！`);
    }
    // 借錢還款（35% 中途停還）
    if (k.loan && k.loan.left > 0) {
      const n = s.year - k.loan.year;
      if (k.loan.stopAt > 0 && n >= k.loan.stopAt) {
        k.loan.left = 0;
        g.add('J', -1); k.rel = clamp(k.rel - 5, 0, 100);
        g.tick(`${k.name}話最近手緊，之後都冇再還錢。`);
      } else {
        const pay = Math.min(k.loan.per, k.loan.left);
        k.loan.left -= pay;
        s.cash += pay;
        if (k.loan.left <= 0) g.tick(`${k.name}還清咗借你嘅錢。`);
      }
    }
  }
  // 撫養費完結
  if (s.flags['recur_childSupport'] && !s.kids.some((k) => k.away && k.age < 18)) {
    delete s.flags['recur_childSupport'];
    for (const k of s.kids) if (k.away && k.age >= 18) k.away = false;
  }
  if (s.kids.length) {
    const youngestAge = youngest(g);
    if (youngestAge <= 2) { g.add('H', -1, '湊BB瞓唔夠'); g.add('J', 1); }
  }
}

// 懷孕（9.9）
const FERT: [number, number][] = [[24, 0.85], [25, 0.82], [29, 0.82], [30, 0.72], [34, 0.72], [35, 0.58], [37, 0.58], [38, 0.42], [40, 0.42], [41, 0.25], [42, 0.25], [43, 0.12], [44, 0.12], [45, 0.04], [47, 0.04], [48, 0]];

function pregnancyYear(g: Game, r: RNG) {
  const s = g.s;
  const p = spouse(g);
  if (!p || !s.flags['tryBaby']) return;
  const fa = femaleAge(g);
  if (fa >= 48 || s.kids.length >= 5) { delete s.flags['tryBaby']; return; }
  s.flags['tryYears'] = Number(s.flags['tryYears'] ?? 0) + 1;
  const fh = s.gender === 'F' ? s.H : p.health;
  const smoke = s.smoker || p.smoker ? 0.85 : 1;
  let pp = s.flags['infertile'] ? 0 : interp(FERT, fa) * clamp(Math.sqrt(Mpos(fh)) * smoke, 0.5, 1.5);
  let ivf = false;
  const cycles = Number(s.flags['ivfCycles'] ?? 0);
  if (cycles > 0 && Number(s.flags['ivfFrom'] ?? 0) <= s.year) {
    const rate = fa < 35 ? 0.35 : fa < 40 ? 0.25 : fa < 43 ? 0.1 : 0.03;
    const cost = s.flags['ivfPublic'] ? r.uni(10000, 30000) : r.uni(100000, 150000);
    g.spend(g.p(cost * cycles), '人工受孕');
    g.add('J', -3 * cycles);
    const pIvf = 1 - Math.pow(1 - rate, cycles);
    pp = 1 - (1 - pp) * (1 - pIvf);
    ivf = true;
  }
  if (r() >= pp) {
    if (ivf) g.add('J', -5, '人工受孕失敗');
    const need = fa >= 35 ? 1 : 2;
    if (Number(s.flags['tryYears']) >= need && !s.flags['ivfAsked']) g.flag('needIvfCard');
    return;
  }
  // 流產
  const mc = fa < 35 ? 0.12 : fa < 40 ? 0.2 : 0.35;
  if (r() < mc) { g.add('J', -10); g.tick('今年有一個令人難過嘅消息。'); return; }
  const twinsP = ivf ? 0.12 : 0.015 * (fa < 30 ? 0.85 : fa < 35 ? 1 : fa < 40 ? 1.35 : 1.6);
  const n = r() < twinsP ? 2 : 1;
  birth(g, r, n);
}

function birth(g: Game, r: RNG, n: number) {
  const s = g.s;
  const first = s.kids.length === 0;
  const era = s.year < 2010 ? 1 : 2;
  const sur = s.gender === 'M' ? s.name[0] : s.flags['partnerSurname'] ? String(s.flags['partnerSurname']) : s.name[0];
  for (let i = 0; i < n; i++) {
    const sex = r() < 0.515 ? 'M' : 'F';
    const kid: Kid = { name: sur + r.pick(GIVEN[sex][era]), sex, age: 0, acad: clamp(r.normal(50, 12), 10, 90), rel: 70, school: 0 };
    s.kids.push(kid);
  }
  g.add('J', 10, n === 2 ? '雙胞胎出世' : 'BB出世'); g.add('R', 3);
  g.spend(g.p(2000), '分娩');
  if (s.year >= 2023) s.cash += 20000 * n;
  delete s.flags['tryBaby'];
  delete s.flags['tryYears'];
  delete s.flags['ivfCycles'];
  s.babyAskAge = s.age + 2;
  g.ach('parent');
  if (n === 2) g.ach('twins');
  const names = s.kids.slice(-n).map((k) => k.name).join('同');
  g.log(`${names}出世${n === 2 ? '（雙胞胎！）' : ''}`, '人生抉擇', true);
  g.tick(n === 2 ? `雙倍驚喜！${names}一齊出世。` : `${names}出世喇！BB 第一聲喊，你覺得一切都值得。`);
  if (first) {
    g.pushCard(childcareCard(g));
    g.pushCard(insuranceGateCard(g, 'baby'));
  }
}

// 住屋：公屋輪候、抽居屋、儲首期
function homeYear(g: Game, r: RNG) {
  const s = g.s;
  if (s.publicWait !== null && s.home !== 'public' && s.home !== 'own') {
    s.publicWait++;
    if (r() < (s.publicWait > 3 ? 0.35 : 0.2)) {
      s.publicWait = null;
      s.home = 'public';
      g.add('J', 3, '上樓');
      g.ach('public_housing');
      g.tick(`申公屋等咗多年，終於打喺${r.pick(['上水', '天水圍', '東涌', '將軍澳', '屯門', '馬鞍山'])}。`);
    }
  }
  if (s.flags['hosWait'] && !s.prop) {
    if (r() < 0.08) {
      const price = 3_800_000 * g.e.hpi;
      const res = buyHome(g, price, 0.9, '居屋', true);
      if (res.ok) { delete s.flags['hosWait']; g.tick(`抽中居屋！${res.text}`); }
    }
  }
  if (s.saveForHome && !s.prop) {
    const price = starterPrice(g);
    const res = buyHome(g, price, 0.7, '私樓', false);
    if (res.ok) { s.saveForHome = false; g.tick(`你終於儲夠首期！${res.text}`); g.log(`上車：${res.text}`, '人生抉擇', true); }
  }
}

/** 照顧仔女：玩家自己辭工 */
function selfCarerYear(g: Game) {
  const s = g.s;
  const until = Number(s.flags['selfQuitUntil'] ?? 0);
  if (!until) return;
  if (s.age < until) {
    s.flags['yearPay'] = 0;
    s.flags['yearBonus'] = 0;
    g.add('K', -0.5);
  } else {
    delete s.flags['selfQuitUntil'];
    if (s.job) s.job.salary = Math.round(s.job.salary * 0.85);
    g.tick('仔女大咗，你重返職場，人工比以前少咗少少。');
  }
}

// ---------- 買樓（8.11） ----------
export const starterPrice = (g: Game) => Math.round((g.s.married ? 4_500_000 : 3_600_000) * g.e.hpi);

function mortgageOf(g: Game, price: number, ltv: number) {
  const s = g.s;
  const years = Math.max(10, Math.min(30, 75 - s.age));
  const loan = price * ltv * (ltv > 0.7 ? 1.025 : 1);
  const rate = g.e.rmort;
  const pmt = pmtOf(loan, rate, years * 12);
  const upfront = price * (1 - ltv) + price * 0.043; // 首期 + 印花稅、佣金、律師費
  const blocked = s.flags['bankrupt'] && s.year - Number(s.flags['bankrupt']) < 5 || s.flags['iva'] && s.year - Number(s.flags['iva']) < 5;
  const stress = !blocked && pmtOf(loan, rate + 0.02, years * 12) <= householdMonthly(g) * 0.5;
  return { years, loan, rate, pmt, upfront, stress };
}

export function buyHome(g: Game, price: number, ltv: number, kind: string, subsidised: boolean, helper = 0): { ok: boolean; text: string } {
  const s = g.s;
  const m = mortgageOf(g, price, ltv);
  if (!m.stress) return { ok: false, text: '入息唔夠，銀行唔批。' };
  const liq = s.cash + s.deposit + s.index + s.stock;
  if (liq + helper < m.upfront + needBuffer(g)) return { ok: false, text: `首期同使費要 ${fmtMoney(m.upfront)}，你暫時未夠。` };
  s.cash += helper;
  g.spend(Math.round(m.upfront), '首期');
  s.prop = { kind, price0: price, hpi0: g.e.hpi, mortgage: m.loan, rate: m.rate, monthsLeft: m.years * 12, pmt: m.pmt, first: !s.flags['ownedBefore'], ltv, passedStress: true, boughtYear: s.year };
  s.home = 'own';
  s.publicWait = null;
  g.flag('ownedBefore');
  g.ach('first_home');
  if (subsidised) g.flag('hos');
  g.add('J', 4, '上車');
  return { ok: true, text: `買咗${kind}，樓價 ${fmtMoney(price)}，每月供 ${fmtMoney(m.pmt)}。` };
}
const needBuffer = (g: Game) => Number(g.s.flags['lastNeed'] ?? 0) / 12 * 2;

// ---------- 卡 ----------
function meetCard(g: Game): Card {
  const s = g.s;
  const r = streamRng(s.seed, 'meet', s.age);
  const p = makePartner(g, r);
  const w: Record<string, number> = { 舊同學: 10, 興趣班: 10 * (['培養嗜好', '強身健體'].includes(s.focus ?? '') ? 2 : 1), 旅行: 5 * (s.expatLeft > 0 ? 4 : 1), 朋友介紹: 25 * (s.R >= 40 ? 1.5 : 1) };
  if (s.status === 'work') w['同事'] = 30;
  if (s.year >= 2012) w['交友 App'] = 20;
  const where = r.weighted(w);
  const T: Record<string, string> = {
    同事: '公司茶水間成日撞到嘅同事，原來同你住同一區。',
    朋友介紹: '朋友生日飯，坐你隔離嘅人同你好傾得埋。',
    '交友 App': '交友 App 配對咗一個人，傾咗三個星期終於約出嚟。',
    舊同學: '舊同學聚會，你發現當年冇點傾過嘅同學變咗好多。',
    興趣班: '興趣班認識咗一個人，每次落堂都一齊行去地鐵站。',
    旅行: '旅行團入面，有個人同你一樣鍾意影日落。',
  };
  const reason = s.R >= 65 ? `因為你朋友多（人際 ${Math.round(s.R)}），識人機會高咗。` : s.R < 35 ? `你圈子細（人際 ${Math.round(s.R)}），遇到合適對象唔容易。` : undefined;
  return mkCard('E-MEET', '遇到一個人', `${T[where]}\n${partnerDesc(p)}。`, [
    { label: '開始拍拖', fx: { J: 3 } },
    { label: '做朋友先' },
    { label: '唔考慮' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0) {
      s2.partner = p; s2.datingYears = 0; s2.proposeAt = s2.age + (s2.age >= 32 ? 1 : 2); s2.proposeTries = 0;
      g2.add('J', 3, '拍拖');
      g2.ach('first_love');
      return `你同${p.name}開始拍拖。`;
    }
    if (i === 1) { if (g2.er() < 0.5) g2.flag('meetAgain', s2.age + 1); return '你哋保持聯絡。'; }
    return '你覺得而家唔係時候。';
  }, { pri: 650, def: 1, auto: 0, agui: 0, cat: '人生抉擇', reason, scene: 'cafe' });
}

function proposeCard(g: Game, byPartner: boolean): Card {
  const s = g.s;
  const p = s.partner!;
  const ring = clamp(g.monthlyIncome(), g.p(8000), g.p(60000));
  const opts = byPartner
    ? [{ label: '答應', fx: { J: 6 } }, { label: '再等等', fx: { R: -1 } }, { label: '分手', fx: { J: -8 } }]
    : [{ label: '結婚', note: `戒指約 ${fmtMoney(ring)}`, money: -ring }, { label: '再等等' }, { label: '分手', fx: { J: -8 } }];
  const text = byPartner ? `${p.name}拎出戒指：「我哋結婚好唔好？」` : `你同${p.name}拍拖 ${s.datingYears} 年。要唔要同佢結婚？`;
  return mkCard(byPartner ? 'C-YA-10P' : 'C-YA-10', byPartner ? '另一半想同你結婚' : '要唔要結婚', text, opts, (g2, i) => {
    const s2 = g2.s;
    const pt = s2.partner;
    if (!pt || s2.married) return '';
    s2.proposeTries++;
    if (i === 2) {
      g2.add('J', -8, '分手'); g2.add('R', -2);
      s2.partner = null; s2.datingYears = 0;
      g2.flag('brokeYear', s2.year);
      return `你同${pt.name}分咗手。`;
    }
    if (i === 1) {
      pt.rel = clamp(pt.rel - 8, 0, 100);
      g2.flag('waitPenalty', s2.year + 1);
      s2.proposeAt = s2.age + 2;
      return `${pt.name}冇出聲，但你感覺到佢有啲失望。`;
    }
    if (!byPartner) {
      g2.spend(ring, '戒指');
      const hiDebt = s2.card > g2.monthlyIncome() * 3;
      const pYes = clamp(0.55 + (pt.rel - 50) / 100 + (s2.status === 'work' ? 0.1 : 0) + (s2.prop ? 0.05 : 0) - (hiDebt ? 0.1 : 0) + (pt.traits.includes('浪漫') ? 0.05 : 0), 0.2, 0.97);
      if (g2.er() >= pYes) {
        g2.add('J', -10, '求婚失敗');
        pt.rel = clamp(pt.rel - 15, 0, 100);
        if (g2.er() < 0.5) { s2.partner = null; s2.datingYears = 0; return `${pt.name}拒絕咗你，之後你哋分咗手。`; }
        s2.proposeAt = s2.age + 2;
        return `${pt.name}話未準備好結婚。`;
      }
    }
    g2.add('J', 6, '求婚成功');
    g2.pushCard(weddingCard(g2), true);
    return `${pt.name}答應咗！`;
  }, { pri: 780, def: 1, fixed: true, auto: byPartner ? 0 : s.F >= 40 ? 0 : 1, agui: 0, cat: '人生抉擇', scene: 'night' } as Partial<Card>);
}

export function weddingCard(g: Game): Card {
  const s = g.s;
  const p = s.partner!;
  const tables = Math.round((10 + Math.round(s.R / 5)) * (s.divorces || s.widowed ? 0.6 : 1));
  const gross = (800 + tables * 13800 + 25000 + 30000 + 40000 + 20000 + 40000) * g.P;
  const gifts = tables * 10 * 1000 * (0.6 + s.R / 125) * g.P;
  const big = Math.round((gross - gifts) / 2);
  const simple = Math.round(31000 * g.P / 2);
  const travel = Math.round(88000 * g.P / 2);
  const romantic = p.traits.includes('浪漫');
  return mkCard('C-FM-01', '結婚形式', `你同${p.name}決定結婚！你哋各出一半使費。點樣擺？`, [
    { label: `大排筵席（${tables} 圍）`, money: -big, note: `淨支出約 ${fmtMoney(big)}（已扣人情）`, fx: { J: 6, R: 5 } },
    { label: '簡單註冊', money: -simple, fx: { J: 3, R: 1 } },
    { label: '旅行結婚', money: -travel, fx: { J: 6, R: 2 } },
  ], (g2, i) => {
    const s2 = g2.s;
    const pt = s2.partner;
    if (!pt || s2.married) return '';
    const note = g2.spend([big, simple, travel][i], '婚禮');
    if (i === 0) { g2.add('J', 6 + (romantic ? 2 : 0), '婚禮'); g2.add('R', 5); }
    if (i === 1) { g2.add('J', 3, '結婚'); g2.add('R', 1); if (romantic) pt.rel = clamp(pt.rel - 5, 0, 100); }
    if (i === 2) { g2.add('J', 6, '結婚'); g2.add('R', 2); }
    s2.married = true;
    s2.marriedAt = s2.age;
    s2.babyAskAge = s2.age + 1;
    s2.babyPlan = null;
    if (pt.sex === 'M') g2.flag('partnerSurname', '陳李黃張梁林劉吳王何'[Math.floor(g2.er() * 10)]);
    g2.flag('liqAtMarriage', liquidAssets(g2));
    g2.flag('marriedDating', s2.datingYears);
    g2.flag('housingAskAt', s2.age + 1);
    if (s2.divorces || s2.widowed) pt.remarry = true;
    // 不育（以夫婦為單位）
    const fa = femaleAge(g2);
    const ma = s2.gender === 'M' ? s2.age : pt.age;
    const inf = 0.08 + (fa >= 40 ? 0.15 : fa >= 35 ? 0.06 : 0) + (ma >= 45 ? 0.04 : 0) + (s2.smoker || pt.smoker ? 0.03 : 0);
    if (g2.er() < inf) g2.flag('infertile');
    g2.ach('married');
    if (pt.debt > 0) { s2.card += pt.debt; g2.add('J', -3); g2.tick(`結婚後先發現${pt.name}有 ${fmtMoney(pt.debt)} 卡數未還。`); pt.debt = 0; }
    g2.pushCard(insuranceGateCard(g2, 'marry'));
    return ['20 圍酒，阿爺飲到面紅。', '婚姻註冊處影完相，一家人去食燒鵝。', '你哋喺冰島教堂行禮，只有攝影師見證。'][i] + (note ? ` ${note}` : '');
  }, { pri: 785, def: 1, auto: 1, agui: 1, cat: '人生抉擇', scene: 'wedding' });
}

function publicLimit(g: Game) {
  const n = Math.min(5, g.householdSize());
  return [12940, 19500, 25000, 30000, 36000][n - 1] * g.P;
}

function housingCard(g: Game, single: boolean): Card {
  const s = g.s;
  const eligible = householdMonthly(g) <= publicLimit(g) && liquidAssets(g) < 600000 * g.P;
  const canSave = mortgageOf(g, starterPrice(g), 0.7).stress && g.s.F >= 40;
  const hn = Math.min(5, g.householdSize()) - 1;
  return mkCard('C-FM-02', single ? '35 歲，住屋點算？' : '成家住屋', single ? '你 35 歲，仲係租樓或者同屋企人住。之後點打算？' : '結咗婚，你哋要諗住邊。', [
    { label: eligible ? '申公屋' : '抽居屋', note: eligible ? `平均約 5 年上樓（公屋月租約 ${fmtMoney(g.p(PUBLIC_RENT[hn]))}），期間租樓` : '入息超出公屋限額，每年約 8% 中籤' },
    { label: s.home === 'parents' ? '留喺屋企' : '繼續租樓', note: s.home === 'parents' && !s.married ? '住屋開支 0，交家用照舊' : `月租約 ${fmtMoney(PRIVATE_RENT[hn] * rentFactor(g))}，靈活，冇樓價風險` },
    { label: '買樓上車', note: `上車盤約 ${fmtMoney(starterPrice(g))}` },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0) {
      if (eligible) { s2.publicWait = 0; if (s2.married && s2.home === 'parents') { s2.home = 'rent'; s2.rentBase = 0; } return '你遞咗表，開始漫長嘅等待。'; }
      g2.flag('hosWait');
      return '你入咗居屋申請表，等抽籤。';
    }
    if (i === 1) { if (s2.married && s2.home === 'parents') { s2.home = 'rent'; s2.rentBase = 0; } return '租樓靈活啲，遲啲先算。'; }
    g2.pushCard(buyCard(g2), true);
    return '你哋開始周圍睇樓。';
  }, { pri: 760, def: 1, auto: canSave ? 2 : eligible ? 0 : 1, agui: canSave ? 2 : eligible ? 0 : 1, cat: '人生抉擇', scene: 'home' });
}

export function buyCard(g: Game): Card {
  const s = g.s;
  const price = starterPrice(g);
  const m70 = mortgageOf(g, price, 0.7);
  const m90 = mortgageOf(g, price, 0.9);
  const parentsCan = s.parents.some((p) => p.alive) && !s.origin.isBaoyou && Math.max(0, Number(s.flags['familySavings'] ?? 0)) + Math.max(0, Number(s.flags['familyEquity'] ?? 0)) * 0.3 > 200000 * g.P;
  const help = Math.round(Math.max(0, Number(s.flags['familySavings'] ?? 0)) * 0.3 + Math.max(0, Number(s.flags['familyEquity'] ?? 0)) * g.e.hpi * 0.1);
  const liq = s.cash + s.deposit + s.index + s.stock;
  return mkCard('C-FM-03', '上車首期', `上車盤樓價 ${fmtMoney(price)}，按揭利率 ${(g.e.rmort * 100).toFixed(1)}%。你手上可動用 ${fmtMoney(liq)}。（遊戲模擬，不構成投資建議）`, [
    { label: '自己儲夠先買', note: `七成按揭：首期連使費 ${fmtMoney(m70.upfront)}，月供 ${fmtMoney(m70.pmt)}`, disabled: m70.stress ? undefined : '入息唔夠，銀行唔批' },
    { label: '父母幫手', note: parentsCan ? `父母出約 ${fmtMoney(help)}` : undefined, disabled: !parentsCan ? '父母冇可動用資產' : !m70.stress ? '入息唔夠，銀行唔批' : undefined, fx: { J: 2, R: 2 } },
    { label: '借按揭保險做高成數', note: `首期一成：連使費 ${fmtMoney(m90.upfront)}，月供 ${fmtMoney(m90.pmt)}`, disabled: m90.stress ? undefined : '入息唔夠，銀行唔批' },
    { label: '暫時唔買', note: '繼續租樓，遲啲再諗' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 3) { delete s2.flags['wantHomeUntil']; if (s2.home === 'parents' && s2.married) { s2.home = 'rent'; s2.rentBase = 0; } return '你決定暫時唔買，繼續租樓。'; }
    if (i === 0) {
      const res = buyHome(g2, price, 0.7, '私樓', false);
      if (res.ok) return res.text;
      s2.saveForHome = true;
      if (s2.home === 'parents' && s2.married) { s2.home = 'rent'; s2.rentBase = 0; }
      return `${res.text}你入咗「儲首期模式」，夠錢就自動買。`;
    }
    if (i === 1) {
      const res = buyHome(g2, price, 0.7, '私樓', false, help);
      if (!res.ok) { s2.saveForHome = true; return `${res.text}你決定繼續儲。`; }
      g2.flag('parentsHelpedHome');
      g2.flag('parentsGave', help);
      g2.flag('familySavings', Number(s2.flags['familySavings'] ?? 0) - help * 0.7);
      g2.add('J', 2); g2.add('R', 2);
      return `阿爸拎咗一筆退休錢出嚟，叫你唔好話俾人知。${res.text}`;
    }
    const res = buyHome(g2, price, 0.9, '私樓', false);
    if (!res.ok) { s2.saveForHome = true; return `${res.text}你入咗「儲首期模式」。`; }
    return res.text;
  }, { pri: 755, def: m70.stress ? 0 : 3, auto: m70.stress ? 0 : 3, agui: m70.stress ? 0 : 3, cat: '人生抉擇', scene: 'home' });
}

function babyCard(g: Game): Card {
  const s = g.s;
  const second = s.kids.length > 0;
  return mkCard('C-FM-04', second ? `生唔生第 ${s.kids.length + 1} 個？` : '生仔', second ? '屋企多咗個小朋友，熱鬧咗好多。要唔要再生？' : '結咗婚，長輩已經開始問幾時有好消息。', [
    { label: '生', note: '每名仔女每年約 $4.5–11 萬（官津）', fx: { J: 2 } },
    { label: '唔生' },
    { label: '遲啲先' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0) { s2.babyPlan = 'yes'; g2.flag('tryBaby'); s2.flags['tryYears'] = 0; return '你哋開始備孕。'; }
    if (i === 1) { s2.babyPlan = 'no'; s2.babyAskAge = s2.age + 5; return second ? '你哋覺得而家咁就啱啱好。' : '你哋決定做丁克，多啲時間陪對方。'; }
    s2.babyPlan = 'later'; s2.babyAskAge = s2.age + 2;
    return '等經濟穩定啲先。';
  }, {
    pri: 740, def: 2, cat: '人生抉擇', scene: 'home',
    auto: s.F >= 50 && s.kids.length < 2 ? 0 : 2,
    agui: femaleAge(g) < 38 && s.kids.length < 2 ? 0 : 1,
  });
}

function ivfCard(g: Game): Card {
  const s = g.s;
  const fa = femaleAge(g);
  return mkCard('E-IVF', '醫生建議做檢查', s.flags['infertile'] ? '檢查結果：要靠人工受孕先有機會。' : '檢查結果一切正常，醫生叫你哋繼續努力。不過都可以考慮人工受孕。', [
    { label: '私家人工受孕', note: `每個周期 $10–15 萬，${fa < 35 ? '成功率約 35%' : fa < 40 ? '成功率約 25%' : '成功率低'}`, disabled: fa > 47 ? '年齡太大' : undefined },
    { label: '公立輪候', note: '平好多，但要等 1–2 年', disabled: fa >= 40 ? '女方要 40 歲以下' : undefined },
    { label: '順其自然' },
  ], (g2, i) => {
    g2.flag('ivfAsked');
    if (i === 0) { g2.flag('ivfCycles', 1); g2.flag('ivfFrom', g2.s.year + 1); return '你哋開始人工受孕療程。'; }
    if (i === 1) { g2.flag('ivfCycles', 1); g2.flag('ivfPublic'); g2.flag('ivfFrom', g2.s.year + 2); return '你哋排咗公立輪候。'; }
    return '你哋決定順其自然。';
  }, { pri: 600, def: 2, auto: 2, agui: 2, cat: '健康' });
}

function childcareCard(g: Game): Card {
  const s = g.s;
  const p = spouse(g);
  const grand = s.parents.some((x) => x.alive && x.age < 75 && x.health >= 40);
  const selfLower = !!p && g.monthlyIncome() * 12 < p.income;
  return mkCard('C-FM-05', '湊仔', 'BB 出世咗，邊個湊？', [
    { label: '請外傭', money: -g.p(90000), note: '每年約 $9 萬' },
    { label: '父母幫手湊', note: '每月俾父母 $4,000', disabled: grand ? undefined : '父母要健在、75 歲以下', fx: { R: 3 } },
    { label: `一方辭工（${!p ? '你' : selfLower ? '你' : p.name}）`, note: '少一份收入，4 年', fx: { R: 3, J: 2 } },
  ], (g2, i) => {
    const s2 = g2.s;
    s2.childcare = (['helper', 'parents', 'quit'] as const)[i];
    if (i === 1) { g2.add('R', 3); return '阿嫲日日湊孫，湊到眉開眼笑。'; }
    if (i === 2) {
      g2.add('R', 3); g2.add('J', 2);
      if (selfLower || !p) { g2.flag('quitWho', 'self'); g2.flag('selfQuitUntil', s2.age + 4); }
      else g2.flag('quitWho', 'partner');
      return '你哋決定留一個人喺屋企陪佢成長。';
    }
    return '姐姐好錫 BB，你終於可以安心返工。';
  }, { pri: 745, def: 0, auto: 0, agui: 0, cat: '人生抉擇', scene: 'home' });
}

function schoolCard(g: Game, k: Kid): Card {
  const s = g.s;
  const yf = householdMonthly(g);
  const okDss = yf >= 45000 * g.W;
  const okInt = yf >= 100000 * g.W;
  const sec = k.age >= 12;
  return mkCard('C-FM-06', sec ? `${k.name}升中` : `${k.name}讀幼稚園`, sec ? `${k.name}要升中學喇，想讀邊類學校？` : `${k.name} 3 歲，要揀學校。`, [
    { label: '官津校', note: '每年約 $6–11 萬' },
    { label: '直資或私立', note: '每年約 $11–18 萬', disabled: okDss ? undefined : '家庭收入要全港中位數 1.5 倍', fx: { J: 1 } },
    { label: '國際學校', note: `每年約 $18–32 萬，另建校費 ${fmtMoney(g.p(150000))}`, disabled: okInt ? undefined : '家庭收入要全港頭 10%', fx: { J: 2, R: -1 } },
  ], (g2, i) => {
    k.school = i as 0 | 1 | 2;
    k.schoolAsked = k.age;
    if (i === 1) g2.add('J', 1);
    if (i === 2) { g2.add('J', 2); g2.add('R', -1); if (!sec) g2.spend(g2.p(150000), '建校費'); }
    return ['屋企附近嘅學校，行路 5 分鐘。', '面試準備咗半年，終於入到。', '全英文環境，佢半年就講得好流利。'][i];
  }, { pri: 735, def: 0, auto: 0, agui: 0, cat: '人生抉擇', scene: 'school' });
}

function supportCard(g: Game): Card {
  const s = g.s;
  const care = s.parents.some((p) => p.alive && p.needsCare);
  return mkCard('C-MA-01', '供養父母', care ? '父母開始需要人照顧。你點安排？' : '父母年紀大，你諗緊點樣供養佢哋。', [
    { label: '每月俾家用', note: '每月約 $5,000–8,000' },
    { label: '接返嚟同住', note: '每月生活費約 $4,000', fx: { R: 3 } },
    { label: '安排入安老院', note: '私營每月約 $1.4 萬', fx: { J: -2, R: -2 } },
  ], (g2, i) => {
    const s2 = g2.s;
    s2.support = (['money', 'live', 'home'] as const)[i];
    delete s2.flags['needSupportCard'];
    if (i === 1) { g2.add('R', 3); return '阿爸搬入嚟，晚晚都有老火湯飲。'; }
    if (i === 2) { g2.add('J', -2); g2.add('R', -2); return '你每個星期日都去探佢。'; }
    return '每月 1 號，你準時過數俾阿媽。';
  }, { pri: 800, def: 0, auto: 0, agui: 0, cat: '人生抉擇' });
}

function crisisCard(g: Game, kind: 'div' | 'self' | 'partner' | 'partner2'): Card {
  const s = g.s;
  const p = s.partner!;
  const T = {
    div: ['婚姻危機', `你同${p.name}嘅關係去到冰點，${p.name}提出離婚。`],
    self: ['婚姻危機（你出軌）', `${p.name}發現咗你同第三者嘅訊息。`],
    partner: ['另一半出軌', `你喺${p.name}手機見到唔應該見嘅訊息。`],
    partner2: ['另一半再犯', `${p.name}又再同嗰個人聯絡。`],
  }[kind];
  const counselCost = g.p(15000);
  const agreeNote = `律師費約 ${fmtMoney(g.p(30000))}–${fmtMoney(g.p(50000))}，婚後積蓄同物業對半分`;
  const opts = kind === 'div'
    ? [{ label: '協議離婚', note: agreeNote }, { label: '嘗試婚姻輔導', money: -counselCost }, { label: '爭取到底（打官司）', note: `律師費約 ${fmtMoney(g.p(150000))}–${fmtMoney(g.p(400000))}，分到四至六成` }]
    : kind === 'self'
      ? [{ label: '認錯求原諒', note: `對方唔原諒就要離婚（${agreeNote}）` }, { label: '一齊做婚姻輔導', money: -counselCost }, { label: '離婚', note: agreeNote }]
      : [{ label: '原諒佢', disabled: kind === 'partner2' ? '上次已經原諒過' : undefined }, { label: '一齊做婚姻輔導', money: -counselCost }, { label: '離婚', note: agreeNote }];
  return mkCard(kind === 'div' ? 'E-DIV' : kind === 'self' ? 'E-FM-AF1C' : 'E-FM-AF2', T[0], T[1], opts, (g2, i) => {
    const s2 = g2.s;
    const r = streamRng(s2.seed, 'crisis', s2.age, kind);
    const pt = s2.partner;
    if (!pt || !s2.married) return '';
    delete s2.flags['crisisPending'];
    delete s2.flags['crisisSelf'];
    delete s2.flags['partnerAffairAgain'];
    if (i === 1) {
      g2.spend(counselCost, '婚姻輔導');
      g2.flag('counselled');
      const ok = r() < (kind === 'div' ? 0.5 : kind === 'self' ? 0.55 : 0.6);
      if (ok) {
        pt.rel = clamp(pt.rel + (kind === 'div' ? 15 : kind === 'self' ? -15 : -10), 0, 100);
        if (kind === 'partner' || kind === 'partner2') g2.add('J', -8);
        g2.flag('counselUntil', s2.age + 3);
        return '輔導做咗大半年，你哋慢慢學識再傾偈。';
      }
      g2.flag('divorceNext', s2.year + 1);
      return '輔導冇用，你哋決定明年分開。';
    }
    if (kind === 'div') {
      return i === 0 ? divorce(g2, r, 'agree', null) : (g2.add('J', -10), divorce(g2, r, 'fight', null));
    }
    if (kind === 'self') {
      if (i === 0) {
        if (r() < 0.4) { pt.rel = clamp(pt.rel - 25, 0, 100); g2.add('J', -8); g2.flag('forgivenUntil', s2.age + 3); return `${pt.name}最後原諒咗你，但關係已經唔同咗。`; }
        return divorce(g2, r, 'agree', 'self');
      }
      g2.add('R', -5);
      return divorce(g2, r, 'agree', 'self');
    }
    if (i === 0) { g2.add('J', -10, '另一半出軌'); pt.rel = clamp(pt.rel - 20, 0, 100); g2.flag('partnerForgiven'); return '你揀咗原諒，但心入面有條刺。'; }
    return divorce(g2, r, 'agree', 'partner');
  }, { pri: 820, def: 1, auto: 1, agui: kind === 'div' ? 0 : 1, cat: '人生抉擇', scene: 'night' });
}

// 婚姻危機機率（9.6.1）
function divorceP(g: Game): number {
  const s = g.s;
  const p = spouse(g);
  if (!p || s.marriedAt === null) return 0;
  const d = s.age - s.marriedAt;
  if (d < 1) return 0;
  const h = d <= 3 ? 0.012 : d <= 10 ? 0.018 : d <= 20 ? 0.012 : d <= 30 ? 0.006 : 0.003;
  const Y = householdMonthly(g) * 12;
  let fin = clamp(Math.pow(2, (50 - s.F) / 100), 0.7, 1.41) * (s.card > Y / 4 ? 1.2 : 1) * (s.prop && propEquity(g) < 0 ? 1.15 : 1) * (s.flags['laidOffYear'] === s.year ? 1.2 : 1);
  let life = (p.rel >= 80 ? 0.7 : p.rel < 30 ? 1.5 : 1) * (apart(g) ? 1.5 : 1) * (s.focus === '事業衝刺' ? 1.15 : s.focus === '家庭優先' ? 0.8 : 1);
  life *= (youngest(g) < 6 ? 0.85 : 1) * (Number(s.flags['marriedDating'] ?? 2) < 1 ? 1.3 : 1) * (p.remarry ? 1.2 : 1);
  life *= (p.traits.includes('顧家') ? 0.85 : 1) * (p.traits.includes('冷靜') ? 0.9 : 1) * (p.traits.includes('事業型') ? 1.1 : 1);
  life *= (s.flags['crisisPending'] ? 2 : 1) * (Number(s.flags['counselUntil'] ?? 0) > s.age ? 0.7 : 1) * (Number(s.flags['forgivenUntil'] ?? 0) > s.age ? 1.5 : 1);
  fin = fin * life;
  return h * clamp(Mneg(s.R) * Mneg(s.J) * fin, 0.25, 3);
}

function kidWeddingCard(g: Game, name: string): Card {
  return mkCard('E-KIDWED', `${name}結婚`, `${name}話今年擺酒。你俾幾多人情 / 嫁妝？`, [
    { label: '俾多啲', money: -g.p(200000), fx: { R: 2 } },
    { label: '俾少少', money: -g.p(50000) },
    { label: '唔俾', fx: { R: -2 } },
  ], (g2, i) => {
    const k = g2.s.kids.find((x) => x.name === name);
    g2.add('J', 4, `${name}結婚`);
    if (i === 0) { g2.spend(g2.p(200000), '人情'); g2.add('R', 2); if (k) k.rel = clamp(k.rel + 5, 0, 100); }
    if (i === 1) g2.spend(g2.p(50000), '人情');
    if (i === 2) { g2.add('R', -2); if (k) k.rel = clamp(k.rel - 5, 0, 100); }
    return '酒樓入面，你望住佢，記起佢細個嘅樣。';
  }, { pri: 500, def: 1, auto: 1, agui: 1, cat: '人生抉擇', scene: 'wedding' });
}

function helpBuyCard(g: Game, k: Kid): Card {
  const s = g.s;
  const amt = Math.round(Math.min(liquidAssets(g) * 0.3, 1_000_000 * g.P));
  return mkCard('C-RT-04', `${k.name}叫你幫手上車`, `${k.name}想買樓，首期仲差少少，問你可唔可以幫手（約 ${fmtMoney(amt)}）。`, [
    { label: '幫', money: -amt, fx: { R: 4, J: 2 } },
    { label: '唔幫', fx: { R: -3, J: -1 } },
    { label: '借俾佢、要還', money: -amt, note: '分 10 年還', fx: { R: 1 } },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 1) { g2.add('R', -3); g2.add('J', -1); k.rel = clamp(k.rel - 5, 0, 100); return '你同佢講：「我嘅錢要留嚟養老。」'; }
    g2.spend(amt, '幫仔女上車');
    if (i === 0) { g2.add('R', 4); g2.add('J', 2); k.rel = clamp(k.rel + 8, 0, 100); return '佢搬入新屋嗰日，特登煮咗餐飯請你。'; }
    g2.add('R', 1);
    const r = streamRng(s2.seed, 'kidloan', k.name);
    const stop = r() < 0.35 ? r.int(1, 10) : 0;
    k.loan = { left: amt, per: Math.round(amt / 10), stopAt: stop, year: s2.year };
    return '佢寫咗張借據俾你，你收埋喺抽屜。';
  }, { pri: 520, def: 2, auto: 2, agui: 1, cat: '人生抉擇' });
}

function emigrateCard(g: Game): Card {
  const s = g.s;
  const fam = s.married || s.kids.length > 0;
  const cost = g.p(fam ? 300000 : 150000);
  return mkCard('C-FM-07', fam ? '移民' : '移居外地', s.year >= 2020 && s.year <= 2024 ? '身邊好多朋友都走咗。你哋要唔要移民？' : '有機會去外國重新開始。你去唔去？', [
    { label: fam ? '一家移民' : '去', money: -cost, note: '首 3 年收入 ×0.7', fx: { J: -5, R: -10 } },
    { label: '留港', fx: { J: -1, R: -2 } },
    { label: '一個留港搵錢、其他人移民', disabled: fam && s.married ? undefined : '要有家庭先揀到', note: '每月寄 $2.5 萬，離婚風險 ×1.5' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0) {
      g2.spend(cost, '移民');
      g2.add('J', -5); g2.add('R', -10);
      s2.emigrated = true;
      g2.flag('emigratedYear', s2.year);
      g2.ach('emigrate');
      if (s2.home === 'public') s2.home = 'rent';
      return '機場禁區門口，阿媽揮手揮到你睇唔見。';
    }
    if (i === 2) {
      g2.flag('astronaut');
      g2.flag('recur_astronaut', 25000 * 12 + 30000);
      for (const k of s2.kids) k.away = true;
      return '每晚 11 點，你對住手機同仔女講晚安。';
    }
    g2.add('J', -1); g2.add('R', -2);
    return '你留低，送咗好幾班朋友去機場。';
  }, { pri: 700, def: 1, auto: 1, agui: 1, cat: '時代事件', scene: 'airport' });
}

function willCard(g: Game): Card {
  return mkCard('C-MA-06', '立遺囑同持久授權書', '律師朋友提你：遺囑同持久授權書，可以免得家人將來手忙腳亂。', [
    { label: '而家做', money: -g.p(8000), fx: { J: 1 } },
    { label: '遲啲先' },
    { label: '唔做' },
  ], (g2, i) => {
    const s = g2.s;
    if (i === 0) { g2.spend(g2.p(8000), '遺囑'); s.will = true; s.epa = true; g2.add('J', 1); g2.ach('will'); return '律師樓簽完字，你覺得放低咗一件心事。'; }
    if (i === 1) { g2.flag('willAskAt', s.age + 5); return '仲後生，遲啲先。'; }
    g2.flag('willNever'); return '啲錢自然會留俾仔女啦。';
  }, { pri: 560, def: 1, auto: 0, agui: 1, cat: '人生抉擇' });
}

// ---------- 事件表 ----------
export const FAMILY_EVENTS: EventDef[] = [
  { // 住屋（初出社會）
    id: 'C-YA-04', pri: 760, fixed: true,
    when: (g) => (g.s.age >= 20 && yaDue(g, 'ya_move') && g.s.status === 'work' && g.s.home === 'parents' ? 1 : 0),
    make: (g) => mkCard('C-YA-04', '搬出去住？', '出嚟做咗一排嘢，你諗緊要唔要搬出去住。', [
      { label: '留喺屋企', note: '住屋開支 0，儲首期最快' },
      { label: '同朋友夾租', money: -g.p(6500 * 12), note: '每月約 $6,500', fx: { J: 2, R: 2 } },
      { label: '自己租', money: -g.p(11000 * 12), note: '每月約 $11,000', fx: { J: 3, R: -1 } },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 1) { s.home = 'share'; g2.add('J', 2); g2.add('R', 2); return '三個大學同學夾租太子一個單位。'; }
      if (i === 2) { s.home = 'rent'; s.rentBase = 0; g2.add('J', 3); g2.add('R', -1); return '細細一間，但終於有自己嘅空間。'; }
      return '同屋企人瞓碌架床瞓到 25 歲。';
    }, { pri: 760, def: 0, auto: 0, agui: 0, cat: '人生抉擇', scene: 'home' }),
  },
  { // 遇到對象
    id: 'E-MEET', pri: 650, once: false, ages: [22, 85], cat: '人生抉擇',
    when: (g) => {
      const s = g.s;
      if (s.partner || s.married) return 0;
      if (Number(s.flags['meetCoolUntil'] ?? 0) > s.age || s.flags['brokeYear'] === s.year) return 0;
      if (s.flags['meetAgain'] === s.age) return 0.5;
      const a = s.age;
      const B = a < 25 ? 0.22 : a < 30 ? 0.28 : a < 35 ? 0.24 : a < 40 ? 0.17 : a < 45 ? 0.12 : a < 55 ? 0.07 : a < 65 ? 0.04 : 0.02;
      const ff = ['廣結朋友', '家庭優先'].includes(s.focus ?? '') ? 1.25 : ['享受當下', '培養嗜好', '周遊列國'].includes(s.focus ?? '') ? 1.1 : s.focus === '增值進修' ? 0.9 : s.focus === '事業衝刺' ? 0.8 : 1;
      let fs = (s.expatLeft > 0 ? 1.2 : 1) * (s.kids.length ? 0.8 : 1) * (s.emigrated && s.year - Number(s.flags['emigratedYear'] ?? 0) < 2 ? 0.7 : 1);
      fs *= (s.diseases.some((d) => d.status === 'treating') ? 0.5 : 1) * (s.mental ? 0.7 : 1) * (s.divorces || s.widowed ? 0.8 : 1);
      return Math.min(0.45, B * clamp(Mpos(s.R) * Math.sqrt(Mpos(s.J)) * ff * fs, 0.25, 3));
    },
    make: meetCard,
  },
  { // 求婚
    id: 'C-YA-10', pri: 780, fixed: true, once: false,
    when: (g) => {
      const s = g.s;
      if (!s.partner || s.married || s.proposeTries >= 3) return 0;
      return s.datingYears >= (s.age >= 32 ? 1 : 2) && s.proposeAt <= s.age ? 1 : 0;
    },
    make: (g) => proposeCard(g, false),
  },
  { // 伴侶主動求婚
    id: 'C-YA-10P', pri: 781, once: false,
    when: (g) => {
      const s = g.s;
      const p = s.partner;
      if (!p || s.married || s.datingYears < 3 || s.proposeAt <= s.age) return 0;
      return p.traits.includes('浪漫') || p.traits.includes('顧家') ? 0.3 : 0;
    },
    make: (g) => proposeCard(g, true),
  },
  { // 成家住屋
    id: 'C-FM-02', pri: 760, fixed: true,
    when: (g) => {
      const s = g.s;
      if (s.prop || s.home === 'public' || s.publicWait !== null || s.saveForHome || s.flags['hosWait']) return 0;
      if (s.married && Number(s.flags['housingAskAt'] ?? 999) <= s.age) return 1;
      return 0;
    },
    make: (g) => housingCard(g, false),
  },
  { // 35 歲單身住屋
    id: 'C-FM-02S', pri: 750, fixed: true, ages: [35, 35],
    when: (g) => {
      const s = g.s;
      return !s.married && !s.prop && (s.home === 'rent' || s.home === 'parents' || s.home === 'share') && s.status === 'work' && s.publicWait === null && !s.saveForHome ? 1 : 0;
    },
    make: (g) => housingCard(g, true),
  },
  { // 生仔
    id: 'C-FM-04', pri: 740, fixed: true, once: false,
    when: (g) => {
      const s = g.s;
      if (!spouse(g) || s.flags['tryBaby'] || s.kids.length >= 5 || s.age >= 70) return 0;
      if (femaleAge(g) > 44) return 0;
      return s.babyAskAge <= s.age && s.babyAskAge > 0 ? 1 : 0;
    },
    make: babyCard,
  },
  { // 人工受孕跟進
    id: 'E-IVF', pri: 600, fixed: true,
    when: (g) => (g.s.flags['needIvfCard'] && spouse(g) ? 1 : 0),
    make: (g) => { delete g.s.flags['needIvfCard']; return ivfCard(g); },
  },
  { // 仔女讀書
    id: 'C-FM-06', pri: 735, fixed: true, once: false,
    when: (g) => (g.s.kids.some((k) => !k.away && (k.age === 3 || k.age === 12) && (k.schoolAsked ?? -9) < k.age - 2) ? 1 : 0),
    make: (g) => {
      const k = g.s.kids.find((x) => !x.away && (x.age === 3 || x.age === 4 || x.age === 12 || x.age === 13) && (x.schoolAsked ?? -9) < x.age - 2);
      return k ? schoolCard(g, k) : null;
    },
  },
  { // 仔女想出國讀書
    id: 'C-MA-03', pri: 600, once: false,
    when: (g) => (g.s.kids.some((k) => k.age === 17 && !k.away && (k.acad >= 60 || k.school === 2) && !k.overseas && k.path !== '出國') ? 1 : 0),
    make: (g) => {
      const k = g.s.kids.find((x) => x.age === 17 && !x.away && (x.acad >= 60 || x.school === 2))!;
      const cost = g.p(450000);
      return mkCard('C-MA-03', `${k.name}想出國讀書`, `${k.name}想去英國讀大學，一年連生活費要成 ${fmtMoney(cost)}。`, [
        { label: '全數支持', note: `每年約 ${fmtMoney(cost)}，3–4 年`, fx: { J: 2 } },
        { label: '留港讀' },
        { label: '叫佢自己申請獎學金' },
      ], (g2, i) => {
        if (i === 0) { k.overseas = true; k.path = '出國'; g2.add('J', 2); k.rel = clamp(k.rel + 5, 0, 100); return '機場送機，你塞咗封利是落佢袋。'; }
        if (i === 1) { k.rel = clamp(k.rel - 3, 0, 100); return '佢有啲失望，但都明白。'; }
        if (g2.er() < 0.25) { k.overseas = true; k.path = '出國'; k.loan = undefined; g2.add('J', 3); return '佢真係攞到獎學金！'; }
        return '申請唔到，佢決定留港讀。';
      }, { pri: 600, def: 1, auto: 1, agui: 1, cat: '人生抉擇' });
    },
  },
  { // 仔女結婚
    id: 'E-KIDWED', pri: 500, once: false,
    when: (g) => (g.s.flags['kidWedding'] ? 1 : 0),
    make: (g) => { const n = String(g.s.flags['kidWedding']); delete g.s.flags['kidWedding']; return kidWeddingCard(g, n); },
  },
  { // 仔女叫你幫手上車
    id: 'C-RT-04', pri: 520, once: false, ages: [55, 80],
    when: (g) => {
      const s = g.s;
      const k = s.kids.find((x) => x.age >= 28 && x.age <= 40 && x.job && !x.emigrated && !x.loan && !s.flags[`helped_${x.name}`]);
      if (!k || liquidAssets(g) < 500000 * g.P) return 0;
      return 0.1;
    },
    make: (g) => {
      const s = g.s;
      const k = s.kids.find((x) => x.age >= 28 && x.age <= 40 && x.job && !x.emigrated && !x.loan && !s.flags[`helped_${x.name}`])!;
      g.flag(`helped_${k.name}`);
      return helpBuyCard(g, k);
    },
  },
  { // 仔女反叛
    id: 'E-REBEL', pri: 300, once: false, cool: 3,
    when: (g) => (g.s.kids.some((k) => k.age >= 13 && k.age <= 17 && !k.away) ? 0.08 * (g.s.kids.some((k) => k.age >= 13 && k.age <= 17 && k.rel < 50) ? 2 : 1) : 0),
    make: (g) => {
      const k = g.s.kids.find((x) => x.age >= 13 && x.age <= 17 && !x.away)!;
      return mkCard('E-REBEL', `${k.name}反叛期`, `${k.name}成日關埋房門，夜晚 12 點仲喺度打機。`, [
        { label: '坐低傾' }, { label: '收手機' }, { label: '由佢' },
      ], (g2, i) => {
        if (i === 0) { k.rel = clamp(k.rel + (g2.s.R >= 50 ? 5 : 1), 0, 100); return '傾咗成晚，原來佢喺學校唔開心。'; }
        if (i === 1) { k.rel = clamp(k.rel - 6, 0, 100); k.acad = clamp(k.acad + 2, 0, 100); return '佢冇同你講嘢成個星期。'; }
        k.acad = clamp(k.acad - 2, 0, 100); return '你諗住佢大個自然會好。';
      }, { pri: 300, def: 0, auto: 0, agui: 2, cat: '生活日常' });
    },
  },
  { // 湊仔：仔女成績追唔上
    id: 'E-KIDTUTOR', pri: 280, once: true,
    when: (g) => (g.s.kids.some((k) => k.age >= 8 && k.age <= 16 && k.acad < 45 && !k.away) ? 0.5 : 0),
    make: (g) => mkCard('E-KIDTUTOR', '仔女成績追唔上', '老師打電話嚟，話小朋友成績追唔上。', [
      { label: '報補習社', money: -g.p(18000) }, { label: '自己教' }, { label: '私補', money: -g.p(48000) },
    ], (g2, i) => {
      g2.flag('kidTutor', [1, 0.5, 1.5][i]);
      g2.flag('kidClasses', [1.3, 1, 1.8][i]);
      if (i === 1) g2.add('J', -1);
      return ['逢星期二四去補習社。', '你每晚陪佢做功課。', '請咗個大學生上門補習。'][i];
    }, { pri: 280, def: 0, auto: 0, agui: 0, cat: '生活日常' }),
  },
  { // 供養父母
    id: 'C-MA-01', pri: 800, fixed: true, once: false,
    when: (g) => {
      const s = g.s;
      if (s.support || !s.parents.some((p) => p.alive) || s.age < 22) return 0;
      if (s.flags['needSupportCard']) return 1;
      return s.age === 45 && !s.once.includes('C-MA-01@45') ? (s.once.push('C-MA-01@45'), 1) : 0;
    },
    make: supportCard,
  },
  { // 移民
    id: 'C-FM-07', pri: 700, ages: [25, 55],
    when: (g) => {
      const s = g.s;
      if (s.emigrated) return 0;
      if (s.year >= 2020 && s.year <= 2024) return s.married || s.kids.length ? 0.08 : 0.04;
      return 0.01;
    },
    make: emigrateCard,
  },
  { // 回流
    id: 'E-RETURN', pri: 400,
    when: (g) => (g.s.emigrated && g.s.year - Number(g.s.flags['emigratedYear'] ?? 0) <= 5 ? 0.06 : 0),
    tick: (g) => {
      g.s.emigrated = false;
      g.add('R', 3); g.add('J', 5);
      g.ach('return_hk');
      return '外國住咗幾年，你決定回流香港。';
    },
  },
  { // 婚姻危機
    id: 'E-DIV', pri: 820, once: false, cool: 2,
    when: (g) => divorceP(g),
    make: (g) => crisisCard(g, 'div'),
  },
  { // 你出軌被發現
    id: 'E-FM-AF1C', pri: 821, once: false,
    when: (g) => (g.s.flags['crisisSelf'] && spouse(g) ? 1 : 0),
    make: (g) => crisisCard(g, 'self'),
  },
  { // 遇到誘惑
    id: 'E-FM-AF1', pri: 450, once: false, cool: 5, group: 'marriageEv', groupCool: 1, ages: [25, 65],
    when: (g) => {
      const s = g.s;
      const p = spouse(g);
      if (!p || s.marriedAt === null || s.age - s.marriedAt < 2 || s.flags['affair'] || Number(s.flags['af1Count'] ?? 0) >= 2) return 0;
      const f = (apart(g) ? 2 : 1) * (s.focus === '事業衝刺' ? 1.3 : 1) * (p.rel < 30 ? 1.8 : p.rel >= 80 ? 0.5 : 1) * (youngest(g) < 6 ? 0.8 : 1);
      return 0.008 * clamp(Mneg(s.J) * f, 0.25, 3);
    },
    make: (g) => {
      g.s.flags['af1Count'] = Number(g.s.flags['af1Count'] ?? 0) + 1;
      return mkCard('E-FM-AF1', '你遇到誘惑', '公司新同事成日搵你食飯傾偈，佢好明白你。', [
        { label: '即刻拉開距離', fx: { J: -1 } },
        { label: '曖昧下去', fx: { J: 2 } },
        { label: '出軌', fx: { J: 3 }, note: '每年開支 +$2–6 萬' },
      ], (g2, i) => {
        if (!g2.s.partner) return '';
        if (i === 0) { g2.add('J', -1); g2.s.partner.rel = clamp(g2.s.partner.rel + 2, 0, 100); return '你刪咗佢個電話，返屋企同另一半去咗食飯。'; }
        if (i === 1) { g2.add('J', 2); g2.flag('affair', 'flirt'); return '你話服自己只係朋友。'; }
        g2.add('J', 3); g2.flag('affair', 'on'); return '你開始成日話要 OT。';
      }, { pri: 450, def: 0, auto: 0, agui: 0, cat: '人生抉擇' });
    },
  },
  { // 另一半出軌
    id: 'E-FM-AF2', pri: 460, once: false, cool: 5, group: 'marriageEv', groupCool: 1,
    when: (g) => {
      const s = g.s;
      const p = spouse(g);
      if (!p) return 0;
      if (s.flags['partnerAffairAgain']) return 1;
      if (s.marriedAt === null || s.age - s.marriedAt < 2 || p.age < 25 || p.age > 65 || Number(s.flags['af2Count'] ?? 0) >= 2) return 0;
      const f = (apart(g) ? 2 : 1) * (s.focus === '事業衝刺' ? 1.3 : s.focus === '家庭優先' ? 0.7 : 1) * (p.traits.includes('事業型') ? 1.2 : 1) * (p.traits.includes('顧家') ? 0.6 : 1);
      return 0.007 * clamp(Mneg(p.rel) * f, 0.25, 3);
    },
    make: (g) => {
      const again = !!g.s.flags['partnerAffairAgain'];
      if (!again) g.s.flags['af2Count'] = Number(g.s.flags['af2Count'] ?? 0) + 1;
      g.flag('tragedyYear', g.s.year);
      g.ach('green_hat');
      return crisisCard(g, again ? 'partner2' : 'partner');
    },
  },
  { // 意外有咗
    id: 'E-FM-UP', pri: 470, once: false, group: 'marriageEv', groupCool: 1,
    when: (g) => {
      const s = g.s;
      if (!spouse(g) || s.flags['tryBaby'] || !(s.babyPlan === 'no' || s.babyPlan === 'later') || s.kids.length >= 5) return 0;
      const fa = femaleAge(g);
      if (fa >= 45 || Number(s.flags['upCount'] ?? 0) >= 2) return 0;
      return 0.015 * (fa >= 40 ? 0.5 : 1);
    },
    make: (g) => {
      g.s.flags['upCount'] = Number(g.s.flags['upCount'] ?? 0) + 1;
      return mkCard('E-FM-UP', '驚喜！', '你哋有咗BB。', [
        { label: '重新做家庭預算', fx: { J: 2 } },
        { label: '搬大啲', note: '搬屋雜費 $2–5 萬，租金 +25%', fx: { J: 3 } },
        { label: '請父母幫手湊', note: '每月俾父母 $4,000', disabled: g.s.parents.some((p) => p.alive && p.age < 75) ? undefined : '父母要健在、75 歲以下' },
      ], (g2, i) => {
        const s = g2.s;
        const r = streamRng(s.seed, 'oops', s.age);
        if (i === 0) g2.add('J', 2);
        if (i === 1) { g2.add('J', 3); g2.spend(g2.p(r.uni(20000, 50000)), '搬屋'); if (s.home === 'rent') s.rentBase = Math.round(([11000, 15000, 18000, 22000, 26000][Math.min(4, g2.householdSize())]) * 1.25); }
        if (i === 2) { s.childcare = 'parents'; }
        birth(g2, r, r() < 0.015 ? 2 : 1);
        return ['你哋坐低計清楚，原來每個月要慳 $6,000。', 'BB 房要有個窗。', '阿媽一聽到就話：「我幫你湊！」'][i] + ' 意外嘅開支冇得預先揀時間，備用金同保障要早啲準備。';
      }, { pri: 470, def: 0, auto: 0, agui: 0, cat: '人生抉擇' });
    },
  },
  { // 婚姻伏筆
    id: 'T-FAM-HINT', pri: 50, once: false, cool: 3,
    when: (g) => (divorceP(g) > 0.03 ? 1 : 0),
    tick: (g) => (g.s.F < 40 ? '你同另一半最近成日為錢嗌交。' : '你哋好耐冇一齊食過飯。'),
  },
  { // 立遺囑
    id: 'C-MA-06', pri: 560, fixed: true, once: false,
    when: (g) => {
      const s = g.s;
      if (s.will || s.flags['willNever']) return 0;
      if (s.age === 50) return 1;
      return Number(s.flags['willAskAt'] ?? 999) === s.age ? 1 : 0;
    },
    make: willCard,
  },
  { // 一家團聚（太空人家庭）
    id: 'E-REUNITE', pri: 300, once: false, cool: 3,
    when: (g) => (g.s.flags['astronaut'] ? 0.25 : 0),
    make: (g) => mkCard('E-REUNITE', '一家團聚？', '仔女視像時問你幾時可以一齊住。', [
      { label: '飛過去團聚', note: '收入 ×0.7', fx: { J: 5 } }, { label: '再捱多陣' },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 1) { g2.add('J', -1); return '你答應佢哋：「再過多一兩年。」'; }
      delete s.flags['astronaut']; delete s.flags['recur_astronaut'];
      for (const k of s.kids) if (k.age < 18) k.away = false;
      s.emigrated = true; g2.flag('emigratedYear', s.year);
      g2.add('J', 5); g2.ach('emigrate');
      return '機場出閘，仔女衝過嚟攬住你。';
    }, { pri: 300, def: 1, auto: 1, agui: 1, cat: '人生抉擇' }),
  },
];

export const familyNames = { pName };
