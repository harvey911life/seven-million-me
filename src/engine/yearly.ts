// 每年流程 ③ 焦點 / 花錢面板、④ 自然變化（第 4 章 4.5–4.16、第 5 章 5.3）
import type { Game } from './game';
import { streamRng } from './rng';
import type { StatKey } from './state';
import { clamp, Mneg, Mpos } from './util';

export interface FocusDef { id: string; fx: Partial<Record<StatKey, number>>; desc: string; tip: string; minAge?: number; maxAge?: number }

export const FOCUS: Record<'student' | 'work' | 'retired', FocusDef[]> = {
  student: [
    { id: '發奮圖強', fx: { H: 1, J: -1, K: 3 }, desc: '知識大升，但壓力大', tip: '你日日溫書到 12 點，成績好咗，但笑容少咗。' },
    { id: '廣結朋友', fx: { J: 1, K: -1, R: 3 }, desc: '人際大升，易有拍拖事件', tip: '你成日約同學打波，朋友越嚟越多。' },
    { id: '放飛自我', fx: { J: 3, K: -1, R: 1 }, desc: '開心最重要', tip: '今年你玩得好開心，功課就……之後先算。' },
    { id: '培養興趣', fx: { J: 2, K: 1 }, desc: '興趣點 +1，解鎖設計、音樂、運動類工', tip: '你每日練琴兩個鐘，老師話你有天份。' },
    { id: '做兼職', fx: { K: -1, R: 1 }, desc: '自己搵錢，理財觸覺上升', tip: '第一次自己搵錢，你開始知道一蚊有幾難賺。', minAge: 15 },
    { id: '平衡人生', fx: { H: 0.5, J: 0.5, K: 0.5, R: 0.5 }, desc: '樣樣都有啲', tip: '讀書、玩、朋友，樣樣都有啲。' },
    { id: '幫手頂家', fx: { J: -1, R: 2 }, desc: '家庭打擊減輕，回饋社會 +', tip: '放學你返屋企煮飯湊細佬，阿媽輕鬆咗好多。', minAge: 8 },
  ],
  work: [
    { id: '事業衝刺', fx: { H: -1, R: -1 }, desc: '加薪 ×1.4、升職 ×1.5', tip: '你今年 OT 咗 600 個鐘，老闆開始記得你個名。' },
    { id: '家庭優先', fx: { J: 1, R: 3 }, desc: '人際大升；升職 ×0.7、離婚 ×0.7', tip: '你每晚 7 點前返到屋企食飯。' },
    { id: '享受當下', fx: { J: 3 }, desc: '開支 + 年收入 12%', tip: '今朝有酒今朝醉，月尾先算。' },
    { id: '精打細算', fx: { J: -1 }, desc: '開支 ×0.9，理財習慣分上升', tip: '你開始記帳，每月自動轉三成人工去儲蓄戶口。' },
    { id: '強身健體', fx: { H: 3, J: 1 }, desc: '抵銷健康下降；每年 $6,000', tip: '你每星期跑三次步，覺都瞓好咗。' },
    { id: '培養嗜好', fx: { H: 1, J: 3 }, desc: '抵銷快樂下降；每年 $8,000', tip: '你重新執起結他，週末同朋友夾 band。' },
    { id: '增值進修', fx: { K: 3 }, desc: '轉行點 +1；學費約年收入 8%', tip: '你報咗夜校，返完工直接去上堂。' },
    { id: '平衡人生', fx: { H: 0.5, J: 0.5, K: 0.5, R: 0.5 }, desc: '工作生活兩邊都顧', tip: '工作生活兩邊都顧。' },
  ],
  retired: [
    { id: '含飴弄孫', fx: { J: 1, R: 3 }, desc: '冇孫時叫「陪伴家人」', tip: '每朝送孫仔返學，係你一日最開心嘅時候。' },
    { id: '周遊列國', fx: { J: 3 }, desc: '每年 $60,000', tip: '今年去咗北海道同葡萄牙。' },
    { id: '養生保健', fx: { H: 3 }, desc: '死亡率 ×0.9；每年 $12,000', tip: '太極、飲湯、定期覆診，你嘅血壓穩定咗。' },
    { id: '退而不休', fx: { H: -1, R: 0.5 }, desc: '兼職收入（75 歲前）', tip: '你返舊公司做兼職顧問，一星期三日。', maxAge: 74 },
    { id: '服務社區', fx: { R: 1 }, desc: '回饋社會 +3', tip: '你喺社區中心教長者用手機。' },
    { id: '平衡人生', fx: { H: 0.5, J: 0.5, K: 0.5, R: 0.5 }, desc: '慢慢嚟，乜都試吓', tip: '慢慢嚟，乜都試吓。' },
  ],
};

export function focusList(g: Game): FocusDef[] {
  const st = g.s.focusStage as 'student' | 'work' | 'retired';
  const list = FOCUS[st] ?? [];
  const s = g.s;
  // v1.0：冇屋企人就唔出「含飴弄孫 / 陪伴家人」
  const family = (s.partner?.alive && s.married) || s.kids.some((k) => !k.emigrated) || s.parents.some((p) => p.alive);
  return list.filter((f) => (f.minAge ?? 0) <= s.age && (f.maxAge ?? 200) >= s.age && (f.id !== '含飴弄孫' || family));
}

export function focusEffects(g: Game) {
  const s = g.s;
  if (!s.focus || s.age < 6) return;
  const st = s.focusStage as 'student' | 'work' | 'retired';
  const def = (FOCUS[st] ?? []).find((f) => f.id === s.focus);
  if (!def) return;
  s.focusYears[s.focus] = (s.focusYears[s.focus] ?? 0) + 1;
  let fx = { ...def.fx };
  if (s.focus === '含飴弄孫' && !s.kids.some((k) => k.married)) fx = { J: 1, R: 2 };
  if (s.focus === '退而不休' && (s.H < 30 || s.age >= 75)) fx = {};
  g.fx(fx, s.focus);
  switch (s.focus) {
    case '培養興趣': s.IP = Math.min(10, s.IP + 1); break;
    case '做兼職': if (s.age % 2 === 0) s.FL = Math.min(5, s.FL + 1); break;
    case '幫手頂家': s.GP += 0.5; break;
    case '精打細算': s.HB = Math.min(9, s.HB + 3); break;
    case '培養嗜好': if (s.age % 2 === 0) s.IP = Math.min(10, s.IP + 1); break;
    case '增值進修': s.CP = Math.min(5, s.CP + 1); break;
    case '服務社區': s.GP += 3; break;
  }
  if (s.focus !== '精打細算') s.HB = Math.max(0, s.HB - 3);
}

// 花錢面板（5.3.2）
export interface PanelDef { id: string; name: string; cost: (g: Game) => number; minAge: number; teen?: boolean; desc: string }
const B = (g: Game) => Math.max(g.income(), 0.6 * Number(g.s.flags['lastNeed'] ?? 100000));
export const PANEL: PanelDef[] = [
  { id: 'checkup', name: '全身身體檢查', minAge: 18, cost: (g) => (g.s.age >= 50 ? 6000 : 4000) * g.P, desc: '健康 +1；之後 2 年早期發現重病' },
  { id: 'dinner', name: '同家人朋友食飯', minAge: 15, teen: true, cost: (g) => clamp(B(g) * 0.02, 3000 * g.P, 20000 * g.P) * (g.s.age < 18 ? 0.2 : 1), desc: '人際 +2、快樂 +1' },
  // v1.1 加歐洲：機票約 $8,000、10 日住宿食用交通約 $20,000，每人約 $28,000
  { id: 'travel', name: '本地遊 / 日本 / 歐洲', minAge: 15, teen: true, cost: (g) => (g.s.travelPick === '歐洲' ? 28000 * (1 + 0.8 * (g.householdSize() - 1)) : g.s.travelPick === '日本' ? 12000 * (1 + 0.8 * (g.householdSize() - 1)) : 3000) * g.P, desc: '本地遊快樂 +2；日本 +4；歐洲 +6、知識 +1' },
  { id: 'course', name: '報興趣班 / 進修', minAge: 18, cost: (g) => clamp(B(g) * 0.05, 8000 * g.P, 40000 * g.P), desc: '知識 +2；轉行點 +1' },
  { id: 'jobhunt', name: '搵轉工機會', minAge: 18, cost: (g) => 1000 * g.P, desc: '下一年跳槽機會 ×2.5' },
  { id: 'give', name: '捐款 / 做義工', minAge: 15, teen: true, cost: (g) => (g.s.givePick === '捐款' ? Math.max(1000 * g.P, B(g) * 0.02) : 0), desc: '回饋社會 +2、快樂 +1' },
  { id: 'gadget', name: '買新手機、名牌', minAge: 15, teen: true, cost: (g) => clamp(B(g) * 0.04, 6000 * g.P, 50000 * g.P) * (g.s.age < 18 ? 0.3 : 1), desc: '快樂 +3；下年快樂 −1' },
];

export function panelEffects(g: Game) {
  const s = g.s;
  if (s.age < 15) return;
  let cost = 0;
  const half = (k: StatKey, v: number) => {
    const f = FOCUS.work.concat(FOCUS.student, FOCUS.retired).find((x) => x.id === s.focus);
    return f && (f.fx[k] ?? 0) * v > 0 ? v * 0.5 : v;
  };
  if (s.flags['gadgetLast'] === s.year - 1) g.add('J', -1, '新鮮感過咗');
  for (const id of s.panel) {
    const def = PANEL.find((p) => p.id === id)!;
    if (s.age < def.minAge || (s.age < 18 && !def.teen)) continue;
    if ((s.panelCool[id] ?? 0) > s.age) continue;
    const c = def.cost(g);
    const avail = s.age < 18 ? s.piggy + s.cash : s.cash + s.deposit;
    if (c > avail) { g.tick(`今年唔夠錢，「${def.name}」取消咗。`); continue; }
    if (s.age < 18) { const fromP = Math.min(s.piggy, c); s.piggy -= fromP; s.cash -= c - fromP; }
    else cost += c;
    const streak = (s.panelStreak[id] = (s.panelStreak[id] ?? 0) + 1);
    const dim = streak >= 3 ? 0.75 : 1;
    switch (id) {
      case 'checkup': g.add('H', half('H', 1) * dim); s.checkupUntil = s.age + 2; s.panelCool[id] = s.age < 50 ? s.age + 2 : 0; break;
      case 'dinner': g.add('R', half('R', 2) * dim + (s.support ? 0.5 : 0), '同屋企人食飯'); g.add('J', half('J', 1) * dim); break;
      case 'travel': {
        const tp = s.travelPick;
        g.add('J', half('J', tp === '歐洲' ? 6 : tp === '日本' ? 4 : 2) * dim, tp === '歐洲' ? '去歐洲旅行' : tp === '日本' ? '去日本旅行' : '本地遊');
        if (tp === '歐洲') g.add('K', half('K', 1) * dim);
        if (tp !== '本地遊' && g.householdSize() > 1) g.add('R', 1 * dim);
        g.flag('travelled', s.year); break;
      }
      case 'course': g.add('K', half('K', 2) * dim, '進修'); s.CP = Math.min(5, s.CP + 1); break;
      case 'jobhunt': g.add('J', -1); g.flag('jobhunt', s.year); break;
      case 'give': s.GP += 2; g.add('J', 1 * dim); if (s.givePick === '義工') g.add('R', (s.focus === '事業衝刺' ? 0.5 : 1) * dim); break;
      case 'gadget': g.add('J', half('J', 3) * dim, '買新嘢'); g.flag('gadgetLast', s.year); break;
    }
  }
  for (const k of Object.keys(s.panelStreak)) if (!s.panel.includes(k)) s.panelStreak[k] = 0;
  s.flags['panelCost'] = Math.round(cost);
}

export function naturalChanges(g: Game) {
  const s = g.s;
  const a = s.age;
  const pre = { H: s.H, J: s.J, R: s.R, F: s.F };
  // ④a 年齡
  if (a <= 5) { g.add('H', 1); g.add('K', a >= 3 ? 1 : 0); g.add('R', 0.5); }
  else if (a <= 17 && s.status === 'study') {
    let k = 1;
    if (s.origin.housing === '劏房' || s.home === 'subdiv') k -= 0.5;
    if (s.origin.family === '三代同堂' || s.origin.family === '隔代照顧') k += 0.3;
    if (a >= 12 && s.band === 1) k += 0.5;
    if (a >= 12 && s.band === 3) { k -= 0.5; g.add('R', 0.3); }
    if (a >= 14 && a <= 17) k += s.tutoring === 1 ? 1 : s.tutoring === 3 ? 1.5 : s.tutoring === 2 ? (s.J >= 50 ? 0.5 : 0) : 0;
    if (s.movedSchoolNet) k += 0.5;
    if (a <= 11 && s.hobbyClass === 1) { g.add('H', 1); g.add('J', 0.5); }
    if (a <= 11 && s.hobbyClass === 2) { k += 0.5; g.add('J', 0.5); }
    if (a <= 11 && s.hobbyClass === 0 && s.flags['playTime']) { g.add('J', 1); g.add('R', 0.5); }
    g.add('K', k);
  } else if (s.status === 'study' && s.study) {
    g.add('K', s.study.kind === '職業學院' ? 1.5 : 2);
  }
  // 年紀大自然退化（v0.5 調慢：原本 60 歲平均健康只剩十幾分）
  if (a >= 40 && a < 50) g.add('H', -0.2);
  else if (a >= 50 && a < 60) g.add('H', -0.35);
  else if (a >= 60 && a < 70) g.add('H', -0.5);
  else if (a >= 70 && a < 80) { g.add('H', -0.8, '年紀大'); g.add('K', -0.25); if (s.focus !== '含飴弄孫' && s.focus !== '服務社區') g.add('R', -0.5); }
  else if (a >= 80 && a < 90) { g.add('H', -1.5, '年紀大'); g.add('K', -0.5); if (s.focus !== '含飴弄孫' && s.focus !== '服務社區') g.add('R', -0.5); }
  else if (a >= 90) { g.add('H', -2, '年紀大'); g.add('K', -0.75); g.add('R', -0.75); }

  // ④b 工作時期自然下降
  if (s.focusStage === 'work' && (s.status === 'work' || s.status === 'unemp')) {
    const j = s.job;
    if (s.status === 'unemp') g.add('J', -2, '失業');
    else {
      let dh = s.focus === '強身健體' ? 0 : -0.3;
      const dj = s.focus === '培養嗜好' ? 0 : -1;
      if (j?.firstType === 'ontime' && j.firstYears < 5) dh *= 0.5;
      g.add('H', dh, dh < 0 ? '工作忙，冇時間做運動' : undefined);
      g.add('J', dj + (j?.firstType === 'ontime' ? 0.5 : 0));
      if (j?.firstType === 'hard' && j.firstYears < 5) g.add('H', -0.3, '超時工作');
      if (s.overtime) {
        g.add('H', -1, '日日超時');
        // 超時唔會一世：每年大約四分一機會完咗個 project / 換上司
        if (streamRng(s.seed, 'ot', s.age)() < 0.25) { s.overtime = false; g.tick('公司請多咗人，你終於唔使日日超時。'); }
      }
    }
  }
  // 身體有自我修復：成年後健康低過 60，每年慢慢回升少少（冇病喺度治療時）
  if (a >= 18 && s.H < 60 && !s.diseases.some((d) => d.status === 'treating')) g.add('H', (60 - s.H) * 0.04);
  // ④c 住屋
  switch (s.home) {
    case 'subdiv': g.add('H', -0.5); g.add('J', -1.5, '劏房擠迫'); break;
    case 'own': g.add('J', s.prop ? 0.5 : 0.25); break;
    case 'village': g.add('H', 0.25); g.add('J', 0.25); g.add('R', -0.25); break;
    case 'institution': g.add('J', -0.5); g.add('R', -0.5); break;
    case 'parents': if (s.age >= 18 && (s.origin.housing === '公屋' || s.origin.housing === '劏房')) g.add('J', -1, '同屋企人迫埋一齊'); break;
    case 'share': g.add('J', 0.5); g.add('R', 0.5); break;
    case 'rent': if (s.age >= 18) g.add('J', 0.5); break;
  }
  if (s.prop && s.prop.mortgage > 0 && s.prop.price0 * (g.e.hpi / s.prop.hpi0) < s.prop.mortgage) g.add('J', -3, '負資產');
  // ④d 疾病持續
  for (const d of s.diseases) {
    if (d.kind === 'threeHigh' && d.status === 'chronic') g.add('H', s.flags['3hControlled'] ? -0.25 : -1, '三高');
    if (d.status === 'treating' && d.kind === 'cancer') { g.add('H', -5, '治療中'); g.add('J', -3); }
    if (d.status === 'remission' && d.years <= 2) g.add('H', Math.min(6, 3 * Mpos(s.H)));
    if (d.kind === 'dementia') { g.add('K', -3, '認知障礙'); g.add('R', -1); }
  }
  if (s.mental) {
    if (s.mental.treat === 'none') { g.add('J', -4, '情緒病'); g.add('H', -2); }
    else if (s.mental.treat === 'public') { g.add('J', 2); g.add('H', 1); }
    else { g.add('J', 5); g.add('H', 2); }
  }
  if (s.disabled && s.H > 70) s.H = 70;
  // ④e 悲劇回升
  if (s.GR > 0) {
    let r = 3;
    if (['家庭優先', '培養嗜好', '含飴弄孫'].includes(s.focus ?? '')) r += 2;
    if (s.mental && s.mental.treat !== 'none') r += 3;
    if (pre.R > 70) r += 1;
    if (pre.F < 30) r -= 1;
    r = Math.max(1, r);
    const up = Math.min(r, s.GR);
    g.add('J', up);
    s.GR -= up;
  }
  // ④f 連鎖影響
  const d = { H: 0, J: 0, R: 0 };
  if (s.age >= 18) {
    if (pre.F < 15) { d.J -= 3; d.H -= 1; } else if (pre.F < 30) { d.J -= 1.5; d.H -= 0.5; } else if (pre.F > 70) d.J += 0.5;
  }
  if (pre.J < 30) { d.H -= 1; d.R -= 0.5; }
  if (pre.H < 30) d.J -= 1;
  if (pre.R < 30) d.J -= 1;
  if (pre.J > 70) d.R += 0.5;
  for (const k of ['H', 'J', 'R'] as const) g.add(k, clamp(d[k], -4, 1), k === 'J' && pre.F < 30 && s.age >= 18 ? '錢唔夠用' : undefined);
}

export const tragedyHit = (g: Game, base: number, mod = 1) => {
  const s = g.s;
  const hit = base * clamp(Math.sqrt(Mneg(s.J)), 0.7, 1.3) * (s.focus === '幫手頂家' ? 0.7 : 1) * mod;
  g.add('J', -hit, '傷痛');
  s.GR += hit * 0.8;
  s.tragedies++;
};
