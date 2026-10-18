// v1.2：中年同晚年抉擇（試玩感想：40 歲後好多年冇嘢揀）
import type { Game } from './game';
import { fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, type EventDef } from './cards';

const working = (g: Game) => g.s.status === 'work' || g.s.status === 'biz';
const afford = (g: Game, amt: number) => (g.liquid >= amt ? undefined : '手頭冇咁多錢');

export const MIDLIFE_EVENTS: EventDef[] = [
  {
    id: 'E-ML-COURSE', pri: 420, ages: [40, 55], cat: '人生抉擇',
    when: (g) => (working(g) ? 0.08 : 0),
    make: (g) => {
      const fee = g.p(30000);
      return mkCard('E-ML-COURSE', '中年轉型', '同事話而家行業變化好快，問你有冇興趣一齊報個 AI 應用證書課程。', [
        { label: '報讀', money: -fee, note: '半年夜校', fx: { K: 3, J: -1 }, disabled: afford(g, fee) },
        { label: '自學網上免費課程', fx: { K: 1 } },
        { label: '唔使喇', fx: { J: 1 } },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 0) { g2.spend(fee, '進修'); g2.fx({ K: 3, J: -1 }, '中年進修'); s.CP = Math.min(5, s.CP + 2); g2.flag('jobhunt', s.year); return '每星期兩晚返學，畢業嗰日你影咗張相放上 IG。'; }
        if (i === 1) { g2.add('K', 1); return '你睇咗幾條教學片，學識咗用 AI 寫報告。'; }
        g2.add('J', 1); return '你覺得做好本份已經夠。';
      }, { def: 2, auto: 0, agui: 0 });
    },
  },
  {
    id: 'E-ML-FRIENDBIZ', pri: 410, ages: [35, 60], cat: '生活陷阱',
    when: (g) => (g.liquid > g.p(300000) ? 0.06 : 0),
    make: (g) => {
      const amt = g.p(200000);
      return mkCard('E-ML-FRIENDBIZ', '朋友邀請入股', `舊同學想喺旺角開茶餐廳，邀請你入股 ${fmtMoney(amt)}，話「兩年回本」。`, [
        { label: '入股', money: -amt, note: '新食肆頭三年結業率好高', fx: { J: 2 } },
        { label: '入少啲做支持', money: -amt / 4 },
        { label: '婉拒', fx: { R: -1 } },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 2) { g2.add('R', -1); return '佢話明白，之後少咗搵你。'; }
        const put = i === 0 ? amt : amt / 4;
        g2.spend(put, '入股');
        const ok = streamRng(s.seed, 'friendbiz', s.age)() < 0.3;
        if (ok) { g2.gain(put * 1.8); g2.add('J', 3); return `茶餐廳排長龍，你分到 ${fmtMoney(put * 1.8)}，仲有免費奶茶飲。`; }
        g2.add('J', -3); g2.add('R', -2);
        return `一年半後結業，${fmtMoney(put)} 冇咗。你同舊同學都唔再提呢件事。`;
      }, { def: 2, auto: 2, agui: 2 });
    },
  },
  {
    id: 'E-ML-HEALTH', pri: 430, ages: [45, 64], once: false, cool: 6, cat: '健康',
    when: (g) => (g.s.H < 70 ? 0.1 : 0.05),
    make: (g) => mkCard('E-ML-HEALTH', '身體響警號', '身體檢查報告寫住「膽固醇同血糖偏高，建議跟進」。', [
      { label: '戒口兼做運動', fx: { H: 4, J: -2 } },
      { label: '睇私家醫生食藥', money: -g.p(12000), fx: { H: 2 } },
      { label: '遲啲先算', fx: { H: -3 } },
    ], (g2, i) => {
      if (i === 0) { g2.fx({ H: 4, J: -2 }, '戒口運動'); return '你每朝去公園行一個鐘，三個月後指標返晒正常。'; }
      if (i === 1) { g2.spend(g2.p(12000), '睇醫生'); g2.add('H', 2); return '醫生開咗藥，叫你半年後再覆診。'; }
      g2.add('H', -3, '唔理身體'); return '你將份報告擺咗入櫃桶。';
    }, { def: 0, auto: 0, agui: 0 }),
  },
  {
    id: 'E-ML-SANDWICH', pri: 440, ages: [40, 62], cat: '人生抉擇',
    when: (g) => (g.s.parents.some((p) => p.alive && p.age >= 75) && g.s.kids.some((k) => k.age < 18) ? 0.1 : 0),
    make: (g) => {
      const cost = g.p(8000 * 12);
      const sib = g.s.siblings > 0;
      return mkCard('E-ML-SANDWICH', '上有高堂下有細', '阿媽行路開始唔穩，仔女又要人湊。你一個人分身不暇。', [
        { label: '請鐘點照顧阿媽', money: -cost, note: '每月約 $8,000，請一年', fx: { J: 1 } },
        { label: '自己減少工作時間', note: '今年收入少一成', fx: { R: 3, J: -2 } },
        { label: '同兄弟姊妹輪流照顧', disabled: sib ? undefined : '你冇兄弟姊妹', fx: { R: 1 } },
      ], (g2, i) => {
        if (i === 0) { g2.spend(cost, '照顧父母'); g2.add('J', 1); return '姑娘每日上門，你終於可以專心返工。'; }
        if (i === 1) { g2.spend(g2.income() * 0.1, '減工時'); g2.fx({ R: 3, J: -2 }, '照顧家人'); return '你每星期抽兩個下晝陪阿媽覆診。'; }
        g2.add('R', 1); return '兄弟姊妹開咗個群組排更，總算撐得住。';
      }, { def: 2, auto: sib ? 2 : 0, agui: sib ? 2 : 0 });
    },
  },
  {
    id: 'E-ML-CRISIS', pri: 400, ages: [42, 55], cat: '生活日常',
    when: (g) => (g.s.J < 60 ? 0.07 : 0.03),
    make: (g) => {
      const car = g.p(450000), trip = g.p(120000);
      return mkCard('E-ML-CRISIS', '中年危機', '有一朝你望住鏡，突然問自己：「人生係咪就係咁？」', [
        { label: '買架跑車', money: -car, fx: { J: 6 }, disabled: afford(g, car) },
        { label: '放三個月假去旅行', money: -trip, fx: { J: 5, H: 2 }, disabled: afford(g, trip) },
        { label: '寫低人生下半場目標', fx: { J: 2, K: 1 } },
      ], (g2, i) => {
        if (i === 0) { g2.spend(car, '跑車'); g2.add('J', 6, '買跑車'); g2.flag('gadgetLast', g2.s.year); return '開咗兩個月，你發覺香港塞車塞到跑唔起。'; }
        if (i === 1) { g2.spend(trip, '長假'); g2.fx({ J: 5, H: 2 }, '長假'); return '你喺冰島睇到極光，返嚟成個人輕鬆咗。'; }
        g2.fx({ J: 2, K: 1 }); return '你喺筆記簿寫低三個目標，第一個係學識游水。';
      }, { def: 2, auto: 2, agui: 2 });
    },
  },
  // ---------- 65 歲後 ----------
  {
    id: 'E-OLD-SCAM', pri: 450, ages: [65, 95], once: false, cool: 8, cat: '生活陷阱',
    when: () => 0.15,
    make: (g) => {
      const amt = g.p(80000);
      return mkCard('E-OLD-SCAM', '猜猜我是誰', '電話嗰頭話：「阿爺／阿嫲，係我呀！我出咗事，即刻要錢……」', [
        { label: '即刻過數', money: -amt },
        { label: '收線再打俾仔女核實', fx: { R: 1 } },
        { label: '問佢細個個花名', fx: { K: 1 } },
      ], (g2, i) => {
        if (i === 0) { g2.spend(amt, '電話騙案'); g2.add('J', -6, '被騙'); g2.ach('scammed'); return `原來係騙案，${fmtMoney(amt)} 冇咗。警察話呢類案件每年都有好多長者中招。`; }
        if (i === 1) { g2.add('R', 1); return '孫仔好好地喺學校上堂。你即刻報警。'; }
        g2.add('K', 1); return '對方答唔出，即刻收線。你笑咗出嚟。';
      }, { def: 1, auto: 1, agui: 1 });
    },
  },
  {
    id: 'E-OLD-UNI', pri: 380, ages: [65, 85], once: false, cool: 7, cat: '生活日常',
    when: (g) => (g.s.K >= 40 ? 0.2 : 0.12),
    make: (g) => mkCard('E-OLD-UNI', '長者學苑', '社區中心開辦長者學苑，有書法、攝影同智能手機班。', [
      { label: '報讀', money: -g.p(3000), fx: { K: 3, R: 2, J: 2 } },
      { label: '唔報', fx: { J: 0 } },
    ], (g2, i) => {
      if (i === 0) { g2.spend(g2.p(3000), '長者學苑'); g2.fx({ K: 3, R: 2, J: 2 }, '長者學苑'); return '你學識用手機影相，仲識埋一班同學仔。'; }
      return '你覺得而家咁已經好。';
    }, { def: 0, auto: 0, agui: 0 }),
  },
  {
    id: 'E-OLD-GRANDKID', pri: 420, ages: [55, 85], once: false, cool: 6, cat: '人生抉擇',
    when: (g) => (g.s.ach.includes('grandparent') ? 0.18 : 0),
    make: (g) => mkCard('E-OLD-GRANDKID', '幫手湊孫', '仔女夫婦返工好忙，問你可唔可以平日幫手湊孫。', [
      { label: '一口答應', fx: { R: 4, J: 2, H: -1 } },
      { label: '出錢請工人', money: -g.p(60000), fx: { R: 2 } },
      { label: '婉拒，享受退休', fx: { J: 1, R: -2 } },
    ], (g2, i) => {
      if (i === 0) { g2.fx({ R: 4, J: 2, H: -1 }, '湊孫'); return '每朝送孫返幼稚園，佢叫你嗰聲好甜。'; }
      if (i === 1) { g2.spend(g2.p(60000), '請工人'); g2.add('R', 2); return '你出錢請工人，週末先去探孫。'; }
      g2.fx({ J: 1, R: -2 }); return '仔女話明白，但你聽得出佢有啲失望。';
    }, { def: 0, auto: 0, agui: 0 }),
  },
  {
    id: 'E-OLD-VOL', pri: 370, ages: [65, 85], once: false, cool: 6, cat: '生活日常',
    when: (g) => (g.s.R >= 40 ? 0.2 : 0.12),
    make: (g) => mkCard('E-OLD-VOL', '社區義工', '屋苑互助會搵長者義工探訪獨居長者。', [
      { label: '參加', fx: { R: 3, J: 2 } },
      { label: '捐少少錢支持', money: -g.p(2000), fx: { J: 1 } },
      { label: '唔參加' },
    ], (g2, i) => {
      if (i === 0) { g2.s.GP += 3; g2.fx({ R: 3, J: 2 }, '做義工'); return '你每星期探一位婆婆，佢每次都塞糖俾你。'; }
      if (i === 1) { g2.spend(g2.p(2000), '捐款'); g2.s.GP += 1; g2.add('J', 1); return '互助會寄咗張感謝卡俾你。'; }
      return '你話自己身體都唔係咁好。';
    }, { def: 0, auto: 0, agui: 0 }),
  },
  {
    id: 'E-OLD-TRIP', pri: 360, ages: [65, 80], once: false, cool: 5, cat: '生活日常',
    when: (g) => (g.liquid > g.p(200000) ? 0.25 : 0),
    make: (g) => {
      const cruise = g.p(80000), short = g.p(15000);
      return mkCard('E-OLD-TRIP', '退休去旅行', '退休之後終於有時間，你想去邊度？', [
        { label: '郵輪環遊一個月', money: -cruise, fx: { J: 5 } },
        { label: '去台灣短線遊', money: -short, fx: { J: 2 } },
        { label: '留港行山', fx: { H: 2 } },
      ], (g2, i) => {
        if (i === 0) { g2.spend(cruise, '郵輪'); g2.add('J', 5, '郵輪旅行'); g2.flag('travelled', g2.s.year); return '你喺甲板睇日落，覺得捱咗咁多年都值得。'; }
        if (i === 1) { g2.spend(short, '旅行'); g2.add('J', 2); g2.flag('travelled', g2.s.year); return '你喺九份飲茶，影咗好多相。'; }
        g2.add('H', 2); return '你同老友記行完麥理浩徑第二段。';
      }, { def: 2, auto: 1, agui: 1 });
    },
  },
];
