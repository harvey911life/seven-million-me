// 主遊戲畫面（直向單手）：上面場景同指標，中間時間線，下面事件卡 / 快捷理財，底部導航（右下角主頁）
import type { Game } from '../engine/game';
import type { Card } from '../engine/cards';
import type { StatKey, InsKind } from '../engine/state';
import { INS_NAME } from '../engine/state';
import { focusList, PANEL } from '../engine/yearly';
import { pickFor, autoFocus } from '../engine/agui';
import { premiumOf, canBuy, setIns, propValue, plansValue } from '../engine/finance';
import { jobName } from '../engine/career';
import { LEVEL_NAME, EDU_NAME } from '../data/jobs';
import { ACH_BY_ID } from '../engine/achievements';
import type { QuizAnswer } from '../engine/quiz';
import { fmtMoney } from '../engine/util';
import { h, clear, sleep, toast } from './dom';
import { drawScene, SW, SH } from './scene';
import { store, type Settings } from './store';

const STAT_NAME: Record<StatKey | 'F', string> = { H: '健康', J: '快樂', K: '知識', R: '人際', F: '財務' };
const CAT_CLASS: Record<string, string> = {
  人生抉擇: 'c-yellow', 生活日常: 'c-green', 財務衝擊: 'c-red', 時代事件: 'c-purple', 國際都會: 'c-blue', 悲劇: 'c-grey',
  生活陷阱: 'c-orange', 政策衍生: 'c-cyan', 天馬行空: 'c-gold', 健康: 'c-pink',
};
const SPEEDS: Settings['speed'][] = [1, 2, 4, 8];
const YEAR_MS = 45000; // 1 倍速：一年約 45 秒
const CHILD_MS = 6000; // 0–5 歲（未有得揀）快啲行

export function stageLabel(g: Game): string {
  const s = g.s;
  if (s.age < 6) return '童年';
  if (s.status === 'study' && s.age < 12) return '小學';
  if (s.status === 'study' && s.age < 18) return '中學';
  if (s.status === 'study') return '進修';
  if (s.status === 'work') return s.married ? '成家立室' : '打工仔';
  if (s.status === 'unemp') return '待業';
  if (s.status === 'retired') return '退休';
  return '成長';
}

type PauseWhy = 'user' | 'sheet' | 'card' | 'hidden' | 'home';

export function playGame(root: HTMLElement, g: Game, settings: Settings, onEnd: (g: Game) => void, onQuit: () => void) {
  clear(root);
  const s = g.s;
  g.autoPick = settings.autoPick;
  const paused = new Set<PauseWhy>();
  let ended = false;
  let skipYear = false;
  let wake: (() => void) | null = null;
  const nudge = () => { const w = wake; wake = null; w?.(); };

  // ---------- 版面 ----------
  const nameEl = h('div', { class: 'who' });
  const speedBtn = h('button', { class: 'pill', type: 'button', 'aria-label': '轉速度', onclick: () => cycleSpeed() });
  const pauseBtn = h('button', { class: 'pill', type: 'button', 'aria-label': '暫停或繼續', onclick: () => togglePause() });
  const header = h('header', { class: 'g-head' }, nameEl, h('div', { class: 'g-tools' }, speedBtn, pauseBtn));

  const canvas = h('canvas', { class: 'scene', width: SW, height: SH, 'aria-label': '角色像素場景' });
  const cashEl = h('div', { class: 'cash' });
  const scene = h('div', { class: 'scene-wrap' }, canvas, cashEl);
  const statsEl = h('div', { class: 'stats' });
  const feed = h('div', { class: 'feed', 'aria-live': 'polite' });

  const progFill = h('span');
  const progLabel = h('span', { class: 'prog-l' });
  const nextBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { skipYear = true; nudge(); } }, '下一年 ▶');
  const quick = h('div', { class: 'quick' });
  const idle = h('div', { class: 'idle' }, h('div', { class: 'prog-row' }, h('div', { class: 'prog' }, progFill), progLabel, nextBtn), quick);
  const event = h('div', { class: 'event', hidden: true });
  const dock = h('section', { class: 'dock' }, idle, event);

  const nav = h('nav', { class: 'nav' },
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('focus') }, h('i', null, '◎'), h('span', null, '焦點')),
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('money') }, h('i', null, '$'), h('span', null, '理財')),
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('spend') }, h('i', null, '♥'), h('span', null, '花錢')),
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('profile') }, h('i', null, '☰'), h('span', null, '資料')),
    h('button', { class: 'nav-b home', type: 'button', onclick: () => askHome() }, h('i', null, '⌂'), h('span', null, '主頁')));

  const sheetTitle = h('h3');
  const sheetBody = h('div', { class: 'sheet-body' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-head' }, sheetTitle, h('button', { class: 'x', type: 'button', 'aria-label': '收起', onclick: () => closeSheet() }, '✕')), sheetBody);
  const shade = h('div', { class: 'shade', onclick: () => closeSheet() });

  root.append(h('div', { class: 'screen game' }, header, scene, statsEl, feed, dock, nav, shade, sheet));

  // ---------- 場景動畫 ----------
  const ctx = canvas.getContext('2d')!;
  let frame = 0;
  let lastDraw = 0;
  const anim = (ts: number) => {
    if (ended) return;
    if (ts - lastDraw > 160) { lastDraw = ts; frame++; drawScene(ctx, s, frame); }
    requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);

  // ---------- 狀態顯示 ----------
  let prevStats: Record<string, number> = {};
  function renderTop() {
    clear(nameEl).append(h('b', null, `${s.name}・${s.age} 歲`), h('span', null, `${s.year} 年・${stageLabel(g)}`));
    speedBtn.textContent = `${settings.speed}×`;
    pauseBtn.textContent = paused.has('user') ? '▶ 繼續' : 'Ⅱ 暫停';
    pauseBtn.classList.toggle('on', paused.has('user'));
  }
  function renderStats() {
    clear(statsEl);
    for (const k of ['H', 'J', 'K', 'R', 'F'] as (StatKey | 'F')[]) {
      const v = Math.round(s[k]);
      const d = prevStats[k] !== undefined ? v - prevStats[k] : 0;
      const kidF = k === 'F' && (s.status === 'child' || (s.status === 'study' && !s.everEmployed));
      const lvl = v < 30 ? 'low' : v > 70 ? 'high' : '';
      statsEl.append(h('button', { class: `stat s-${k} ${lvl}`, type: 'button', onclick: k === 'F' ? () => fDetail() : null, 'aria-label': `${STAT_NAME[k]} ${v}` },
        h('span', { class: 'sl' }, kidF ? '家庭財務' : STAT_NAME[k]),
        h('span', { class: 'sv' }, String(v), d ? h('i', { class: d > 0 ? 'up' : 'dn' }, d > 0 ? `+${d}` : String(d)) : null),
        h('span', { class: 'bar' }, h('span', { style: `width:${v}%` }))));
    }
    prevStats = { H: Math.round(s.H), J: Math.round(s.J), K: Math.round(s.K), R: Math.round(s.R), F: Math.round(s.F) };
    if (s.age >= 18) clear(cashEl).append(h('span', null, '現金同存款 '), h('b', null, fmtMoney(s.cash + s.deposit)));
    else if (s.age >= 6) clear(cashEl).append(h('span', null, '錫錢罐 '), h('b', null, fmtMoney(s.piggy)));
    else clear(cashEl);
  }
  function fDetail() {
    const fp = s.fParts;
    const lines = s.age < 18 && !s.everEmployed
      ? [`屋企積蓄夠用大約 ${fp.m.toFixed(1)} 個月`]
      : [`緊急備用金 ${fp.m.toFixed(1)} 個月`, s.status === 'retired' ? `退休錢預計用到 ${fp.untilAge} 歲` : `退休儲蓄達標 ${Math.round(Math.min(fp.r, 9.99) * 100)}%`, `保障缺口 ${Math.round(fp.gap)}%`];
    toast(lines.join('；'), 'info', 4000);
  }

  // ---------- 時間線（新嘅喺上面） ----------
  function addYear(age: number, year: number, rows: { t: string; k: 'imp' | 'log' | 'tick' | 'sum' }[]) {
    feed.prepend(h('div', { class: 'yr' }, h('div', { class: 'yh' }, h('b', null, `${age} 歲`), h('span', null, String(year))), h('ul', null, rows.map((r) => h('li', { class: r.k }, r.t)))));
    feed.scrollTop = 0;
  }

  // ---------- 快捷理財（等緊下一年時可以改，唔強制） ----------
  function seg(labels: string[], cur: number, pick: (i: number) => void, dis: (string | null)[] = []): HTMLElement {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    labels.forEach((l, i) => wrap.append(h('button', {
      class: i === cur ? 'on' : '', type: 'button', role: 'radio', 'aria-checked': i === cur ? 'true' : 'false', disabled: !!dis[i], title: dis[i] ?? null,
      onclick: () => {
        pick(i);
        Array.from(wrap.children).forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-checked', j === i ? 'true' : 'false'); });
      },
    }, l)));
    return wrap;
  }
  const RATIOS = [0, 0.05, 0.1, 0.2, 0.3];
  function renderQuick() {
    clear(quick);
    if (s.age < 6) { quick.append(h('p', { class: 'muted' }, '仲細，由屋企人照顧。6 歲入學之後就可以揀人生焦點。')); return; }
    const focusRow = h('button', { class: 'qrow', type: 'button', onclick: () => openSheet('focus') }, h('span', null, '人生焦點'), h('b', null, s.focus ?? '未揀'), h('i', null, '›'));
    if (s.age < 18) { quick.append(focusRow); return; }
    quick.append(
      h('div', { class: 'qline' }, h('span', null, '每月投資'), seg(['唔投', '5%', '10%', '20%', '30%'], Math.max(0, RATIOS.indexOf(s.investRatio)), (i) => { s.investRatio = RATIOS[i]; })),
      h('div', { class: 'qline' }, h('span', null, '強積金'), seg(['保守', '均衡', '增長'], ['保守', '均衡', '增長'].indexOf(s.mpfFund), (i) => { s.mpfFund = (['保守', '均衡', '增長'] as const)[i]; })),
      focusRow);
  }

  // ---------- 底部抽屜（焦點 / 理財 / 花錢 / 資料） ----------
  type Tab = 'focus' | 'spend' | 'money' | 'profile';
  let tab: Tab = 'focus';
  const TAB_NAME: Record<Tab, string> = { focus: '人生焦點', money: '理財', spend: '每年花錢', profile: '人生資料' };
  function renderSheet() {
    sheetTitle.textContent = TAB_NAME[tab];
    clear(sheetBody).append(tab === 'focus' ? focusPanel() : tab === 'spend' ? spendPanel() : tab === 'money' ? moneyPanel() : profilePanel());
  }
  function openSheet(t: Tab) {
    tab = t; renderSheet();
    sheet.classList.add('open'); shade.classList.add('on');
    paused.add('sheet'); renderTop();
  }
  function closeSheet() {
    sheet.classList.remove('open'); shade.classList.remove('on');
    paused.delete('sheet'); renderTop(); renderQuick(); nudge();
  }

  const fxText = (fx: Partial<Record<StatKey, number>>) => (Object.keys(fx) as StatKey[]).filter((k) => fx[k]).map((k) => `${STAT_NAME[k]} ${fx[k]! > 0 ? '+' : ''}${fx[k]}`).join('、');
  function focusPanel(): HTMLElement {
    if (s.age < 6) return h('p', { class: 'muted' }, '仲細，未有得揀。6 歲入學之後就可以揀每年嘅人生焦點。');
    return h('div', { class: 'list' },
      h('p', { class: 'hint' }, '揀咗即刻記住，下一年開始生效。'),
      focusList(g).map((f) => h('button', { class: `opt-card ${s.focus === f.id ? 'on' : ''}`, type: 'button', onclick: () => { s.focus = f.id; renderSheet(); } },
        h('b', null, f.id), h('span', { class: 'fx' }, fxText(f.fx)), h('span', { class: 'muted' }, f.desc))));
  }
  function spendPanel(): HTMLElement {
    if (s.age < 15) {
      return h('div', { class: 'list' }, h('p', null, `錫錢罐有 ${fmtMoney(s.piggy)}。利是錢點處理？`),
        seg(['全部儲起', '儲一半', '使晒佢'], s.piggyMode, (i) => { s.piggyMode = i as 0 | 1 | 2; }),
        h('p', { class: 'muted' }, '15 歲起可以用花錢面板。'));
    }
    const avail = PANEL.filter((p) => s.age >= p.minAge && (s.age >= 18 || p.teen));
    const box = h('div', { class: 'list' }, h('p', { class: 'hint' }, `每年最多揀 2 項，會每年照做，直到你取消。已揀 ${s.panel.length} / 2`));
    for (const p of avail) {
      const on = s.panel.includes(p.id);
      const cost = p.cost(g);
      const full = !on && s.panel.length >= 2;
      box.append(h('label', { class: `spend ${on ? 'on' : ''} ${full ? 'dis' : ''}` },
        h('input', { type: 'checkbox', id: `sp-${p.id}`, checked: on, disabled: full, onchange: () => {
          if (on) s.panel = s.panel.filter((x) => x !== p.id); else if (s.panel.length < 2) s.panel = [...s.panel, p.id];
          renderSheet();
        } }),
        h('span', { class: 'sp-t' }, h('b', null, p.name), h('span', { class: 'muted' }, p.desc)),
        h('span', { class: 'sp-c' }, cost > 0 ? fmtMoney(cost) : '免費')));
    }
    if (avail.some((p) => p.id === 'travel')) box.append(h('div', { class: 'qline' }, h('span', null, '旅行'), seg(['本地遊', '日本'], s.travelPick === '日本' ? 1 : 0, (i) => { s.travelPick = i ? '日本' : '本地遊'; renderSheet(); })));
    box.append(h('div', { class: 'qline' }, h('span', null, '回饋'), seg(['捐款', '義工'], s.givePick === '義工' ? 1 : 0, (i) => { s.givePick = i ? '義工' : '捐款'; renderSheet(); })));
    return box;
  }
  function moneyPanel(): HTMLElement {
    if (s.age < 18) return h('p', { class: 'muted' }, '18 歲先可以自己理財。而家啲錢由屋企人管。');
    const ALLOC: [string, typeof s.alloc][] = [
      ['全指數', { deposit: 0, plan: 0, index: 100, stock: 0, crypto: 0 }],
      ['穩陣', { deposit: 60, plan: 0, index: 40, stock: 0, crypto: 0 }],
      ['平衡', { deposit: 10, plan: 0, index: 70, stock: 20, crypto: 0 }],
      ['進取', { deposit: 0, plan: 0, index: 50, stock: 40, crypto: 10 }],
    ];
    const aIdx = ALLOC.findIndex(([, a]) => JSON.stringify(a) === JSON.stringify(s.alloc));
    const box = h('div', { class: 'list' },
      h('div', { class: 'tiles' },
        h('div', null, h('span', null, '流動資產'), h('b', null, fmtMoney(g.liquid))),
        h('div', null, h('span', null, '淨資產'), h('b', null, fmtMoney(g.net))),
        h('div', null, h('span', null, '強積金'), h('b', null, fmtMoney(s.mpf)))),
      h('h4', null, '每月拎幾多人工去投資'),
      seg(['唔投資', '5%', '10%', '20%', '30%'], Math.max(0, RATIOS.indexOf(s.investRatio)), (i) => { s.investRatio = RATIOS[i]; }),
      h('h4', null, '投資組合'),
      seg(ALLOC.map(([n]) => n), aIdx, (i) => { s.alloc = { ...ALLOC[i][1] }; }),
      h('h4', null, '緊急備用金目標'),
      seg(['唔留', '3 個月', '6 個月'], [0, 3, 6].indexOf(s.emergTarget), (i) => { s.emergTarget = ([0, 3, 6] as const)[i]; }),
      h('h4', null, '強積金基金'),
      seg(['保守', '均衡', '增長'], ['保守', '均衡', '增長'].indexOf(s.mpfFund), (i) => { s.mpfFund = (['保守', '均衡', '增長'] as const)[i]; }),
      h('h4', null, '保險'));
    for (const k of ['med', 'ci', 'acc', 'life'] as InsKind[]) {
      const why = canBuy(g, k);
      const lv = s.ins[k].level;
      box.append(h('div', { class: 'ins' },
        h('span', { class: 'ins-n' }, INS_NAME[k], h('small', null, lv ? `年保費 ${fmtMoney(premiumOf(g, k))}` : why ?? '未買')),
        seg(['冇', '基本', '充足'], lv, (i) => { setIns(g, k, i as 0 | 1 | 2); renderSheet(); }, [null, lv < 1 ? why : null, lv < 2 ? why : null])));
    }
    box.append(
      h('h4', null, '六星彩'),
      seg(['唔買', '間中買', '每期買'], s.lottery, (i) => { s.lottery = i as 0 | 1 | 2; }),
      h('h4', null, '打算幾時退休'),
      seg(['60 歲', '65 歲', '做到唔做得'], [60, 65, 99].indexOf(s.retirePlan), (i) => { s.retirePlan = ([60, 65, 99] as const)[i]; }),
      h('p', { class: 'fine' }, '回報只係模擬，不構成投資建議。'));
    return box;
  }
  function profilePanel(): HTMLElement {
    const o = s.origin;
    const rows: [string, string][] = [];
    rows.push(['出身', `${o.subArea}・${o.housing}${o.family ? `・${o.family}` : ''}`]);
    rows.push(['學歷', s.age < 18 ? (s.age < 6 ? '未入學' : s.age < 12 ? '小學' : '中學') : EDU_NAME[s.edu] + (s.major ? `（${s.major}）` : '')]);
    if (s.job && s.status === 'work') rows.push(['工作', `${jobName(g, s.job.id)}・${LEVEL_NAME[s.job.level] ?? ''}・月薪 ${fmtMoney(s.job.salary)}`]);
    else rows.push(['工作', { child: '細路', study: '讀緊書', work: '返工', unemp: '待業', retired: '已退休' }[s.status]]);
    rows.push(['住屋', { parents: '同父母住', share: '合租', rent: '租樓', public: '公屋', subdiv: '劏房', own: '自置物業', village: '村屋', institution: '院舍' }[s.home]]);
    if (s.partner && s.partner.alive) rows.push([s.married ? '伴侶' : '拍拖', `${s.partner.name}（${s.partner.age} 歲，${s.partner.job || '冇返工'}）`]);
    if (s.kids.length) rows.push(['子女', s.kids.map((k) => `${k.name} ${k.age} 歲`).join('、')]);
    const alive = s.parents.filter((p) => p.alive).map((p) => `${p.role === '父' ? '爸爸' : '媽媽'} ${p.age} 歲`);
    rows.push(['父母', alive.length ? alive.join('、') : '已離世']);
    if (s.age >= 18) {
      rows.push(['現金同存款', fmtMoney(s.cash + s.deposit)]);
      if (s.index + s.stock + s.crypto > 0) rows.push(['投資', `指數 ${fmtMoney(s.index)}・股票 ${fmtMoney(s.stock)}・加密 ${fmtMoney(s.crypto)}`]);
      if (s.plans.length) rows.push(['儲蓄保險', fmtMoney(plansValue(s))]);
      rows.push(['強積金', fmtMoney(s.mpf)]);
      if (s.prop) rows.push(['物業', `市值 ${fmtMoney(propValue(g))}・欠按揭 ${fmtMoney(s.prop.mortgage)}`]);
      const debt = s.card + s.finco + s.privateLoan + (s.studentLoan?.bal ?? 0);
      if (debt > 0) rows.push(['欠債', fmtMoney(debt)]);
      rows.push(['保險', (['med', 'ci', 'acc', 'life'] as InsKind[]).map((k) => `${INS_NAME[k]}${['✕', '基本', '充足'][s.ins[k].level]}`).join('・')]);
    }
    if (s.diseases.length || s.mental) rows.push(['健康狀況', [...s.diseases.map((d) => ({ cancer: '癌症', stroke: '中風', heart: '心臟病', kidney: '腎病', threeHigh: '三高', dementia: '認知障礙' }[d.kind])), s.mental ? '情緒病' : ''].filter(Boolean).join('、')]);
    rows.push(['成就', `${s.ach.length} 個`]);
    return h('div', { class: 'list' }, h('dl', { class: 'facts' }, rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])),
      s.mental ? h('p', { class: 'fine' }, '如果你感到困擾，可以搵身邊人傾吓，或致電「情緒通」18111。') : null);
  }

  // ---------- 事件卡（喺下面出，唔遮場景） ----------
  let keyPick: ((n: number) => void) | null = null;
  let keyEnter: (() => void) | null = null;
  function showEvent(...kids: (Node | null)[]) {
    paused.add('card');
    clear(event).append(...kids.filter((k): k is Node => !!k));
    idle.hidden = true; event.hidden = false;
    event.scrollTop = 0;
    dock.classList.add('busy');
  }
  function hideEvent() {
    paused.delete('card');
    clear(event); event.hidden = true; idle.hidden = false;
    dock.classList.remove('busy');
    renderQuick();
  }
  function deltaChips(d?: Record<StatKey, number>, money = 0): HTMLElement {
    const box = h('div', { class: 'chips' });
    if (d) for (const k of ['H', 'J', 'K', 'R'] as StatKey[]) {
      const v = Math.round(d[k]);
      if (v) box.append(h('span', { class: `chip ${v > 0 ? 'up' : 'dn'}` }, `${STAT_NAME[k]} ${v > 0 ? '+' : ''}${v}`));
    }
    if (Math.abs(money) >= 1000) box.append(h('span', { class: `chip ${money > 0 ? 'up' : 'dn'}` }, `錢 ${money > 0 ? '+' : ''}${fmtMoney(money)}`));
    return box;
  }

  function cardEvent(c: Card): Promise<void> {
    return new Promise((done) => {
      const tag = c.cat ?? (c.kind === 'system' ? '人生抉擇' : '生活日常');
      const opts = h('div', { class: 'copts' });
      const body = h('div', { class: `ecard ${tag === '天馬行空' ? 'wonder' : ''}` },
        h('div', { class: 'ctop' }, h('span', { class: `tag ${CAT_CLASS[tag] ?? ''}` }, tag), h('span', { class: 'muted' }, `${s.age} 歲`)),
        h('h3', null, c.title),
        h('p', { class: 'ctext' }, c.text),
        c.reason ? h('p', { class: 'reason' }, c.reason) : null,
        c.hotline ? h('p', { class: 'hotline' }, '如果你感到困擾，可以搵身邊人傾吓，或致電「情緒通」18111。') : null,
        opts);
      showEvent(body);
      // 保險：如果全部選項都揀唔到，預設選項照樣可以揀（避免卡死）
      const allOff = c.options.every((o) => o.disabled);
      const pick = (i: number) => {
        if (c.options[i]?.disabled && !(allOff && i === c.def)) return;
        keyPick = null;
        const before = g.liquid;
        const text = g.choose(c, i);
        const money = g.liquid - before;
        clear(opts);
        const btn = h('button', { class: 'btn', type: 'button', onclick: () => finish() }, '繼續');
        body.append(h('div', { class: 'cres' }, h('p', { class: 'picked' }, `你揀咗「${c.options[i]?.label ?? ''}」`), text ? h('p', null, text) : null, deltaChips(c.resultDeltas, money)), btn);
        keyEnter = finish;
        renderStats();
      };
      const finish = () => { keyEnter = null; hideEvent(); done(); };
      c.options.forEach((o, i) => {
        const off = !!o.disabled && !(allOff && i === c.def);
        const fx = o.fx ? (Object.keys(o.fx) as StatKey[]).filter((k) => o.fx![k]).map((k) => h('i', { class: o.fx![k]! > 0 ? 'up' : 'dn' }, `${o.fx![k]! > 0 ? '▲' : '▼'}${STAT_NAME[k]}`)) : [];
        opts.append(h('button', { class: 'copt', type: 'button', disabled: off, onclick: () => pick(i) },
          h('span', { class: 'ol' }, o.label, o.note ? h('small', null, o.note) : null, o.disabled ? h('small', { class: 'why' }, o.disabled) : null),
          fx.length ? h('span', { class: 'ofx' }, fx) : null));
      });
      keyPick = pick;
    });
  }

  /** 突擊測驗 / 公開試：每題 10 秒；答完顯示答案，撳任何位置或 1 秒後自動下一題 */
  function quizEvent(c: Card): Promise<void> {
    return new Promise((done) => {
      const qs = c.quiz ?? [];
      const exam = c.kind === 'exam';
      const answers: QuizAnswer[] = [];
      const box = h('div', { class: 'ecard quiz' });
      showEvent(box);
      const intro = () => {
        clear(box).append(h('div', { class: 'ctop' }, h('span', { class: 'tag c-cyan' }, exam ? '公開試' : '測驗'), h('span', { class: 'muted' }, `${s.age} 歲`)),
          h('h3', null, c.title), h('p', { class: 'ctext' }, c.text),
          h('button', { class: 'btn', type: 'button', onclick: () => ask(0) }, c.options[0]?.label ?? '開始'));
        keyEnter = () => ask(0);
      };
      const ask = (i: number) => {
        keyEnter = null;
        if (i >= qs.length) return end();
        const q = qs[i];
        const t0 = performance.now();
        const bar = h('span');
        let over = false;
        const btns = q.opts.map((o, k) => h('button', { class: 'qopt', type: 'button', onclick: (e: Event) => { e.stopPropagation(); answer(k); } }, h('span', { class: 'k' }, 'ABCD'[k]), o));
        clear(box).append(
          h('div', { class: 'ctop' }, h('span', { class: 'tag c-cyan' }, q.subj), h('span', { class: 'muted' }, `第 ${i + 1} / ${qs.length} 題`)),
          h('div', { class: 'timer' }, bar),
          h('p', { class: 'qq' }, q.q),
          h('div', { class: 'qopts' }, btns));
        const tick = () => {
          if (over) return;
          const left = Math.max(0, 1 - (performance.now() - t0) / 10000);
          bar.style.width = `${left * 100}%`;
          bar.classList.toggle('warn', left < 0.3);
          if (left <= 0) answer(-1); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        keyPick = (n) => { if (n < 4) answer(n); };
        function answer(k: number) {
          if (over) return;
          over = true;
          keyPick = null;
          const ok = k === q.ans;
          answers.push({ correct: ok, timeout: k < 0, ms: performance.now() - t0 });
          btns.forEach((b, j) => { b.disabled = true; if (j === q.ans) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
          box.append(h('p', { class: `qexp ${ok ? 'ok' : 'no'}` }, h('b', null, ok ? '答啱！' : k < 0 ? '時間到！' : '答錯咗。'), ` 答案：${q.opts[q.ans]}`));
          // 撳任何位置或 1 秒後自動下一題
          let gone = false;
          const go = () => { if (gone) return; gone = true; document.removeEventListener('pointerdown', go, true); clearTimeout(tm); ask(i + 1); };
          const tm = setTimeout(go, 1000);
          setTimeout(() => { if (!gone) document.addEventListener('pointerdown', go, true); }, 50);
          keyEnter = go;
        }
      };
      const end = () => {
        keyEnter = null;
        (c as Card & { answers?: QuizAnswer[] }).answers = answers;
        const text = g.choose(c, 0);
        clear(box).append(h('div', { class: 'ctop' }, h('span', { class: 'tag c-cyan' }, exam ? '放榜' : '測驗完'), h('span', { class: 'muted' }, `${s.age} 歲`)),
          h('h3', null, exam ? '公開試成績' : '測驗成績'), h('p', { class: 'ctext' }, text), deltaChips(c.resultDeltas),
          h('button', { class: 'btn', type: 'button', onclick: () => fin() }, '繼續'));
        keyEnter = fin;
        renderStats();
      };
      const fin = () => { keyEnter = null; hideEvent(); done(); };
      intro();
    });
  }

  function focusPrompt(): Promise<void> {
    return new Promise((done) => {
      const title = s.focusStage === 'student' ? '入學喇！揀你嘅人生焦點' : s.focusStage === 'work' ? '出嚟做嘢，揀新嘅人生焦點' : '退休喇，揀新嘅人生焦點';
      const list = focusList(g).slice(0, 4);
      const box = h('div', { class: 'ecard' },
        h('div', { class: 'ctop' }, h('span', { class: 'tag c-yellow' }, '人生焦點'), h('span', { class: 'muted' }, `${s.age} 歲`)),
        h('h3', null, title),
        h('p', { class: 'muted' }, '之後隨時可以喺底部「焦點」改，嗰度仲有其他選擇。'),
        h('div', { class: 'copts' }, list.map((f) => h('button', { class: 'copt', type: 'button', onclick: () => { s.focus = f.id; hideEvent(); renderTop(); done(); } },
          h('span', { class: 'ol' }, f.id, h('small', null, `${fxText(f.fx)}・${f.desc}`))))));
      showEvent(box);
    });
  }

  // ---------- 主頁 ----------
  function askHome() {
    paused.add('home');
    const wrap = h('div', { class: 'confirm' }, h('div', { class: 'confirm-box' },
      h('h3', null, '返回主頁？'),
      h('p', { class: 'muted' }, '今局人生會冇咗，唔會儲低。'),
      h('div', { class: 'row2' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { wrap.remove(); paused.delete('home'); nudge(); } }, '繼續玩'),
        h('button', { class: 'btn', type: 'button', onclick: () => { wrap.remove(); quit(); } }, '返回主頁'))));
    root.querySelector('.game')!.append(wrap);
  }
  function quit() {
    ended = true;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    nudge();
    onQuit();
  }

  // ---------- 控制 ----------
  function cycleSpeed() {
    settings.speed = SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length];
    store.saveSettings(settings);
    renderTop(); nudge();
  }
  function togglePause() { if (paused.has('user')) paused.delete('user'); else paused.add('user'); renderTop(); nudge(); }
  const onKey = (e: KeyboardEvent) => {
    if (ended) return;
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    if (e.key >= '1' && e.key <= '4' && keyPick) { keyPick(Number(e.key) - 1); e.preventDefault(); return; }
    if (e.key === 'Enter' && keyEnter) { keyEnter(); e.preventDefault(); return; }
    if (paused.has('card') || paused.has('sheet')) return;
    if (e.key === ' ') { togglePause(); e.preventDefault(); } else if (e.key.toLowerCase() === 's') cycleSpeed();
    else if (e.key.toLowerCase() === 'n') { skipYear = true; nudge(); }
  };
  document.addEventListener('keydown', onKey);
  const onVis = () => { if (document.hidden) paused.add('hidden'); else { paused.delete('hidden'); nudge(); } };
  document.addEventListener('visibilitychange', onVis);

  // ---------- 每年循環 ----------
  const yearLen = () => (s.age < 6 ? CHILD_MS : YEAR_MS) / settings.speed;
  async function waitYear() {
    let elapsed = 0;
    let last = performance.now();
    skipYear = false;
    while (!ended) {
      const now = performance.now();
      if (!paused.size) elapsed += now - last;
      last = now;
      const len = yearLen();
      const left = Math.max(0, len - elapsed);
      progFill.style.width = `${Math.min(100, (elapsed / len) * 100)}%`;
      progLabel.textContent = paused.has('user') ? '暫停中' : `${Math.ceil(left / 1000)} 秒後 ${s.age + 1} 歲`;
      if (skipYear || left <= 0) break;
      await new Promise<void>((r) => { wake = r; setTimeout(r, 200); });
    }
    progFill.style.width = '100%';
  }

  async function resolveCard(c: Card) {
    const manual = c.kind === 'quiz' || c.kind === 'exam' || !settings.autoPick;
    if (!manual) {
      const i = pickFor(c, 'auto');
      const text = g.choose(c, i);
      g.tick(`自動揀「${c.title}」：${c.options[i]?.label ?? ''}${text ? `，${text}` : ''}`);
      return;
    }
    if (c.kind === 'quiz' || c.kind === 'exam') await quizEvent(c);
    else await cardEvent(c);
  }

  async function year() {
    const st = g.startYear();
    renderTop(); renderQuick();
    if (st.needFocus && s.age >= 6) {
      if (settings.autoPick) autoFocus(g);
      else await focusPrompt();
    }
    let guard = 0;
    while (g.queue.length && guard++ < 40 && !ended) await resolveCard(g.queue.shift()!);
    if (ended) return;
    const end = g.endYear();
    const rows: { t: string; k: 'imp' | 'log' | 'tick' | 'sum' }[] = [];
    const seen = new Set<string>();
    for (const l of s.log) if (l.age === s.age && !seen.has(l.text)) { seen.add(l.text); rows.push({ t: l.text, k: l.big ? 'imp' : 'log' }); }
    for (const t of g.ticker) if (!seen.has(t)) { seen.add(t); rows.push({ t, k: 'tick' }); }
    if (end.summary) rows.push({ t: end.summary, k: 'sum' });
    addYear(s.age, s.year, rows);
    renderStats(); renderTop(); renderQuick();
    for (const id of s.achNew) { const a = ACH_BY_ID[id]; if (a) toast(`★ 成就解鎖：${a.name}`, 'ach'); }
    s.achNew = [];
    if (end.dead) {
      ended = true;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      await sleep(1200);
      onEnd(g);
    }
  }

  async function loop() {
    renderTop(); renderStats(); renderQuick();
    addYear(0, s.year, [{ t: `${s.name}出世喇。名係屋企人改嘅，你揀唔到。`, k: 'imp' }, { t: '平淡嘅年份會自動行，等緊嘅時候可以改投資同強積金；唔想等可以撳「下一年」。', k: 'sum' }]);
    while (!ended && s.alive) {
      await waitYear();
      if (ended) break;
      await year();
    }
  }
  loop();
}
