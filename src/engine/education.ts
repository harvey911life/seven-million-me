// 第 5 章童年 / 中學抉擇 + 第 6 章學制、公開試出路、專上教育
import type { Game } from './game';
import type { Edu, Major, Track } from '../data/jobs';
import { streamRng } from './rng';
import { clamp, Mneg, Mpos, fmtMoney } from './util';
import { mkCard, firstEnabled, type Card, type EventDef } from './cards';
import { examCard, quizCard } from './quiz';
import { firstJobCard } from './career';
import { laiOf } from './finance';

const famF = (g: Game) => g.s.F; // 童年時 F = 家庭財務健康

export function studyYear(g: Game) {
  const s = g.s;
  const r = streamRng(s.seed, 'study', s.age);
  if (s.age === 12 && !s.band) {
    const score = s.K + (s.movedSchoolNet ? 5 : 0) - (s.home === 'subdiv' ? 2 : 0) + r.normal(0, 6);
    s.band = score >= 45 ? 1 : score >= 30 ? 2 : 3;
    g.tick(`中一派位結果出咗，你入咗一間 Band ${s.band} 中學。`);
  }
  if (!s.study || s.age < 18) return;
  const st = s.study;
  st.years++;
  // 輟學
  const base = { 學士: 0.02, 副學士: 0.06, 高級文憑: 0.05, 職業學院: 0.07, 毅進: 0.1, 出國升學: 0.03, 碩士: 0.01, 重讀: 0 }[st.kind] ?? 0.03;
  if (st.kind !== '重讀' && r() < base * Mneg(s.K) * (s.F < 30 && !s.studentLoan ? 1.5 : 1) * 0.5) {
    s.study = null;
    g.tick('你讀唔落去，決定退學出嚟做嘢。');
    g.add('J', -3);
    g.flag('needFirstJob');
    return;
  }
  if (st.years <= st.left) return;
  // 畢業
  s.study = null;
  const done: Record<string, Edu> = { 學士: 5, 出國升學: 5, 副學士: 4, 高級文憑: 4, 職業學院: 3, 毅進: 2, 碩士: 6 };
  if (st.kind === '重讀') return; // 重考喺 EXAM 事件處理
  s.edu = Math.max(s.edu, done[st.kind] ?? 2) as Edu;
  if (st.kind === '出國升學') { s.overseas = true; g.ach('overseas_grad'); }
  if (s.edu >= 5 && ['公屋', '劏房'].includes(s.origin.housing)) g.ach('grassroots_grad');
  g.add('J', 3, '畢業');
  g.tick(`你${st.kind === '出國升學' ? `喺${String(s.flags['abroadCountry'] ?? '外國')}` : st.kind}畢業喇！`);
  if (st.kind === '碩士') { g.add('K', 5, '碩士'); g.flag('needFirstJob'); return; }
  if ((st.kind === '學士' || st.kind === '出國升學') && !s.everEmployed && s.K >= 45 && s.edu < 6) { g.pushCard(masterCard(g, 'grad')); return; }
  if ((st.kind === '副學士' || st.kind === '高級文憑') && r() < clamp((st.kind === '副學士' ? 0.45 : 0.3) * Mpos(s.K) * (s.year >= 2012 ? 1 : 0.8), 0.05, 0.9)) {
    g.pushCard(bridgeCard(g));
    return;
  }
  g.flag('needFirstJob');
}

function bridgeCard(g: Game): Card {
  return mkCard('E-BRIDGE', '銜接學士', '你成功拎到銜接學士學位嘅取錄。讀唔讀？', [
    { label: '讀兩年學士', note: `每年學費 ${fmtMoney(g.p(g.s.K >= 65 ? 55000 : 95000))}` },
    { label: '出嚟做嘢' },
  ], (g2, i) => {
    const s = g2.s;
    if (i === 0) { s.study = { kind: '學士', left: 2, fee: s.K >= 65 ? 55000 : 95000, years: 0 }; s.status = 'study'; if (!s.major) s.major = s.stream === '理科' ? '工程' : s.stream === '商科' ? '商科' : '社科'; return '你繼續讀書。'; }
    g2.flag('needFirstJob');
    return '你決定出嚟做嘢。';
  }, { pri: 800, def: 0, auto: 0, agui: 0 });
}

// ---------- 公開試出路（C-SS-06） ----------
function canOverseas(g: Game) {
  const s = g.s;
  const fs = Number(s.flags['familySavings'] ?? 0);
  const total = 420000 * g.P * 3;
  const fi = Number(s.flags['familyIncome'] ?? 0);
  const proParent = [s.origin.father, s.origin.mother].some((p) => p?.cat === '經理及行政級' || p?.cat === '專業人員');
  return fs >= total * 0.6 || fi * 12 * 0.4 * 3 + fs >= total || (s.origin.family === '雙職家庭' && proParent && s.F >= 60);
}

export function routeCard(g: Game): Card {
  const s = g.s;
  const res = s.examResult ?? '未達副學位要求';
  const uni = res === '達大學要求';
  const sub = uni || res === '達副學位要求';
  const kEff = s.examR ?? s.K;
  const y = s.year;
  const retake = s.examTries < 3;
  const ov = canOverseas(g) && kEff >= 40;
  const famPoor = s.F < 40;
  const opts = [
    { label: '大學學士（4 年）', disabled: uni ? undefined : '未達大學要求', note: `每年學費 ${fmtMoney(g.p(55000))}`, fx: { J: 5 } },
    { label: '副學士（2 年）', disabled: !sub ? '未達副學位要求' : y < 2000 ? '2000 年先有副學士' : undefined, note: `每年 ${fmtMoney(g.p(68000))}`, fx: { J: 1 } },
    { label: '高級文憑（2 年）', disabled: sub ? undefined : '未達副學位要求', note: `每年 ${fmtMoney(g.p(32000))}`, fx: { J: 1 } },
    { label: '職業學院 / 毅進', note: `每年 ${fmtMoney(g.p(5000))}` },
    { label: '重讀再考', disabled: retake ? undefined : '已經考咗三次', fx: { J: -3 } },
    { label: '出國升學', disabled: ov ? undefined : kEff < 40 ? '知識唔夠' : '屋企負擔唔起', note: `每年約 ${fmtMoney(g.p(420000))}`, fx: { J: 3, R: -3 } },
    { label: '直接出嚟做嘢', fx: { J: -1 } },
  ];
  const run = (g2: Game, i: number) => {
    const t = g2.s;
    t.status = 'study';
    switch (i) {
      case 0: g2.add('J', 5, '入大學'); g2.pushCard(majorCard(g2), true); if (famPoor) loanNote(g2); return '你收到大學取錄通知，阿媽喊咗出嚟。';
      case 1: t.study = { kind: '副學士', left: 2, fee: 68000, years: 0 }; t.track = t.stream === '理科' ? '理學' : t.stream === '商科' ? '商業' : '社會科學'; g2.add('J', 1); if (famPoor) loanNote(g2); return '你諗住兩年後再搏一次入大學。';
      case 2: { const r = streamRng(t.seed, 'track', t.age); t.study = { kind: '高級文憑', left: 2, fee: 32000, years: 0 }; t.track = r.pick(['工程', '設計', '資訊科技', '醫護輔助', '酒店'] as Track[]); g2.add('J', 1); return `你讀${t.track}高級文憑，實用啲，出嚟易搵工。`; }
      case 3: { const r = streamRng(t.seed, 'track', t.age); const yj = t.edu < 2 || r() < 0.3; t.study = { kind: yj ? '毅進' : '職業學院', left: yj ? 1 : 2, fee: 5000, years: 0 }; t.track = yj ? '一般' : r.pick(['電機', '廚藝', '美容', '汽車維修', '建造'] as Track[]); return yj ? '你讀毅進，打好基礎。' : `你讀${t.track}，師傅話你手勢好。`; }
      case 4: t.study = { kind: '重讀', left: 1, fee: 15000, years: 0 }; g2.add('J', -3); g2.flag('retakeAt', t.age + 1); return '呢一年，你決定再搏一次。';
      case 5: { t.major = t.stream === '理科' ? '工程' : t.stream === '商科' ? '商科' : '社科'; g2.pushCard(abroadCard(g2), true); return '你決定出國讀書，下一步係揀國家。'; }
      default: t.edu = Math.max(t.edu, 2) as Edu; g2.add('J', -1); g2.pushCard(firstJobCard(g2), true); return '你一放榜就去見工。';
    }
  };
  const def = uni ? 0 : sub ? 2 : 3;
  const c = mkCard('C-SS-06', '公開試之後出路', `${String(s.flags['examText'] ?? '')}你打算點行？`, opts, run, { pri: 864, def, auto: def, agui: def, scene: 'school' });
  c.def = firstEnabled(c, def);
  c.auto = c.def; c.agui = c.def;
  return c;
}

// ---------- 出國升學揀國家（6.7.6） ----------
const ABROAD: [string, string, number, number][] = [
  ['英國', '倫敦', 3, 420000], ['澳洲', '墨爾本', 4, 380000], ['加拿大', '多倫多', 4, 370000], ['美國', '波士頓', 4, 550000],
];

function abroadCard(g: Game): Card {
  const s = g.s;
  const r = streamRng(s.seed, 'abroad', s.age);
  // 最多 3 個，隨機抽；美國只喺家庭財務健康 ≥ 70 先出現
  let pool = ABROAD.filter((d) => d[0] !== '美國' || s.F >= 70);
  if (pool.length > 3) pool = pool.map((d) => [r(), d] as const).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
  pool.sort((a, b) => ABROAD.indexOf(a) - ABROAD.indexOf(b));
  const cheapest = pool.reduce((m, d, i) => (d[2] * d[3] < pool[m][2] * pool[m][3] ? i : m), 0);
  return mkCard('E-ABROAD', '去邊個國家讀書？', '屋企人同你一齊睇學校資料，每個地方嘅年期同使費都唔同。', pool.map((d) => ({
    label: d[0], note: `${d[2]} 年，學費連生活費每年約 ${fmtMoney(g.p(d[3]))}，總共約 ${fmtMoney(g.p(d[3] * d[2]))}`,
  })), (g2, i) => {
    const [country, city, yrs, fee] = pool[i];
    const t = g2.s;
    t.study = { kind: '出國升學', left: yrs, fee, years: 0 };
    t.flags['abroadCountry'] = country;
    g2.fx({ J: 3, R: -3 }, '出國讀書');
    return `你拖住兩個大喼飛去${city}。`;
  }, { pri: 863, def: cheapest, auto: cheapest, agui: cheapest, scene: 'school' });
}

// ---------- 碩士（6.9） ----------
const MASTER_FT = 200000;
const MASTER_PT = 110000;

/** grad = 啱啱學士畢業；work = 在職 */
export function masterCard(g: Game, mode: 'grad' | 'work'): Card {
  const ft = { label: mode === 'grad' ? '讀一年全職碩士' : '辭工讀一年全職碩士', note: `學費約 ${fmtMoney(g.p(MASTER_FT))}${mode === 'work' ? '，嗰年冇人工' : ''}；知識 +5，之後搵工起薪高啲` };
  const opts = mode === 'grad'
    ? [ft, { label: '出嚟搵工' }]
    : [{ label: '兼讀兩年碩士', note: `每年學費約 ${fmtMoney(g.p(MASTER_PT))}，保住份工；健康每年 −1` }, ft, { label: '唔讀' }];
  const text = mode === 'grad' ? '你學士畢業，教授問你有冇興趣讀埋碩士。' : '公司有同事讀完碩士升咗職，你都諗緊要唔要再讀書。';
  return mkCard(mode === 'grad' ? 'E-MASTER-GRAD' : 'E-MASTER', '讀唔讀碩士？', text, opts, (g2, i) => {
    const s = g2.s;
    const full = mode === 'grad' ? i === 0 : i === 1;
    const part = mode === 'work' && i === 0;
    if (full) {
      if (mode === 'work') { s.job = null; }
      s.status = 'study';
      s.study = { kind: '碩士', left: 1, fee: MASTER_FT, years: 0 };
      return mode === 'work' ? '你遞咗信，返學校做一年全職學生。' : '你決定讀多一年。';
    }
    if (part) { s.flags['ptMaster'] = 2; return '你放工就趕返學校上堂。'; }
    if (mode === 'grad') g2.flag('needFirstJob');
    return mode === 'grad' ? '你決定出嚟做嘢。' : '你覺得而家專心做好份工更實際。';
  }, { pri: 800, def: mode === 'grad' ? 1 : 2, auto: mode === 'grad' ? 1 : (g.s.focus === '增值進修' ? 0 : 2), agui: mode === 'grad' ? 1 : 2, cat: '人生抉擇' });
}

/** 在職兼讀碩士：每年交學費、健康 −1，讀滿兩年學歷升碩士 */
export function partTimeStudyYear(g: Game) {
  const s = g.s;
  const left = Number(s.flags['ptMaster'] ?? 0);
  if (!left) return;
  if (s.status !== 'work') { delete s.flags['ptMaster']; g.tick('你冇咗份工，兼讀碩士暫時停咗。'); return; }
  const n = g.spend(g.p(MASTER_PT), '兼讀碩士');
  g.add('H', -1, '兼讀碩士');
  if (left > 1) { s.flags['ptMaster'] = left - 1; g.tick(`兼讀碩士第一年，日頭返工夜晚上堂${n}。`); return; }
  delete s.flags['ptMaster'];
  s.edu = 6 as Edu;
  g.add('K', 5, '碩士');
  g.add('J', 3, '畢業');
  g.tick(`你兼讀碩士畢業喇${n}！`);
}

function loanNote(g: Game) {
  // 學費由家庭先付，唔夠就學貸（finance.settleYear 處理）
  g.flag('mayLoan');
}

function majorCard(g: Game): Card {
  const s = g.s;
  const k = s.examR ?? s.K;
  const sci = s.stream === '理科';
  const all: [Major, number, boolean][] = [
    ['醫科', 6, sci && k >= 90], ['法律', 5, k >= 80], ['藥劑', 5, sci && k >= 80], ['護理', 5, sci], ['工程', 4, sci],
    ['商科', 4, true], ['教育', 5, true], ['社科', 4, true],
  ];
  const ok = all.filter((m) => m[2]);
  const r = streamRng(s.seed, 'major', s.age);
  const first = ok[0];
  const rest = ok.slice(1).sort(() => r() - 0.5).slice(0, 2);
  const show = [first, ...rest];
  const desc: Record<string, string> = { 醫科: '6 年，之後做醫生', 法律: '4 年 + 1 年專業證書', 藥劑: '5 年，做藥劑師', 護理: '5 年，做註冊護士', 工程: '4 年，工程師 / 程式員', 商科: '4 年，會計 / 金融', 教育: '5 年，做老師', 社科: '4 年，社工 / 文職 / 設計' };
  return mkCard('E-MAJOR', '揀大學學系', '你嘅成績可以揀以下學系：', show.map((m) => ({ label: m[0], note: desc[m[0]] })), (g2, i) => {
    const [m, yrs] = show[i];
    g2.s.major = m;
    g2.s.study = { kind: '學士', left: yrs, fee: m === '法律' ? 55000 + 190000 / 5 : 55000, years: 0 };
    return `你入咗${m}。`;
  }, { pri: 863, def: 0, auto: 0, agui: 0 });
}

// ---------- 固定抉擇 ----------
/** 新年利是：無論揀咩，都有兩成機會俾父母收起（攞唔返） */
function laiseeCard(g: Game, id: string): Card {
  const amt = laiOf(g);
  return mkCard(id, '新年利是', `農曆新年，你今年收到大約 ${fmtMoney(amt)} 利是。你點處理？`, [
    { label: '全部儲落錢罌', note: `儲 ${fmtMoney(amt)}，18 歲先拎出嚟` },
    { label: '一半儲一半使', note: `儲 ${fmtMoney(amt / 2)}，使 ${fmtMoney(amt / 2)}`, fx: { J: 1 } },
    { label: '全部買玩具', note: `使晒 ${fmtMoney(amt)}`, fx: { J: 3 } },
  ], (g2, i) => {
    const s = g2.s;
    s.piggyMode = i as 0 | 1 | 2;
    s.FL += [2, 1, 0][i];
    if (streamRng(s.seed, 'laitaken', s.age)() < 0.2) {
      g2.flag('laiTaken', s.age);
      g2.add('J', -2, '利是俾阿媽收咗');
      return `阿媽：「我幫你儲起佢先。」${fmtMoney(amt)} 利是就咁冇咗下文，之後都冇再見過。`;
    }
    if (i === 1) g2.add('J', 1);
    if (i === 2) { g2.add('J', 3, '買玩具'); g2.flag('toyRegret', s.age + 1); }
    return ['錢罌重到你抱唔起。', '你買咗一盒心儀嘅模型，其餘留低。', '玩具玩咗兩個星期就擺埋一邊。'][i];
  }, { def: 1, auto: 0, agui: 0, scene: 'home', cat: '生活日常' });
}

// v1.2：以前每局必出嘅童年卡，改做每一世按機率決定出唔出（同一世固定）
const maybe = (g: Game, id: string, p: number) => (streamRng(g.s.seed, 'skel', id)() < p ? 1 : 0);

export const EDU_EVENTS: EventDef[] = [
  { id: 'QUIZ', pri: 860, once: false, fixed: true, when: (g) => (g.s.quizAges.includes(g.s.age) && g.s.status === 'study' && !g.s.flags['quizDone' + g.s.age] ? 1 : 0), make: (g) => { g.flag('quizDone' + g.s.age); return quizCard(g); } },
  {
    id: 'EXAM', pri: 865, once: false, fixed: true,
    when: (g) => (g.s.status === 'study' && ((g.s.age === 17 && !g.s.examTries) || g.s.flags['retakeAt'] === g.s.age) ? 1 : 0),
    make: (g) => { delete g.s.flags['retakeAt']; return examCard(g, (g2) => g2.pushCard(routeCard(g2), true)); },
  },
  {
    id: 'C-CH-01', pri: 850, fixed: true, ages: [6, 7], when: (g) => maybe(g, 'C-CH-01', 0.65),
    make: (g) => {
      const inst = g.s.origin.housing === '保幼局院舍';
      const p = (n: number) => (inst ? '院舍免費活動' : `家庭開支每月 ${fmtMoney(g.p(n))}`);
      return mkCard('C-CH-01', '報興趣班', '升小一喇，屋企問你想唔想報興趣班。', [
        { label: '運動（游水、足球）', note: p(1500), fx: { H: 1, J: 0.5 } },
        { label: '音樂藝術（鋼琴、畫畫）', note: p(2000), fx: { K: 0.5, J: 0.5 } },
        { label: '唔報，留時間玩', fx: { J: 1, R: 0.5 } },
      ], (g2, i) => {
        const s = g2.s;
        s.hobbyClass = ([1, 2, 0] as const)[i];
        if (i === 2) g2.flag('playTime');
        if (i < 2) s.IP += 1;
        return ['你第一次游到 25 米，教練拍手俾你。', '琴行老師話你可以考三級。', '放學你同鄰居喺公園玩到天黑。'][i];
      }, { def: 2, auto: 2, agui: 2, scene: 'park' });
    },
  },
  {
    id: 'C-CH-02', pri: 850, fixed: true, ages: [8, 9], when: (g) => maybe(g, 'C-CH-02', 0.6),
    make: (g) => laiseeCard(g, 'C-CH-02'),
  },
  { // v0.7：之後啲新年再有機會揀過
    id: 'E-LAISEE', pri: 300, ages: [10, 17], once: false, cool: 3, cat: '生活日常',
    when: (g) => (g.s.once.includes('C-CH-02') ? 0.3 : 0.12),
    make: (g) => laiseeCard(g, 'E-LAISEE'),
  },
  {
    id: 'C-CH-03', pri: 850, fixed: true, ages: [10, 11],
    when: (g) => {
      const h = g.s.origin.housing;
      if (h === '保幼局院舍' || g.s.age !== 10) return 0;
      return h === '劏房' ? 0.05 : h === '公屋' ? 0.1 : famF(g) >= 40 ? 0.3 : 0.1;
    },
    make: (g) => mkCard('C-CH-03', '搬去好啲校網', '屋企話想搬去好啲嘅校網，問你意見。', [
      { label: '贊成' }, { label: '反對' },
    ], (g2, i) => {
      const s = g2.s;
      const moved = g2.er() < (i === 0 ? 0.8 : 0.5);
      if (moved) {
        s.movedSchoolNet = true;
        g2.add('K', 4, '新校網');
        g2.add('R', -3, '同舊朋友分開');
        g2.add('J', i === 0 ? -1 : -5, i === 1 ? '佢哋冇聽我講' : undefined);
        return '你哋搬咗屋。新學校啲同學好勤力，你都跟住勤力咗。';
      }
      if (i === 0) { g2.add('J', -1); return '最後冇搬，白期待咗。'; }
      g2.add('J', 2); g2.add('R', 1);
      return '你最後留低同老友一齊升中。';
    }, { def: 0, auto: 0, agui: 0 }),
  },
  {
    id: 'C-SS-01', pri: 850, fixed: true, ages: [13, 14],
    when: (g) => (g.s.age === 13 ? (g.s.origin.isBaoyou ? 0.5 : 0.8) * (g.s.band === 1 ? 0.8 : 1) : 0),
    make: (g) => {
      const cost = g.p(800);
      return mkCard('C-SS-01', '同學叫你課金', '你有咗第一部手機，同學個個都課金買限定角色。', [
        { label: '用自己儲嘅錢課', disabled: g.s.piggy >= cost ? undefined : '錢罐唔夠錢', money: -cost, fx: { J: 2 } },
        { label: '問屋企攞', note: `屋企俾 ${fmtMoney(cost)}`, fx: { J: 2, R: -1 } },
        { label: '唔課', fx: { J: -1, R: -1 } },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 0) { s.piggy -= cost; g2.add('J', 2); s.FL += 1; return '你用咗半年利是錢買咗限定角色，有啲心痛。'; }
        if (i === 1) { g2.spend(cost); g2.add('J', 2); g2.add('R', -1); s.FL = Math.max(0, s.FL - 1); return '阿媽俾咗錢你，但成個月都黑面。'; }
        g2.add('J', -1); g2.add('R', -1); s.FL += 1;
        return '你發覺其實唔課都玩得開心。';
      }, { def: 2, auto: 2, agui: 2 });
    },
  },
  {
    id: 'C-SS-02', pri: 850, fixed: true, ages: [14, 15],
    when: (g) => (g.s.age !== 14 ? 0 : g.s.K < 45 ? 1 : g.s.K < 60 ? 0.3 : 0),
    make: (g) => mkCard('C-SS-02', '成績追唔上', '升中三，功課越嚟越深，你開始追唔上。', [
      { label: '報補習社', note: `家庭每年 ${fmtMoney(g.p(18000))}`, fx: { K: 1, J: -0.5 } },
      { label: '自修' },
      { label: '請私補', disabled: famF(g) >= 50 ? undefined : '屋企負擔唔起', note: `家庭每年 ${fmtMoney(g.p(48000))}`, fx: { K: 1.5, J: -0.5 } },
    ], (g2, i) => {
      g2.s.tutoring = ([1, 2, 3] as const)[i];
      return ['補習社老師嘅貼士好有用。', '你去自修室溫書，坐到閉館。', '一對一補習，老師一眼睇穿你邊度唔明。'][i];
    }, { def: 1, auto: g.s.F >= 50 ? 0 : 1, agui: 1 }),
  },
  {
    id: 'C-SS-03', pri: 850, fixed: true, ages: [15, 15], when: () => 1,
    make: (g) => mkCard('C-SS-03', '選科', '升中四要選科。你揀邊條路？', [
      { label: '理科', note: '醫生、工程師、護士路線', fx: g.s.K < 50 ? { J: -1 } : {} },
      { label: '商科', note: '會計、銀行、金融路線' },
      { label: '文科', note: '教師、律師、社工路線', fx: { J: 1 } },
    ], (g2, i) => {
      const s = g2.s;
      s.stream = (['理科', '商科', '文科'] as const)[i];
      if (i === 0 && s.K < 50) g2.add('J', -1);
      if (i === 1) s.FL += 1;
      if (i === 2) g2.add('J', 1);
      return ['實驗室嘅氣味你開始習慣。', '你第一次學到複息，覺得好神奇。', '你鍾意讀歷史，因為每件事都有前因後果。'][i];
    }, { def: 1, auto: g.s.K >= 60 ? 0 : 1, agui: 1, scene: 'school' }),
  },
  {
    id: 'C-SS-04', pri: 849, fixed: true, ages: [16, 16], when: (g) => maybe(g, 'C-SS-04', 0.6),
    make: (g) => {
      const wage = Math.round(g.p(5000));
      return mkCard('C-SS-04', '暑假', '中五暑假，有兩個月時間。你點過？', [
        { label: '做暑期工', note: `賺 ${fmtMoney(wage)}`, fx: { R: 1, J: -1 } },
        { label: '參加交流團', disabled: famF(g) >= 40 ? undefined : '屋企負擔唔起', money: -g.p(15000), fx: { K: 2, J: 2, R: 1 } },
        { label: '留喺屋企休息', fx: { H: 2, J: 2 } },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 0) { s.piggy += wage; g2.add('R', 1); g2.add('J', -1); s.FL += 1; g2.flag('summerJob'); return '你喺快餐店企咗六個星期，雙腳痛到震。'; }
        if (i === 1) { g2.spend(g2.p(15000)); g2.fx({ K: 2, J: 2, R: 1 }, '交流團'); g2.flag('exchange'); return '你喺首爾同當地學生交換咗 IG。'; }
        g2.fx({ H: 2, J: 2 }, '暑假休息');
        return '成個暑假瞓到中午，好爽。';
      }, { def: 2, auto: 2, agui: 0 });
    },
  },
  {
    id: 'C-SS-05', pri: 848, fixed: true, ages: [16, 17], when: (g) => (g.s.partner ? 0 : maybe(g, 'C-SS-05', 0.5)),
    make: (g) => mkCard('C-SS-05', '有人向你表白', '放學後，隔籬班個同學遞咗封信俾你。', [
      { label: '一齊', fx: { J: 5, R: 3 } },
      { label: '做朋友', fx: { R: 1, J: -1 } },
      { label: '專心讀書', fx: { K: 1, J: -2, R: -1 } },
    ], (g2, i) => {
      if (i === 0) { g2.fx({ J: 5, R: 3 }, '初戀'); g2.flag('teenLove'); return '放學你哋一齊行去巴士站，行得特別慢。'; }
      if (i === 1) { g2.add('R', 1); g2.add('J', -1); g2.flag('teenFriend'); return '你哋之後仍然係好朋友。'; }
      g2.fx({ K: 1, J: -2, R: -1 });
      return '你話想專心考公開試，對方點點頭。';
    }, { def: 1, auto: 1, agui: 1, scene: 'school' }),
  },
];
