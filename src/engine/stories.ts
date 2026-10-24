// v1.8（用家批）：新劇情：補習、校隊、紅色炸彈、八號風球、日本、外傭斷約、幼稚園面試、親戚借錢、老店結業，
// 加擔保人連續劇情（由 C-AN-04 開始）
import type { Game } from './game';
import { fmtMoney } from './util';
import { streamRng } from './rng';
import { mkCard, type EventDef } from './cards';

const inHK = (g: Game) => !g.s.emigrated && !g.s.gba;
const afford = (g: Game, amt: number) => (g.liquid >= amt ? undefined : '手頭冇咁多錢');
const famSave = (g: Game) => Math.max(0, Number(g.s.flags['familySavings'] ?? 0));
const num = (g: Game, k: string) => Number(g.s.flags[k] ?? 0);
/** 只喺冇其他升職加成 / 減成嗰陣先改，唔蓋過外派等較大嘅效果 */
function promoNext(g: Game, m: number) {
  const j = g.s.job;
  if (j && !j.promoBoostYears) { j.promoBoost = m; j.promoBoostYears = 1; }
}

export const STORY_EVENTS: EventDef[] = [
  { // 1. 補習天王
    id: 'ST-TUTOR', pri: 700, ages: [15, 16], fixed: true, cat: '人生抉擇',
    when: (g) => (inHK(g) && g.s.status === 'study' && g.s.tutoring !== 1 && g.s.tutoring !== 3 ? 0.35 : 0), // 已經因「成績追唔上」報咗補習就唔再問
    make: (g) => {
      const big = g.p(36000), small = g.p(14400);
      const fs = famSave(g);
      return mkCard('ST-TUTOR', '補習天王', '同學個個都話報咗巴士車身嗰個補習名師，聽講佢每年都「貼中題」。', [
        { label: '報名師班', note: `每月 ${fmtMoney(big / 12)}，一年 ${fmtMoney(big)}，屋企俾`, disabled: fs >= big ? undefined : '屋企負擔唔起', fx: { K: 3 } },
        { label: '平價補習社', note: `每月 ${fmtMoney(small / 12)}，一年 ${fmtMoney(small)}，屋企俾`, disabled: fs >= small ? undefined : '屋企負擔唔起', fx: { K: 1.5 } },
        { label: '唔補，自己溫', fx: { J: 2 } },
      ], (g2, i) => {
        const s = g2.s;
        if (i === 2) { g2.add('J', 2); return '你放學去自修室，溫到圖書館閂門。'; }
        s.flags['familySavings'] = num(g2, 'familySavings') - (i === 0 ? big : small);
        g2.add('K', i === 0 ? 3 : 1.5, '補習');
        g2.flag('tutor', i === 0 ? 2 : 1);
        return i === 0 ? '星期六朝早坐滿 300 人，名師喺大電視度講筆記。' : '補習社導師逐份功課幫你改。';
      }, { pri: 700, def: 2, auto: 2, agui: 1, cat: '人生抉擇', scene: 'school' });
    },
  },
  { // 2. 校隊定讀書
    id: 'ST-TEAM', pri: 700, ages: [13, 15], fixed: true, cat: '人生抉擇',
    when: (g) => (inHK(g) && g.s.status === 'study' ? 0.25 : 0),
    make: (g) => mkCard('ST-TEAM', '校隊定讀書', '體育老師話你有天分，想你入校隊，不過每星期要練三日。', [
      { label: '入校隊', note: `裝備每年約 ${fmtMoney(g.p(2000))}，屋企俾；之後三年知識升得慢啲`, fx: { H: 5, R: 3 } },
      { label: '專心讀書', fx: { K: 1 } },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 1) { g2.add('K', 1); return '你婉拒咗老師，放學照舊返屋企溫書。'; }
      s.flags['familySavings'] = num(g2, 'familySavings') - g2.p(2000) * 3;
      g2.add('H', 5, '校隊'); g2.add('R', 3);
      g2.flag('teamTill', s.age + 3);
      if (streamRng(s.seed, 'scholar')() < 0.05) { g2.flag('sportScholar'); return '你喺學界比賽攞咗冠軍，大學話將來會俾運動獎學金你（學費減半）。'; }
      return '你第一次著住校隊波衫出場，全場同學叫你個名。';
    }, { pri: 700, def: 1, auto: 1, agui: 1, cat: '人生抉擇', scene: 'park' }),
  },
  { // 校隊練習：三年內每年知識少升 0.5
    id: 'ST-TEAM-YR', pri: 699, once: false, fixed: true, cat: '人生抉擇',
    when: (g) => (num(g, 'teamTill') >= g.s.age && g.s.flags['teamTill'] !== undefined ? 1 : 0),
    tick: (g) => {
      g.add('K', -0.5, '校隊練習');
      if (num(g, 'teamTill') === g.s.age) delete g.s.flags['teamTill'];
    },
  },
  { // 3. 紅色炸彈季
    id: 'ST-WEDS', pri: 330, ages: [26, 38], once: false, cool: 4, cat: '生活日常',
    when: (g) => (inHK(g) ? 0.1 : 0),
    make: (g) => {
      const r = streamRng(g.s.seed, 'weds', g.s.age);
      const n = r.int(3, 6);
      const each = g.p(r.uni(1200, 1800));
      const all = Math.round(each * n), two = Math.round(each * 2), pkt = Math.round(each * 2 + g.p(500) * (n - 2));
      return mkCard('ST-WEDS', '紅色炸彈季', `今年身邊啲朋友好似約埋咁，你一共收到 ${n} 張喜帖。`, [
        { label: '全部去', money: -all, note: `每場人情約 ${fmtMoney(each)}`, fx: { R: 3, J: -1 } },
        { label: '只去最熟嗰兩個', money: -two, fx: { R: 1 } },
        { label: '唔去，淨係俾利是', money: -pkt, fx: { R: -2 } },
      ], (g2, i) => {
        const c = [all, two, pkt][i];
        const t = g2.spend(c, '人情');
        if (i === 0) { g2.add('R', 3); g2.add('J', -1, '飲到攰'); if (n >= 5) g2.ach('red_bombs'); return `${n} 個星期六都喺酒樓度飲，人情使咗 ${fmtMoney(c)}${t}。`; }
        if (i === 1) { g2.add('R', 1); return `你去咗兩場，人情 ${fmtMoney(c)}${t}。`; }
        g2.add('R', -2, '冇去飲');
        return `你逐個轉數俾利是，一共 ${fmtMoney(c)}${t}。有個朋友之後冇點覆你。`;
      }, { pri: 330, def: 1, auto: 1, agui: 1, cat: '生活日常', scene: 'street' });
    },
  },
  { // 4. 擔保人連續劇情：第 2 年唔覆訊息、第 3–4 年律師信（或者多謝）
    id: 'ST-GUAR', pri: 340, once: false, fixed: true, cat: '生活陷阱',
    when: (g) => (g.s.flags['guarAt'] !== undefined ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const yrs = s.year - num(g, 'guarAt');
      const fail = !!s.flags['guarFail'];
      if (yrs === 2 && fail) { g.add('J', -2, '表哥失聯'); return '表哥最近成日唔覆你訊息，之前約食飯都話唔得閒。'; }
      if (!fail && yrs >= 3) { delete s.flags['guarAt']; g.add('R', 1); return '表哥還清咗筆貸款，特登請你食飯多謝你。'; }
    },
  },
  { // 擔保人：律師信
    id: 'ST-GUAR-LAW', pri: 341, once: false, fixed: true, cat: '生活陷阱',
    when: (g) => (g.s.flags['guarFail'] && g.s.flags['guarAt'] !== undefined && g.s.year - num(g, 'guarAt') >= num(g, 'guarDue') ? 1 : 0),
    make: (g) => {
      const amt = num(g, 'guarAmt');
      const inst = Math.round(amt * 1.08 / 5);
      return mkCard('ST-GUAR-LAW', '律師信', `你收到銀行律師信：表哥走咗佬，你做擔保嘅 ${fmtMoney(amt)} 貸款要由你還。`, [
        { label: '一筆過還', money: -amt, disabled: afford(g, amt), fx: { J: -5 } },
        { label: '同銀行傾分期', note: `五年每年 ${fmtMoney(inst)}，利息多大約 8%`, fx: { J: -5 } },
      ], (g2, i) => {
        delete g2.s.flags['guarAt']; delete g2.s.flags['guarFail'];
        g2.add('J', -5, '代還擔保');
        if (i === 0) { const t = g2.spend(amt, '代還'); return `你清咗筆數${t}，之後再冇人搵你做擔保。`; }
        g2.flag('guarInst', inst); g2.flag('guarLeft', 5);
        return '銀行同意分五年還，你每年都要預留一筆錢。';
      }, { pri: 340, def: 1, auto: 1, agui: g.liquid > amt * 2 ? 0 : 1, cat: '生活陷阱', scene: 'home' });
    },
  },
  { // 擔保分期
    id: 'ST-GUAR-INST', pri: 339, once: false, fixed: true, cat: '生活陷阱',
    when: (g) => (num(g, 'guarLeft') > 0 ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      const left = num(g, 'guarLeft') - 1;
      const t = g.spend(num(g, 'guarInst'), '代還分期');
      if (left > 0) { s.flags['guarLeft'] = left; return `代表哥還擔保貸款，今年還咗 ${fmtMoney(num(g, 'guarInst'))}${t}，仲有 ${left} 年。`; }
      delete s.flags['guarLeft']; delete s.flags['guarInst'];
      return `擔保貸款終於還清${t}。`;
    },
  },
  { // 5. 八號風球返唔返工
    id: 'ST-T8', pri: 320, ages: [18, 65], once: false, cool: 3, cat: '生活日常',
    when: (g) => (inHK(g) && g.s.status === 'work' && g.s.job ? 0.06 : 0),
    make: (g) => mkCard('ST-T8', '八號風球', '天文台掛咗八號波，老細喺 WhatsApp 群組講：「做得嘢嘅都返嚟。」', [
      { label: '冒險返工', note: '下一年升職機會高少少', fx: { J: -3, H: -1 } },
      { label: '唔返，照勞工處指引', note: '老細可能唔多高興', fx: { J: 2 } },
    ], (g2, i) => {
      const s = g2.s;
      if (i === 0) {
        g2.add('J', -3, '打風返工'); g2.add('H', -1);
        promoNext(g2, 1.05);
        const n = num(g2, 't8Work') + 1; g2.flag('t8Work', n);
        if (n >= 3) g2.ach('t8_warrior');
        return '你頂住橫風橫雨行去地鐵站，成條街得返你一個。';
      }
      g2.add('J', 2);
      if (streamRng(s.seed, 't8boss', s.age)() < 0.15) { promoNext(g2, 0.9); return '你留喺屋企，第二日返工老細黑口黑面。'; }
      return '你留喺屋企煮公仔麵睇新聞，第二日老細冇講乜。';
    }, { pri: 320, def: 1, auto: 1, agui: 1, cat: '生活日常', scene: 'home' }),
  },
  { // 6. 日本常客
    id: 'ST-JAPAN', pri: 310, ages: [22, 55], once: false, cool: 6, cat: '生活日常',
    when: (g) => (inHK(g) && g.s.status !== 'study' ? 0.08 : 0),
    make: (g) => {
      const three = g.p(24000), one = g.p(8000);
      const mi = Math.max(1, g.monthlyIncome());
      const mo = (x: number) => (x / mi < 1 ? `差唔多 ${Math.max(1, Math.round((x / mi) * 4))} 個星期人工` : `差唔多 ${(x / mi).toFixed(1)} 個月人工`);
      return mkCard('ST-JAPAN', '日本常客', '朋友開咗個群組叫「今年去多幾轉日本」，機票特價，佢問你參唔參加。', [
        { label: '今年去三轉', money: -three, note: mo(three), disabled: afford(g, three), fx: { J: 4 } },
        { label: '去一轉就夠', money: -one, note: mo(one), disabled: afford(g, one), fx: { J: 2 } },
        { label: '唔去，儲錢', fx: { J: -1 } },
      ], (g2, i) => {
        if (i === 2) { g2.add('J', -1); return '你喺 IG 睇住朋友啲相，將嗰筆錢擺咗落儲蓄戶口。'; }
        const c = i === 0 ? three : one;
        const t = g2.spend(c, '旅行');
        g2.add('J', i === 0 ? 4 : 2, '去日本');
        return `${i === 0 ? '春天睇櫻花、夏天去海邊、冬天滑雪' : '你去咗一轉大阪，食到唔想返'}，使咗 ${fmtMoney(c)}${t}，即係${mo(c)}。`;
      }, { pri: 310, def: 1, auto: 2, agui: 2, cat: '生活日常', scene: 'street' });
    },
  },
  { // 7b. 姐姐突然斷約
    id: 'ST-MAID-QUIT', pri: 330, once: false, cool: 4, cat: '生活日常',
    when: (g) => {
      const s = g.s;
      const kidsHelper = s.childcare === 'helper' && s.kids.some((k) => k.age < 12 && !k.away);
      const parentHelper = s.support === 'helper' && s.parents.some((p) => p.alive);
      return kidsHelper || parentHelper ? 0.05 : 0;
    },
    make: (g) => {
      const fee = g.p(15000);
      return mkCard('ST-MAID-QUIT', '姐姐突然斷約', '屋企外傭姐姐話屋企有事，下個月要提早斷約返鄉下。', [
        { label: '即刻搵中介請過', money: -fee, note: '空窗期一兩個月', fx: { J: -3 } },
      ], (g2) => {
        const t = g2.spend(fee, '外傭中介費');
        g2.add('J', -3, '冇人幫手');
        return `你請咗兩日假面試新姐姐，中介費 ${fmtMoney(fee)}${t}。`;
      }, { pri: 330, def: 0, auto: 0, agui: 0, cat: '生活日常', scene: 'home' });
    },
  },
  { // 8. 幼稚園面試大戰（每個仔女 2 歲嗰年 60%）
    id: 'ST-K1', pri: 720, once: false, fixed: true, cat: '人生抉擇',
    when: (g) => (inHK(g) && g.s.kids.some((k) => k.age === 2 && !k.away && !g.s.flags[`k1:${k.name}`]) ? 0.6 : 0),
    make: (g) => {
      const k = g.s.kids.find((x) => x.age === 2 && !x.away && !g.s.flags[`k1:${x.name}`]);
      if (!k) return null;
      const big = g.p(25000), small = g.p(3000);
      return mkCard('ST-K1', '幼稚園面試大戰', `${k.name}兩歲，身邊啲家長已經開始排隊攞 K1 報名表。`, [
        { label: '報 10 間，再上面試班', money: -big, disabled: afford(g, big), fx: { J: -2 } },
        { label: '報 3 間', money: -small, fx: {} },
        { label: '報就近嗰間', fx: { J: 1 } },
      ], (g2, i) => {
        const s = g2.s;
        s.flags[`k1:${k.name}`] = true;
        if (i === 0) { const t = g2.spend(big, '幼稚園面試'); k.acad += 3; g2.add('J', -2, '面試大戰'); return `${k.name}一個月面咗十間，識得用英文講自己鍾意食乜${t}。`; }
        if (i === 1) { const t = g2.spend(small, '幼稚園報名'); k.acad += 1; return `你幫${k.name}報咗三間，都收到面試通知${t}。`; }
        g2.add('J', 1);
        return `${k.name}入咗屋企樓下嗰間，朝早可以瞓多陣。`;
      }, { pri: 720, def: 1, auto: 1, agui: 1, cat: '人生抉擇', scene: 'school' });
    },
  },
  { // 9. 親戚借錢上車
    id: 'ST-SIBLOAN', pri: 320, ages: [30, 55], cat: '財務衝擊',
    when: (g) => (inHK(g) && g.s.siblings > 0 && g.liquid >= g.p(300000) ? 0.03 : 0),
    make: (g) => {
      const s = g.s;
      const r = streamRng(s.seed, 'sibloan', s.age);
      const amt = Math.round(Math.min(g.p(r.uni(200000, 500000)), g.liquid * 0.6) / 1000) * 1000;
      return mkCard('ST-SIBLOAN', '親戚借錢上車', `兄弟姊妹睇中咗層樓，首期仲差 ${fmtMoney(amt)}，問你借住先。`, [
        { label: '借全數', money: -amt, note: '口頭講話五年內還', fx: { R: 3 } },
        { label: '借一半', money: -Math.round(amt / 2), fx: { R: 1 } },
        { label: '唔借', fx: { R: -4 } },
      ], (g2, i) => {
        const s2 = g2.s;
        if (i === 2) { g2.add('R', -4, '唔借錢'); return '佢話明白，不過之後屋企食飯氣氛有啲怪。'; }
        const lent = i === 0 ? amt : Math.round(amt / 2);
        const t = g2.spend(lent, '借俾兄弟姊妹');
        g2.add('R', i === 0 ? 3 : 1);
        // 借出嗰陣擲一次：七成分五年還，三成永遠唔還
        if (streamRng(s2.seed, 'sibrepay', s2.age)() < 0.7) { g2.flag('sibPay', Math.round(lent / 5)); g2.flag('sibLeft', 5); }
        else g2.flag('sibNoPay', s2.year + 2);
        return `你過咗 ${fmtMoney(lent)} 俾佢${t}，佢話上到車就慢慢還。`;
      }, { pri: 320, def: 1, auto: 2, agui: 2, cat: '財務衝擊', scene: 'home' });
    },
  },
  { // 兄弟姊妹還錢 / 唔還
    id: 'ST-SIBLOAN-YR', pri: 319, once: false, fixed: true, cat: '財務衝擊',
    when: (g) => (num(g, 'sibLeft') > 0 || (g.s.flags['sibNoPay'] !== undefined && g.s.year >= num(g, 'sibNoPay')) ? 1 : 0),
    tick: (g) => {
      const s = g.s;
      if (s.flags['sibNoPay'] !== undefined) {
        delete s.flags['sibNoPay'];
        g.add('R', -3, '借錢唔還');
        g.log('兄弟姊妹借咗錢上車，之後一直冇提過還錢。', '財務衝擊', true);
        return '你試探咗兄弟姊妹幾時還錢，佢話「一家人計咁清做咩」。';
      }
      const pay = num(g, 'sibPay');
      g.gain(pay);
      const left = num(g, 'sibLeft') - 1;
      if (left > 0) { s.flags['sibLeft'] = left; return `兄弟姊妹還咗 ${fmtMoney(pay)} 俾你。`; }
      delete s.flags['sibLeft']; delete s.flags['sibPay'];
      return `兄弟姊妹還清晒借你嗰筆錢，最後一期 ${fmtMoney(pay)}。`;
    },
  },
  { // 12. 街坊老店結業
    id: 'ST-CAFE', pri: 300, ages: [30, 100], cat: '生活日常',
    when: (g) => (inHK(g) ? 0.03 : 0),
    make: (g) => mkCard('ST-CAFE', '街坊老店結業', '你由細食到大嘅茶餐廳門口貼咗張紙：「本店經營四十年，月底結業，多謝街坊支持。」', [
      { label: '去食最後一餐', money: -g.p(80), fx: { J: 2, R: 1 } },
      { label: '唔得閒', fx: { J: -1 } },
    ], (g2, i) => {
      if (i === 1) { g2.add('J', -1); return '後來你經過，個舖位已經變咗做藥房。'; }
      g2.spend(g2.p(80), '食飯');
      g2.add('J', 2, '懷舊'); g2.add('R', 1);
      return '你叫咗個餐蛋麵同凍奶茶，老闆娘仲記得你細個鍾意走青。';
    }, { pri: 300, def: 0, auto: 0, agui: 0, cat: '生活日常', scene: 'street' }),
  },
];
