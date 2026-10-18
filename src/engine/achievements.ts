// 第 12 章 12.11 成就清單 + 每年檢查
import type { Game } from './game';
import { liquidAssets, netWorth, plansValue, insActive } from './finance';

export interface AchDef { id: string; name: string; desc: string; pts: number; cat: string; hidden?: boolean }

const A = (cat: string, list: [string, string, string, number, boolean?][]): AchDef[] =>
  list.map(([id, name, desc, pts, hidden]) => ({ id, name, desc, pts, cat, hidden }));

export const ACHIEVEMENTS: AchDef[] = [
  ...A('出身', [
    ['born_public', '公屋仔女', '喺公屋出世', 1],
    ['born_subdivided', '劏房起步', '喺劏房出世', 1],
    ['golden_spoon', '含住金鎖匙', '父母都係經理或專業人員', 1],
    ['born_orphanage', '保幼局之子', '出世後送到保幼局', 1, true],
    ['born_1997', '九七一代', '1997 年出世', 1],
    ['born_new_immigrant', '新移民家庭', '新移民家庭出身', 1],
  ]),
  ...A('學業', [
    ['quiz_king', '突擊測驗王', '所有突擊測驗全部答啱', 3],
    ['exam_top', '公開試狀元', '公開試 8 題全對', 3],
    ['one_mark_short', '差一分', '差一題就入到大學', 0],
    ['overseas_grad', '海外學成', '出國完成學士', 3],
    ['grassroots_grad', '寒門學士', '公屋或劏房出身，取得學士', 2],
    ['self_made', '自學成才', '冇學士學位，年收入過百萬', 5],
    ['lifelong_learner', '活到老學到老', '40 歲後轉行成功', 3],
  ]),
  ...A('事業', [
    ['first_salary', '第一份人工', '第一次收到人工', 1],
    ['million_salary', '百萬年薪', '年收入 ≥ $100 萬（2026 幣值）', 3],
    ['expat', '外派戰士', '接受公司外派', 3],
    ['gba_5y', '北上打拼', '喺大灣區工作滿 5 年', 3],
    ['biz_start', '老闆夢', '開咗自己第一盤生意', 2],
    ['biz_exit', '賣盤套現', '盤生意俾人收購', 5],
    ['layoff_ready', '被裁也不怕', '被裁嗰年有 6 個月備用金', 2],
  ]),
  ...A('理財', [
    ['first_100k', '第一桶金', '流動資產 ≥ $10 萬', 1],
    ['millionaire', '百萬富翁', '淨資產 ≥ $100 萬', 1],
    ['ten_million', '千萬富豪', '淨資產 ≥ $1,000 萬', 3],
    ['first_home', '上車成功', '第一次買自住樓', 1],
    ['mortgage_free', '供滿樓', '供完層樓', 2],
    ['compound_miracle', '複息奇蹟', '25 歲前開始投資，堅持 30 年', 3],
    ['enough_forever', '豐衣足食', '退休後錢一直夠用', 1],
    ['early_retire', '提早退休', '55 歲前退休而錢夠用', 5],
    ['card_slave', '卡數奴隸', '卡數加財務公司貸款超過 $10 萬', 0],
    ['comeback', '翻身成功', '曾經負資產，之後淨資產過百萬', 3],
    ['scammed', '中招', '信咗騙局而損失金錢', 0],
    ['miser', '守財奴', '一生冇投資，MPF 一直保守', 0],
  ]),
  ...A('保障', [
    ['full_armor', '全副武裝', '四大保險全部充足', 2],
    ['premium_paid_off', '保費冇白交', '一次賠償蓋過損失一半', 2],
    ['peace_whole_life', '一生平安', '有保險 10 年以上而從未索償', 2],
    ['buy_early', '早買早平', '25 歲前四大保險齊全', 3],
    ['uninsurable', '買唔到', '想加保時已經患病', 0],
    ['will', '未雨綢繆', '立好遺囑同持久授權書', 2],
    ['family_at_ease', '家人安心', '身後家人壓力低', 1],
    ['cancer_survivor', '病後重生', '患癌康復而財務健康', 3],
  ]),
  ...A('人生', [
    ['centenarian', '百歲人瑞', '活到 100 歲', 5],
    ['died_young', '英年早逝', '40 歲前離世', 0],
    ['first_love', '初戀', '第一次拍拖', 1],
    ['married', '執子之手', '結婚', 1],
    ['parent', '為人父母', '第一個仔女出世', 1],
    ['twins', '孖寶臨門', '一次過生咗孖仔或孖女', 2],
    ['grandparent', '含飴弄孫', '升級做爺爺嫲嫲或公公婆婆', 2],
    ['public_housing', '終於上樓', '申請公屋成功上樓', 1],
    ['happy_family', '幸福家庭', '結婚生仔，婚後平均快樂 ≥ 80', 3],
    ['happy_single', '單身貴族', '一生單身而平均快樂 > 70', 3],
    ['history_rewrite', '另一個時空', '經歷一次被改寫嘅歷史', 3, true],
    ['filial', '孝順仔女', '照顧父母直到佢哋離世', 2],
    ['emigrate', '移居海外', '移民或移居外地', 2],
    ['return_hk', '回流香港', '移民後回流', 3],
    ['pentagon', '五邊形戰士', '蜘蛛網圖五項全部 > 70', 5],
    ['beat_agui', '贏過某某人', '九項總分高過某某人', 2],
  ]),
  ...A('特殊', [
    ['jackpot', '頭獎得主', '中六星彩頭獎', 0, true],
    ['lottery_vs_fund', '彩票不如基金', '六星彩一生花費 ≥ $10 萬', 0],
    ['against_fate', '逆天改命', '保幼局出身，65 歲退休資產過千萬', 0, true],
    ['gold_rush', '淘金熱', '遇到海底金礦', 0, true],
    ['future_tip', '未來人的忠告', '遇到時光旅人', 0, true],
    ['cat_boss', '貓老闆', '屋企隻貓識講嘢', 0, true],
    ['lion_rock_astronaut', '獅子山上的太空人', '被選中做太空人', 0, true],
    ['meteor', '天降橫財', '隕石落喺你屋苑', 0, true],
    ['will_matters', '遺囑的重要', '南美舅公嘅遺產', 0, true],
    ['lookalike', '撞樣明星', '被誤認為明星', 0, true],
    ['treasure', '尋寶達人', '搵到古董', 0, true],
    ['duck_effect', '鴨鴨效應', '巨型充氣鴨仔群', 0, true],
    ['blackout', '黑暗一星期', '全港停電一星期', 0, true],
    ['robot_gift', '機械人的禮物', 'AI 管理城市一年', 0, true],
    ['rooftop_ufo', '天台飛碟', '飛碟降落天台', 0, true],
    ['mars_scam', '火星樓盤騙局', '外太空商人嘅邀請', 0, true],
    ['earth_defense', '地球保衛戰', '遇到外星人入侵', 0, true],
    ['zombie_survivor', '殭屍潮倖存者', '遇到殭屍潮', 0, true],
    ['redo_10y', '重來一次', '一覺瞓醒返到 10 年前', 0, true],
  ]),
];
export const ACH_BY_ID: Record<string, AchDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const SPECIAL_ACH = new Set(ACHIEVEMENTS.filter((a) => a.cat === '特殊').map((a) => a.id));

/** 退休可動用資產 A_ret（12.6.3） */
export function aRet(g: Game): number {
  const s = g.s;
  return s.cash + s.deposit + s.index + s.stock + s.crypto + s.mpf + plansValue(s) - Number(s.flags['lastNeed'] ?? 0) / 2;
}

export function checkAchievementsYear(g: Game) {
  const s = g.s;
  const P = g.P;
  const o = s.origin;
  // 出身（第一年檢查）
  if (s.age <= 1) {
    if (o.housing === '公屋') g.ach('born_public');
    if (o.housing === '劏房') g.ach('born_subdivided');
    const pro = (c?: string) => c === '經理及行政級' || c === '專業人員';
    if (pro(o.father?.cat) && pro(o.mother?.cat)) g.ach('golden_spoon');
    if (o.isBaoyou) g.ach('born_orphanage');
    if (o.birthYear === 1997) g.ach('born_1997');
    if (o.family === '新移民') g.ach('born_new_immigrant');
  }
  if (!s.alive) return;
  const net = netWorth(g);
  if (s.age >= 18) {
    s.netMinEver = Math.min(s.netMinEver, net / P);
    if (liquidAssets(g) / P >= 100_000) g.ach('first_100k');
    if (net / P >= 1_000_000) { g.ach('millionaire'); if (s.netMinEver < 0) g.ach('comeback'); }
    if (net / P >= 10_000_000) g.ach('ten_million');
  }
  if (s.age >= 100) g.ach('centenarian');
  const inv = s.flags['investStart'];
  if (inv !== undefined && s.age - Number(inv) >= 30 && s.investRatio > 0 && !s.flags['soldLow']) g.ach('compound_miracle');
  if ((['med', 'ci', 'acc', 'life'] as const).some((k) => insActive(s, k))) s.insuredYears++;
  // 理財平均（P̄、Ē，由開始工作或 23 歲起）
  if (s.everEmployed || s.age >= 23) {
    s.pAvg.P.push(s.fParts.P);
    s.pAvg.E.push(s.fParts.E);
    s.flags['fSum'] = Number(s.flags['fSum'] ?? 0) + s.F;
    s.flags['fN'] = Number(s.flags['fN'] ?? 0) + 1;
  }
  // 退休期間錢用完
  if (s.status === 'retired' && liquidAssets(g) + s.mpf + plansValue(s) <= 0 && !s.flags['brokeAt']) g.flag('brokeAt', s.age);
  // 65 歲退休成績快照
  if (s.age === 65) {
    const a = aRet(g);
    g.flag('aRet65', a / P);
    if (o.isBaoyou && a / P >= 10_000_000) g.ach('against_fate');
  }
  if (s.married && s.marriedAt !== null) {
    s.flags['jMarSum'] = Number(s.flags['jMarSum'] ?? 0) + s.J;
    s.flags['jMarN'] = Number(s.flags['jMarN'] ?? 0) + 1;
  }
}
