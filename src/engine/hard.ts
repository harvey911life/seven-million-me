// v2.0（用家批）：困難人生模式。出身一定最差，加 1–2 樣額外困難（家暴、先天心臟病、保幼局），
// 另有社會支援卡（書簿津貼、學生資助、在職家庭津貼、傷殘津貼）。所有普通事件機率同普通模式一樣。
import type { Game } from './game';
import { fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, type EventDef } from './cards';

const num = (g: Game, k: string) => Number(g.s.flags[k] ?? 0);
const hard = (g: Game) => !!g.s.flags['hardMode'];
const inHK = (g: Game) => !g.s.emigrated && !g.s.gba;
export const DV_HOTLINE = '現實中如果你或身邊人遇到家暴，可以致電社會福利署熱線 2343 2255；需要情緒支援可以打 18111「情緒通」。';
export const CONG_NAME = '先天心臟病';
export const HARD_MULT = 1.2;

/** 開局：困難人生嘅旗 */
export function initHard(g: Game) {
  const s = g.s;
  const h = s.origin.hard;
  g.flag('hardMode');
  if (h?.dv) g.flag('dvActive');
  if (h?.cong) { g.flag('congenital'); g.flag('hCap', 75); g.flag('congCost', 6000); }
}

const DV_LINES = [
  '屋企又有人發脾氣，你同兄弟姊妹匿埋喺碌架床上面，等佢靜落嚟。',
  '屋企氣氛好緊張，你放學寧願留喺圖書館，到夜晚先返去。',
  '老師問你點解成日咁攰，你只係話瞓得唔好。',
  '有啲晚上屋企好嘈，你戴住耳筒扮聽唔到。',
];

// 書簿津貼、學生資助、在職家庭津貼、傷殘津貼嘅金額（2026 港元）
const BOOK_AID = 4500;
const DA_MONTH = 2000;
const WFA_LIMIT = 28000;
const wfaYear = (g: Game) => {
  const kids = g.s.kids.filter((k) => k.age < 15 && !k.out).length;
  return g.p(1000 + 1200 * Math.min(kids, 2)) * 12;
};
const household = (g: Game) => g.monthlyIncome() + (g.s.married && g.s.partner?.alive ? g.s.partner.income : 0);

export const HARD_EVENTS: EventDef[] = [
  { // 家暴：童年每年拖低快樂同人際（只用間接描述）
    id: 'HD-DV-YR', pri: 330, ages: [1, 17], once: false, fixed: true, cat: '生活日常',
    when: (g) => (g.s.flags['dvActive'] ? (g.s.flags['dvMild'] ? 0.3 : 0.6) : 0),
    tick: (g) => {
      const s = g.s;
      g.add('J', -2, '屋企氣氛緊張');
      g.add('R', -1, '屋企氣氛緊張');
      s.childAdversity += 0.1;
      const r = streamRng(s.seed, 'dv', s.age);
      return s.age >= 4 && r() < 0.35 ? r.pick(DV_LINES) : '';
    },
  },
  { // 學校社工介入：留喺屋企跟進／搬去親戚屋企／寄養家庭
    id: 'HD-SW', pri: 760, ages: [6, 12], fixed: true, cat: '人生抉擇',
    when: (g) => (g.s.flags['dvActive'] ? (g.s.age >= 10 ? 1 : 0.35) : 0),
    make: (g) => mkCard('HD-SW', '學校社工', `學校社工留意到你成日好攰、唔想返屋企，約咗你同屋企人傾。社工話可以幫你安排。\n\n${DV_HOTLINE}`, [
      { label: '留喺屋企，社工定期跟進', note: '屋企情況會好少少，但未必完全解決', fx: { R: 1 } },
      { label: '搬去親戚屋企住', note: '要轉校，重新識朋友', fx: { J: 3, R: -2 } },
      { label: '入住寄養家庭', note: '社工會配對一個寄養家庭', fx: { J: 2, K: 1, R: -1 } },
    ], (g2, i) => {
      const s = g2.s;
      g2.flag('swHelped');
      if (i === 0) {
        g2.flag('dvMild');
        g2.add('R', 1);
        return '社工每個月都會上門。屋企人上咗幾堂情緒管理課，晚上靜咗啲。';
      }
      delete s.flags['dvActive'];
      if (i === 1) {
        g2.flag('dvMoved', '親戚');
        g2.add('J', 3, '搬去親戚屋企'); g2.add('R', -2);
        return '你搬咗去姨媽屋企，雖然要瞓梳化，但晚晚都瞓得着。';
      }
      g2.flag('dvMoved', '寄養家庭');
      g2.add('J', 2, '寄養家庭'); g2.add('K', 1); g2.add('R', -1);
      return '社工幫你配對咗一個寄養家庭，佢哋好有耐性，晚晚陪你做功課。';
    }, { pri: 760, def: 1, auto: 1, agui: 1, cat: '人生抉擇', scene: 'school' }),
  },
  { // 先天心臟病：出世後確診，父母可以申請傷殘津貼
    id: 'HD-DA', pri: 700, ages: [1, 1], fixed: true, cat: '健康',
    when: (g) => (g.s.flags['congenital'] ? 1 : 0),
    make: (g) => mkCard('HD-DA', '傷殘津貼', `你出世之後確診${CONG_NAME}，要定期覆診同食藥。醫生建議屋企申請傷殘津貼。`, [
      { label: '申請', note: `每月約 ${fmtMoney(g.p(DA_MONTH))}，要醫生證明` },
      { label: '唔申請', note: '屋企人覺得唔想靠政府' },
    ], (g2, i) => {
      if (i === 1) return '屋企決定自己頂住醫藥費。';
      g2.flag('daOn');
      return `批咗傷殘津貼，每月 ${fmtMoney(g2.p(DA_MONTH))}，幫補覆診同藥費。`;
    }, { pri: 700, def: 0, auto: 0, agui: 0, cat: '健康', scene: 'hospital' }),
  },
  { // 傷殘津貼：每年入賬（細個入屋企，18 歲後入自己）
    id: 'HD-DA-YR', pri: 318, once: false, fixed: true, cat: '政策衍生',
    when: (g) => (g.s.flags['daOn'] && g.s.flags['congenital'] && inHK(g) ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const amt = g.p(DA_MONTH) * 12;
      if (s.status === 'child' || (s.status === 'study' && !s.everEmployed && s.age < 23)) s.flags['familySavings'] = num(g, 'familySavings') + amt;
      else g.gain(amt);
      return '';
    },
  },
  { // 先天心臟病：公立醫院排到手術，之後身體上限提高
    id: 'HD-HEART-OP', pri: 690, ages: [4, 14], cat: '健康',
    when: (g) => (g.s.flags['congenital'] && !g.s.flags['heartOp'] ? 0.08 : 0),
    tick: (g) => {
      g.flag('heartOp');
      g.flag('hCap', 85);
      g.flag('congCost', 3000);
      g.add('J', -2, '做心臟手術');
      g.add('K', -1, '停學半年');
      g.add('H', 5);
      return '公立醫院終於排到你做心臟手術，休養咗半年。手術好成功，醫生話之後可以正常上體育堂。';
    },
  },
  { // 書簿津貼：小一派表
    id: 'HD-BOOK', pri: 650, ages: [6, 6], fixed: true, cat: '政策衍生',
    when: (g) => (hard(g) && !g.s.origin.isBaoyou ? 1 : 0),
    make: (g) => mkCard('HD-BOOK', '書簿津貼', '升小一，學校派咗書簿津貼申請表返屋企。媽媽擔心同學知道你屋企窮。', [
      { label: '申請', note: `每年約 ${fmtMoney(g.p(BOOK_AID))}，讀到中六` },
      { label: '唔申請', note: '屋企自己慳返出嚟買書', fx: { J: -1 } },
    ], (g2, i) => {
      if (i === 1) { g2.add('J', -1); return '開學前，屋企人去二手書攤執咗大半套書。'; }
      g2.flag('bookAid');
      return '批咗全額書簿津貼，開學終於有一套新書。';
    }, { pri: 650, def: 0, auto: 0, agui: 0, cat: '政策衍生', scene: 'school' }),
  },
  { // 書簿津貼：每年減輕屋企負擔
    id: 'HD-BOOK-YR', pri: 317, ages: [6, 17], once: false, fixed: true, cat: '政策衍生',
    when: (g) => (g.s.flags['bookAid'] && g.s.status !== 'work' ? 1 : 0),
    tick: (g) => { g.s.flags['familySavings'] = num(g, 'familySavings') + g.p(BOOK_AID); return ''; },
  },
  { // 學生資助：讀專上
    id: 'HD-GRANT', pri: 720, ages: [16, 30], fixed: true, cat: '政策衍生',
    when: (g) => {
      const st = g.s.study;
      return hard(g) && st && ['學士', '副學士', '高級文憑', '職業學院'].includes(st.kind) ? 1 : 0;
    },
    make: (g) => mkCard('HD-GRANT', '學生資助', `你入咗${g.s.study?.kind ?? '專上課程'}，可以向政府申請學生資助。`, [
      { label: '申請助學金', note: '學費資助一半，要交屋企入息證明' },
      { label: '唔申請，做兼職頂', note: '自己賺學費，讀書會辛苦啲', fx: { J: -2, R: 1 } },
    ], (g2, i) => {
      if (i === 1) { g2.add('J', -2, '邊讀書邊兼職'); g2.add('R', 1); g2.gain(g2.p(30000)); return '你喺便利店做夜更，一個月返二十日。'; }
      g2.flag('studentGrant');
      return '批咗助學金，學費少咗一半。';
    }, { pri: 720, def: 0, auto: 0, agui: 0, cat: '政策衍生', scene: 'school' }),
  },
  { // 在職家庭津貼：有工作、有細路、入息低
    id: 'HD-WFA', pri: 600, ages: [20, 60], fixed: true, cat: '政策衍生',
    when: (g) => (hard(g) && inHK(g) && g.s.status === 'work' && wfaYear(g) > 0 && g.s.kids.some((k) => k.age < 15) && household(g) < g.p(WFA_LIMIT) ? 1 : 0),
    make: (g) => mkCard('HD-WFA', '在職家庭津貼', '同事話你屋企入息咁低，又有細路，應該申請在職家庭津貼。', [
      { label: '申請', note: `而家每年約 ${fmtMoney(wfaYear(g))}；入息高過上限就冇` },
      { label: '唔申請', note: '要交糧單同工時紀錄，你覺得麻煩' },
    ], (g2, i) => {
      if (i === 1) return '你覺得自己頂得住，冇去申請。';
      g2.flag('wfaOn');
      return '批咗在職家庭津貼，每幾個月入一次數。';
    }, { pri: 600, def: 0, auto: 0, agui: 0, cat: '政策衍生', scene: 'office' }),
  },
  { // 在職家庭津貼：每年入賬
    id: 'HD-WFA-YR', pri: 316, once: false, fixed: true, cat: '政策衍生',
    when: (g) => (g.s.flags['wfaOn'] && inHK(g) && g.s.status === 'work' && household(g) < g.p(WFA_LIMIT) && wfaYear(g) > 0 ? 1 : 0),
    tick: (g) => { g.gain(wfaYear(g)); return ''; },
  },
];
