// v2.1（用家批）：第三批新劇情：短片爆紅、裝修佬走數、職場欺凌、另一半失業、照顧患病另一半、
// 轉按回贈同加按、樓花定二手、父母再婚、照顧隔籬婆婆（「仔女要首期」升級咗 family.ts 原有嘅 C-RT-04）
import type { Game } from './game';
import { clamp, fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, type EventDef } from './cards';
import { pmtOf } from './finance';
import { buyHome, mortgageOf, starterPrice } from './family';

const inHK = (g: Game) => !g.s.emigrated && !g.s.gba;
const afford = (g: Game, amt: number) => (g.liquid >= amt ? undefined : '手頭冇咁多錢');
const num = (g: Game, k: string) => Number(g.s.flags[k] ?? 0);
const homeValue = (g: Game) => (g.s.prop ? g.s.prop.price0 * (g.e.hpi / g.s.prop.hpi0) : 0);
const spouse = (g: Game) => (g.s.married && g.s.partner?.alive ? g.s.partner : null);
/** 備用金夠用幾多個月（按去年開支） */
const monthsCover = (g: Game) => {
  const need = Math.max(1, num(g, 'lastExpense') / 12);
  return Math.floor(Math.max(0, g.s.cash + g.s.deposit) / need);
};
/** 辭工：記低人工，明年開始搵工 */
const quitJob = (g: Game) => {
  const s = g.s;
  if (s.job) s.lastSalary = s.job.salary;
  s.status = 'unemp';
};

export const STORY3_EVENTS: EventDef[] = [
  { // 1. 短片爆紅
    id: 'ST3-VIRAL', pri: 330, ages: [18, 35], cat: '生活日常',
    when: (g) => (inHK(g) && g.s.status === 'work' && g.s.year >= 2010 ? 0.025 : 0),
    make: (g) => mkCard('ST3-VIRAL', '短片爆紅', `你隨手拍咗條片講返工日常，一晚有 50 萬人睇，仲有品牌搵你合作。你而家嘅備用金夠用 ${monthsCover(g)} 個月。`, [
      { label: '辭工做全職網紅', note: '試兩年；收入有時好多、有時好少，之後再搵工', fx: { J: 4 } },
      { label: '放工先拍', note: `三年內每月多約 ${fmtMoney(g.p(3000))}，會攰啲`, fx: { H: -1 } },
      { label: '唔理佢', note: '專心返工' },
    ], (g2, i) => {
      if (i === 2) return '條片熱咗兩個星期，之後就冇人記得。';
      if (i === 1) { g2.flag('viralSide', 3); return '你開咗個頻道，放工剪片剪到兩點。'; }
      quitJob(g2);
      g2.flag('creatorLeft', 2);
      g2.flag('retrainYear', g2.s.year + 1);
      g2.add('J', 4, '做全職網紅');
      return '你遞咗信，買咗部新相機。';
    }, { pri: 330, def: 2, auto: 1, agui: 1, cat: '生活日常', scene: 'street' }),
  },
  { // 全職網紅：每年收入時高時低
    id: 'ST3-CREATOR-YR', pri: 329, once: false, fixed: true, cat: '生活日常',
    when: (g) => (num(g, 'creatorLeft') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const left = num(g, 'creatorLeft') - 1;
      if (left > 0) { s.flags['creatorLeft'] = left; g.flag('retrainYear', s.year + 1); } else delete s.flags['creatorLeft'];
      const r = streamRng(s.seed, 'creator', s.age);
      const k = r();
      const month = k < 0.15 ? 60000 : k < 0.55 ? 18000 : 3000;
      const pay = g.p(month) * 12;
      g.gain(pay);
      const tail = left ? '' : '兩年過去，你決定返去搵份正職。';
      if (month >= 60000) { g.add('J', 3); return `做網紅今年好旺，接咗好多廣告，賺咗 ${fmtMoney(pay)}。${tail}`; }
      if (month >= 18000) return `做網紅今年收入一般，賺咗 ${fmtMoney(pay)}。${tail}`;
      const cover = monthsCover(g);
      g.add('J', -3, '網紅收入冇着落');
      return `今年演算法變咗，冇人睇你條片，全年只賺咗 ${fmtMoney(pay)}。${cover >= 6 ? '好彩之前有儲備用金。' : '你要碌卡頂住。'}${tail}`;
    },
  },
  { // 放工兼職拍片
    id: 'ST3-VIRAL-YR', pri: 328, once: false, fixed: true, cat: '生活日常',
    when: (g) => (num(g, 'viralSide') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const left = num(g, 'viralSide') - 1;
      if (left > 0) s.flags['viralSide'] = left; else delete s.flags['viralSide'];
      const pay = g.p(3000) * 12;
      g.gain(pay);
      g.add('H', -1, '放工拍片');
      return left ? '' : `拍片三年，總共多賺咗大約 ${fmtMoney(pay * 3)}，你決定休息吓。`;
    },
  },
  { // 2. 裝修佬走數
    id: 'ST3-RENO', pri: 560, cat: '財務衝擊',
    when: (g) => (inHK(g) && g.s.prop && g.s.prop.boughtYear === g.s.year - 1 ? 0.6 : 0),
    make: (g) => {
      const r = streamRng(g.s.seed, 'reno', g.s.age);
      const c = Math.round(g.p(r.uni(150000, 250000)) / 1000) * 1000;
      const lump = Math.round(c * 0.9), safe = Math.round(c * 1.2);
      return mkCard('ST3-RENO', '新屋裝修', `新屋要裝修，網上搵到嘅師傅報價 ${fmtMoney(c)}。佢話一次過俾晒可以打九折。`, [
        { label: '一次過俾晒', money: -lump, note: '平一成，但錢一早俾晒', disabled: afford(g, lump) },
        { label: '按進度分期俾', money: -c, note: '每做完一部分先俾一期', disabled: afford(g, c) },
        { label: '搵相熟師傅', money: -safe, note: '貴兩成，親戚推介', disabled: afford(g, safe) },
        { label: '住住先，遲啲先裝', note: '慳返筆錢，住得冇咁舒服', fx: { J: -1 } },
      ], (g2, i) => {
        if (i === 3) { g2.add('J', -1); return '你買咗幾件平價傢俬，住住先。'; }
        if (i === 2) { const t = g2.spend(safe, '裝修'); g2.add('J', 3, '新屋裝修'); return `師傅準時完工，連你冇留意嘅位都執好晒${t}。`; }
        const run = streamRng(g2.s.seed, 'renoRun', g2.s.age)() < 0.25;
        if (i === 0) {
          const t = g2.spend(lump, '裝修');
          if (!run) { g2.add('J', 3, '新屋裝修'); return `師傅好快手，兩個月就搞掂${t}。`; }
          const fix = Math.round(c * 0.5);
          const t2 = g2.spend(fix, '搵人執手尾');
          g2.add('J', -6, '裝修佬走數');
          return `做到一半，師傅收咗錢就搵唔到人。你要另外搵人執手尾，多使咗 ${fmtMoney(fix)}${t}${t2}。`;
        }
        const t = g2.spend(c, '裝修');
        if (!run) { g2.add('J', 3, '新屋裝修'); return `你每一期都驗收先俾錢，裝修順利完成${t}。`; }
        g2.add('J', -2, '裝修延誤');
        return `做到一半師傅冇再出現，好在你未俾尾數，搵第二個師傅接手，只係遲咗兩個月入伙${t}。`;
      }, { pri: 560, def: 1, auto: 1, agui: 1, cat: '財務衝擊', scene: 'home' });
    },
  },
  { // 3. 職場欺凌
    id: 'ST3-BULLY', pri: 420, ages: [20, 60], cat: '人生抉擇',
    when: (g) => (g.s.status === 'work' && g.s.job && !num(g, 'bullyLeft') ? 0.012 : 0),
    make: (g) => mkCard('ST3-BULLY', '職場欺凌', `新上司成日喺人前針對你，仲將你嘅功勞據為己有。你而家嘅備用金夠用 ${monthsCover(g)} 個月。`, [
      { label: '向人事部投訴', note: '可能解決，亦可能影響升職' },
      { label: '忍住', note: '每年快樂同健康都會受影響', fx: { J: -2 } },
      { label: '辭工', note: '要靠備用金頂住，再搵新工', fx: { J: 3 } },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 2) { quitJob(g2); g2.add('J', 3, '離開有毒職場'); return '你交咗信，走出公司嗰下覺得成個人輕咗。'; }
      if (i === 1) { g2.flag('bullyLeft', 3); g2.add('J', -2, '職場欺凌'); return '你決定忍住，每朝返工前都要深呼吸。'; }
      if (streamRng(s.seed, 'bully', s.age)() < 0.5) { g2.add('J', 2); g2.add('R', 1); return '人事部調查之後，個上司俾人調走咗。'; }
      if (s.job) { s.job.promoBoost = 0.7; s.job.promoBoostYears = 3; }
      g2.add('J', -3, '投訴冇結果');
      return '投訴最後不了了之，上司對你更加冷淡，升職機會少咗。';
    }, { pri: 420, def: 0, auto: 0, agui: 0, cat: '人生抉擇', scene: 'office' }),
  },
  { // 忍住：每年影響身心，上司有機會調走
    id: 'ST3-BULLY-YR', pri: 419, once: false, fixed: true, cat: '人生抉擇',
    when: (g) => (num(g, 'bullyLeft') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      if (s.status !== 'work') { delete s.flags['bullyLeft']; return ''; }
      const left = num(g, 'bullyLeft') - 1;
      if (left <= 0 || streamRng(s.seed, 'bullyEnd', s.age)() < 0.3) { delete s.flags['bullyLeft']; return '針對你嘅上司終於轉咗工，辦公室靜返晒。'; }
      s.flags['bullyLeft'] = left;
      g.add('J', -3, '職場欺凌'); g.add('H', -1, '職場欺凌');
      return '';
    },
  },
  { // 4. 另一半失業
    id: 'ST3-PJOB', pri: 600, ages: [28, 60], cool: 10, once: false, cat: '財務衝擊',
    when: (g) => {
      const p = spouse(g);
      return p && p.income > 0 && p.age < 60 && !num(g, 'ptBackAt') ? 0.012 : 0;
    },
    make: (g) => {
      const p = spouse(g)!;
      return mkCard('ST3-PJOB', '另一半失業', `${p.name}公司裁員，佢失業喇，每月少咗 ${fmtMoney(p.income)} 收入。你哋嘅備用金夠用 ${monthsCover(g)} 個月。`, [
        { label: '你頂住，等佢慢慢搵', note: '佢一年冇收入，之後搵返差唔多嘅工' },
        { label: '叫佢即刻搵住份工先', note: '收入少三成，冇咁大壓力' },
        { label: '一齊慳住使', note: '佢一年冇收入，屋企每月慳返約 ' + fmtMoney(g.p(3000)), fx: { J: -2 } },
      ], (g2, i) => {
        const pt = g2.s.partner!;
        if (i === 1) { pt.income = Math.round(pt.income * 0.7); pt.rel = clamp(pt.rel - 8, 0, 100); g2.add('J', -1); return `${pt.name}去咗做文員，人工少咗，佢一直悶悶不樂。`; }
        g2.flag('ptBack', pt.income);
        g2.flag('ptBackAt', g2.s.year + 1);
        pt.income = 0;
        if (i === 2) { g2.gain(g2.p(3000) * 12); g2.add('J', -2, '慳住使'); pt.rel = clamp(pt.rel + 3, 0, 100); return '你哋取消咗旅行，晚晚喺屋企煮飯。'; }
        pt.rel = clamp(pt.rel + 5, 0, 100); g2.add('J', -1);
        return `你同${pt.name}講：「慢慢嚟，屋企有我。」`;
      }, { pri: 600, def: 0, auto: 0, agui: 0, cat: '財務衝擊', scene: 'home' });
    },
  },
  { // 另一半搵返工
    id: 'ST3-PJOB-YR', pri: 599, once: false, fixed: true, cat: '財務衝擊',
    when: (g) => (num(g, 'ptBackAt') && g.s.year >= num(g, 'ptBackAt') ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const back = num(g, 'ptBack');
      delete s.flags['ptBack']; delete s.flags['ptBackAt'];
      const p = spouse(g);
      if (!p) return '';
      p.income = p.age >= 65 ? 0 : Math.round(back * (g.W / Math.max(1e-9, g.econ(s.year - 1).W)));
      return p.income ? `${p.name}終於搵到新工。` : '';
    },
  },
  { // 5. 照顧患病嘅另一半（伴侶今年確診重病）
    id: 'ST3-PCARE', pri: 700, ages: [50, 95], cat: '健康',
    when: (g) => {
      const p = spouse(g);
      return p && p.ill === g.s.year ? 0.5 : 0;
    },
    make: (g) => {
      const p = spouse(g)!;
      const helper = g.p(7500) * 12, home = g.p(16000) * 12;
      const working = g.s.status === 'work';
      return mkCard('ST3-PCARE', `照顧${p.name}`, `${p.name}出院之後行動唔方便，要人長期照顧。公營院舍要輪候幾年。`, [
        { label: working ? '自己辭工照顧' : '自己照顧', note: working ? '冇咗人工，身心都會好攰' : '身心都會好攰', fx: { H: -2, R: 2 } },
        { label: '請外傭照顧', note: `每年約 ${fmtMoney(helper)}` },
        { label: '入住私營院舍', note: `每年約 ${fmtMoney(home)}`, fx: { J: -2 } },
      ], (g2, i) => {
        const pt = g2.s.partner!;
        g2.flag('pcareLeft', 5);
        if (i === 0) {
          if (g2.s.status === 'work') quitJob(g2);
          g2.flag('pcare', 'self');
          if (g2.s.age < 65) g2.flag('retrainYear', g2.s.year + 1);
          pt.rel = clamp(pt.rel + 10, 0, 100);
          return `你決定親手照顧${pt.name}，每日陪佢做復康。`;
        }
        if (i === 1) { g2.flag('pcare', 'helper'); return '外傭姐姐好細心，你放工可以陪佢散步。'; }
        g2.flag('pcare', 'home');
        g2.add('J', -2, `${pt.name}入院舍`);
        pt.rel = clamp(pt.rel - 5, 0, 100);
        return `你每個星期去院舍探${pt.name}兩次。`;
      }, { pri: 700, def: 1, auto: 1, agui: 1, cat: '健康', scene: 'hospital' });
    },
  },
  { // 照顧開支同身心
    id: 'ST3-PCARE-YR', pri: 698, once: false, fixed: true, cat: '健康',
    when: (g) => (num(g, 'pcareLeft') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const how = String(s.flags['pcare'] ?? '');
      const p = spouse(g);
      const left = num(g, 'pcareLeft') - 1;
      if (!p || left <= 0) {
        delete s.flags['pcareLeft']; delete s.flags['pcare'];
        return p ? `${p.name}慢慢康復得七七八八，唔再需要全日照顧。` : '';
      }
      s.flags['pcareLeft'] = left;
      if (how === 'self') {
        g.add('H', -2, '照顧另一半'); g.add('J', -2, '照顧另一半');
        if (s.age < 65 && left > 1) g.flag('retrainYear', s.year + 1);
        return '';
      }
      const cost = how === 'helper' ? g.p(7500) * 12 : g.p(16000) * 12;
      const t = g.spend(cost, how === 'helper' ? '外傭照顧另一半' : '院舍費');
      return t ? `照顧${p.name}嘅開支今年 ${fmtMoney(cost)}${t}。` : '';
    },
  },
  { // 6. 轉按回贈 / 加按套現
    id: 'ST3-REFI', pri: 380, ages: [30, 65], cat: '人生抉擇',
    when: (g) => {
      const p = g.s.prop;
      return inHK(g) && p && p.mortgage > g.p(500000) && p.monthsLeft > 60 && g.s.year - p.boughtYear >= 3 ? 0.04 : 0;
    },
    make: (g) => {
      const p = g.s.prop!;
      const cash = Math.round(p.mortgage * 0.01 / 100) * 100;
      const co = Math.max(0, Math.round(Math.min(homeValue(g) * 0.1, homeValue(g) * 0.6 - p.mortgage) / 1000) * 1000);
      const newPmt = pmtOf(p.mortgage + co, g.e.rmort, p.monthsLeft);
      return mkCard('ST3-REFI', '轉按', `另一間銀行話你轉按過去，可以攞返貸款額 1% 現金回贈（約 ${fmtMoney(cash)}）。佢仲話可以順便加按套現。（遊戲模擬，不構成投資建議）`, [
        { label: '轉按攞回贈', note: '要留兩年罰息期' },
        { label: '唔轉', note: '慳返麻煩' },
        { label: '轉按再加按套現', note: co > 0 ? `多拎 ${fmtMoney(co)} 現金，月供由 ${fmtMoney(p.pmt)} 變 ${fmtMoney(newPmt)}` : undefined, disabled: co > 0 ? undefined : '層樓唔夠價值加按' },
      ], (g2, i) => {
        if (i === 1) return '你覺得而家咁樣都 OK。';
        g2.gain(cash);
        if (i === 0) return `轉按完成，收到 ${fmtMoney(cash)} 回贈。`;
        const pr = g2.s.prop!;
        pr.mortgage += co;
        pr.pmt = pmtOf(pr.mortgage, g2.e.rmort, pr.monthsLeft);
        g2.gain(co);
        g2.flag('cashOut', g2.s.year);
        g2.add('J', 2);
        return `你手上多咗 ${fmtMoney(cash + co)}，不過每月要供多啲，供樓年期冇變。`;
      }, { pri: 380, def: 1, auto: 0, agui: 0, cat: '人生抉擇', scene: 'bank' });
    },
  },
  { // 7. 樓花定二手
    id: 'ST3-OFFPLAN', pri: 750, ages: [25, 50], cat: '人生抉擇',
    when: (g) => {
      const s = g.s;
      if (!inHK(g) || s.prop || s.status !== 'work' || !(s.saveForHome || s.flags['wantHomeUntil'])) return 0;
      return 0.15;
    },
    make: (g) => {
      const price = starterPrice(g);
      const op = Math.round(price * 0.92);
      const mo = mortgageOf(g, op, 0.7), m2 = mortgageOf(g, price, 0.7);
      const liq = g.s.cash + g.s.deposit + g.s.index + g.s.stock;
      const why = (m: typeof mo) => (!m.stress ? '入息唔夠，銀行唔批' : liq < m.upfront ? '首期未夠' : undefined);
      return mkCard('ST3-OFFPLAN', '樓花定二手', `附近有新樓盤賣樓花，比同區二手平 8%，不過要等兩年先收樓。（遊戲模擬，不構成投資建議）`, [
        { label: '買樓花', note: `樓價 ${fmtMoney(op)}，首期連使費 ${fmtMoney(mo.upfront)}；有機會延遲收樓`, disabled: why(mo) },
        { label: '買二手', note: `樓價 ${fmtMoney(price)}，首期連使費 ${fmtMoney(m2.upfront)}；即刻有得住`, disabled: why(m2) },
        { label: '再睇睇', note: '暫時唔買' },
      ], (g2, i) => {
        if (i === 2) return '你決定再儲多陣先。';
        const s = g2.s;
        const old = s.home;
        if (i === 1) { const res = buyHome(g2, price, 0.7, '二手樓', false); return res.text; }
        const res = buyHome(g2, op, 0.7, '樓花', false);
        if (!res.ok) return res.text;
        const delay = streamRng(s.seed, 'offplan', s.age)() < 0.15;
        g2.flag('offplanWait', delay ? 3 : 2);
        g2.flag('offplanHome', old);
        return `${res.text}你要等${delay ? '三' : '兩'}年先收樓，期間仲住喺舊屋。`;
      }, { pri: 750, def: 2, auto: 1, agui: 1, cat: '人生抉擇', scene: 'home' });
    },
  },
  { // 等收樓：住喺舊地方，每年交租或者迫住
    id: 'ST3-OFFPLAN-YR', pri: 749, once: false, fixed: true, cat: '人生抉擇',
    when: (g) => (num(g, 'offplanWait') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const left = num(g, 'offplanWait') - 1;
      const old = String(s.flags['offplanHome'] ?? '');
      if (left > 0) {
        s.flags['offplanWait'] = left;
        if (old === 'rent' || old === 'subdiv') { const rent = g.p(12000) * 12; const t = g.spend(rent, '等收樓期間租金'); return `等收樓期間一邊供樓一邊交租，今年租金 ${fmtMoney(rent)}${t}。`; }
        g.add('J', -1, '等收樓');
        return '';
      }
      delete s.flags['offplanWait']; delete s.flags['offplanHome'];
      g.add('J', 3, '收樓');
      return '終於收樓，你第一次攞住鎖匙入新屋。';
    },
  },
  { // 9. 父母再婚（童年／青少年）
    id: 'ST3-REMARRY', pri: 450, ages: [7, 16], cat: '人生抉擇',
    when: (g) => {
      const s = g.s;
      if (s.origin.isBaoyou) return 0;
      const single = s.origin.family === '單親' || s.parents.some((p) => !p.alive);
      return single && s.parents.some((p) => p.alive) ? 0.1 : 0;
    },
    make: (g) => {
      const p = g.s.parents.find((x) => x.alive)!;
      const who = p.role === '父' ? '爸爸' : '媽媽';
      return mkCard('ST3-REMARRY', `${who}再婚`, `${who}話想同拍拖兩年嘅對象結婚，對方仲有個同你差唔多大嘅小朋友。`, [
        { label: '接受佢哋', note: '屋企會多兩個人', fx: { R: 3 } },
        { label: '抗拒', note: '你覺得冇人可以取代你屋企', fx: { J: -3, R: -2 } },
      ], (g2, i) => {
        g2.flag('stepFamily', i === 0 ? 'ok' : 'no');
        if (i === 0) { g2.add('R', 3); g2.add('J', 1); return `婚禮上，${who}攬住你喊。慢慢你多咗個一齊打機嘅拍檔。`; }
        g2.add('J', -3, `${who}再婚`); g2.add('R', -2);
        return '你成日收埋喺房，唔肯同佢哋食飯。';
      }, { pri: 450, def: 0, auto: 0, agui: 0, cat: '人生抉擇', scene: 'home' });
    },
  },
  { // 抗拒之後：幾年後慢慢和解
    id: 'ST3-REMARRY-YR', pri: 449, ages: [9, 25], fixed: true, cat: '人生抉擇',
    when: (g) => (g.s.flags['stepFamily'] === 'no' ? 0.3 : 0),
    tick: (g) => { g.flag('stepFamily', 'ok'); g.add('R', 2); g.add('J', 2); return '你病咗嗰晚，繼父母成晚冇瞓照顧你。你開始接受佢哋。'; },
  },
  { // 10. 照顧隔籬獨居婆婆
    id: 'ST3-GRANNY', pri: 340, ages: [12, 75], cat: '生活日常',
    when: (g) => (inHK(g) ? 0.012 : 0),
    make: (g) => mkCard('ST3-GRANNY', '隔籬屋婆婆', '隔籬屋獨居嘅陳婆婆冇子女，成日一個人坐喺門口望住條走廊。', [
      { label: '定期探佢', note: '每星期陪佢傾偈、幫佢買餸', fx: { J: 2, R: 2 } },
      { label: '偶然幫手', note: '見到就幫佢拎嘢', fx: { R: 1 } },
      { label: '唔好理人哋屋企事' },
    ], (g2, i) => {
      if (i === 2) return '你繼續行過，冇停低。';
      if (i === 1) { g2.s.GP += 1; g2.add('R', 1); return '婆婆每次見到你都塞粒糖俾你。'; }
      g2.s.GP += 3; g2.add('J', 2); g2.add('R', 2);
      g2.flag('grannyAt', g2.s.age);
      return '婆婆教你整芝麻糊，仲講咗好多舊香港嘅故事。';
    }, { pri: 340, def: 1, auto: 1, agui: 0, cat: '生活日常', scene: 'home' }),
  },
  { // 幾年後婆婆離世
    id: 'ST3-GRANNY-END', pri: 339, fixed: true, cat: '生活日常',
    when: (g) => (g.s.flags['grannyAt'] !== undefined && g.s.age - num(g, 'grannyAt') >= 3 ? 0.25 : 0),
    tick: (g) => { g.add('J', -2); g.s.GP += 2; return '陳婆婆安詳離世。社工交咗本相簿俾你，入面有好多張你同佢嘅合照。'; },
  },
];
