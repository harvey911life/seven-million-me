// v1.9（用家批）：第二批新劇情：考車牌、外賣兼職、公司欠薪、同事夾份六星彩、返鄉下探親、過大禮、
// 仔女叛逆期、兩代同住磨擦、退休做顧問、賣樓搬細、老友病危、金婚
import type { Game } from './game';
import { clamp, fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, type Card, type EventDef } from './cards';

const inHK = (g: Game) => !g.s.emigrated && !g.s.gba;
const afford = (g: Game, amt: number) => (g.liquid >= amt ? undefined : '手頭冇咁多錢');
const num = (g: Game, k: string) => Number(g.s.flags[k] ?? 0);
const homeValue = (g: Game) => (g.s.prop ? g.s.prop.price0 * (g.e.hpi / g.s.prop.hpi0) : 0);
const rmMonthly = (g: Game) => Math.round(homeValue(g) * (0.0028 + Math.max(0, g.s.age - 65) * 0.0001)); // 同「退休住邊」一樣

/** 過大禮：求婚成功之後、擺酒之前（男玩家先有抉擇；女玩家係收禮嗰邊） */
export function bigGiftCard(g: Game): Card {
  const s = g.s;
  const p = s.partner!;
  const r = streamRng(s.seed, 'biggift', s.age);
  const ask = g.p(r.pick([38888, 58888, 68888, 98888]));
  const gold = g.p(r.uni(20000, 40000));
  return mkCard('ST-BIGGIFT', '過大禮', `擺酒之前，${p.name}屋企開咗張過大禮清單：聘金 ${fmtMoney(ask)}，仲有禮餅同金器（約 ${fmtMoney(gold)}）。`, [
    { label: '照單全收', money: -(ask + gold), disabled: afford(g, ask + gold), fx: { R: 2 } },
    { label: '傾到減半', money: -Math.round((ask + gold) / 2), note: '外家可能唔多高興', fx: { R: -2 } },
    { label: '堅持唔俾聘金', money: -gold, note: `只買禮餅同金器；${p.name}夾喺中間好難做`, fx: { J: -3 } },
  ], (g2, i) => {
    const pt = g2.s.partner;
    if (i === 0) { const t = g2.spend(ask + gold, '過大禮'); g2.add('R', 2); return `外家好滿意，未來外母仲回禮咗一半聘金俾你哋做家用${t}。`; }
    if (i === 1) {
      const t = g2.spend(Math.round((ask + gold) / 2), '過大禮');
      g2.add('R', -2, '過大禮');
      return `你同未來外父飲咗兩餐茶，終於傾到減半${t}。`;
    }
    const t = g2.spend(gold, '禮餅金器');
    g2.add('J', -3, '過大禮');
    if (pt) pt.rel = clamp(pt.rel - 10, 0, 100);
    return `外母話「我個女唔係咁唔值錢」，${pt?.name ?? '另一半'}為咗呢件事喊咗成晚${t}。`;
  }, { pri: 790, def: 1, auto: 0, agui: 0, cat: '人生抉擇', scene: 'wedding' });
}

export const STORY2_EVENTS: EventDef[] = [
  { // 1. 考車牌
    id: 'ST-LICENSE', pri: 310, ages: [18, 30], cat: '生活日常',
    when: (g) => (inHK(g) && !g.s.flags['license'] ? 0.08 : 0),
    make: (g) => {
      const learn = g.p(12000), retake = g.p(1500);
      return mkCard('ST-LICENSE', '考車牌', '朋友個個都考緊車牌，話有牌先方便周圍去。', [
        { label: '學車考牌', money: -learn, note: `學車同考試約 ${fmtMoney(learn)}；每次重考約多 ${fmtMoney(retake)}`, disabled: afford(g, learn), fx: { J: 1 } },
        { label: '搭公共交通就夠', fx: {} },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 1) return '你覺得香港交通咁方便，唔使揸車。';
        g2.spend(learn, '學車');
        const r = streamRng(s.seed, 'license', s.age);
        let tries = 1;
        while (tries < 4 && r() >= 0.35) tries++; // 路試每次大約 35% 合格
        const extra = (tries - 1) * retake;
        if (extra) g2.spend(extra, '重考車牌');
        g2.flag('license', s.age);
        g2.add('J', tries === 1 ? 4 : 2, '考到車牌');
        return tries === 1 ? '路試一 take 過，考官都讚你泊車穩陣！' : `考咗 ${tries} 次路試先過，重考使多咗 ${fmtMoney(extra)}，終於拎到車牌。`;
      }, { pri: 310, def: 1, auto: 1, agui: 1, cat: '生活日常', scene: 'street' });
    },
  },
  { // 2. 兼職做外賣車手（兩年）
    id: 'ST-RIDER', pri: 320, ages: [20, 40], cat: '生活日常',
    when: (g) => (inHK(g) && g.s.status === 'work' && g.monthlyIncome() < g.p(25000) ? 0.04 : 0),
    make: (g) => mkCard('ST-RIDER', '兼職做外賣車手', '同事放工去送外賣，話每月可以多賺幾千蚊。', [
      { label: '放工兼職兩年', note: `每月多約 ${fmtMoney(g.p(5000))}；每年健康 −2，有少少交通意外風險`, fx: { H: -2 } },
      { label: '唔做，放工休息', fx: { J: 1 } },
    ], (g2, i) => {
      if (i === 1) { g2.add('J', 1); return '你覺得放工有返自己嘅時間更重要。'; }
      g2.flag('riderLeft', 2);
      return '你買咗個保溫袋，第一晚送咗八單。';
    }, { pri: 320, def: 1, auto: 1, agui: 1, cat: '生活日常', scene: 'street' }),
  },
  { // 外賣兼職：每年收入、健康、意外
    id: 'ST-RIDER-YR', pri: 319, once: false, fixed: true, cat: '生活日常',
    when: (g) => (num(g, 'riderLeft') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const left = num(g, 'riderLeft') - 1;
      if (left > 0) s.flags['riderLeft'] = left; else delete s.flags['riderLeft'];
      const pay = g.p(5000) * 12;
      g.gain(pay);
      g.add('H', -2, '兼職送外賣');
      if (streamRng(s.seed, 'rider', s.age)() < 0.03) {
        const c = g.p(10000);
        const t = g.spend(c, '交通意外');
        g.add('H', -10, '送外賣意外');
        return `送外賣嗰陣俾車撼到，入咗醫院，醫藥費 ${fmtMoney(c)}${t}。今年兼職賺咗 ${fmtMoney(pay)}。`;
      }
      return `兼職送外賣，今年多賺咗 ${fmtMoney(pay)}${left ? '' : '。兩年過去，你決定收工'}。`;
    },
  },
  { // 3. 公司欠薪執笠（取代舊版 T-BANKRUPT 一句說話，機會率一樣）
    id: 'ST-ARREARS', pri: 700, ages: [18, 64], once: false, cool: 10, cat: '財務衝擊',
    when: (g) => (g.s.status === 'work' && g.s.job ? 0.005 : 0),
    make: (g) => {
      const lost = Math.round(g.monthlyIncome() * 2);
      const back = Math.min(lost, g.p(36000));
      return mkCard('ST-ARREARS', '公司欠薪執笠', `公司突然宣佈清盤，欠你兩個月人工 ${fmtMoney(lost)}。`, [
        { label: '申請政府欠薪保障基金', note: `要等幾個月，最多補返 ${fmtMoney(back)}`, fx: { J: -3 } },
        { label: '私下同老細傾分期', note: '有機會全數還，亦可能一蚊都冇', fx: { J: -3 } },
      ], (g2, i) => {
        g2.add('J', -3, '欠薪');
        if (i === 0) { const t = g2.spend(lost - back, '欠薪'); return `你去勞工處填表，幾個月後基金補返 ${fmtMoney(back)}${lost > back ? `，其餘 ${fmtMoney(lost - back)} 冇咗${t}` : ''}。`; }
        if (streamRng(g2.s.seed, 'arrears', g2.s.age)() < 0.4) return '老細真係分期還晒俾你，你鬆咗一口氣。';
        const t = g2.spend(lost, '欠薪');
        g2.add('J', -2);
        return `老細還咗一期之後就搵唔到人，申請基金嘅限期又過咗${t}。`;
      }, { pri: 700, def: 0, auto: 0, agui: 0, cat: '財務衝擊', scene: 'office' });
    },
  },
  { // 4. 同事夾份買六星彩
    id: 'ST-POOL', pri: 300, ages: [25, 60], cat: '生活日常',
    when: (g) => (inHK(g) && g.s.status === 'work' ? 0.04 : 0),
    make: (g) => {
      const cost = g.p(20) * 52;
      return mkCard('ST-POOL', '同事夾份買六星彩', '辦公室有人搞六星彩夾份，每星期每人 $20，問你入唔入。', [
        { label: '夾一份', money: -cost, note: `一年約 ${fmtMoney(cost)}`, fx: { R: 1 } },
        { label: '唔夾', fx: {} },
      ], (g2, i) => {
        const s = g2.s;
        const r = streamRng(s.seed, 'pool', s.age);
        const win = r() < 0.01;
        const share = g2.p(r.uni(60000, 120000));
        s.lotterySpent += i === 0 ? cost : 0;
        if (i === 1) {
          if (win) { g2.add('J', -3, '冇夾到'); return `嗰年你哋公司組中咗二獎，每人分到 ${fmtMoney(share)}，你喺隔籬枱聽到佢哋歡呼。`; }
          return '一年之後個夾份群組靜靜雞解散咗，一個獎都冇中過。';
        }
        g2.spend(cost, '六星彩');
        g2.add('R', 1);
        if (!win) return '一年夾咗 52 期，最多中過一次七獎，大家請咗一餐下午茶。';
        s.lotteryWon += share;
        g2.gain(share);
        if (r() < 0.5) { g2.add('R', -3, '夾份爭拗'); return `你哋中咗二獎！每人分到 ${fmtMoney(share)}，不過有個嗰期冇夾嘅同事話佢都有份，大家鬧到唔同枱食飯。`; }
        g2.add('J', 5, '中二獎');
        return `你哋中咗二獎！每人分到 ${fmtMoney(share)}，成個辦公室開香檳。`;
      }, { pri: 300, def: 1, auto: 1, agui: 1, cat: '生活日常', scene: 'office' });
    },
  },
  { // 5. 返鄉下探親
    id: 'ST-HOMETOWN', pri: 320, ages: [25, 65], cat: '財務衝擊',
    when: (g) => {
      const s = g.s;
      if (!inHK(g) || s.origin.isBaoyou) return 0;
      return s.origin.family === '新移民' || s.partner?.origin === '內地' ? 0.04 : 0.008;
    },
    make: (g) => {
      const s = g.s;
      const r = streamRng(s.seed, 'hometown', s.age);
      const ask = g.p(r.uni(50000, 150000));
      const red = g.p(10000);
      return mkCard('ST-HOMETOWN', '返鄉下探親', `清明返鄉下拜山，叔公話村入面個個都起新屋，想你出 ${fmtMoney(ask)} 幫手。`, [
        { label: '俾全數', money: -ask, disabled: afford(g, ask), fx: { R: 4 } },
        { label: '封封大利是', money: -red, fx: { R: 1 } },
        { label: '婉拒', fx: { R: -3 } },
      ], (g2, i) => {
        if (i === 0) { const t = g2.spend(ask, '鄉下起屋'); g2.add('R', 4); return `新屋入伙嗰日，門口刻咗你個名${t}。`; }
        if (i === 1) { const t = g2.spend(red, '利是'); g2.add('R', 1); return `叔公收咗利是，話「有心就得」${t}。`; }
        g2.add('R', -3, '婉拒鄉下');
        return '你話自己都要供樓，叔公之後喺家族群組少咗同你講嘢。';
      }, { pri: 320, def: 1, auto: 1, agui: 1, cat: '財務衝擊', scene: 'street' });
    },
  },
  { // 7. 仔女叛逆期（每個仔女 14 歲嗰年 40%）
    id: 'ST-REBEL', pri: 720, once: false, fixed: true, cat: '人生抉擇',
    when: (g) => (g.s.kids.some((k) => k.age === 14 && !k.away && !g.s.flags[`rebel:${k.name}`]) ? 0.4 : 0),
    make: (g) => {
      const k = g.s.kids.find((x) => x.age === 14 && !x.away && !g.s.flags[`rebel:${x.name}`]);
      if (!k) return null;
      const camp = g.p(8000);
      return mkCard('ST-REBEL', '仔女叛逆期', `${k.name}最近日日打機打到凌晨三點，叫佢瞓覺仲閂埋房門。`, [
        { label: '沒收手機', note: '成績會好啲，但關係差咗', fx: {} },
        { label: '送佢去訓練營', money: -camp, disabled: afford(g, camp), fx: {} },
        { label: '坐低慢慢傾', note: '未必即刻見效', fx: { J: -1 } },
      ], (g2, i) => {
        const s = g2.s;
        s.flags[`rebel:${k.name}`] = true;
        const r = streamRng(s.seed, 'rebel', s.age);
        if (i === 0) { k.acad += 2; k.rel = clamp(k.rel - 10, 0, 100); return `${k.name}成個月冇同你講過一句嘢，不過測驗分數升咗。`; }
        if (i === 1) {
          const t = g2.spend(camp, '訓練營'); k.acad += 2; k.rel = clamp(k.rel - 3, 0, 100);
          return r() < 0.5 ? `訓練營返嚟，${k.name}會自己摺被，仲早咗瞓${t}。` : `${k.name}返嚟兩個星期又故態復萌${t}。`;
        }
        g2.add('J', -1);
        if (r() < 0.5) { k.rel = clamp(k.rel + 5, 0, 100); k.acad += 1; return `你哋傾到半夜，${k.name}答應十二點前瞓，仲教你打咗一鋪。`; }
        k.rel = clamp(k.rel + 2, 0, 100);
        return `${k.name}聽完話「知啦」，之後照打，不過肯同你講多咗嘢。`;
      }, { pri: 720, def: 2, auto: 2, agui: 2, cat: '人生抉擇', scene: 'home' });
    },
  },
  { // 8. 兩代同住磨擦
    id: 'ST-INLAW', pri: 330, ages: [25, 80], once: false, cool: 6, cat: '生活日常',
    when: (g) => {
      const s = g.s;
      return s.support === 'live' && s.married && s.partner?.alive && s.parents.some((p) => p.alive) ? 0.15 : 0;
    },
    make: (g) => {
      const s = g.s;
      const p = s.partner!;
      const move = g.p(20000);
      return mkCard('ST-INLAW', '兩代同住磨擦', `${p.name}同你屋企老人家為咗煮飯落幾多鹽嗌交，兩邊都望住你。`, [
        { label: '企喺父母嗰邊', fx: { J: -2 } },
        { label: '企喺另一半嗰邊', fx: { J: -2, R: -2 } },
        { label: '幫父母租屋搬開住', money: -move, note: '之後改為每月俾家用', disabled: afford(g, move), fx: { J: 1 } },
      ], (g2, i) => {
        const s2 = g2.s;
        const pt = s2.partner;
        if (i === 0) { g2.add('J', -2, '家庭磨擦'); if (pt) pt.rel = clamp(pt.rel - 8, 0, 100); return `${pt?.name ?? '另一半'}成晚冇同你講嘢。`; }
        if (i === 1) { g2.add('J', -2); g2.add('R', -2, '家庭磨擦'); return '阿媽話「娶咗老婆唔要老母」，第二朝照樣煲湯。'; }
        const t = g2.spend(move, '搬屋'); s2.support = 'money'; g2.add('J', 1);
        return `你幫父母喺附近租咗個單位，大家見面少咗反而客氣咗${t}。`;
      }, { pri: 330, def: 0, auto: 2, agui: 2, cat: '生活日常', scene: 'home' });
    },
  },
  { // 9. 退休後被請返工做顧問
    id: 'ST-CONSULT', pri: 320, ages: [60, 70], cat: '生活日常',
    when: (g) => (inHK(g) && g.s.status === 'retired' && g.s.lastSalary > 0 && (g.s.retiredAt ?? 99) >= 55 ? 0.08 : 0),
    make: (g) => {
      const pay = Math.round(Math.min(g.s.lastSalary * 0.5, g.p(25000)));
      return mkCard('ST-CONSULT', '退休後被請返工', `舊公司打嚟，想請你返去做兩年兼職顧問，每月 ${fmtMoney(pay)}。`, [
        { label: '返去做兩年', note: `每月 ${fmtMoney(pay)}，一星期返兩日`, fx: { R: 2 } },
        { label: '退休就退休', fx: { J: 2 } },
      ], (g2, i) => {
        if (i === 1) { g2.add('J', 2); return '你話「多謝，不過我約咗朋友行山。」'; }
        g2.flag('consultPay', pay); g2.flag('consultLeft', 2); g2.add('R', 2);
        return '你再次打起條領呔，啲後輩見到你都好開心。';
      }, { pri: 320, def: 1, auto: 0, agui: 0, cat: '生活日常', scene: 'office' });
    },
  },
  { // 退休顧問：每年收入
    id: 'ST-CONSULT-YR', pri: 319, once: false, fixed: true, cat: '生活日常',
    when: (g) => (num(g, 'consultLeft') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const left = num(g, 'consultLeft') - 1;
      const pay = num(g, 'consultPay') * 12;
      g.gain(pay);
      if (left > 0) { s.flags['consultLeft'] = left; return `做兼職顧問，今年收入 ${fmtMoney(pay)}。`; }
      delete s.flags['consultLeft']; delete s.flags['consultPay'];
      return `兼職顧問做滿兩年，今年收入 ${fmtMoney(pay)}，你今次真係退休喇。`;
    },
  },
  { // 10. 賣大屋搬細（以樓養老）
    id: 'ST-DOWNSIZE', pri: 340, ages: [65, 90], cat: '財務衝擊',
    when: (g) => {
      const s = g.s;
      if (!inHK(g) || s.home !== 'own' || !s.prop || s.prop.mortgage > 0 || s.reverseMortgage > 0) return 0;
      if (s.kids.some((k) => !k.away && !k.out && k.age < 25)) return 0;
      return 0.04;
    },
    make: (g) => {
      const v = homeValue(g);
      const small = v * 0.55;
      const cashOut = Math.round(v * 0.97 - small * 1.05); // 賣樓扣 3% 使費，買細單位加 5% 稅費
      const rm = rmMonthly(g);
      return mkCard('ST-DOWNSIZE', '以樓養老', `仔女都大咗，你同另一半住住個 ${fmtMoney(v)} 嘅單位，諗緊層樓點樣幫你養老。`, [
        { label: '賣樓搬細', note: `換一個細單位，套現約 ${fmtMoney(cashOut)}`, fx: { J: -2 } },
        { label: '做反向按揭', note: `繼續住，每月收 ${fmtMoney(rm)}` },
        { label: '維持現狀', note: '層樓留俾仔女', fx: { J: 1 } },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 2) { g2.add('J', 1); return '你覺得住慣咗呢度，唔想搬。'; }
        if (i === 1) { s.reverseMortgage = rm; return `層樓每月俾你 ${fmtMoney(rm)}，你照住喺度。`; }
        s.cash += cashOut;
        s.prop = { ...s.prop!, kind: '細單位', price0: Math.round(small), hpi0: g2.e.hpi, mortgage: 0, monthsLeft: 0, pmt: 0, first: false, boughtYear: s.year };
        g2.add('J', -2, '搬離舊屋');
        g2.log(`賣樓搬細，套現 ${fmtMoney(cashOut)}`, '人生抉擇');
        return `你搬去一個細啲嘅單位，套現 ${fmtMoney(cashOut)}，執屋嗰陣搵返好多舊相。`;
      }, { pri: 340, def: 2, auto: 2, agui: g.liquid < v * 0.1 ? 0 : 2, cat: '財務衝擊', scene: 'home' });
    },
  },
  { // 11. 老友病危
    id: 'ST-FRIENDSICK', pri: 340, ages: [45, 75], cat: '財務衝擊',
    when: (g) => (inHK(g) && g.liquid >= g.p(150000) ? 0.015 : 0),
    make: (g) => {
      const s = g.s;
      const r = streamRng(s.seed, 'friendsick', s.age);
      const amt = Math.round(Math.min(g.p(r.uni(100000, 300000)), g.liquid * 0.4) / 1000) * 1000;
      const gift = g.p(10000);
      return mkCard('ST-FRIENDSICK', '老友病危', `中學好朋友阿強確診重病，佢冇買醫療保障，自費藥要成 ${fmtMoney(amt * 2)}，佢問你借 ${fmtMoney(amt)}。`, [
        { label: '借俾佢', money: -amt, fx: { R: 3 } },
        { label: '俾封利是，唔借', money: -gift, fx: { R: 1 } },
        { label: '唔借', fx: { R: -3, J: -2 } },
      ], (g2, i) => {
        const s2 = g2.s;
        const r2 = streamRng(s2.seed, 'friendsick2', s2.age);
        const survive = r2() < 0.6;
        if (i === 2) { g2.add('R', -3); g2.add('J', -2, '老友病危'); return survive ? '阿強最後賣咗層樓醫病，康復之後冇再搵你。' : '幾個月之後收到阿強嘅訃聞，你喺靈堂坐咗好耐。'; }
        if (i === 1) { const t = g2.spend(gift, '探病'); g2.add('R', 1); return `你去醫院探佢，塞咗封利是${t}。${survive ? '阿強撐過咗。' : '半年後阿強走咗。'}`; }
        const t = g2.spend(amt, '借俾朋友');
        g2.add('R', 3);
        if (survive) { g2.flag('friendPay', Math.round(amt / 4)); g2.flag('friendLeft', 4); return `阿強用咗新藥，病情受控，佢話返工之後分四年還你${t}。`; }
        g2.add('J', -5, '老友離世');
        return `你借咗 ${fmtMoney(amt)} 俾阿強${t}，不過佢都係捱唔過。佢太太話會慢慢還，你叫佢唔使。`;
      }, { pri: 340, def: 1, auto: 1, agui: 1, cat: '財務衝擊', scene: 'hospital' });
    },
  },
  { // 老友還錢
    id: 'ST-FRIENDPAY', pri: 339, once: false, fixed: true, cat: '財務衝擊',
    when: (g) => (num(g, 'friendLeft') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const pay = num(g, 'friendPay');
      g.gain(pay);
      const left = num(g, 'friendLeft') - 1;
      if (left > 0) { s.flags['friendLeft'] = left; return `阿強還咗 ${fmtMoney(pay)} 俾你。`; }
      delete s.flags['friendLeft']; delete s.flags['friendPay'];
      return `阿強還清晒錢，仲提你：「記得買定醫療保障，唔好學我。」`;
    },
  },
  { // 12. 金婚
    id: 'ST-GOLDEN', pri: 730, fixed: true, cat: '人生抉擇',
    when: (g) => {
      const s = g.s;
      return s.married && s.marriedAt !== null && s.partner?.alive && s.age - s.marriedAt === 50 ? 1 : 0;
    },
    make: (g) => {
      const p = g.s.partner!;
      const party = g.p(30000), trip = g.p(15000);
      return mkCard('ST-GOLDEN', '金婚', `今年係你同${p.name}結婚 50 周年。`, [
        { label: '擺酒請親友', money: -party, disabled: afford(g, party), fx: { J: 5, R: 3 } },
        { label: '兩個人去旅行', money: -trip, disabled: afford(g, trip), fx: { J: 5 } },
        { label: '喺屋企食餐飯', fx: { J: 3 } },
      ], (g2, i) => {
        g2.ach('golden_wedding');
        const pt = g2.s.partner;
        if (pt) pt.rel = clamp(pt.rel + 5, 0, 100);
        if (i === 0) { const t = g2.spend(party, '金婚'); g2.add('J', 5, '金婚'); g2.add('R', 3); return `仔女孫一齊上台，播返你哋 50 年前嘅結婚相${t}。`; }
        if (i === 1) { const t = g2.spend(trip, '金婚旅行'); g2.add('J', 5, '金婚'); return `你哋返去當年度蜜月嘅地方，拖住手行咗成個下晝${t}。`; }
        g2.add('J', 3, '金婚');
        return `${pt?.name ?? '另一半'}煮咗你最鍾意嗰味餸，同當年第一次約會一樣。`;
      }, { pri: 730, def: 2, auto: 1, agui: 1, cat: '人生抉擇', scene: 'wedding' });
    },
  },
];
