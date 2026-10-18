// 第 11 章 事件系統：抽事件演算法 + 一般隨機事件、騙局、時代事件、天馬行空
import type { Game } from './game';
import { clamp, Mneg, Mpos, fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, firstEnabled, capOptions, type Card, type EventDef } from './cards';
import { CAREER_EVENTS, insuranceGateCard, jobOf } from './career';
import { EDU_EVENTS } from './education';
import { BIZ_EVENTS } from './biz';
import { HISTORY_EVENTS, rewritten } from './history';
import { HEALTH_EVENTS, healthYear } from './health';
import { FAMILY_EVENTS, householdMonthly } from './family';
import { liquidAssets, propEquity, premiums, retireAssets, PET_INFO, petBlock, adoptPet, livingCostYear } from './finance';
const livingNow = (g: Game) => livingCostYear(g);

export type { Card, EventDef } from './cards';

// ---------- 騙局組統一規則（11.10） ----------
interface ScamSpec { id: string; title: string; text: string; believe: string; loss: (g: Game) => number; crypto?: boolean; mlm?: boolean }

function familyAround(g: Game) {
  const s = g.s;
  return (s.married && !!s.partner?.alive) || s.home === 'parents' || s.R >= 40;
}

function scamCard(g: Game, sp: ScamSpec): Card | null {
  const s = g.s;
  const r = streamRng(s.seed, 'scam', s.age, sp.id);
  if (r() < clamp((s.K - 40) / 80, 0, 0.6)) { g.tick(`${sp.title}：你一眼識穿呢個騙局。`); return null; }
  const hint = r() < clamp(0.3 * Mpos(s.K), 0.15, 0.6) ? '呢個回報好似太好，有啲唔妥。' : undefined;
  const fam = familyAround(g);
  const amt = Math.round(sp.loss(g));
  return mkCard(sp.id, sp.title, sp.text, [
    { label: sp.believe, money: -amt },
    { label: '唔信' },
    { label: '先問家人', disabled: fam ? undefined : '身邊冇人可以問' },
  ], (g2, i) => {
    const s2 = g2.s;
    const lose = (x: number) => {
      if (sp.crypto) {
        // 「穩賺」加密貨幣群組：70% 係騙局，1–3 年內爆煲
        const scam = r() < 0.7;
        g2.spend(x, '入群組');
        s2.scamWatch = { amount: x, boomYear: s2.year + r.int(1, 3), isScam: scam };
        return `你入咗 ${fmtMoney(x)}，群組入面個個都話賺咗幾倍。`;
      }
      const note = g2.spend(x, '騙案');
      g2.add('J', -10, '中咗騙案');
      if (sp.mlm) g2.add('R', -5);
      g2.ach('scammed');
      return `你損失咗 ${fmtMoney(x)}${note}。`;
    };
    if (i === 1) return '天下冇免費午餐。';
    if (i === 2) {
      const calm = s2.married && s2.partner?.traits.includes('冷靜');
      const pDetect = calm ? 1 : Math.min(0.95, 0.85 * Math.sqrt(Mpos(s2.R)));
      if (r() < pDetect) { g2.add('R', 1); return '屋企人聽完即刻話：「呢個係騙案嚟㗎！」'; }
      return `屋企人都覺得可信……${lose(Math.round(amt / 2))}`;
    }
    return lose(amt);
  }, { pri: 300, def: fam ? 2 : 1, auto: fam ? 2 : 1, agui: 1, cat: '生活陷阱', reason: hint });
}

const liq = (g: Game) => liquidAssets(g);
const SCAMS: (EventDef & { spec: ScamSpec })[] = [
  {
    id: 'S-CRYPTO', pri: 300, ages: [18, 50], years: [2017, 2200], group: 'scam', groupCool: 3, cool: 5, once: false,
    when: (g) => (g.s.cash >= 20000 * g.P ? 0.04 * clamp(Mneg(g.s.K) * Math.sqrt(Mpos(g.s.R)), 0.25, 3) : 0),
    spec: { id: 'S-CRYPTO', title: '「穩賺」加密貨幣群組', text: '朋友拉你入群組，話跟住「老師」買幣，一個月翻倍。', believe: '入錢', loss: (g) => g.s.cash * 0.3, crypto: true },
  },
  {
    id: 'S-OVERSEAS', pri: 300, ages: [30, 65], group: 'scam', groupCool: 3, cool: 5, once: false,
    when: (g) => (liq(g) >= 500000 * g.P ? 0.02 * clamp(Mneg(g.s.K), 0.25, 3) : 0),
    spec: { id: 'S-OVERSEAS', title: '海外樓盤「保證回報」', text: '酒店講座話買海外樓花保證每年 8% 租金回報。', believe: '買', loss: (g) => Math.min(liq(g) * 0.5, 1_500_000 * g.P) * 0.75 },
  },
  {
    id: 'S-DATING', pri: 300, ages: [18, 85], years: [2012, 2200], group: 'scam', groupCool: 3, once: false,
    when: (g) => 0.02 * clamp(Mneg(g.s.K) * Math.sqrt(Mneg(g.s.R)) * (g.s.married ? 1 : 1.5), 0.25, 3),
    spec: { id: 'S-DATING', title: '網上認識嘅「知己」', text: '網上認識咗個好傾得嚟嘅人，佢話屋企有急事，想借錢周轉。', believe: '借俾佢', loss: (g) => clamp(liq(g) * 0.3, 20000 * g.P, 300000 * g.P) },
  },
  {
    id: 'S-PHONE', pri: 300, ages: [18, 100], years: [2004, 2200], group: 'scam', groupCool: 3, cool: 4, once: false,
    when: (g) => (g.s.cash >= 20000 * g.P ? 0.02 * clamp(Mneg(g.s.K) * (g.s.age >= 65 ? 1.5 : 1) * (g.s.year >= 2013 ? 1.3 : 1), 0.25, 3) : 0),
    spec: { id: 'S-PHONE', title: '電話騙案', text: '有人打嚟自稱係官員，話你戶口涉及洗黑錢，要你轉錢去「安全戶口」。', believe: '照做', loss: (g) => Math.min((g.s.cash + g.s.deposit) * 0.3, 500000 * g.P) },
  },
  {
    id: 'S-COURSE', pri: 300, ages: [25, 70], group: 'scam', groupCool: 3, once: false,
    when: (g) => 0.02 * clamp(Mneg(g.s.K), 0.25, 3),
    spec: { id: 'S-COURSE', title: '「免費」投資講座', text: '「免費」講座講到最後，導師叫你報 $5 萬嘅「財富自由課程」。', believe: '報名', loss: (g) => g.p(50000) },
  },
  {
    id: 'S-GROUP', pri: 300, ages: [25, 75], years: [2018, 2200], group: 'scam', groupCool: 3, once: false,
    when: (g) => (liq(g) > 50000 * g.P ? 0.02 * clamp(Mneg(g.s.K) * Math.sqrt(Mneg(g.s.R)), 0.25, 3) : 0),
    spec: { id: 'S-GROUP', title: '網上投資群組「老師」', text: '群組「老師」日日貼截圖，話跟佢買嘅股票全部升。', believe: '跟', loss: (g) => liq(g) * 0.3 },
  },
  {
    id: 'S-MLM', pri: 300, ages: [25, 60], group: 'scam', groupCool: 3, once: false,
    when: (g) => 0.02 * clamp(Math.sqrt(Mpos(g.s.R)) * Mneg(g.s.K), 0.25, 3),
    spec: { id: 'S-MLM', title: '保健品傳銷', text: '舊同學約你飲咖啡，原來係想你入貨做「事業夥伴」。', believe: '加入', loss: (g) => g.p(60000) * 0.7, mlm: true },
  },
];

// ---------- 一般隨機事件 ----------
const T = (id: string, ages: [number, number], p: (g: Game) => number, fn: (g: Game) => string | void, extra: Partial<EventDef> = {}): EventDef =>
  ({ id, pri: 100, ages, once: false, when: p, tick: fn, ...extra });

function investAdjustCard(g: Game): Card {
  const s = g.s;
  return mkCard('C-MA-05', `${s.age} 歲投資檢討`, `你而家每月將 ${Math.round(s.investRatio * 100)}% 收入拎去投資。要唔要調整？（遊戲模擬，不構成投資建議）`, [
    { label: '加大投資', note: '投資比例 +10%' },
    { label: '維持' },
    { label: '轉保守', note: '轉做定存為主' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0) s2.investRatio = Math.min(0.5, s2.investRatio + 0.1);
    if (i === 2) {
      s2.alloc = { deposit: 70, plan: 0, index: 30, stock: 0, crypto: 0 };
      const move = s2.stock * 0.5 + s2.crypto * 0.5;
      s2.stock *= 0.5; s2.crypto *= 0.5; s2.deposit += move;
    }
    return ['你決定趁仲有收入，加大投資。', '保持紀律，照舊月供。', '你將部分資產轉去穩陣啲嘅地方。'][i];
  }, { pri: 560, def: 1, auto: s.age >= 60 ? 2 : 1, agui: s.age >= 60 ? 2 : 1, kind: 'system', scene: 'bank' });
}

function crashCard(g: Game): Card {
  const s = g.s;
  const held = s.index + s.stock + s.crypto;
  return mkCard('E-CRASH', '股災', `股市一個月跌咗兩成，你手上投資而家值 ${fmtMoney(held)}。（遊戲模擬，不構成投資建議）`, [
    { label: '減風險', note: '賣一半轉定存' },
    { label: '維持', note: '繼續月供' },
    { label: '加注追回報', note: '拎現金一半入市' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0) { const m = (s2.index + s2.stock) * 0.5; s2.index *= 0.5; s2.stock *= 0.5; s2.deposit += m; g2.flag('soldLow', s2.year); return '你賣咗一半，瞓得安穩啲，但錯過咗之後嘅反彈。'; }
    if (i === 2) { const m = s2.cash * 0.5; s2.cash -= m; s2.index += m; g2.add('J', -1); return '你咬緊牙關入市。'; }
    g2.flag('heldCrash', s2.year);
    return '你照舊月供，平均成本慢慢拉低。';
  }, { pri: 700, def: 1, auto: 1, agui: 1, cat: '財務衝擊', scene: 'bank' });
}

function rateHikeCard(g: Game): Card {
  const s = g.s;
  const p = s.prop!;
  return mkCard('E-RATE', '加息，供樓開支上升', `按揭利率升到 ${(g.e.rmort * 100).toFixed(1)}%，每月供 ${fmtMoney(p.pmt)}，已經食咗家庭收入一半。`, [
    { label: '削減開支', fx: { J: -3 } },
    { label: '用備用金頂' },
    { label: '賣樓' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0) { g2.add('J', -3, '慳住過'); g2.flag('cutback', s2.year); return '你哋取消咗旅行，出街食飯都少咗。'; }
    if (i === 2) return sellHome(g2, 0.97);
    return (s2.cash + s2.deposit) > p.pmt * 6 ? '備用金頂得住，你慶幸當初有儲。' : '備用金唔夠，卡數開始滾。';
  }, { pri: 700, def: 1, auto: 1, agui: 1, cat: '財務衝擊' });
}

function sellHome(g: Game, k: number): string {
  const s = g.s;
  if (!s.prop) return '';
  const eq = propEquity(g);
  const val = s.prop.price0 * (g.e.hpi / s.prop.hpi0);
  const net = val * k - s.prop.mortgage;
  s.cash += net;
  s.prop = null;
  s.home = 'rent';
  s.rentBase = 0;
  void eq;
  return net >= 0 ? `層樓賣咗，套現 ${fmtMoney(net)}，之後租樓住。` : `層樓賣咗都仲欠銀行 ${fmtMoney(-net)}。`;
}

function negEquityCard(g: Game): Card {
  const s = g.s;
  const gap = -propEquity(g);
  return mkCard('E-NEG', '負資產', `樓價跌咗，你層樓而家值少過欠銀行嘅錢 ${fmtMoney(gap)}。`, [
    { label: '繼續供' }, { label: '賣樓止蝕' }, { label: '同銀行商量延長年期', note: '月供減少，總利息增加' },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 1) { g2.add('J', -5); return sellHome(g2, 0.97); }
    if (i === 2 && s2.prop) { s2.prop.monthsLeft = Math.min(s2.prop.monthsLeft + 60, Math.max(12, (75 - s2.age) * 12)); return '月供輕咗少少，但要供多幾年。'; }
    const short = s2.cash + s2.deposit < (s2.prop?.pmt ?? 0) * 3;
    if (short && g2.er() < 0.3) { g2.add('J', -10, '負資產'); return '現金唔夠，銀行要求你加按金，你周圍借錢。'; }
    return '你決定咬實牙關供落去，等樓價回升。';
  }, { pri: 700, def: 0, auto: 0, agui: 0, cat: '財務衝擊' });
}

function borrowCard(g: Game): Card {
  const s = g.s;
  const guarantee = g.er() < 0.3;
  const amt = Math.round(guarantee ? 300000 * g.P : clamp(liq(g) * 0.2, 20000 * g.P, 200000 * g.P));
  const why = s.flags['jackpotYear'] && s.year - Number(s.flags['jackpotYear']) <= 5 ? '（中咗獎之後，搵你借錢嘅人多咗）' : undefined;
  return mkCard('C-AN-04', guarantee ? '親戚叫你做擔保人' : '朋友借錢', guarantee ? `表哥做生意要借錢，叫你做 ${fmtMoney(amt)} 貸款嘅擔保人。` : `舊同學話周轉唔靈，想借 ${fmtMoney(amt)}，「三個月內一定還」。`, [
    { label: guarantee ? '做擔保' : '借', money: guarantee ? 0 : -amt, fx: { R: 1 } },
    { label: guarantee ? '唔擔保' : '唔借', fx: { R: -3 } },
    { label: guarantee ? '擔保一半' : '借一半', money: guarantee ? 0 : -Math.round(amt / 2), fx: { R: -1 } },
  ], (g2, i) => {
    const s2 = g2.s;
    const r = streamRng(s2.seed, 'borrow', s2.age);
    if (i === 1) { g2.add('R', -3); return '你拒絕咗，之後佢冇再搵你。'; }
    const part = i === 0 ? amt : amt / 2;
    g2.add('R', i === 0 ? 1 : -1);
    if (guarantee) {
      if (r() < 0.3) { const n = g2.spend(Math.round(part), '代還'); g2.add('J', -5); return `表哥生意失敗，你要代還 ${fmtMoney(part)}${n}。`; }
      return '表哥準時還款，你鬆咗一口氣。';
    }
    g2.spend(Math.round(part), '借錢');
    if (r() < Math.min(0.6, 0.4 * Math.sqrt(Mpos(s2.R)))) { s2.cash += part; return '佢真係準時還錢，仲請你食飯。'; }
    g2.add('R', -2); g2.add('J', -2);
    return '三個月變咗三年，佢已讀不回。';
  }, { pri: 300, def: 2, auto: 1, agui: 2, cat: '生活陷阱', reason: why });
}

function jackpotCard(g: Game): Card {
  const s = g.s;
  const r = streamRng(s.seed, 'jackpot', s.age);
  const prize = Math.round(r.uni(8_000_000, 30_000_000) * Math.max(0.3, g.P));
  g.s.lotteryWon += prize;
  return mkCard('C-AN-06', '中咗六星彩頭獎！', `你張彩票 6 個號碼全中，獎金 ${fmtMoney(prize)}！（機率約 1 / 13,983,816）`, [
    { label: '全部使', fx: { J: 10 } },
    { label: '一半投資', fx: { J: 8 } },
    { label: '全部投資', fx: { J: 6 } },
  ], (g2, i) => {
    const s2 = g2.s;
    g2.ach('jackpot');
    if (i === 0) { s2.cash += prize; g2.add('J', 10); g2.flag('lotterySplurge', Math.round(prize * 0.2)); g2.flag('splurgeUntil', s2.age + 5); return '跑車、名錶、新樓……'; }
    if (i === 1) { s2.cash += prize / 2; s2.index += prize / 2; g2.add('J', 8); return '你留咗一半，諗住俾自己退休用。'; }
    s2.index += prize; g2.add('J', 6);
    return '你繼續返工，冇人知你中咗獎。';
  }, { pri: 850, def: 1, auto: 1, agui: 1, cat: '財務衝擊' });
}

function mpfShortCard(g: Game): Card {
  const hasKids = g.s.kids.some((k) => k.job && !k.emigrated);
  return mkCard('E-MPF65', '發現退休錢唔夠用', '65 歲計一計數，原來退休儲蓄只係需要嘅一半都唔夠。', [
    { label: '繼續做', note: '兼職收入，健康每年 −1' },
    { label: '減開支', fx: { J: -5 } },
    { label: '靠仔女', disabled: hasKids ? undefined : '冇已出身嘅仔女' },
  ], (g2, i) => {
    const s = g2.s;
    if (i === 0) { s.focus = '退而不休'; return '你搵咗份兼職，每日返半日。'; }
    if (i === 1) { g2.add('J', -5, '節衣縮食'); g2.flag('cutback', s.year); return '你戒咗飲茶，改喺屋企煮。'; }
    for (const k of s.kids) k.rel = clamp(k.rel - 10, 0, 100);
    g2.flag('kidsSupport');
    return '仔女每月俾多咗家用，但你知佢哋都唔易。';
  }, { pri: 700, def: 1, auto: 0, agui: 0, cat: '財務衝擊' });
}

function longevityCard(g: Game): Card {
  const s = g.s;
  const rm = s.prop && s.prop.mortgage <= 0;
  return mkCard('E-LONG', '錢夠唔夠用到 95 歲？', `照而家咁使，你嘅積蓄大概只夠用到 ${s.fParts.untilAge} 歲。`, [
    { label: '做反向按揭', disabled: rm ? undefined : '要有冇按揭嘅物業' },
    { label: '減開支', fx: { J: -5 } },
    { label: '申請綜援 / 靠仔女', fx: { J: -8 } },
  ], (g2, i) => {
    const s2 = g2.s;
    if (i === 0 && s2.prop) { const v = s2.prop.price0 * (g2.e.hpi / s2.prop.hpi0); s2.reverseMortgage = Math.round(v * (0.0028 + Math.max(0, s2.age - 65) * 0.0001)); return `層樓每月俾你 ${fmtMoney(s2.reverseMortgage)}，你照住喺度。`; }
    if (i === 1) { g2.add('J', -5); return '你學識咗格價。'; }
    g2.add('J', -8);
    return '你放低面子，申請咗援助。';
  }, { pri: 700, def: 1, auto: rm ? 0 : 1, agui: 1, cat: '財務衝擊' });
}

const GENERAL_EVENTS: EventDef[] = [
  ...SCAMS.map(({ spec, ...d }) => ({ ...d, make: (g: Game) => scamCard(g, spec) })),
  // 「穩賺」群組爆煲
  T('S-CRYPTO-BOOM', [18, 110], (g) => (g.s.scamWatch && g.s.scamWatch.boomYear <= g.s.year ? 1 : 0), (g) => {
    const w = g.s.scamWatch!;
    g.s.scamWatch = null;
    if (w.isScam) { g.add('J', -10, '群組爆煲'); g.ach('scammed'); return `群組一夜之間解散，你嘅 ${fmtMoney(w.amount)} 冇咗。`; }
    const r = streamRng(g.s.seed, 'cryptoBack', g.s.age);
    const back = Math.max(0, w.amount * (1 + 0.6 * r.normal()));
    g.s.cash += back;
    return `群組真係冇走佬，你取返 ${fmtMoney(back)}。`;
  }, { pri: 900 }),
  // 債務太重：v0.6 改為破產結局（見 game.ts bankruptCheck 同 E-DEBT 財困卡）
  // 交唔起保費：保單失效
  T('E-LAPSE', [18, 110], (g) => (premiums(g) > 0 && g.s.cash + g.s.deposit + g.s.index + g.s.stock < premiums(g) && g.s.card > 0 ? 1 : 0), (g) => {
    for (const k of ['med', 'ci', 'acc', 'life'] as const) g.s.ins[k] = { level: 0, a0: 0, s0: 0, p0: 1, age0: 0 };
    g.add('J', -3);
    return '你交唔起保費，所有保單失效。之後有病就要自己頂。';
  }, { pri: 850, cat: '財務衝擊' }),
  // 生活日常 ticker
  T('T-T8', [6, 17], () => 0.25, (g) => { g.add('R', 1); g.add('J', 1); return '八號風球停課，同屋企人打麻雀。'; }, { cool: 2 }),
  T('T-MONITOR', [9, 17], (g) => 0.06 * clamp(Mpos(g.s.R) * Math.sqrt(Mpos(g.s.K)), 0.25, 3), (g) => { g.add('R', 2); g.add('K', 1); return '你被選做班長。'; }, { cool: 3 }),
  T('T-AWARD', [6, 17], (g) => (g.s.hobbyClass || g.s.focus === '培養興趣' ? 0.1 * Math.sqrt(Mpos(g.s.H)) : 0), (g) => { g.add('J', 2); g.s.IP++; return g.s.hobbyClass === 2 ? '你喺音樂比賽得咗獎。' : '你喺運動會攞咗金牌。'; }, { cool: 3 }),
  T('T-REUNION', [30, 65], (g) => 0.05 * Mpos(g.s.R), (g) => { g.add('R', 2); g.add('J', 1); if (g.er() < 0.1) g.flag('jobhunt', g.s.year); return '舊同學聚會，大家都老咗少少。'; }, { cool: 5 }),
  T('T-PHONE', [13, 90], () => 0.05, (g) => { const c = g.p(g.er.uni(3000, 8000)); g.spend(c, '手機'); return `手機跌爛咗，換部新嘅用咗 ${fmtMoney(c)}。`; }, { cool: 2 }),
  T('T-DINNER', [22, 64], (g) => (g.s.status === 'work' ? 0.02 : 0), (g) => { const c = g.p(g.er.uni(5000, 20000)); g.gain(c); g.add('J', 2); return `公司周年晚宴抽中大獎，${fmtMoney(c)}！`; }, { cool: 5 }),
  T('T-FLIGHT', [18, 85], (g) => (g.s.flags['travelled'] === g.s.year ? 0.08 : 0), (g) => { const c = g.p(g.er.uni(2000, 5000)); g.spend(c, '旅行'); g.add('J', -1); return `航班取消，多使咗 ${fmtMoney(c)}。`; }),
  T('T-SEVENS', [18, 80], (g) => 0.08 * Math.sqrt(Mpos(g.s.J)), (g) => { g.add('J', 1); g.add('R', 1); g.spend(g.p(2000), '娛樂'); return g.er.pick(['你同朋友去咗睇七人欖球賽。', '你去咗國際藝術展。', '你去咗設計展打卡。']); }, { cool: 2 }),
  T('T-RED', [22, 75], () => 0.3, (g) => {
    const c = g.p(g.er.uni(3000, 20000) * g.s.R / 50 * (g.s.partner?.traits.includes('好客') ? 1.3 : 1));
    g.spend(c, '人情');
    return `今年飲咗幾次，人情紅白事用咗 ${fmtMoney(c)}。`;
  }),
  T('T-SIBWED', [20, 50], (g) => (g.s.siblings > 0 ? 0.03 : 0), (g) => { const c = g.p(g.er.uni(10000, 30000)); g.spend(c, '人情'); return `兄弟姊妹結婚，你俾咗 ${fmtMoney(c)} 人情。`; }, { cool: 4 }),
  T('T-SIBHOME', [25, 60], (g) => (g.s.siblings > 0 ? 0.03 : 0), () => '兄弟姊妹今年上咗車。', { cool: 6 }),
  T('T-BANKRUPT', [18, 64], (g) => (g.s.status === 'work' ? 0.005 : 0), (g) => { const lost = g.monthlyIncome() * 2; const back = Math.min(lost, 36000 * g.P); g.spend(lost - back, '欠薪'); return `公司倒閉，欠你兩個月人工，破產欠薪保障基金補返 ${fmtMoney(back)}。`; }),
  T('T-TALENT', [22, 60], (g) => (g.s.year >= 2023 && g.s.status === 'work' ? 0.04 : 0), (g) => { if (g.s.job) { g.s.job.promoBoost = 0.8; g.s.job.promoBoostYears = 3; } return '大量專業人才來港，公司升職競爭激烈咗。'; }),
  T('T-RENTUP', [18, 100], (g) => (g.s.year >= 2023 && g.s.year <= 2026 && (g.s.home === 'rent' || g.s.home === 'share') ? 0.15 : 0), (g) => { g.s.rentBase = Math.round((g.s.rentBase || 11000) * 1.1); return '租屋需求大增，業主加租一成。'; }),
  T('T-AI', [22, 64], (g) => (g.s.year >= 2023 && (g.s.focus === '增值進修' || g.s.panel.includes('course')) && !g.s.aiSkill ? 0.15 * Mpos(g.s.K) : 0), (g) => { g.s.aiSkill = true; if (g.s.job) g.s.job.salary = Math.round(g.s.job.salary * 1.08); return '你自費學 AI 工具，老闆加咗你人工。'; }),
  T('T-PREMIUM', [30, 90], (g) => (g.s.age % 10 === 0 && premiums(g) > 0 ? 1 : 0), (g) => `你嘅保費今年起又加咗，而家每年 ${fmtMoney(premiums(g))}。`),
  T('T-FRIENDS-EMI', [18, 70], (g) => (g.s.year >= 2020 && g.s.year <= 2023 ? 0.25 : 0), (g) => { g.add('R', -2); return '又有朋友移民，你去機場送機。'; }),
  // 生活日常互動
  {
    id: 'E-BULLY', pri: 200, ages: [9, 15], cat: '生活日常',
    when: (g) => 0.03 * Mneg(g.s.R),
    make: (g) => mkCard('E-BULLY', '被同學排擠', '班上有幾個同學成日唔理你，仲喺群組講你壞話。', [
      { label: '話俾老師知' }, { label: '忍住' }, { label: '搵朋友傾' },
    ], (g2, i) => {
      if (i === 0) { if (g2.er() < 0.7) { g2.add('R', 2); return '老師處理咗，佢哋之後收斂咗。'; } return '老師講咗兩句，但情況冇乜改善。'; }
      if (i === 1) { g2.add('J', -6, '被排擠'); g2.add('K', -1); return '你成個學期都唔想返學。'; }
      if (g2.s.R >= 40 && g2.er() < 0.8) { g2.add('J', 2); return '好朋友陪你食晏，你覺得冇咁孤單。'; }
      g2.add('J', -3); return '你搵唔到人傾。';
    }, { pri: 200, def: 0, auto: 0, agui: 1 }),
  },
  {
    id: 'E-RENT', pri: 200, ages: [18, 100], once: false, cool: 2, cat: '生活日常',
    when: (g) => (g.s.home === 'rent' ? 0.06 * Math.sqrt(Mneg(g.s.F)) : 0),
    make: (g) => mkCard('E-RENT', '業主加租', '業主話約滿要加租 15%，唔接受就要搬。', [
      { label: '接受加租', note: '租金 +15%' }, { label: '搬細啲', fx: { J: -2 } }, { label: '搬遠啲', fx: { J: -1 } },
    ], (g2, i) => {
      const s = g2.s;
      const base = s.rentBase || [11000, 15000, 18000, 22000, 26000][Math.min(4, g2.householdSize() - 1)];
      if (i === 0) { s.rentBase = Math.round(base * 1.15); return '你咬咬牙續約。'; }
      g2.spend(g2.p(15000), '搬屋');
      s.rentBase = Math.round(base * (i === 1 ? 0.85 : 0.9));
      g2.add('J', i === 1 ? -2 : -1);
      return i === 1 ? '新屋細咗，但租金平返啲。' : '返工遠咗，每日多咗一個鐘車程。';
    }, { pri: 200, def: 0, auto: 1, agui: 0 }),
  },
  { // 負債過多警告（破產前最後機會）
    id: 'E-DEBT', pri: 905, fixed: true, once: false, cat: '財務衝擊', ages: [18, 120],
    when: (g) => (g.s.flags['debtCardDue'] ? 1 : 0),
    make: (g) => {
      delete g.s.flags['debtCardDue'];
      const s = g.s;
      const debt = s.card + s.finco + s.privateLoan + (s.biz?.loan ?? 0);
      const canIva = !s.flags['ivaUsed'] && s.card + s.finco > 0;
      const canMove = s.home !== 'own' && s.home !== 'public' && s.home !== 'subdiv' && s.home !== 'institution';
      return mkCard('E-DEBT', '財困：快要破產', `你欠落 ${fmtMoney(debt)}，連最低還款都俾唔起。再咁落去就會被人入稟破產，人生遊戲會提早結算，理財分數變 0。`, [
        { label: '債務重組', note: '卡數同財務公司變做低息分期，5 年內還', fx: { R: -3 }, disabled: canIva ? undefined : s.flags['ivaUsed'] ? '一世只可以重組一次' : '冇卡數或財務公司欠款' },
        { label: '縮皮搬平啲', note: '搬去劏房、開支減兩成', fx: { J: -5 }, disabled: canMove ? undefined : '而家已經冇得再搬平' },
        { label: '節衣縮食', note: '開支減兩成，維持三年', fx: { J: -3 } },
        { label: '唔理佢', note: '明年仍然還唔到就破產' },
      ], (g2, i) => {
        const st = g2.s;
        if (i === 0) {
          st.privateLoan += st.card + st.finco; st.card = 0; st.finco = 0;
          st.flags['ivaUsed'] = true; st.flags['ivaUntil'] = st.age + 5; st.flags['debtGrace'] = st.age + 4; g2.add('R', -3, '債務重組');
          return '你同債權人達成協議，每月定額還款，暫時唔使破產。';
        }
        if (i === 1) {
          st.home = 'subdiv'; st.rentBase = 0; st.flags['recur_frugal'] = -Math.round(livingNow(g2) * 0.2 / g2.P);
          st.flags['frugalUntil'] = st.age + 5; st.flags['debtGrace'] = st.age + 3; g2.add('J', -5, '縮皮搬屋');
          return '你搬咗去劏房，每樣嘢都慳住使。';
        }
        if (i === 2) {
          st.flags['recur_frugal'] = -Math.round(livingNow(g2) * 0.2 / g2.P);
          st.flags['frugalUntil'] = st.age + 3; st.flags['debtGrace'] = st.age + 2; g2.add('J', -3, '節衣縮食');
          return '你戒咗出街食飯同買嘢，每個月記帳。';
        }
        return '你決定唔諗住先。';
      }, { pri: 905, def: 0, auto: 0, agui: 0, cat: '財務衝擊', scene: 'bank' });
    },
  },
  { // 健康 ≤ 25：強制出補救選項，令玩家即刻留意到
    id: 'E-RESCUE-H', pri: 900, fixed: true, once: false, cool: 5, cat: '健康', ages: [6, 120],
    when: (g) => (g.s.H <= 25 && g.s.alive && rescueOk(g, 'H') ? 1 : 0),
    make: (g) => {
      rescueMark(g, 'H');
      const kid = g.s.age < 18;
      const doc = g.p(kid ? 0 : 1500);
      return mkCard('E-RESCUE-H', '身體響警號', `你嘅健康得返 ${Math.round(g.s.H)} 分，成日覺得好攰。要即刻做啲嘢。`, kid ? [
        { label: '同屋企人去睇醫生', fx: { H: 5 } },
        { label: '每日放學去公園跑步', fx: { H: 4, J: 1 } },
        { label: '早啲瞓，唔再打機打通宵', fx: { H: 3, J: -1 } },
        { label: '唔理佢', note: '冇任何改變' },
      ] : [
        { label: '睇醫生做身體檢查', note: `約 ${fmtMoney(doc)}`, fx: { H: 5 } },
        { label: '開始每星期做運動', fx: { H: 4, J: 1 } },
        { label: '早啲瞓、戒宵夜', fx: { H: 3 } },
        { label: '唔理佢', note: '冇任何改變' },
      ], (g2, i) => {
        if (i === 3) return '你話自己冇事，照舊咁過。';
        if (!kid && i === 0) { g2.spend(doc, '身體檢查'); g2.add('H', 5); return '醫生幫你調整咗生活習慣，你精神咗好多。'; }
        if (i === 0) { g2.add('H', 5); return '醫生開咗藥，叮囑你要多休息。'; }
        if (i === 1) { g2.add('H', 4); g2.add('J', 1); return '頭幾日好辛苦，之後越跑越輕鬆。'; }
        g2.add('H', 3); if (kid) g2.add('J', -1); return '瞓夠覺，成個人清醒咗。';
      }, { pri: 900, def: 1, auto: 1, agui: 0, cat: '健康' });
    },
  },
  { // 快樂 ≤ 25：強制出補救選項
    id: 'E-RESCUE-J', pri: 899, fixed: true, once: false, cool: 5, cat: '健康', ages: [6, 120],
    when: (g) => (g.s.J <= 25 && g.s.alive && rescueOk(g, 'J') ? 1 : 0),
    make: (g) => {
      rescueMark(g, 'J');
      const kid = g.s.age < 18;
      const fee = g.p(3200);
      const c = mkCard('E-RESCUE-J', '心情好差', `你嘅快樂得返 ${Math.round(g.s.J)} 分，最近成日唔想出門口。`, kid ? [
        { label: '同爸爸媽媽傾吓', fx: { J: 4, R: 1 } },
        { label: '搵學校社工', fx: { J: 5 } },
        { label: '約同學出去玩', fx: { J: 3, R: 2 } },
        { label: '唔理佢', note: '冇任何改變' },
      ] : [
        { label: '見輔導員傾幾次', note: `約 ${fmtMoney(fee)}`, fx: { J: 6 } },
        { label: '約朋友食飯傾偈', fx: { J: 3, R: 2 } },
        { label: '打去「情緒通」18111', note: '免費，24 小時', fx: { J: 4 } },
        { label: '唔理佢', note: '冇任何改變' },
      ], (g2, i) => {
        if (i === 3) return '你話自己頂得順，照舊咁過。';
        if (kid) {
          if (i === 0) { g2.add('J', 4); g2.add('R', 1); return '講咗出嚟，心入面輕鬆咗。'; }
          if (i === 1) { g2.add('J', 5); return '社工姑娘教咗你幾個減壓方法。'; }
          g2.add('J', 3); g2.add('R', 2); return '同朋友玩咗一日，暫時唔諗啲煩惱。';
        }
        if (i === 0) { g2.spend(fee, '輔導'); g2.add('J', 6); return '輔導員幫你理清思緒，你慢慢搵返方向。'; }
        if (i === 1) { g2.add('J', 3); g2.add('R', 2); return '朋友聽你講咗成晚，你覺得冇咁孤單。'; }
        g2.add('J', 4); return '電話另一邊嘅人好耐心咁聽你講。';
      }, { pri: 899, def: 1, auto: 1, agui: 0, cat: '健康' });
      c.hotline = true;
      return c;
    },
  },
  {
    id: 'E-PET', pri: 760, fixed: true, once: false, ages: [19, 80], cat: '生活日常',
    when: (g) => (petAskDue(g) ? 1 : 0),
    make: (g) => {
      g.s.flags['petAskN'] = Number(g.s.flags['petAskN'] ?? 0) + 1;
      const more = g.s.pets.length > 0;
      return mkCard('E-PET', more ? '再養多隻寵物？' : '養唔養寵物？', more ? '朋友屋企隻寵物生咗 BB，問你要唔要多養一隻。' : '朋友屋企隻寵物生咗 BB，問你要唔要領養一隻。', [
        { label: '養貓', note: `每年約 ${fmtMoney(g.p(PET_INFO.cat.year))}`, fx: { J: 3 }, disabled: petBlock(g, 'cat') ?? undefined },
        { label: '養狗', note: `每年約 ${fmtMoney(g.p(PET_INFO.dog.year))}`, fx: { J: 3 }, disabled: petBlock(g, 'dog') ?? undefined },
        { label: '唔養' },
      ], (g2, i) => {
        if (i === 2) return '你覺得而家照顧唔到。';
        return adoptPet(g2, i === 0 ? 'cat' : 'dog');
      }, { pri: 760, def: 2, auto: 2, agui: 2 });
    },
  },
  {
    id: 'E-PETSICK', pri: 200, ages: [10, 100], once: false, cool: 3, cat: '生活日常',
    when: (g) => (g.s.pets.length ? 0.04 * Math.min(2, g.s.pets.length) : 0),
    make: (g) => {
      const c = g.p(40000);
      const pet = g.s.pets[Math.floor(g.er() * g.s.pets.length)] ?? g.s.pets[0];
      return mkCard('E-PETSICK', `${pet ? `「${pet.name}」` : '寵物'}急病`, `獸醫話要做大手術，要成 ${fmtMoney(c)}。`, [
        { label: '救', money: -c }, { label: '唔救', fx: { J: -10 } }, { label: '揀平啲療程', money: -Math.round(c / 3) },
      ], (g2, i) => {
        if (i === 0) { g2.spend(c, '獸醫'); return '手術成功，佢又可以喺屋企跑嚟跑去。'; }
        if (i === 2) { g2.spend(Math.round(c / 3), '獸醫'); if (g2.er() < 0.5) return '平啲嘅療程都救返佢。'; }
        g2.s.pets = g2.s.pets.filter((x) => x !== pet); g2.add('J', -10, '寵物離開'); return '佢最後都離開咗你。';
      }, { pri: 200, def: 0, auto: 0, agui: 0 });
    },
  },
  {
    id: 'E-IMPULSE', pri: 200, ages: [18, 80], once: false, cool: 2, cat: '生活陷阱',
    when: (g) => (g.s.J < 40 ? 0.1 * Mneg(g.s.J) : 0),
    make: (g) => {
      const c = g.p(20000);
      return mkCard('E-IMPULSE', '衝動消費', '心情差，行過名店見到個新手袋 / 新手機，好想買嚟獎勵自己。', [
        { label: '買', money: -c, fx: { J: 3 } }, { label: '唔買' }, { label: '分期買', note: '入卡數' },
      ], (g2, i) => {
        if (i === 0) { g2.spend(c, '購物'); g2.add('J', 3); return '開心咗幾日。'; }
        if (i === 2) { g2.s.card += c; g2.add('J', 3); return '「免息分期」，但卡數又多咗。'; }
        return '你忍住咗，返屋企沖個涼瞓覺。';
      }, { pri: 200, def: 1, auto: 1, agui: 1 });
    },
  },
  {
    id: 'E-CARDMAX', pri: 300, ages: [18, 85], once: false, cool: 2, cat: '生活陷阱',
    when: (g) => (g.s.card + g.s.finco > g.monthlyIncome() * 3 && g.s.card + g.s.finco > 10000 * g.P ? 0.3 * Mneg(g.s.F) : 0),
    make: (g) => mkCard('E-CARDMAX', '卡數失控，被追數', `你欠咗卡數同財務公司 ${fmtMoney(g.s.card + g.s.finco)}，日日有人打嚟追。`, [
      { label: '債務重組', note: '利息降低，但之後難借按揭' }, { label: '搵家人幫', fx: { R: -5 } }, { label: '繼續拖', fx: { J: -8 } },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 0) { s.privateLoan += s.card + s.finco; s.card = 0; s.finco = 0; g2.flag('iva', s.year); return '你簽咗債務重組，利息降低，每月定額還款。'; }
      if (i === 1) { const help = Math.min(s.card, 100000 * g2.P); s.card -= help; s.privateLoan += help; g2.add('R', -5); return '屋企人幫你還咗一部分，你答應慢慢還返。'; }
      s.card *= 1.3; g2.add('J', -8, '被追數'); return '電話一響你就心驚。';
    }, { pri: 300, def: 0, auto: 0, agui: 0 }),
  },
  {
    id: 'E-FINCO', pri: 300, ages: [18, 85], once: false, cool: 2, cat: '生活陷阱',
    when: (g) => {
      const need = Number(g.s.flags['lastNeed'] ?? 0) / 12;
      return g.s.cash + g.s.deposit < need && Number(g.s.flags['lastCF'] ?? 0) < 0 ? 0.25 * clamp(Mneg(g.s.F) * Math.sqrt(Mneg(g.s.K)), 0.25, 3) : 0;
    },
    make: (g) => {
      const amt = g.p(50000);
      return mkCard('E-FINCO', '「免 TU 即批」貸款', '手機彈出廣告：「免 TU、即批、即日過數」。你最近好手緊。', [
        { label: '借', note: `${fmtMoney(amt)}，年利率 40%` }, { label: '唔借', fx: { J: -3 } }, { label: '搵家人', fx: { R: -3 } },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 0) { s.cash += amt; s.finco += amt; g2.flag('usedFinco'); return '錢即日到手，但利息驚人。'; }
        if (i === 2) { s.cash += amt; s.privateLoan += amt; g2.add('R', -3); return '屋企人借咗俾你，冇收利息。'; }
        g2.add('J', -3); return '你決定削減開支捱過去。';
      }, { pri: 300, def: 1, auto: 1, agui: 1 });
    },
  },
  {
    id: 'E-REPAIR', pri: 300, ages: [18, 100], cat: '財務衝擊',
    when: (g) => (g.s.prop && g.s.prop.kind !== '新樓' ? 0.03 : 0),
    make: (g) => {
      const c = g.p(streamRng(g.s.seed, 'repair').uni(80000, 200000));
      return mkCard('E-REPAIR', '大廈大維修', `法團通過大維修，每戶要夾 ${fmtMoney(c)}。`, [
        { label: '用備用金', money: -c }, { label: '借錢分期', note: '入卡數' }, { label: '申請資助', disabled: g.s.age >= 60 || g.income() < 200000 * g.W ? undefined : '要 60 歲或低收入' },
      ], (g2, i) => {
        if (i === 1) { g2.s.card += c * 1.05; return '你簽咗分期。'; }
        if (i === 2 && g2.er() < 0.5) { g2.spend(c / 2, '維修'); return '資助批咗，政府幫你俾一半。'; }
        const n = g2.spend(c, '維修');
        return `外牆搭滿棚架，錢就咁冇咗${n}。`;
      }, { pri: 300, def: 0, auto: 0, agui: 0 });
    },
  },
  {
    id: 'E-IPO', pri: 400, ages: [18, 85], once: false, cool: 2, cat: '國際都會',
    when: (g) => {
      const y = g.s.year;
      const hot = [2006, 2007, 2009, 2010, 2018, 2020, 2021, 2025].includes(y) || (y > 2026 && streamRng(g.s.seed, 'ipohot', y)() < 0.08);
      return hot && g.s.cash >= 50000 * g.P ? 0.25 * Math.sqrt(Mpos(g.s.K)) * (g.s.partner?.traits.includes('投資狂熱') ? 1.5 : 1) : 0;
    },
    make: (g) => {
      const amt = Math.round(g.s.cash * 0.3);
      return mkCard('E-IPO', '新股熱潮', '同事個個都話抽新股，一手中簽即刻賺。（遊戲模擬，不構成投資建議）', [
        { label: '抽', money: -amt }, { label: '唔抽' }, { label: '借孖展抽', note: '盈虧放大 5 倍' },
      ], (g2, i) => {
        if (i === 1) return '你冇跟風。';
        const r = streamRng(g2.s.seed, 'ipo', g2.s.age);
        const ret = (r() < 0.6 ? 1 : -1) * r.uni(0.05, 0.2) * (i === 2 ? 5 : 1);
        const pnl = Math.round(amt * ret);
        if (pnl >= 0) { g2.s.cash += pnl; return `新股上市升咗，你賺咗 ${fmtMoney(pnl)}。`; }
        if (i === 2) { g2.s.card += -pnl; g2.add('J', -4); return `新股潛水，孖展蝕咗 ${fmtMoney(-pnl)}，要碌卡填數。`; }
        g2.spend(-pnl, '新股'); return `新股潛水，蝕咗 ${fmtMoney(-pnl)}。`;
      }, { pri: 400, def: 1, auto: 1, agui: 1 });
    },
  },
  {
    id: 'E-POACH', pri: 400, ages: [25, 45], cat: '國際都會',
    when: (g) => (g.s.status === 'work' && g.s.K >= 70 && ['專業人員', '經理及行政級'].includes(jobOf(g)?.cat ?? '') ? 0.015 * Mpos(g.s.K) * Mpos(g.s.R) : 0),
    make: (g) => mkCard('E-POACH', '投行挖角', '獵頭打嚟：年薪翻倍，不過每日做 14 個鐘。', [
      { label: '去', note: '收入 ×2，健康每年 −3' }, { label: '唔去' }, { label: '討價還價' },
    ], (g2, i) => {
      const j = g2.s.job;
      if (!j || i === 1) return '你覺得而家嘅生活幾好。';
      if (i === 0) { j.salary *= 2; g2.s.overtime = true; return '新辦公室喺 60 樓，你每晚都望住維港夜景加班。'; }
      if (g2.er() < 0.5) { j.salary = Math.round(j.salary * 1.6); return '對方答應人工 ×1.6，工時正常。'; }
      return '對方話考慮吓，之後冇再搵你。';
    }, { pri: 400, def: 1, auto: 1, agui: 1 }),
  },
  // 財務衝擊
  {
    id: 'E-CRASH', pri: 700, ages: [18, 100], once: false, cat: '財務衝擊',
    when: (g) => (g.e.crash && g.s.index + g.s.stock + g.s.crypto > 20000 * g.P ? 1 : 0),
    make: crashCard,
  },
  {
    id: 'E-RATE', pri: 700, ages: [18, 100], once: false, cool: 3, cat: '財務衝擊',
    when: (g) => {
      const p = g.s.prop;
      if (!p || p.monthsLeft <= 0) return 0;
      const up = g.e.rmort - g.econ(g.s.year - 1).rmort > 0.005;
      return up && p.pmt >= householdMonthly(g) * 0.5 ? 1 : 0;
    },
    make: rateHikeCard,
  },
  {
    id: 'E-NEG', pri: 700, ages: [18, 100], once: false, cool: 5, cat: '財務衝擊',
    when: (g) => (g.s.prop && g.s.prop.mortgage > 0 && propEquity(g) < 0 ? 1 : 0),
    make: negEquityCard,
  },
  {
    id: 'C-AN-04', pri: 300, ages: [25, 75], once: false, cool: 3, cat: '生活陷阱',
    when: (g) => {
      const s = g.s;
      if (Number(s.flags['borrowCount'] ?? 0) >= 3) return 0;
      const jp = s.flags['jackpotYear'] && s.year - Number(s.flags['jackpotYear']) <= 5 ? 3 : 1;
      const mpf = s.flags['mpfLumpYear'] && s.year - Number(s.flags['mpfLumpYear']) <= 3 ? 1.5 : 1;
      return 0.02 * Math.sqrt(Mpos(s.R)) * jp * mpf;
    },
    make: (g) => { g.s.flags['borrowCount'] = Number(g.s.flags['borrowCount'] ?? 0) + 1; return borrowCard(g); },
  },
  {
    id: 'C-AN-06', pri: 850, once: true,
    when: (g) => (g.s.flags['jackpotYear'] === g.s.year ? 1 : 0),
    make: jackpotCard,
  },
  {
    id: 'E-MPF65', pri: 700, ages: [65, 65], cat: '財務衝擊',
    when: (g) => {
      const s = g.s;
      const need = Number(s.flags['lastExpense'] ?? 0) * Math.max(10, 85 - s.age);
      return need > 0 && retireAssets(g) + liquidAssets(g) < need * 0.5 ? 1 : 0;
    },
    make: mpfShortCard,
  },
  {
    id: 'E-LONG', pri: 700, ages: [80, 100], cat: '財務衝擊',
    when: (g) => (g.s.status === 'retired' && g.s.fParts.untilAge > 0 && g.s.fParts.untilAge < g.s.age + 5 ? 1 : 0),
    make: longevityCard,
  },
  // 理財關口
  {
    id: 'INS-age40', pri: 880, ages: [40, 40],
    when: (g) => (g.s.status === 'work' ? 1 : 0),
    make: (g) => insuranceGateCard(g, 'age40'),
  },
  {
    id: 'C-MA-05', pri: 560, once: false,
    when: (g) => ([40, 50, 60].includes(g.s.age) && g.s.investRatio > 0 ? 1 : 0),
    make: investAdjustCard,
  },
  {
    id: 'C-MA-02', pri: 500, ages: [45, 60], cat: '人生抉擇',
    when: (g) => (g.s.prop ? (g.s.kids.length >= 2 ? 0.2 : 0.1) : 0),
    make: (g) => {
      const s = g.s;
      const val = s.prop!.price0 * (g.e.hpi / s.prop!.hpi0);
      return mkCard('C-MA-02', '中年住屋', `你層樓而家值大約 ${fmtMoney(val)}。要唔要換樓？`, [
        { label: '換大屋', note: '樓價 ×1.6，再供多啲年', fx: { J: 3 } }, { label: '留原址' }, { label: '賣樓套現', note: '之後租樓', fx: { J: -2 } },
      ], (g2, i) => {
        const s2 = g2.s;
        if (i === 1) return '住慣咗，街坊都識晒。';
        if (i === 2) { g2.add('J', -2); return sellHome(g2, 0.98); }
        const p = s2.prop!;
        const newPrice = val * 1.6;
        const eq = val - p.mortgage;
        const cost = newPrice * 0.05;
        const loan = Math.max(0, newPrice - eq * 0.98 + cost - (s2.cash * 0.3));
        const years = Math.max(10, Math.min(25, 75 - s2.age));
        const r = g2.e.rmort;
        const pmt = loan * (r / 12) / (1 - Math.pow(1 + r / 12, -years * 12));
        if (pmt > householdMonthly(g2) * 0.5) return '銀行計過，你嘅入息唔夠借咁多，換樓計劃擱置。';
        s2.cash -= Math.min(s2.cash * 0.3, s2.cash);
        s2.prop = { ...p, kind: '大屋', price0: newPrice, hpi0: g2.e.hpi, mortgage: loan, monthsLeft: years * 12, pmt, rate: r, boughtYear: s2.year };
        g2.add('J', 3);
        return '仔女終於有自己間房。';
      }, { pri: 500, def: 1, auto: 1, agui: 1 });
    },
  },
  // 時代事件（ticker）
  ...ERA_TICKS(),
];

function ERA_TICKS(): EventDef[] {
  const E: [number, string, ((g: Game) => void)?, ((g: Game) => boolean)?][] = [
    [1984, '中英聯合聲明簽署，大人喺電視前面討論咗成晚。'],
    [1987, '十月股災，聯交所停市四日。', (g) => { if (g.s.stock + g.s.index > 0) { g.s.stock *= 0.6; } }],
    [1997, '回歸，公眾假期，維港放煙花。', (g) => g.add('J', 1)],
    [1998, '亞洲金融風暴，周圍都講裁員同負資產。'],
    [2000, '強積金制度開始，打工仔每月供款。'],
    [2003, '沙士爆發，全城戴口罩，學校停課。', (g) => g.add('H', -2)],
    [2004, '自由行開始，街上多咗好多旅客。'],
    [2008, '金融海嘯，雷曼倒閉，好多人嘅「保本」產品變咗廢紙。'],
    [2009, '人類豬型流感，學校又停課一排。'],
    [2011, '法定最低工資實施，每小時 $28。'],
    [2017, '十號風球，停工停課一日。'],
    [2018, '高鐵香港段同港珠澳大橋通車。'],
    [2020, '新冠疫情，學校改上網課，街上冷冷清清。', (g) => { if (g.s.status === 'study') { g.add('K', -1); g.add('R', -2); } }],
    [2023, '通關，大家急不及待去旅行。', (g) => g.add('J', 1)],
    [2023, '世紀黑雨，部分地舖水浸。'],
    [2024, '樓市全面撤辣，地產代理又開始忙。'],
  ];
  // 被改寫咗嘅歷史唔再出現原本嘅字幕
  // 字幕位置 → 改寫事件（2023 通關跟疫情）
  const RW: Record<number, string> = { 1: '1987', 3: '1997', 5: '2003', 7: '2008', 10: '2017', 12: '2020', 13: '2020' };
  return E.map(([y, text, fx, cond], i) => ({
    id: `ERA-${y}-${i}`, pri: 90, years: [y, y] as [number, number], cat: '時代事件' as const,
    when: (g: Game) => (cond && !cond(g) ? 0 : RW[i] && rewritten(g, RW[i]) ? 0 : 1),
    tick: (g: Game) => { fx?.(g); return text; },
  }));
}

// ---------- 天馬行空（11.17，一生合共 ≤ 0.1%） ----------
const P_TIANMA_YEAR = 1.25e-5;
interface Tianma { id: string; ach: string; name: string; ok: (g: Game) => boolean; card?: (g: Game) => Card; tick?: (g: Game) => string }
const TIANMA: Tianma[] = [
  { id: 'TM-GOLD', ach: 'gold_rush', name: '淘金熱', ok: (g) => g.s.age >= 5, tick: (g) => { g.add('J', 5); g.spend(g.p(500), '買鏟'); return '香港發現海底金礦！全港市民去海灘掘金，你最後只掘到蜆。'; } },
  { id: 'TM-CAT', ach: 'cat_boss', name: '貓老闆', ok: () => true, tick: (g) => { g.add('K', 3); g.add('J', 5); if (!g.s.pets.some((p) => p.kind === 'cat')) g.s.pets.push({ kind: 'cat', name: '貓老闆', age: 3, since: g.s.age }); return '屋企隻貓突然識講嘢，佢教你：「唔好追高殺低。」'; } },
  { id: 'TM-METEOR', ach: 'meteor', name: '天降橫財', ok: () => true, tick: (g) => { g.add('R', 8); g.add('J', 3); return '一粒隕石落喺你屋苑平台，變咗地標，成個屋苑都識你。'; } },
  { id: 'TM-DUCK', ach: 'duck_effect', name: '鴨鴨效應', ok: () => true, tick: (g) => { g.add('J', 5); g.add('R', 2); return '維港出現巨型充氣鴨仔群，全港打卡熱潮！'; } },
  { id: 'TM-BLACKOUT', ach: 'blackout', name: '黑暗一星期', ok: () => true, tick: (g) => { const m = (g.s.cash + g.s.deposit) / Math.max(1, Number(g.s.flags['lastNeed'] ?? 1) / 12); if (m < 1 && g.s.age >= 18) g.add('J', -5); return m >= 3 ? '全港停電一星期，你有備用金，淡定應對。' : '全港停電一星期，你手頭緊，過得好狼狽。'; } },
  { id: 'TM-AI', ach: 'robot_gift', name: '機械人的禮物', ok: (g) => g.s.year >= 2026, tick: (g) => { g.add('H', 5); g.add('J', 5); g.add('R', 3); return 'AI 管理城市一年，全民四天工作周，你多咗時間陪屋企人。'; } },
  { id: 'TM-UFO', ach: 'rooftop_ufo', name: '天台飛碟', ok: () => true, tick: (g) => { g.add('H', 5); g.add('R', 3); return '飛碟降落喺你天台，外星人做咗你鄰居，教你種火星菜。'; } },
  {
    id: 'TM-ASTRO', ach: 'lion_rock_astronaut', name: '獅子山上的太空人', ok: (g) => g.s.age >= 22 && g.s.age <= 55,
    card: (g) => mkCard('TM-ASTRO', '首位香港太空人', '你被選中成為首位香港太空人，要上太空一年。', [{ label: '去' }, { label: '唔去' }], (g2, i) => {
      if (i === 1) { g2.add('J', -3); return '你揀咗留喺地球。'; }
      g2.fx({ H: -10, K: 10, R: 10 }, '太空任務');
      if (g2.s.job) g2.s.job.salary = Math.round(g2.s.job.salary * 1.2);
      return '你喺太空站望住香港嘅燈光，返嚟之後變咗名人。';
    }, { pri: 150, def: 0, auto: 0, agui: 0, cat: '天馬行空' }),
  },
  {
    id: 'TM-UNCLE', ach: 'will_matters', name: '遺囑的重要', ok: (g) => g.s.age >= 18,
    card: (g) => mkCard('TM-UNCLE', '南美舅公嘅遺產', '你從來冇見過嘅南美舅公過咗身，佢冇立遺囑，幾個親戚爭緊遺產。', [
      { label: '打官司', note: '律師費 $20 萬' }, { label: '和解', note: '淨收 $50 萬' }, { label: '放棄' },
    ], (g2, i) => {
      g2.flag('uncleHint');
      if (i === 0) { g2.spend(g2.p(200000), '律師費'); if (g2.er() < 0.6) { g2.gain(g2.p(2_000_000)); return '官司贏咗，你分到 $200 萬！'; } return '官司輸咗，律師費白白冇咗。'; }
      if (i === 1) { g2.gain(g2.p(500000)); return '大家各退一步，你收到 $50 萬。'; }
      return '你覺得唔關自己事。';
    }, { pri: 150, def: 1, auto: 1, agui: 1, cat: '天馬行空' }),
  },
  {
    id: 'TM-STAR', ach: 'lookalike', name: '撞樣明星', ok: (g) => g.s.age >= 16 && g.s.age <= 60,
    card: (g) => mkCard('TM-STAR', '被誤認為明星', '你喺街上被人誤認為某位明星，廣告公司索性搵你拍廣告。', [{ label: '接' }, { label: '唔接' }], (g2, i) => {
      if (i === 1) { g2.add('R', 1); return '你笑住拒絕咗。'; }
      g2.gain(g2.p(g2.er.uni(100000, 300000))); g2.add('J', 5); return '廣告一出，你成日俾人認出。';
    }, { pri: 150, def: 0, auto: 0, agui: 0, cat: '天馬行空' }),
  },
  {
    id: 'TM-ANTIQUE', ach: 'treasure', name: '尋寶達人', ok: (g) => g.s.age >= 12,
    card: (g) => mkCard('TM-ANTIQUE', '舊樓雜物房嘅古董', '你喺舊樓雜物房搵到一個好似好值錢嘅花樽。', [{ label: '賣' }, { label: '留' }, { label: '捐博物館' }], (g2, i) => {
      if (i === 1) return '你將佢擺喺客廳。';
      if (i === 2) { g2.add('J', 3); g2.s.GP += 5; return '博物館將你個名寫喺展品旁邊。'; }
      if (g2.er() < 0.5) { g2.gain(g2.p(500000)); return '鑒定係真貨！賣咗 $50 萬。'; }
      g2.spend(g2.p(3000), '鑒定費'); return '鑒定係假貨，白俾咗鑒定費。';
    }, { pri: 150, def: 1, auto: 1, agui: 1, cat: '天馬行空' }),
  },
  {
    id: 'TM-FUTURE', ach: 'future_tip', name: '未來人的忠告', ok: (g) => g.s.age >= 18,
    card: (g) => mkCard('TM-FUTURE', '時光旅人', '一個自稱嚟自未來嘅人話你知下期六星彩號碼。', [{ label: '買' }, { label: '唔買' }, { label: '買多幾注' }], (g2, i) => {
      if (i === 1) { g2.add('J', -2); return '之後你一直諗，佢係咪真係未來人。'; }
      const prize = g2.p(640) * (i === 2 ? 3 : 1);
      g2.gain(prize);
      return `佢記錯咗兩個號碼，你只中咗三獎 ${fmtMoney(prize)}。`;
    }, { pri: 150, def: 1, auto: 1, agui: 1, cat: '天馬行空' }),
  },
  {
    id: 'TM-MARS', ach: 'mars_scam', name: '火星樓盤騙局', ok: (g) => g.s.age >= 18,
    card: (g) => mkCard('TM-MARS', '火星樓盤', '一個外太空商人邀請你投資「火星樓盤」，保證回報。', [{ label: '投資' }, { label: '唔信' }, { label: '先問家人' }], (g2, i) => {
      if (i === 0) { const c = Math.round(g2.s.cash * 0.3); g2.spend(c, '火星樓盤'); return `火星冇樓。你損失咗 ${fmtMoney(c)}。`; }
      return '你保住咗身家。宇宙都有騙徒。';
    }, { pri: 150, def: 2, auto: 2, agui: 1, cat: '天馬行空' }),
  },
];

function rollTianma(g: Game): Card | null {
  const s = g.s;
  if (s.wonder) return null;
  if (streamRng(s.seed, 'tianma', 'gate', s.age)() >= P_TIANMA_YEAR) return null;
  const elig = TIANMA.filter((t) => t.ok(g));
  if (!elig.length) return null;
  const t = streamRng(s.seed, 'tianma', 'pick', s.age).pick(elig);
  s.wonder = t.name;
  g.ach(t.ach);
  g.log(`奇遇：${t.name}`, '天馬行空', true);
  if (t.tick) { g.tick(`✨ ${t.tick(g)}`); return null; }
  return t.card!(g);
}

// ---------- 抽事件（每年流程 ⑤） ----------
/** 成年後隨機兩年問養唔養寵物，中間最少隔五年 */
function petAskDue(g: Game) {
  const r = streamRng(g.s.seed, 'petask', 0);
  const a1 = r.int(19, 40);
  const a2 = a1 + r.int(5, 15);
  const n = Number(g.s.flags['petAskN'] ?? 0);
  return n === 0 ? g.s.age >= a1 : n === 1 ? g.s.age >= a2 && g.s.age - a1 >= 5 : false;
}

/** 急救選項：健康 / 快樂各自一生最多兩次，中間最少隔五年 */
function rescueOk(g: Game, k: 'H' | 'J') {
  const n = Number(g.s.flags[`rescue${k}N`] ?? 0);
  const last = g.s.flags[`rescue${k}Age`];
  return n < 2 && (last === undefined || g.s.age - Number(last) >= 5);
}
function rescueMark(g: Game, k: 'H' | 'J') {
  g.s.flags[`rescue${k}N`] = Number(g.s.flags[`rescue${k}N`] ?? 0) + 1;
  g.s.flags[`rescue${k}Age`] = g.s.age;
}

export const ALL_EVENTS: EventDef[] = [...CAREER_EVENTS, ...BIZ_EVENTS, ...HISTORY_EVENTS, ...EDU_EVENTS, ...HEALTH_EVENTS, ...FAMILY_EVENTS, ...GENERAL_EVENTS];
export const EVENTS_BY_ID: Record<string, EventDef> = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));

const isInteractive = (c: Card) => c.kind !== 'system';

function markFired(g: Game, d: EventDef) {
  const s = g.s;
  if (d.once !== false && !s.once.includes(d.id)) s.once.push(d.id);
  if (d.cool) g.cooldown(d.id, d.cool);
  if (d.group && d.groupCool) g.cooldown(`g:${d.group}`, d.groupCool);
  if (d.tragedy) s.tragedies++;
}

/** 揀預設選項自動處理（冇時間諗 / 父母決定） */
function autoResolve(g: Game, c: Card, prefix: string) {
  const idx = firstEnabled(c, c.def);
  const label = c.options[idx]?.label ?? '';
  const text = g.choose(c, idx);
  g.tick(`${prefix}「${c.title}」→ ${label}${text ? `：${text}` : ''}`);
}

export function drawEvents(g: Game) {
  const s = g.s;
  healthYear(g);
  const pre = g.queue.splice(0); // 事業結算等已經推入嘅跟進卡
  const hits: { d: EventDef | null; c: Card; forced: boolean }[] = pre.map((c) => ({ d: EVENTS_BY_ID[c.defId ?? ''] ?? null, c, forced: true }));

  // 0. 去年延後嘅固定抉擇
  const deferred = s.pendingFixed.splice(0);
  for (const id of deferred) {
    const d = EVENTS_BY_ID[id];
    if (!d?.make) continue;
    if (d.when && !d.when(g)) continue; // 條件已經唔成立（例如學貸已還清）
    let c: Card | null = null;
    try { c = d.make(g); } catch { c = null; }
    if (!c) continue;
    c.defId = id;
    hits.push({ d, c, forced: true });
    markFired(g, d);
  }

  // 1. 天馬行空
  const tm = rollTianma(g);
  if (tm) hits.push({ d: null, c: tm, forced: false });

  // 2–3. 候選池同擲骰
  let tragedyThisYear = 0;
  for (const d of ALL_EVENTS) {
    if (deferred.includes(d.id)) continue;
    if (d.ages && (s.age < d.ages[0] || s.age > d.ages[1])) continue;
    if (d.years && (s.year < d.years[0] || s.year > d.years[1])) continue;
    if (d.once !== false && s.once.includes(d.id)) continue;
    if (g.cooling(d.id)) continue;
    if (d.group && g.cooling(`g:${d.group}`)) continue;
    let p = d.when(g);
    if (!(p > 0)) continue;
    if (d.tragedy) p *= s.tragedies >= 3 ? 0.25 : s.tragedies >= 2 ? 0.5 : 1;
    p = Math.min(p, d.fixed ? 1 : 0.95);
    if (p < 1 && streamRng(s.seed, 'ev', s.age, d.id)() >= p) continue;
    if (d.tragedy && tragedyThisYear >= 1) continue;
    if (d.tick) {
      const t = d.tick(g);
      markFired(g, d);
      if (t) g.tick(t);
      continue;
    }
    if (!d.make) continue;
    const c = d.make(g);
    markFired(g, d);
    if (!c) continue;
    c.defId = d.id;
    c.cat = c.cat ?? d.cat;
    if (d.fixed) c.deferrable = true;
    if (d.tragedy) tragedyThisYear++;
    hits.push({ d, c, forced: false });
  }

  // 4–5. 排序、上限
  hits.sort((a, b) => b.c.pri - a.c.pri);
  const out: Card[] = [];
  let used = 0;
  let randomUsed = 0;
  const cap = s.age < 6 ? 0 : 2;
  // 隨機互動事件唔好年年都有：每年最多 1 張，仲要過一道閘（大約每 3 年 1 張）
  const gateOpen = streamRng(s.seed, 'gate', s.age)() < (s.flags['lastRandomCard'] === s.age - 1 ? 0.15 : 0.4);
  for (const h of hits) {
    const c = h.c;
    if (!isInteractive(c)) {
      if (s.age < 18 && c.kind === 'system') { autoResolve(g, c, '父母幫你決定：'); continue; }
      out.push(c);
      continue;
    }
    if (s.age < 6) { autoResolve(g, c, '父母幫你決定：'); continue; }
    const isRandom = !(h.d?.fixed) && c.kind === 'choice' && !h.forced;
    const important = h.d?.tragedy || c.cat === '財務衝擊' || c.cat === '健康' || c.cat === '天馬行空';
    if (isRandom && !gateOpen && !important && h.d) {
      // 今年唔出：當冇發生過，之後年份仲可以再抽到
      const d = h.d;
      s.once = s.once.filter((x) => x !== d.id);
      delete s.cool[d.id];
      if (d.group) delete s.cool[`g:${d.group}`];
      continue;
    }
    const randomBlocked = isRandom && randomUsed >= 1;
    if (used < cap && !randomBlocked) {
      out.push(c);
      used++;
      if (isRandom) { randomUsed++; g.flag('lastRandomCard', s.age); }
      continue;
    }
    if (h.d?.fixed && c.deferrable && !deferred.includes(h.d.id)) {
      // 延後一年（未當已觸發）
      s.once = s.once.filter((x) => x !== h.d!.id);
      s.pendingFixed.push(h.d.id);
      continue;
    }
    autoResolve(g, c, '你冇時間諗，');
  }
  g.queue.push(...out.map((c) => capOptions(c, g.er)));
}
