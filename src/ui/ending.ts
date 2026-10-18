// 結局畫面（第 12 章，v0.1 精簡版）：離世 → 身後 → 退休 → 蜘蛛網 → 計分 → 賺錢 → 上榜 → 成就 → 最後一頁
import type { Game } from '../engine/game';
import type { LogEntry } from '../engine/state';
import { computeEnding, endAchievements, spiderLine, lifeGrade, bestEarnYear, GRADE_CUTS, type Ending, type Spider } from '../engine/ending';
import { aguiEnding } from '../engine/agui';
import { simulateParallel } from '../engine/parallel';
import { ACHIEVEMENTS, ACH_BY_ID } from '../engine/achievements';
import { fmtMoney } from '../engine/util';
import { propEquity } from '../engine/finance';
import { h, clear, copyText } from './dom';
import { store } from './store';
import { drawPortrait, drawScene, drawApocalypse, SW, SH } from './scene';
import QR from '../assets/ig-qr.png';
import { emblem, rarityOf, rateText, tierOf } from './emblem';
import { makeShareImage, shareImage, quoteFor } from './shareimg';

const rateLine = (id: string) => { const t = rateText(id); return `${t.startsWith('少於') ? '' : '大約 '}${t} 嘅人生會解鎖`; };
const GRADE_COLOR: Record<string, string> = { 'A+': '#b07ad6', A: '#e0ac2b', B: '#12706a', C: '#5aa9e6', D: '#9aa7b4', E: '#b07a5a', F: '#555c66' };

const HOUSE_DESC: Record<string, string> = { 公屋: '公屋', 資助出售: '居屋', 私樓自置: '自置私樓', 私樓租住: '租嚟嘅私樓', 劏房: '劏房', 村屋: '村屋', 跨境: '', 保幼局院舍: '保幼局', 寄養家庭: '寄養家庭' };
export const placeOf = (g: Game) => `${g.s.origin.subArea}${HOUSE_DESC[g.s.origin.housing] ?? ''}`;

const KEY_WORDS = ['結婚', '出世', '買樓', '上車', '第一份工', '升職', '公開試', '放榜', '退休', '移民', '離婚', '中咗', '患'];

function moments(g: Game): string[] {
  const big = g.s.log.filter((l) => l.big);
  const pref = big.filter((l) => KEY_WORDS.some((w) => l.text.includes(w)));
  const pool = (pref.length >= 3 ? pref : pref.concat(big.filter((l) => !pref.includes(l)))).slice();
  const pick: typeof pool = [];
  if (pool.length <= 3) pick.push(...pool);
  else for (let i = 0; i < 3; i++) pick.push(pool[Math.round((i * (pool.length - 1)) / 2)]);
  return pick.sort((a, b) => a.age - b.age).map((l) => `${l.age} 歲：${l.text.split('：')[0]}${l.text.includes('「') ? ' ' + (l.text.match(/「[^」]*」/)?.[0] ?? '') : ''}`);
}

// v1.1：死亡頁下面嘅人生回顧，按人生階段列出重要抉擇同事件
const STAGES: [string, number, number][] = [['童年', 0, 11], ['少年', 12, 17], ['青年', 18, 29], ['壯年', 30, 44], ['中年', 45, 64], ['晚年', 65, 200]];
function reviewLine(l: LogEntry): string {
  const m = l.text.match(/^([^：「]{1,24})：(「[^」]*」)\s*(.*)$/);
  if (m) {
    const rest = m[3].replace(/（[^）]*）/g, '').split(/[。！]/)[0];
    return `${m[1]}，揀咗${m[2]}${rest && rest.length <= 26 ? `，${rest}` : ''}`;
  }
  const t = l.text.replace(/（[^）]*）/g, '').split(/[。！]/)[0];
  return t.length > 34 ? `${t.slice(0, 33)}…` : t;
}
function lifeReview(g: Game): { name: string; span: string; items: string[] }[] {
  const s = g.s;
  const pool = s.log.filter((l) => l.big || KEY_WORDS.some((w) => l.text.includes(w)) || l.cat === '天馬行空');
  const out: { name: string; span: string; items: string[] }[] = [];
  for (const [name, a, b] of STAGES) {
    if (s.age < a) break;
    // 同一類抉擇（例如每 5 年問一次嘅遺囑）只列第一次
    const seen = new Set<string>();
    const inStage = pool.filter((l) => {
      if (l.age < a || l.age > b || /^自動揀/.test(l.text)) return false;
      const t = l.text.split('：')[0].replace(/\d+/g, '');
      if (seen.has(t)) return false;
      seen.add(t); return true;
    });
    if (!inStage.length) continue;
    const KEY_CAT = ['天馬行空', '悲劇', '健康', '財務衝擊'];
    const key = inStage.filter((l) => KEY_WORDS.some((w) => l.text.includes(w)) || KEY_CAT.includes(l.cat ?? ''));
    const rest = inStage.filter((l) => !key.includes(l));
    const max = 5;
    let pick = key.slice(0, max);
    if (pick.length < max && rest.length) {
      const need = max - pick.length;
      const step = rest.length / need;
      for (let i = 0; i < need && i * step < rest.length; i++) pick.push(rest[Math.floor(i * step)]);
    }
    pick = Array.from(new Set(pick)).sort((x, y) => x.age - y.age || s.log.indexOf(x) - s.log.indexOf(y));
    out.push({ name, span: `${a}–${Math.min(b, s.age)} 歲`, items: pick.map((l) => `${l.age} 歲　${reviewLine(l)}`) });
  }
  return out;
}
function reviewBox(g: Game): HTMLElement | null {
  const st = lifeReview(g);
  if (!st.length) return null;
  return h('section', { class: 'review' }, h('h3', null, '人生回顧'),
    st.map((x) => h('div', { class: 'rv-stage' }, h('div', { class: 'rv-h' }, h('b', null, x.name), h('span', null, x.span)),
      h('ul', null, x.items.map((t) => h('li', null, t))))));
}

function spiderCanvas(me: Spider, ag: Spider, forceDpr?: number): HTMLCanvasElement {
  const size = 280;
  const dpr = forceDpr ?? Math.min(3, Math.max(1, Math.round(devicePixelRatio || 1)));
  const cv = h('canvas', { class: 'spider', width: size * dpr, height: size * dpr, 'aria-label': '蜘蛛網圖：你同某某人' });
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const col = (n: string) => css.getPropertyValue(n).trim() || '#fff';
  const keys: (keyof Spider)[] = ['H', 'J', 'K', 'R', 'F'];
  const names = { H: '健康', J: '快樂', K: '知識', R: '人際', F: '財務' };
  const cx = size / 2, cy = size / 2 + 6, rad = 96;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return [cx + Math.cos(a) * rad * v / 100, cy + Math.sin(a) * rad * v / 100]; };
  c.strokeStyle = col('--line'); c.lineWidth = 1;
  for (const r of [25, 50, 75, 100]) { c.beginPath(); keys.forEach((_, i) => { const [x, y] = pt(i, r); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.stroke(); }
  keys.forEach((_, i) => { const [x, y] = pt(i, 100); c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); });
  const poly = (sp: Spider, stroke: string, fill: string | null, dash: number[]) => {
    c.beginPath(); keys.forEach((k, i) => { const [x, y] = pt(i, Math.max(4, sp[k])); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
    c.setLineDash(dash); c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
    if (fill) { c.fillStyle = fill; c.fill(); }
  };
  poly(ag, col('--muted'), null, [5, 4]);
  poly(me, col('--accent'), 'rgba(255,122,69,.20)', []);
  c.fillStyle = col('--ink'); c.font = `600 12px ${css.getPropertyValue('--font').trim() || 'sans-serif'}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  keys.forEach((k, i) => { const [x, y] = pt(i, 122); c.fillText(`${names[k]} ${Math.round(me[k])}`, x, y); });
  return cv;
}

export function showEnding(root: HTMLElement, g: Game, period: string | null, onRestart: () => void) {
  const s = g.s;
  const seed0 = Number(s.flags['seed0'] ?? s.seed); // 「返到 10 年前」之後 s.seed 會變，某某人同金句跟返出世嗰個
  const ag = aguiEnding(seed0, period);
  const e: Ending = computeEnding(g, ag);
  const fresh = endAchievements(g, e, ag);
  const minor = s.age < 18;
  const bankrupt = !!s.flags['bankrupt'];
  const apoc = s.flags['apocalypse'] as 'alien' | 'zombie' | undefined; // 終局事件
  const ageLine = bankrupt ? `${s.age} 歲破產` : apoc ? `${s.age} 歲遇上世界末日` : `享年 ${s.age} 歲`;
  const heroScene = (t = 0) => {
    const sc = h('canvas', { width: SW, height: SH });
    if (apoc) drawApocalypse(sc.getContext('2d')!, apoc, t, Number(s.flags['zombieDays'] ?? 0) >= 16); else drawScene(sc.getContext('2d')!, s, t);
    return sc;
  };
  store.addRun();
  store.addAchs(s.ach);
  const firstRun = store.runs() === 1;
  // 第一局完、或者仲未撞過任何終局事件，就暗示有特殊結局
  // v1.1：彩蛋提示，只提未解鎖嘅成就，每局揀兩句
  const HINTS: [string[], string][] = [
    [['giant_cat', 'talking_cat'], '養多幾隻貓，話唔定有奇怪嘅事發生……'],
    [['twins'], '生多幾個，可能會有雙倍驚喜。'],
    [['green_hat'], '結咗婚都要好好維繫感情，唔係頭上可能會變色。'],
    [['centenarian'], '注重健康，或者可以食到 100 歲生日蛋糕。'],
    [['history_rewrite'], '留意時代大事，歷史未必一定照舊發生。'],
    [['pentagon'], '五項數值全部過 70，會有一個特別稱號。'],
    [['expat'], '事業衝刺嘅人，有機會被公司派去外國。'],
    [['biz_exit'], '自己做老細做得好，可能有人想收購你盤生意。'],
    [['jackpot'], '六星彩頭獎機會好微，但遊戲入面……唔係零。'],
    [['rooftop_ufo', 'meteor', 'duck_effect', 'treasure'], '香港上空偶然會出現一啲解釋唔到嘅嘢。'],
  ];
  const known = new Set(store.achs());
  const hintPool = HINTS.filter(([ids]) => ids.some((id) => !known.has(id))).map(([, t]) => t);
  const hints = hintPool.length <= 2 ? hintPool : [hintPool[seed0 % hintPool.length], hintPool[(seed0 + 1 + (seed0 >> 3) % (hintPool.length - 1)) % hintPool.length]];
  const SECRET = ['earth_defense', 'zombie_survivor', 'redo_10y'];
  const showSecret = !apoc && (firstRun || (store.runs() <= 5 && !store.achs().some((id) => SECRET.includes(id))));
  let boardRank: number | null = null;
  let boardDone = false;

  type Page = { id: string; render: () => HTMLElement };
  const pages: Page[] = [];
  const P = (id: string, render: () => HTMLElement) => pages.push({ id, render });

  P('death', () => {
    if (apoc) {
      // 終局事件：特別像素動畫，唔用一般死亡畫面
      const cv = h('canvas', { class: 'apoc', width: SW, height: SH });
      const ctx = cv.getContext('2d')!;
      const full = Number(s.flags['zombieDays'] ?? 0) >= 16;
      let tt = 0;
      drawApocalypse(ctx, apoc, 0, full);
      const iv = setInterval(() => { if (!cv.isConnected && tt > 2) { clearInterval(iv); return; } drawApocalypse(ctx, apoc, ++tt, full); }, 90);
      const line = apoc === 'alien'
        ? `${s.year} 年，地球被佔領。${s.name}嘅人生停喺 ${s.age} 歲。`
        : `${s.year} 年，殭屍淹沒香港。${s.name}撐咗 ${Number(s.flags['zombieDays'] ?? 0)} 日，撐到最後一刻，${s.age} 歲。`;
      return h('div', { class: 'epage death' }, cv,
        h('h2', null, `${s.name}`),
        h('p', { class: 'years' }, `${s.birthYear}–${s.year}，${s.age} 歲`),
        h('p', { class: 'cause' }, line),
        h('p', { class: 'muted' }, apoc === 'alien' ? '如果世界冇完，你嘅人生本來會走到哪裡？' : '全世界都一齊完結，冇人需要為你善後。'),
        h('ul', { class: 'moments' }, moments(g).map((m) => h('li', null, m))),
        reviewBox(g));
    }
    const pc = h('canvas', { class: 'portrait', width: 24, height: 24 });
    drawPortrait(pc.getContext('2d')!, s);
    return h('div', { class: 'epage death' }, pc,
      h('h2', null, `${s.name}`),
      h('p', { class: 'years' }, bankrupt ? `${s.birthYear}–${s.year}，${s.age} 歲破產` : `${s.birthYear}–${s.year}，享年 ${s.age} 歲`),
      h('p', { class: 'cause' }, bankrupt ? '破產結算：負債太多，人生遊戲提早結束，理財分數計 0 分。' : s.deathCause ?? '離世'),
      h('ul', { class: 'moments' }, moments(g).map((m) => h('li', null, m))),
      reviewBox(g));
  });
  if (!bankrupt && !apoc) P('after', () => {
    const f = e.fpi;
    if (minor) return h('div', { class: 'epage' }, h('h2', null, '你走咗之後'), h('p', null, '爸爸媽媽好長一段時間都唔習慣屋企少咗一個人。佢哋會一直記住你。'));
    return h('div', { class: 'epage' }, h('h2', null, '你走咗之後'),
      h('div', { class: `meter b-${f.band}` }, h('span', null, '家人壓力指數'), h('b', null, `${Math.round(f.fpi)}`), h('em', null, f.band)),
      h('div', { class: 'mbar' }, h('span', { style: `width:${Math.round(f.fpi)}%` })),
      h('ul', { class: 'plain' }, f.text.map((t) => h('li', null, t))),
      f.lifePayout > 0 ? h('p', { class: 'muted' }, `你留俾家人嘅心意大約 ${fmtMoney(f.lifePayout)}。`) : null);
  });
  if (!minor && !bankrupt) P('retire', () => {
    const r = e.retire;
    const reached = r.aRet65 !== null;
    return h('div', { class: 'epage' }, h('h2', null, reached ? '退休財務成績表' : '退休準備度'),
      h('div', { class: `grade g-${r.grade}` }, r.grade),
      h('p', { class: 'lead' }, r.comment),
      h('dl', { class: 'facts' },
        reached ? [h('dt', null, '65 歲可動用資產'), h('dd', null, `${fmtMoney(r.aRet65!)}（2026 年幣值）`)] : null,
        r.monthly65 !== null ? [h('dt', null, '每月可以安全咁用'), h('dd', null, fmtMoney(r.monthly65))] : null,
        h('dt', null, '錢用到'), h('dd', null, r.M >= 100 ? '100 歲以上' : `${r.M} 歲`),
        h('dt', null, '某某人嘅錢用到'), h('dd', null, ag.retire.M >= 100 ? '100 歲以上' : `${ag.retire.M} 歲`)),
      h('p', { class: 'fine' }, '每月可用金額按 4% 提取法估算。內容為模擬，不構成投資建議。'));
  });
  P('spider', () => h('div', { class: 'epage' }, h('h2', null, '你 vs 某某人'),
    h('p', { class: 'muted' }, '某某人同你同一個出身，但每一步都有規劃：每月投資一成、留六個月備用金、買夠保險。'),
    spiderCanvas(e.spider, ag.spider),
    h('div', { class: 'legend' }, h('span', { class: 'lg me' }, '你'), h('span', { class: 'lg ag' }, '某某人')),
    h('p', { class: 'lead' }, spiderLine(e.spider, ag.spider))));
  P('score', () => {
    const rows = e.items.map((it) => h('div', { class: 'srow' }, h('span', null, it.name), h('span', { class: 'sbar' }, h('span', { style: `width:${Math.round(it.v)}%` })), h('b', null, String(Math.round(it.v)))));
    const beat = e.nine > ag.nine;
    const grade = lifeGrade(e.total);
    return h('div', { class: 'epage' }, h('h2', null, '人生排行榜計分'), h('div', { class: 'scores' }, rows),
      e.wonder ? h('p', { class: 'wonder' }, `天馬行空奇遇 +${e.wonder}`) : null,
      h('div', { class: 'total' }, h('span', null, '總分'), h('b', null, String(e.total)), h('small', null, '/ 1,000')),
      h('div', { class: `lgrade lg-${grade.replace('+', 'p')}` }, h('span', null, '人生評級'), h('b', null, grade)),
      h('p', { class: 'fine' }, GRADE_CUTS.slice(0, -1).map(([g, t]) => `${g} ≥ ${t}`).join('・') + '・F < 300'),
      h('p', { class: beat ? 'lead good' : 'lead' }, beat ? `你贏咗某某人！（某某人 ${Math.round(ag.total)} 分）` : `某某人有 ${Math.round(ag.total)} 分。下一世再試吓贏佢。`));
  });
  P('earn', () => h('div', { class: 'epage' }, h('h2', null, '賺錢榜'),
    h('div', { class: 'total' }, h('span', null, '一生收入'), h('b', null, fmtMoney(s.earnReal)), h('small', null, '2026 年幣值')),
    (() => {
      const b = bestEarnYear(s);
      if (!b) return h('p', { class: 'muted' }, '呢一世未有過收入。');
      return h('div', { class: 'bestyr' }, h('span', null, '賺得最多嘅一年'),
        h('b', null, `${b.year} 年（${b.age} 歲）`),
        h('em', null, `全年收入 ${fmtMoney(b.income)}`),
        Math.abs(b.real - b.income) > 1000 ? h('small', null, `約等於 2026 年嘅 ${fmtMoney(b.real)}`) : null);
    })(),
    h('dl', { class: 'facts money-sum' },
      h('dt', null, '強積金賺咗'), h('dd', { class: s.mpfGain >= 0 ? 'up' : 'dn' }, `${s.mpfGain < 0 ? '−' : ''}${fmtMoney(Math.abs(s.mpfGain))}`),
      h('dt', null, '投資賺咗'), h('dd', { class: s.investGain >= 0 ? 'up' : 'dn' }, `${s.investGain < 0 ? '−' : ''}${fmtMoney(Math.abs(s.investGain))}`),
      h('dt', null, '買六星彩用咗'), h('dd', null, fmtMoney(s.lotterySpent)),
      h('dt', null, '六星彩一共中咗'), h('dd', null, fmtMoney(s.lotteryWon)),
      h('dt', null, '離世時淨資產'), h('dd', { class: g.net >= 0 ? 'up' : 'dn' }, `${g.net < 0 ? '−' : ''}${fmtMoney(Math.abs(g.net))}`)),
    (() => {
      // v1.0：最後係負債就額外講清楚欠咗乜
      if (g.net >= 0) return null;
      const debts: [string, number][] = [
        ['卡數', s.card], ['財務公司', s.finco], ['私人貸款', s.privateLoan], ['學債', s.studentLoan?.bal ?? 0], ['生意貸款', s.biz?.loan ?? 0],
        ['物業按揭（超出樓價部分）', Math.max(0, -propEquity(g))],
      ];
      return h('div', { class: 'debtbox' },
        h('b', null, `你最後係負資產：欠 ${fmtMoney(-g.net)}`),
        h('ul', { class: 'plain' }, debts.filter(([, v]) => v > 1).map(([k, v]) => h('li', null, `${k} ${fmtMoney(v)}`))),
        h('small', null, '負債唔會因為離世消失，要由遺產先還；遺產唔夠還，債權人通常就收唔返。'));
    })(),
    h('p', { class: 'fine' }, '強積金同投資回報以 2026 年幣值計（包括定期存款利息）；六星彩按當年銀碼計。內容為模擬，不構成投資建議。'),
    h('p', { class: 'lead' }, `某某人一生賺咗 ${fmtMoney(ag.earnReal)}。${s.earnReal > ag.earnReal ? '你賺得比佢多，但賺得多唔等於夠用。' : '賺得少唔緊要，規劃先係關鍵。'}`)));
  P('parallel', () => {
    const lives = g.parallel ?? simulateParallel(g, period);
    type Row = { name: string; tag: string; place: string; end: string; total: number; grade: string; earn: number; moments: string; me?: boolean; bankrupt: boolean };
    const endText = (age: number, cause: string, bankrupt: boolean) => bankrupt ? `${age} 歲破產，提早結算` : `享年 ${age} 歲・${cause || '離世'}`;
    const rows: Row[] = [
      { name: s.name, tag: '你', place: placeOf(g), end: endText(s.age, s.deathCause ?? '', !!s.flags['bankrupt']), total: e.total, grade: lifeGrade(e.total), earn: s.earnReal, moments: '', me: true, bankrupt: !!s.flags['bankrupt'] },
      ...lives.map((l) => ({
        name: l.name, tag: l.planner ? '有規劃' : '同日出世', place: `${l.subArea}${HOUSE_DESC[l.housing] ?? ''}`,
        end: endText(l.end.age, l.end.cause, l.end.bankrupt), total: l.end.total, grade: l.end.grade, earn: l.end.earn, bankrupt: l.end.bankrupt,
        moments: l.news.filter((n) => n.key && !/離世|破產/.test(n.text)).slice(0, 5).map((n) => `${n.age} 歲${n.text}`).join('・'),
      })),
    ].sort((a, b) => b.total - a.total);
    const rank = rows.findIndex((r) => r.me) + 1;
    return h('div', { class: 'epage' }, h('h2', null, '平行人生'),
      h('p', { class: 'muted' }, `${s.birthYear} 年同一日，香港仲有其他人出世。某某人同你同一個出身；另外三個喺唔同屋企長大。${apoc ? '佢哋活喺一個世界冇完結嘅時空。' : ''}`),
      h('div', { class: 'plist' }, rows.map((r, i) => h('div', { class: `pl-row${r.me ? ' me' : ''}` },
        h('span', { class: 'pl-rank' }, String(i + 1)),
        h('div', { class: 'pl-main' },
          h('div', { class: 'pl-name' }, h('b', null, r.name), h('em', null, r.tag)),
          h('small', null, `${r.place}出世・${r.end}`),
          r.moments ? h('small', { class: 'pl-mo' }, r.moments) : null,
          h('small', null, `一生收入 ${fmtMoney(r.earn)}`)),
        h('div', { class: 'pl-score' }, h('b', null, String(r.total)), h('span', { class: `lgc lg-${r.grade.replace('+', 'p')}` }, r.grade))))),
      h('p', { class: rank === 1 ? 'lead good' : 'lead' }, rank === 1 ? '同日出世嘅五個人入面，你行得最好。' : `同日出世嘅五個人入面，你排第 ${rank}。出身唔同，結局都唔同。`));
  });
  P('board', () => {
    const box = h('div', { class: 'epage' }, h('h2', null, '上榜'));
    if (!boardDone) {
      const inp = h('input', { id: 'nick', type: 'text', maxlength: 8, placeholder: '你嘅暱稱（最多 8 個字）', autocomplete: 'off' });
      const form = h('form', { class: 'nick', onsubmit: (ev: Event) => {
        ev.preventDefault();
        const nick = inp.value.trim().slice(0, 8) || '無名氏';
        boardRank = store.addBoard({ nick, score: e.total, age: s.age, born: s.birthYear, place: placeOf(g), date: new Date().toISOString().slice(0, 10) });
        boardDone = true;
        go(idx);
      } }, inp, h('button', { class: 'btn', type: 'submit' }, '上榜'));
      box.append(h('p', { class: 'muted' }, '排行榜只會儲喺呢部機，唔會傳去任何地方。'), form,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { boardDone = true; go(idx + 1); } }, '唔上榜'));
    } else {
      if (boardRank !== null && boardRank >= 0) box.append(h('p', { class: 'lead good' }, `你排第 ${boardRank + 1} 名！`));
      box.append(boardTable(boardRank));
    }
    return box;
  });
  P('ach', () => {
    // 成就卡：中間放今世最稀有嘅成就（大圖），其他成就用文字排喺下面；設計成適合截圖分享
    const mine = s.ach.map((id) => ACH_BY_ID[id]).filter((a) => a && a.id !== 'beat_agui');
    const sorted = [...mine].sort((x, y) => rarityOf(x.id) - rarityOf(y.id) || y.pts - x.pts || Number(!!y.hidden) - Number(!!x.hidden));
    const top = sorted[0];
    const rest = sorted.slice(1);
    const grade = lifeGrade(e.total);
    const cv = heroScene(6);
    cv.classList.add('sc-scene');
    cv.setAttribute('aria-hidden', 'true');
    const tier = top ? tierOf(top.id) : null;
    const shown = rest.slice(0, 12);
    const card = h('div', { class: 'sharecard' },
      h('div', { class: 'sc-top' }, h('span', { class: 'sc-logo' }, '七百萬分之', h('em', null, '我')), h('span', { class: 'sc-tag' }, '人生成就卡')),
      h('div', { class: 'sc-hero' }, cv),
      h('div', { class: 'sc-who' }, h('b', null, s.name), h('span', null, `${s.birthYear}–${s.year} · ${ageLine} · ${s.origin.district}出世`)),
      top ? h('div', { class: `sc-star t-${tier!.name}` },
        h('span', { class: 'sc-star-tag' }, `最稀有成就 · ${tier!.name}`),
        emblem(top.id, 120),
        h('b', null, top.name),
        h('span', null, top.desc),
        h('small', null, rateLine(top.id)),
        fresh.includes(top.id) ? h('i', { class: 'sc-new' }, 'NEW') : null)
        : h('div', { class: 'sc-star' }, h('b', null, '呢一世未解鎖成就'), h('span', null, '下一世再嚟過。')),
      h('div', { class: 'sc-nums' },
        h('div', null, h('b', null, String(e.total)), h('span', null, '人生總分')),
        h('div', null, h('b', { class: `lgc lg-${grade.replace('+', 'p')}` }, grade), h('span', null, '人生評級')),
        h('div', null, h('b', null, String(mine.length)), h('span', null, '解鎖成就'))),
      rest.length ? h('div', { class: 'sc-list' }, h('h4', null, '其他成就'),
        h('p', null, shown.flatMap((a, i) => [i ? h('span', { class: 'dot' }, '・') : null, h('span', { class: fresh.includes(a.id) ? 'new' : '' }, a.name)])),
        rest.length > shown.length ? h('small', null, `仲有 ${rest.length - shown.length} 個`) : null) : null,
      h('div', { class: 'sc-foot' }, h('span', null, quoteFor(seed0)), h('span', null, '內容為模擬')));
    const shareText = `我喺「七百萬分之我」做咗${s.name}，${bankrupt ? `${s.age} 歲破產收場` : apoc ? `${s.age} 歲遇上${apoc === 'alien' ? '外星人入侵' : '殭屍潮'}` : `活到 ${s.age} 歲`}，人生評級 ${grade}（${e.total} 分），解鎖咗 ${mine.length} 個成就${top ? `，最稀有係「${top.name}」` : ''}。你又會點過？`;
    const note = h('small', { class: 'copied' }, '');
    return h('div', { class: 'epage achpage' }, card,
      h('div', { class: 'row2' },
        h('button', { class: 'btn ghost', type: 'button', onclick: async () => { note.textContent = (await copyText(shareText)) ? '已複製，可以貼俾朋友' : shareText; } }, '複製文字'),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          const line = bankrupt ? `我在${placeOf(g)}出世，${s.age} 歲破產，人生提早結算` : apoc ? `我在${placeOf(g)}出世，${s.age} 歲遇上世界末日` : `我在${placeOf(g)}出世，享年 ${s.age} 歲`;
          const sc = heroScene(6);
          const img = makeShareImage({
            scene: sc, quote: quoteFor(seed0), name: s.name, line, grade, gradeColor: GRADE_COLOR[grade] ?? '#8e1f3f', total: e.total, achCount: mine.length,
            star: top ? { emblem: emblem(top.id, 120), name: top.name, tier: `最稀有成就・${tier!.name}`, desc: top.desc, rate: rateLine(top.id) } : null,
            spider: spiderCanvas(e.spider, ag.spider, 3),
          });
          note.textContent = await shareImage(img, shareText, root);
        } }, '分享圖片')),
      note,
      h('details', { class: 'allach' }, h('summary', null, `全部成就（累積 ${store.achs().filter((id) => ACH_BY_ID[id]).length} / ${ACHIEVEMENTS.length}）`),
        achGrid(new Set(store.achs()), new Set(fresh))));
  });
  P('last', () => {
    const lines = ['同一個起點，有冇規劃，結局差好遠。', '下一世，你想點過？', '人生唔可以重嚟，但遊戲可以。'];
    const sad = s.tragedies > 0 || !!s.mental || !!s.flags['mentalEver'];
    return h('div', { class: 'epage last' }, h('h2', null, '呢一世完咗。'),
      h('p', { class: 'lead' }, lines[seed0 % 3]),
      firstRun ? h('p', { class: 'unlock' }, '解鎖：自動揀、自動答題、揀出生時段') : null,
      showSecret ? h('div', { class: 'secret' }, h('b', null, '🔮 ……'),
        h('p', null, '有啲人生，唔係咁樣完結嘅。'),
        h('p', { class: 'muted small' }, '下一世，留意身邊唔尋常嘅嘢。')) : null,
      hints.length ? h('div', { class: 'hints' }, h('b', null, '💡 小提示'), h('ul', null, hints.map((t) => h('li', null, t)))) : null,
      h('button', { class: 'btn big', type: 'button', onclick: () => onRestart() }, '再投胎一次'),
      h('button', { class: 'btn outline big', type: 'button', onclick: () => booking(root) }, '點擊查詢更多'),
      h('p', { class: 'igline' }, h('span', null, '玩得開心？'), h('span', null, '記得喺 IG follow 我，第一時間玩到新版本！'),
        h('a', { href: 'https://instagram.com/life_balance_adventure', target: '_blank', rel: 'noopener' }, '@life_balance_adventure')),
      sad ? h('p', { class: 'fine' }, '如果你感到困擾，可以搵身邊人傾吓，或致電「情緒通」18111。') : null,
      h('p', { class: 'fine' }, '內容為模擬，不構成投資建議。'));
  });

  let idx = 0;
  const dots = h('div', { class: 'dots' });
  const stage = h('div', { class: 'estage' });
  const prev = h('button', { class: 'btn ghost', type: 'button', onclick: () => go(idx - 1) }, '◀ 上一頁');
  const next = h('button', { class: 'btn', type: 'button', onclick: () => go(idx + 1) }, '下一頁 ▶');
  const skip = h('button', { class: 'pill', type: 'button', onclick: () => go(pages.findIndex((p) => p.id === 'score')) }, '跳到分數 ▶▶');
  clear(root).append(h('div', { class: 'screen ending' }, h('div', { class: 'etop' }, dots, skip), stage, h('div', { class: 'enav' }, prev, next)));

  function go(i: number) {
    idx = Math.max(0, Math.min(pages.length - 1, i));
    clear(dots).append(...pages.map((_, j) => h('span', { class: j < idx ? 'done' : j === idx ? 'cur' : '' })));
    clear(stage).append(pages[idx].render());
    prev.hidden = idx < 2;
    next.hidden = idx === pages.length - 1 || (pages[idx].id === 'board' && !boardDone);
    skip.hidden = idx < 1 || idx >= pages.findIndex((p) => p.id === 'score');
    stage.scrollTop = 0;
    (next.hidden ? (stage.querySelector('button, input') as HTMLElement | null) : next)?.focus({ preventScroll: true });
  }
  go(0);
}

/** 成就圖鑑：每個成就一張顯示圖，未解鎖顯示剪影 */
export function achGrid(got: Set<string>, fresh = new Set<string>()): HTMLElement {
  return h('div', { class: 'achs' }, ACHIEVEMENTS.map((a) => {
    const on = got.has(a.id);
    const open = on || !a.hidden;
    return h('div', { class: `ach ${on ? '' : 'locked'} ${fresh.has(a.id) ? 'new' : ''}` },
      emblem(a.id, 44, !on),
      h('div', null, h('b', null, open ? a.name : '？？？'), h('span', null, open ? a.desc : '隱藏成就'),
        h('small', null, `${tierOf(a.id).name} · ${rateText(a.id)}${a.pts ? ` · ${a.pts} 分` : ''}`)));
  }));
}

export function boardTable(hi: number | null = null): HTMLElement {
  const b = store.board();
  if (!b.length) return h('p', { class: 'muted' }, '未有人上榜。玩完一局就可以上榜。');
  return h('ol', { class: 'board' }, b.slice(0, 10).map((r, i) => h('li', { class: i === hi ? 'me' : '' },
    h('span', { class: 'rk' }, String(i + 1)), h('span', { class: 'nk' }, r.nick, h('small', null, `${r.born} 年${r.place}出世・${r.age} 歲`)), h('b', null, String(r.score)))));
}

export function booking(root: HTMLElement) {
  const wrap = h('div', { class: 'mwrap in' });
  const close = () => wrap.remove();
  wrap.append(h('div', { class: 'modal booking', role: 'dialog', 'aria-modal': 'true', 'aria-label': '點擊查詢更多' },
    h('button', { class: 'mx', type: 'button', 'aria-label': '關閉', onclick: close }, '✕'),
    h('h3', { class: 'ctitle' }, '15 分鐘免費理財健康檢查'),
    h('img', { src: QR, alt: 'IG 專頁 QR code', class: 'qr', width: 180, height: 180 }),
    h('a', { href: 'https://instagram.com/life_balance_adventure', target: '_blank', rel: 'noopener' }, 'IG：@life_balance_adventure'),
    h('p', { class: 'fine' }, '你可以自己決定係咪聯絡。遊戲唔會收集任何玩家資料。內容為模擬，不構成投資建議。')));
  wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });
  root.append(wrap);
}
