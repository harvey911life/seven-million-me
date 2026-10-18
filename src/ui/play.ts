// 主遊戲畫面（直向單手，版面參考 80億分之1）：頂部歲數同速度列；中間場景、指標、人生紀錄、身分紀錄、家人、人生地圖；
// 下面事件卡 / 快捷理財（唔遮場景）；底部導航（右下角主頁）
import type { Game } from '../engine/game';
import type { Card } from '../engine/cards';
import type { StatKey, InsKind } from '../engine/state';
import { INS_NAME } from '../engine/state';
import { focusList, PANEL } from '../engine/yearly';
import { pickFor, autoFocus } from '../engine/agui';
import { parallelNewsFor } from '../engine/parallel';
import { premiumOf, canBuy, setIns, propValue, plansValue, PET_INFO, petBlock, adoptPet, petCostYear } from '../engine/finance';
import { jobName } from '../engine/career';
import { BIZ, bizBlock, bizName, startBiz, closeBiz } from '../engine/biz';
import { LEVEL_NAME, EDU_NAME } from '../data/jobs';
import { achToast } from './emblem';
import { atFamilyHome, sibsAtHome, kidAtHome } from '../engine/family';
import { rentalQuote, buyRental, sellRental, rentalValue, rentalMonthlyRent } from '../engine/rental';
import type { QuizAnswer } from '../engine/quiz';
import { fmtMoney } from '../engine/util';
import { h, clear, sleep, toast, reduceMotion, type Chip } from './dom';
import { drawScene, drawPortrait, SW, SH } from './scene';
import { store, type Settings } from './store';

const STAT_NAME: Record<StatKey | 'F', string> = { H: '健康', J: '快樂', K: '知識', R: '人際', F: '財務' };
const CAT_CLASS: Record<string, string> = {
  人生抉擇: 'c-yellow', 生活日常: 'c-green', 財務衝擊: 'c-red', 時代事件: 'c-purple', 國際都會: 'c-blue', 悲劇: 'c-grey',
  生活陷阱: 'c-orange', 政策衍生: 'c-cyan', 天馬行空: 'c-gold', 健康: 'c-pink',
};
const SPEEDS: Settings['speed'][] = [1, 2, 4, 8, 16];
const YEAR_MS = 40000; // 1 倍速：一年約 40 秒（v1.0）
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
  const ageEl = h('div', { class: 'age' });
  const metaEl = h('div', { class: 'meta-t' });
  const progFill = h('span');
  const progLabel = h('span', { class: 'prog-l' });
  const pauseBtn = h('button', { type: 'button', class: 'pz', 'aria-label': '暫停或繼續', onclick: () => togglePause() });
  const speedSeg = h('div', { class: 'speeds', role: 'radiogroup', 'aria-label': '速度' },
    pauseBtn, SPEEDS.map((v) => h('button', { type: 'button', role: 'radio', 'data-v': v, onclick: () => setSpeed(v) }, `${v}×`)));
  const nextBtn = h('button', { class: 'nextb', type: 'button', onclick: () => { skipYear = true; nudge(); } }, '下一年 »');
  const header = h('header', { class: 'g-head' },
    h('div', { class: 'g-top' }, ageEl, h('div', { class: 'g-meta' }, metaEl, h('div', { class: 'prog-row' }, h('div', { class: 'prog' }, progFill), progLabel))),
    h('div', { class: 'g-ctrl' }, speedSeg, nextBtn));

  const canvas = h('canvas', { class: 'scene', width: SW, height: SH, 'aria-label': '角色像素場景' });
  const cashEl = h('div', { class: 'cash' });
  const placeEl = h('p', { class: 'place' });
  const scene = h('section', { class: 'card scene-card' }, h('div', { class: 'scene-wrap' }, canvas, cashEl), placeEl);
  const statsEl = h('section', { class: 'card stats' });
  const moneyCard = h('section', { class: 'card money' });
  let moneyOpen = false;
  const feed = h('div', { class: 'feed', 'aria-live': 'polite' });
  const logCard = h('section', { class: 'card log' }, h('div', { class: 'card-h' }, h('h3', null, '人生紀錄'), h('span', null, '最新的在前')), feed);
  const idCard = h('section', { class: 'card idcard' });
  const famCard = h('section', { class: 'card fam' });
  const mapGrid = h('div', { class: 'lmap' });
  const mapCard = h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', null, '人生地圖'), h('span', null, '一格 = 一年，顏色係快樂程度')), mapGrid);
  const main = h('main', { class: 'g-main' }, scene, statsEl, moneyCard, logCard, idCard, famCard, mapCard);

  const event = h('div', { class: 'event' });
  const dock = h('section', { class: 'dock', hidden: true }, event);

  const nav = h('nav', { class: 'nav' },
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('focus') }, h('i', null, '◎'), h('span', null, '焦點')),
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('money') }, h('i', null, '$'), h('span', null, '理財')),
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('spend') }, h('i', null, '♥'), h('span', null, '花錢')),
    h('button', { class: 'nav-b', type: 'button', onclick: () => openSheet('profile') }, h('i', null, '☰'), h('span', null, '資料')),
    h('button', { class: 'nav-b home', type: 'button', onclick: () => askHome() }, h('i', null, '⌂'), h('span', null, '主頁')));

  const sheetTitle = h('h3');
  const sheetBody = h('div', { class: 'sheet-body' });
  const sheetOk = h('button', { class: 'btn small', type: 'button', hidden: true, onclick: () => { if (pendFocus) s.focus = pendFocus; pendFocus = null; closeSheet(); toast(`人生焦點：${s.focus}`, 'info', 1800); } }, '確認');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-head' }, sheetTitle, h('div', { class: 'sh-r' }, sheetOk, h('button', { class: 'x', type: 'button', 'aria-label': '收起', onclick: () => closeSheet() }, '✕'))), sheetBody);
  let pendFocus: string | null = null;
  let pendBiz: string | null = null; // 創業：撳一下揀，再撳確認
  const shade = h('div', { class: 'shade', onclick: () => closeSheet() });

  root.append(h('div', { class: 'screen game' }, header, main, dock, nav, shade, sheet));

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
  let prevCash: number | null = null;
  function flashCash(up: boolean) {
    if (reduceMotion()) return;
    cashEl.classList.remove('flash-up', 'flash-dn'); void cashEl.offsetWidth;
    cashEl.classList.add(up ? 'flash-up' : 'flash-dn');
  }
  function renderTop() {
    clear(ageEl).append(h('b', null, String(s.age)), h('span', null, '歲'));
    metaEl.textContent = `${s.year}年 · ${s.name} · ${stageLabel(g)} · 1年≈${Math.round(yearLen() / 1000)}秒`;
    pauseBtn.textContent = paused.has('user') ? '▶' : 'Ⅱ';
    pauseBtn.classList.toggle('on', paused.has('user'));
    speedSeg.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => { const on = Number(b.dataset.v) === settings.speed; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  }
  function renderStats() {
    clear(statsEl);
    for (const k of ['H', 'J', 'K', 'R', 'F'] as (StatKey | 'F')[]) {
      const v = Math.round(s[k]);
      const d = prevStats[k] !== undefined ? v - prevStats[k] : 0;
      const kidF = k === 'F' && (s.status === 'child' || (s.status === 'study' && !s.everEmployed));
      const lvl = v < 30 ? 'low' : v > 70 ? 'high' : '';
      const bump = !reduceMotion() && Math.abs(d) >= 2 ? ` bump ${d > 0 ? 'b-up' : 'b-dn'}` : '';
      statsEl.append(h('button', { class: `stat s-${k} ${lvl}${bump}`, type: 'button', onclick: k === 'F' ? () => fDetail() : null, 'aria-label': `${STAT_NAME[k]} ${v}` },
        h('span', { class: 'sl' }, kidF ? '家庭財務' : STAT_NAME[k]),
        h('span', { class: 'sv' }, String(v), d ? h('i', { class: `dl ${d > 0 ? 'up' : 'dn'}` }, d > 0 ? `+${d}` : String(d)) : null),
        h('span', { class: 'bar' }, h('span', { style: `width:${v}%${bump ? `;--w0:${Math.max(0, Math.min(100, v - d))}%` : ''}` }))));
    }
    prevStats = { H: Math.round(s.H), J: Math.round(s.J), K: Math.round(s.K), R: Math.round(s.R), F: Math.round(s.F) };
    renderSide();
    renderMoney();
    const cashNow = Math.round(s.cash + s.deposit);
    if (s.age >= 18 && prevCash !== null && Math.abs(cashNow - prevCash) >= Math.max(5000, Math.abs(prevCash) * 0.15)) flashCash(cashNow > prevCash);
    prevCash = cashNow;
    if (s.age >= 18) clear(cashEl).append(h('span', null, '現金同存款 '), h('b', null, fmtMoney(cashNow)));
    else if (s.age >= 6) clear(cashEl).append(h('span', null, '錢罌 '), h('b', null, fmtMoney(s.piggy)));
    else clear(cashEl);
  }
  // ---------- 每月收支卡：每月收入、使費、剩幾多、負債 ----------
  const debtOf = () => s.card + s.finco + s.privateLoan + (s.studentLoan?.bal ?? 0);
  function budgetRows(): HTMLElement {
    const b = s.budget!;
    return h('div', { class: 'bd' },
      h('div', { class: 'bd-r in' }, h('span', null, '收入（連伴侶、津貼）'), h('b', null, fmtMoney(b.income / 12))),
      b.items.map(([k, v]) => h('div', { class: 'bd-r' }, h('span', null, k), h('b', null, `−${fmtMoney(v / 12)}`))),
      h('div', { class: `bd-r tot ${b.cf >= 0 ? 'up' : 'dn'}` }, h('span', null, b.cf >= 0 ? '每月剩低' : '每月唔夠'), h('b', null, fmtMoney(Math.abs(b.cf) / 12))));
  }
  function renderMoney() {
    clear(moneyCard);
    const head = h('button', { class: 'card-h mh', type: 'button', 'aria-expanded': moneyOpen ? 'true' : 'false', onclick: () => { moneyOpen = !moneyOpen; renderMoney(); } },
      h('h3', null, '每月收支'), h('span', null, s.budget ? (moneyOpen ? '收起 ▴' : '睇明細 ▾') : ''));
    if (!s.budget) {
      const fi = Number(s.flags['familyIncome'] ?? 0);
      moneyCard.append(head, h('div', { class: 'mrow' },
        h('div', null, h('span', null, '屋企每月收入'), h('b', null, fi ? fmtMoney(fi) : '—')),
        h('div', null, h('span', null, s.age >= 6 ? '錢罌' : '你嘅使費'), h('b', null, s.age >= 6 ? fmtMoney(s.piggy) : '屋企人負責')),
        h('div', null, h('span', null, '負債'), h('b', null, debtOf() > 0 ? fmtMoney(debtOf()) : '$0'))),
        h('p', { class: 'mnote' }, '出嚟做嘢之後，呢度會顯示你每月嘅收入同使費。'));
      return;
    }
    const b = s.budget;
    const debt = debtOf();
    moneyCard.append(head, h('div', { class: 'mrow' },
      h('div', null, h('span', null, '每月收入'), h('b', null, fmtMoney(b.income / 12))),
      h('div', null, h('span', null, '每月使費'), h('b', null, fmtMoney(b.expense / 12))),
      h('div', null, h('span', null, b.cf >= 0 ? '每月剩低' : '每月唔夠'), h('b', { class: b.cf >= 0 ? 'up' : 'dn' }, fmtMoney(Math.abs(b.cf) / 12)))),
      h('div', { class: 'mrow sub' },
        h('div', null, h('span', null, '負債'), h('b', { class: debt > 0 ? 'dn' : '' }, fmtMoney(debt))),
        h('div', null, h('span', null, '按揭'), h('b', null, s.prop ? fmtMoney(s.prop.mortgage) : '$0')),
        h('div', null, h('span', null, '備用金夠用'), h('b', { class: s.fParts.m < 3 ? 'dn' : '' }, `${s.fParts.m.toFixed(1)} 個月`))),
      moneyOpen ? budgetRows() : '',
      b.cf < 0 ? h('p', { class: 'mnote dn' }, '入不敷支：會先用積蓄，唔夠就要碌卡或者借錢，利息好貴。') : '');
  }

  // ---------- 下面幾張資料卡（場景地點、身分紀錄、家人、人生地圖） ----------
  const HOUSE_ORIGIN: Record<string, string> = { 公屋: '公屋', 資助出售: '居屋', 私樓自置: '自置私樓', 私樓租住: '租住私樓', 劏房: '劏房', 村屋: '村屋', 跨境: '跨境', 保幼局院舍: '保幼局院舍', 寄養家庭: '寄養家庭' };
  const HOME_NAME: Record<string, string> = { parents: '同父母住', share: '合租', rent: '租樓', public: '公屋', subdiv: '劏房', own: '自置物業', village: '村屋', institution: '院舍' };
  const mapCells: number[] = [];
  function eduNow() { return s.age < 6 ? '學前' : s.status === 'study' && s.age < 12 ? '小學' : s.status === 'study' && s.age < 18 ? '中學' : EDU_NAME[s.edu] ?? '—'; }
  function renderSide() {
    const o = s.origin;
    // 而家住喺邊、同邊個住（v0.7）：未搬出屋企就用出世地區；搬咗就淨係講住屋類型
    const atFamily = atFamilyHome(s);
    const homeType = atFamily ? (s.age < 18 || s.home === 'parents' || !s.flags['adultHome'] ? HOUSE_ORIGIN[o.housing] ?? '屋企' : HOME_NAME[s.home]) : HOME_NAME[s.home] ?? s.home;
    const where = atFamily ? `${o.district}${o.subArea && o.subArea !== o.district ? o.subArea : ''}・${homeType}` : homeType;
    const mates: string[] = [];
    if (atFamily) for (const p of s.parents) if (p.alive) mates.push(p.role === '父' ? '爸爸' : '媽媽');
    if (sibsAtHome(s)) mates.push(s.siblings > 1 ? `${s.siblings} 個兄弟姊妹` : '兄弟姊妹');
    if (s.partner?.alive && (s.married || (s.home !== 'parents' && s.datingYears >= 3 && s.flags['cohabit']))) mates.push(s.partner.name);
    for (const k of s.kids) if (kidAtHome(k)) mates.push(k.name);
    if (s.support === 'live') for (const p of s.parents) if (p.alive && !atFamily) mates.push(p.role === '父' ? '爸爸' : '媽媽');
    for (const pt of s.pets ?? []) mates.push(`${pt.kind === 'cat' ? '貓' : '狗'}「${pt.name}」`);
    const withWho = s.home === 'institution' ? '院舍' : mates.length ? mates.join('、') : '自己一個';
    placeEl.textContent = `${where} · 同住：${withWho}`;
    const pc = h('canvas', { class: 'portrait-s', width: 24, height: 24, 'aria-hidden': 'true' });
    drawPortrait(pc.getContext('2d')!, s);
    const d = new Date(Date.UTC(o.birthYear, 0, o.birthDay));
    const work = s.job && s.status === 'work' ? `${jobName(g, s.job.id)}・${LEVEL_NAME[s.job.level] ?? ''}` : s.biz && s.status === 'biz' ? `${bizName(g, s.biz.id)}老闆` : ({ child: '—', study: '讀緊書', work: '返工', unemp: '待業', retired: '已退休', biz: '做生意' } as Record<string, string>)[s.status];
    clear(idCard).append(
      h('div', { class: 'id-h' }, h('span', null, '身分紀錄 · HKG'), h('span', null, String(o.birthYear))),
      h('div', { class: 'id-b' }, pc, h('div', { class: 'id-t' }, h('b', { class: 'id-n' }, s.name),
        h('dl', { class: 'facts tight' },
          h('dt', null, '性別'), h('dd', null, o.gender === 'M' ? '男' : '女'),
          h('dt', null, '出生'), h('dd', null, `${o.birthYear}年${d.getUTCMonth() + 1}月 · ${o.district}`),
          h('dt', null, '出身'), h('dd', null, WEALTH_DOTS(o.wealthTier)),
          h('dt', null, '學歷'), h('dd', null, eduNow()),
          h('dt', null, '工作'), h('dd', null, work),
          h('dt', null, '住喺'), h('dd', null, where),
          h('dt', null, '同住'), h('dd', null, withWho)))));
    const rows: [string, string, string?][] = [];
    for (const p of s.parents) rows.push([p.role === '父' ? '爸爸' : '媽媽', p.alive ? `${p.age}歲` : '已離世', p.alive ? (p.role === '父' ? o.father : o.mother)?.job : undefined]);
    if (!s.parents.length) rows.push(['照顧者', o.isBaoyou ? '保幼局' : '—']);
    rows.push(['兄弟姊妹', o.siblings ? `${o.siblings} 個` : '冇']);
    if (s.partner && s.partner.alive) rows.push([s.married ? '伴侶' : '拍拖', `${s.partner.name} ${s.partner.age}歲`, s.partner.job || undefined]);
    for (const k of s.kids) rows.push([k.sex === 'F' ? '女' : k.sex === 'M' ? '仔' : '子女', `${k.name} ${k.age}歲`]);
    clear(famCard).append(h('div', { class: 'card-h' }, h('h3', null, '家人與生活')),
      h('div', { class: 'fam-rows' }, rows.map(([a, b, c]) => h('div', { class: 'fr' }, h('span', null, a), h('b', null, b, c ? h('small', null, c) : null)))));
    // 人生地圖：每年一格，用嗰年嘅快樂值上色
    while (mapCells.length < s.age) mapCells.push(mapCells.length ? mapCells[mapCells.length - 1] : s.J);
    mapCells[s.age] = s.J;
    const total = Math.max(80, Math.ceil((s.age + 1) / 10) * 10);
    clear(mapGrid).append(...Array.from({ length: total }, (_, i) => {
      const v = mapCells[i];
      const lv = v === undefined ? '' : v >= 70 ? 'l4' : v >= 55 ? 'l3' : v >= 40 ? 'l2' : v >= 25 ? 'l1' : 'l0';
      return h('span', { class: `${lv} ${i === s.age ? 'cur' : ''}`, title: v === undefined ? `${i} 歲` : `${i} 歲：快樂 ${Math.round(v)}` });
    }));
  }
  const WEALTH_DOTS = (t: string) => { const n = ({ 困難: 1, 基層: 2, 小康: 3, 中產: 4, 富裕: 5 } as Record<string, number>)[t] ?? 2; return `${'●'.repeat(n)}${'○'.repeat(5 - n)} ${t}`; };

  function fDetail() {
    const fp = s.fParts;
    const lines = s.age < 18 && !s.everEmployed
      ? [`屋企積蓄夠用大約 ${fp.m.toFixed(1)} 個月`]
      : [`緊急備用金 ${fp.m.toFixed(1)} 個月`, s.status === 'retired' ? `退休錢預計用到 ${fp.untilAge} 歲` : `退休儲蓄達標 ${Math.round(Math.min(fp.r, 9.99) * 100)}%`, `保障缺口 ${Math.round(fp.gap)}%`];
    toast(lines.join('；'), 'info', 4000);
  }

  // ---------- 時間線（新嘅喺上面） ----------
  function addYear(age: number, year: number, rows: { t: string; k: 'imp' | 'log' | 'tick' | 'sum' | 'par' }[]) {
    feed.prepend(h('div', { class: 'yr' }, h('div', { class: 'yh' }, h('b', null, `${age}歲`), h('span', null, String(year))), h('ul', null, rows.map((r) => h('li', { class: r.k }, r.t)))));
    while (feed.children.length > 40) feed.lastElementChild!.remove();
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
  // 投資同強積金只喺「理財」度改，下面唔再長期顯示
  function renderQuick() { /* 保留介面：v0.4 起下面冇快捷面板 */ }

  // ---------- 底部抽屜（焦點 / 理財 / 花錢 / 資料） ----------
  type Tab = 'focus' | 'spend' | 'money' | 'profile';
  let tab: Tab = 'focus';
  const TAB_NAME: Record<Tab, string> = { focus: '人生焦點', money: '理財', spend: '每年花錢', profile: '人生資料' };
  function renderSheet() {
    sheetTitle.textContent = TAB_NAME[tab];
    sheetOk.hidden = !(tab === 'focus' && pendFocus && pendFocus !== s.focus);
    clear(sheetBody).append(tab === 'focus' ? focusPanel() : tab === 'spend' ? spendPanel() : tab === 'money' ? moneyPanel() : profilePanel());
  }
  function openSheet(t: Tab) {
    tab = t; pendFocus = null; pendBiz = null; renderSheet();
    sheet.classList.add('open'); shade.classList.add('on');
    paused.add('sheet'); renderTop();
  }
  function closeSheet() {
    pendFocus = null; pendBiz = null;
    sheet.classList.remove('open'); shade.classList.remove('on');
    paused.delete('sheet'); renderTop(); renderQuick(); nudge();
  }

  const fxText = (fx: Partial<Record<StatKey, number>>) => (Object.keys(fx) as StatKey[]).filter((k) => fx[k]).map((k) => `${STAT_NAME[k]} ${fx[k]! > 0 ? '+' : ''}${fx[k]}`).join('、');
  function focusPanel(): HTMLElement {
    if (s.age < 6) return h('p', { class: 'muted' }, '仲細，未有得揀。6 歲入學之後就可以揀每年嘅人生焦點。');
    return h('div', { class: 'list' },
      h('p', { class: 'hint' }, `而家：${s.focus ?? '未揀'}。揀一個新焦點，再撳多一次（或者撳上面「確認」），下一年開始生效。`),
      focusList(g).map((f) => h('button', { class: `opt-card ${(pendFocus ?? s.focus) === f.id ? 'on' : ''}`, type: 'button', onclick: () => { if (pendFocus === f.id) { sheetOk.click(); return; } pendFocus = f.id; renderSheet(); } },
        h('b', null, f.id, s.focus === f.id ? h('small', { class: 'now' }, '而家') : null), h('span', { class: 'fx' }, fxText(f.fx)), h('span', { class: 'muted' }, f.desc))));
  }
  function spendPanel(): HTMLElement {
    if (s.age < 15) {
      return h('div', { class: 'list' }, h('p', null, `錢罌有 ${fmtMoney(s.piggy)}。利是錢點處理？`),
        seg(['全部儲起', '儲一半', '使晒佢'], s.piggyMode, (i) => { s.piggyMode = i as 0 | 1 | 2; }),
        h('p', { class: 'muted' }, '15 歲起可以用花錢面板。'));
    }
    const avail = PANEL.filter((p) => s.age >= p.minAge && (s.age >= 18 || p.teen));
    const box = h('div', { class: 'list' });
    if (s.age >= 18) {
      // 想買樓：之後兩年每年都會出現買樓選項
      const want = Number(s.flags['wantHomeUntil'] ?? 0) >= s.age;
      box.append(h('h4', null, '買樓'),
        s.prop ? h('p', { class: 'hint' }, `你已經有物業，欠按揭 ${fmtMoney(s.prop.mortgage)}。`)
          : s.saveForHome ? h('p', { class: 'hint' }, '你喺「儲首期模式」，夠錢就會自動買。')
          : h('button', { class: `opt-card ${want ? 'on' : ''}`, type: 'button', onclick: () => {
            if (want) delete s.flags['wantHomeUntil']; else s.flags['wantHomeUntil'] = s.age + 2;
            renderSheet();
          } }, h('b', null, want ? '✓ 想買樓（撳一下取消）' : '我想買樓'), h('span', { class: 'muted' }, want ? `未來兩年（去到 ${Number(s.flags['wantHomeUntil'])} 歲）每年都會有買樓選項。` : `上車盤大約要首期 3 成。揀咗之後，未來兩年每年都會出現買樓選項。${s.status !== 'work' ? '冇穩定收入，銀行未必批按揭。' : ''}`)));
      // 創業：撳一下揀，再撳一下確認
      box.append(h('h4', null, '創業'));
      if (s.biz) {
        const b = s.biz;
        box.append(h('p', { class: 'hint' }, `你做緊${bizName(g, b.id)}老闆，第 ${b.years + 1} 年。${b.years ? `上年${b.lastProfit >= 0 ? `賺咗 ${fmtMoney(b.lastProfit)}` : `蝕咗 ${fmtMoney(-b.lastProfit)}`}。` : ''}${b.loan > 0 ? `仲欠銀行 ${fmtMoney(b.loan)}。` : ''}`),
          h('button', { class: `opt-card ${pendBiz === 'close' ? 'on' : ''}`, type: 'button', onclick: () => {
            if (pendBiz !== 'close') { pendBiz = 'close'; renderSheet(); return; }
            pendBiz = null;
            toast(closeBiz(g, '你決定結束生意，'), 'info', 4000);
            renderSheet(); renderStats(); renderTop();
          } }, h('b', null, pendBiz === 'close' ? '再撳一下確認結業' : '結束生意'), h('span', { class: 'muted' }, '生財工具大約賣返一成本錢，未還嘅銀行貸款要自己還。')));
      } else {
        box.append(h('p', { class: 'hint' }, '自己出最少三成本錢，其餘問銀行借（年息 7%，五年還）。開咗之後唔再打工。'));
        for (const d of BIZ) {
          const why = bizBlock(g, d);
          const on = pendBiz === d.id;
          box.append(h('button', { class: `opt-card ${on ? 'on' : ''}`, type: 'button', disabled: !!why, onclick: () => {
            if (!on) { pendBiz = d.id; renderSheet(); return; }
            pendBiz = null;
            toast(startBiz(g, d.id), 'info', 4000);
            renderSheet(); renderStats(); renderTop();
          } }, h('b', null, on ? `再撳一下確認開${bizName(g, d.id)}` : bizName(g, d.id)), h('span', { class: 'muted' }, why ?? `本錢約 ${fmtMoney(g.p(d.cap))}`)));
        }
      }
      // 寵物：可以養多過一隻
      box.append(h('h4', null, `寵物（每年合共 ${fmtMoney(petCostYear(g))}）`),
        s.pets.length ? h('div', { class: 'pets' }, s.pets.map((p) => h('span', { class: 'pet' }, `${p.kind === 'cat' ? '🐱' : '🐶'} ${p.name}・${p.age} 歲`))) : h('p', { class: 'hint' }, '未有養寵物。'),
        h('div', { class: 'row2' }, (['cat', 'dog'] as const).map((k) => {
          const why = petBlock(g, k);
          return h('button', { class: 'opt-card', type: 'button', disabled: !!why, onclick: () => { toast(adoptPet(g, k), 'info', 4000); renderSheet(); renderStats(); } },
            h('b', null, k === 'cat' ? '🐱 養一隻貓' : '🐶 養一隻狗'),
            h('span', { class: 'muted' }, why ?? `開始約 ${fmtMoney(g.p(PET_INFO[k].once))}，之後每年約 ${fmtMoney(g.p(PET_INFO[k].year))}`));
        })),
        h('p', { class: 'fine' }, '費用參考 MoneyHero 2024 香港養寵物開支：每年約 $9,700–27,900（糧食、貓砂、針、身體檢查、美容）。'));
      box.append(h('h4', null, '興趣同消遣'));
    }
    box.append(h('p', { class: 'hint' }, `每年最多揀 5 項，會每年照做，直到你取消。已揀 ${s.panel.length} / 5`));
    for (const p of avail) {
      const on = s.panel.includes(p.id);
      const cost = p.cost(g);
      const full = !on && s.panel.length >= 5;
      box.append(h('label', { class: `spend ${on ? 'on' : ''} ${full ? 'dis' : ''}` },
        h('input', { type: 'checkbox', id: `sp-${p.id}`, checked: on, disabled: full, onchange: () => {
          if (on) s.panel = s.panel.filter((x) => x !== p.id); else if (s.panel.length < 5) s.panel = [...s.panel, p.id];
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
      s.budget ? [h('h4', null, '每月收支（上年）'), budgetRows()] : null,
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
    // v1.0：買樓收租（可以多過一層）
    box.append(h('h4', null, '買樓收租'));
    (s.rentals ?? []).forEach((r, i) => {
      const key = `sell${i}`;
      const on = pendBiz === key;
      box.append(h('button', { class: `opt-card ${on ? 'on' : ''}`, type: 'button', onclick: () => {
        if (!on) { pendBiz = key; renderSheet(); return; }
        pendBiz = null;
        toast(sellRental(g, i), 'info', 4000);
        renderSheet(); renderStats(); renderTop();
      } }, h('b', null, on ? '再撳一下確認賣樓' : `收租樓 ${i + 1}（${r.boughtYear} 年買）`),
      h('span', { class: 'muted' }, `市值 ${fmtMoney(rentalValue(g, r))}・欠按揭 ${fmtMoney(r.mortgage)}・月租約 ${fmtMoney(rentalMonthlyRent(g, r))}・月供 ${fmtMoney(r.pmt)}`)));
    });
    {
      const q = rentalQuote(g);
      const on = pendBiz === 'buyRental';
      box.append(h('button', { class: `opt-card ${on ? 'on' : ''}`, type: 'button', disabled: !!q.why, onclick: () => {
        if (!on) { pendBiz = 'buyRental'; renderSheet(); return; }
        pendBiz = null;
        toast(buyRental(g), 'info', 4000);
        renderSheet(); renderStats(); renderTop();
      } }, h('b', null, on ? '再撳一下確認買樓' : `買一層收租樓（${fmtMoney(q.price)}）`),
      h('span', { class: 'muted' }, q.why ?? `首期連印花稅約 ${fmtMoney(q.upfront)}・按揭五成・月供約 ${fmtMoney(q.pmt)}・預計月租 ${fmtMoney(q.rent)}`)));
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
    else if (s.biz && s.status === 'biz') rows.push(['工作', `${bizName(g, s.biz.id)}老闆・第 ${s.biz.years + 1} 年${s.biz.loan > 0 ? `・欠銀行 ${fmtMoney(s.biz.loan)}` : ''}`]);
    else rows.push(['工作', { child: '細路', study: '讀緊書', work: '返工', unemp: '待業', retired: '已退休', biz: '做生意' }[s.status]]);
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
      if (s.rentals?.length) rows.push(['收租樓', `${s.rentals.length} 層・市值 ${fmtMoney(s.rentals.reduce((a, r) => a + rentalValue(g, r), 0))}・欠按揭 ${fmtMoney(s.rentals.reduce((a, r) => a + r.mortgage, 0))}`]);
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
    dock.hidden = false;
    dock.scrollTop = 0;
    main.scrollTo({ top: 0, behavior: 'smooth' });
    dock.classList.add('busy');
  }
  function hideEvent() {
    paused.delete('card');
    clear(event); dock.hidden = true;
    dock.classList.remove('busy');
    renderQuick();
  }


  function cardEvent(c: Card): Promise<void> {
    return new Promise((done) => {
      const tag = c.cat ?? (c.kind === 'system' ? '人生抉擇' : '生活日常');
      const opts = h('div', { class: 'copts' });
      const body = h('div', { class: `ecard ${tag === '天馬行空' ? 'wonder' : ''}` },
        h('div', { class: 'ctop' }, h('span', { class: `tag ${CAT_CLASS[tag] ?? ''}` }, tag), h('span', { class: 'muted' }, `${s.age}歲 · ${s.year}年`)),
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
        // 揀完即刻繼續，結果用通知顯示，同時記入人生紀錄
        const d = c.resultDeltas;
        const fx: Chip[] = d ? (['H', 'J', 'K', 'R'] as StatKey[]).filter((k) => Math.round(d[k])).map((k) => ({ t: `${STAT_NAME[k]} ${d[k] > 0 ? '+' : ''}${Math.round(d[k])}`, up: d[k] > 0 })) : [];
        if (Math.abs(money) >= 1000) fx.push({ t: `錢 ${money > 0 ? '+' : '−'}${fmtMoney(Math.abs(money))}`, up: money > 0 });
        toast(`「${c.options[i]?.label ?? ''}」${text ? ` ${text}` : ''}`, 'result', settings.speed >= 8 ? 2200 : 3600, fx);
        if (Math.abs(money) >= 1000) flashCash(money > 0);
        renderStats();
        finish();
      };
      const finish = () => { keyEnter = null; hideEvent(); done(); };
      c.options.forEach((o, i) => {
        const off = !!o.disabled && !(allOff && i === c.def);
        const fx = o.fx ? (Object.keys(o.fx) as StatKey[]).filter((k) => o.fx![k]).map((k) => h('i', { class: o.fx![k]! > 0 ? 'up' : 'dn' }, `${o.fx![k]! > 0 ? '▲' : '▼'}${STAT_NAME[k]}`)) : [];
        opts.append(h('button', { class: 'copt', type: 'button', disabled: off, onclick: () => pick(i) },
          h('span', { class: 'cn' }, String(i + 1)),
          h('span', { class: 'ol' }, o.label, o.note ? h('small', null, o.note) : null, o.disabled ? h('small', { class: 'why' }, o.disabled) : null),
          fx.length ? h('span', { class: 'ofx' }, fx) : null));
      });
      keyPick = pick;
    });
  }

  /** 突擊測驗 / 公開試：每題 10 秒；答完顯示答案，撳任何位置或 1 秒後自動下一題 */
  // 第二局起可以自動答題：按學識擲骰，唔會拎答題成就
  function autoQuiz(c: Card) {
    s.flags['autoQuiz'] = true;
    const text = g.choose(c, 0);
    toast(`${c.kind === 'exam' ? '公開試放榜（自動作答）' : '測驗完（自動作答）'}：${text}`, 'result', c.kind === 'exam' ? 5000 : 2600);
    renderStats();
  }

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
          h('div', { class: 'qstart' },
            h('button', { class: 'btn', type: 'button', onclick: () => ask(0) }, c.options[0]?.label ?? '開始'),
            store.runs() >= 1 ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { keyEnter = null; autoQuiz(c); fin(); } }, '自動作答') : null));
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
        toast(`${exam ? '公開試放榜' : '測驗完'}：${text}`, 'info', exam ? 5000 : 3000);
        renderStats();
        fin();
      };
      const fin = () => { keyEnter = null; hideEvent(); done(); };
      intro();
    });
  }

  function focusPrompt(): Promise<void> {
    return new Promise((done) => {
      const title = s.focusStage === 'student' ? '入學喇！揀你嘅人生焦點' : s.focusStage === 'work' ? '出嚟做嘢，揀新嘅人生焦點' : '退休喇，揀新嘅人生焦點';
      const list = focusList(g).slice(0, 4);
      let pick: string | null = null;
      const ok = h('button', { class: 'btn small', type: 'button', hidden: true, onclick: () => { if (!pick) return; s.focus = pick; keyEnter = null; keyPick = null; hideEvent(); renderTop(); done(); } }, '確認');
      const choose = (id: string) => { if (pick === id) { ok.click(); return; } pick = id; ok.hidden = false; box.querySelectorAll('.copt').forEach((b, j) => b.classList.toggle('sel', list[j].id === id)); keyEnter = () => ok.click(); };
      keyPick = (n) => { if (list[n]) choose(list[n].id); };
      const box = h('div', { class: 'ecard' },
        h('div', { class: 'ctop' }, h('span', { class: 'tag c-yellow' }, '人生焦點'), ok),
        h('h3', null, title),
        h('p', { class: 'muted' }, '揀一個，再撳多一次（或者撳上面「確認」）。之後隨時可以喺底部「焦點」改，嗰度仲有其他選擇。'),
        h('div', { class: 'copts' }, list.map((f, i) => h('button', { class: 'copt', type: 'button', onclick: () => choose(f.id) },
          h('span', { class: 'cn' }, String(i + 1)),
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
  function setSpeed(v: Settings['speed']) {
    settings.speed = v;
    store.saveSettings(settings);
    renderTop(); nudge();
  }
  const cycleSpeed = () => setSpeed(SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length]);
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
    if ((c.kind === 'quiz' || c.kind === 'exam') && settings.autoQuiz) { autoQuiz(c); return; }
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
    const rows: { t: string; k: 'imp' | 'log' | 'tick' | 'sum' | 'par' }[] = [];
    const seen = new Set<string>();
    for (const l of s.log) if (l.age === s.age && !seen.has(l.text)) { seen.add(l.text); rows.push({ t: l.text, k: l.big ? 'imp' : 'log' }); }
    for (const t of g.ticker) if (!seen.has(t)) { seen.add(t); rows.push({ t, k: 'tick' }); }
    // 「返到 10 年前」之後，平行人生嘅新聞唔再重播
    const par = g.parallel && s.year > parSeen ? parallelNewsFor(g.parallel, s.year, g.parMinor) : [];
    parSeen = Math.max(parSeen, s.year);
    for (const n of par) rows.push({ t: n.text, k: 'par' });
    if (end.summary) rows.push({ t: end.summary, k: 'sum' });
    addYear(s.age, s.year, rows);
    renderStats(); renderTop(); renderQuick();
    s.achNew.forEach((id, i) => setTimeout(() => achToast(id), i * 1100));
    s.achNew = [];
    const bigPar = par.filter((n) => n.key);
    if (bigPar.length && !end.dead) toast(bigPar.map((n) => n.text.replace('【平行人生】', '')).join('；'), 'info', 3000);
    if (end.dead) {
      ended = true;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      await sleep(1200);
      onEnd(g);
    }
  }

  let parSeen = -1;
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
