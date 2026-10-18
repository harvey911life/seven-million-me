// 七百萬分之我：入口（標題 → 免責 → 設定 → 出身卡（可重洗）→ 人生 → 結局）
import './ui/style.css';
import { Game } from './engine/game';
import { PERIODS, type ParentInfo } from './engine/origin';
import { WEALTH_LABEL } from './data/origin';
import { ACHIEVEMENTS } from './engine/achievements';
import { h, clear } from './ui/dom';
import { drawTitle, drawScene, SW, SH } from './ui/scene';
import { store, type Settings } from './ui/store';
import { playGame } from './ui/play';
import { simulateParallel } from './engine/parallel';
import { showEnding, boardTable, booking, placeOf, achGrid } from './ui/ending';

const root = document.getElementById('app')!;
let settings: Settings = store.settings();
let titleAnim = 0;

const PERIOD_NOTE: Record<string, string> = {
  隨機時段: '1975–2015 年隨機', 七十年代尾: '1975–1979，經歷工業轉型同股災', 八十年代: '1980–1989，九七前後出嚟做嘢',
  九十年代: '1990–1999，金融海嘯時啱啱畢業', 千禧年代: '2000–2015，口罩年代讀書', 新生代: '2016–2025，AI 年代長大', 未來世代: '2026–2040，未知嘅未來',
};

function newSeed(): number {
  try { return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1; } catch { return Math.floor(Math.random() * 2 ** 31); }
}

// ---------- 右下角主頁按鈕（遊戲以外嘅畫面；遊戲內喺導航列） ----------
const homeFab = h('button', { class: 'home-fab', type: 'button', 'aria-label': '返回主頁', onclick: () => title() }, h('span', { 'aria-hidden': 'true' }, '⌂'), '主頁');
function fab(show: boolean) {
  if (show) { if (!homeFab.isConnected) document.body.append(homeFab); } else homeFab.remove();
}

// ---------- 標題 ----------
function title() {
  cancelAnimationFrame(titleAnim);
  fab(false);
  const cv = h('canvas', { class: 'title-scene', width: SW, height: SH, 'aria-hidden': 'true' });
  const c = cv.getContext('2d')!;
  const hr = new Date().getHours();
  const day = hr >= 6 && hr < 18;
  let t = 0, last = 0;
  const loop = (ts: number) => { if (!cv.isConnected && t) return; if (ts - last > 120) { last = ts; t++; drawTitle(c, t, day); } titleAnim = requestAnimationFrame(loop); };
  titleAnim = requestAnimationFrame(loop);
  const runs = store.runs();
  clear(root).append(h('div', { class: 'screen title' },
    cv,
    h('div', { class: 'title-box' },
      h('p', { class: 'ver' }, 'v0.5 試玩版 · 免費香港人生模擬'),
      h('h1', { class: 'logo' }, '七百萬', h('br'), '分之', h('em', null, '我')),
      h('p', { class: 'tagline' }, '香港七百幾萬人，你係其中一個。喺邊區出世、做邊個嘅仔女，都揀唔到；之後點過，就睇你點揀。'),
      h('div', { class: 'counts' },
        h('div', null, h('b', null, String(runs)), h('span', null, '你投胎過嘅次數')),
        h('div', null, h('b', null, String(new Set(store.achs()).size)), h('span', null, '已解鎖成就'))),
      h('button', { class: 'btn big', type: 'button', onclick: () => { cancelAnimationFrame(titleAnim); disclaimer(); } }, '出生'),
      runs ? h('p', { class: 'muted small' }, '已解鎖：揀出生時段、自動揀') : null,
      h('div', { class: 'title-row' },
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => boardScreen() }, '排行榜'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => achScreen() }, '成就'),
        h('button', { class: 'btn outline small', type: 'button', onclick: () => booking(root) }, '點擊查詢更多'))),
    h('footer', { class: 'title-foot' }, h('span', null, '同一個起點，有冇規劃，結局差好遠。'),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => fullDisclaimer() }, '免責聲明'))));
}

// ---------- 詳細免責聲明（首頁底部） ----------
const DISCLAIMER: [string, string][] = [
  ['純屬模擬', '「七百萬分之我」是一個人生模擬遊戲，只供娛樂及理財教育用途。遊戲中的人物、家庭、事件同結局全部由程式隨機產生，與任何真實人物無關，如有雷同，純屬巧合。'],
  ['不構成任何建議', '遊戲內所有內容，包括投資、強積金、儲蓄、保障、買樓、借貸同消費的結果，均不構成任何投資、保險、財務、稅務、法律或醫療建議。現實決定請按自己情況，向持牌專業人士查詢。內容為模擬，不構成投資建議。'],
  ['數字與機率', '收入、開支、樓價、回報、疾病同壽命等數字，參考香港公開統計及網上資料作粗略估算，並經大幅簡化，未必反映最新或真實情況。投資回報按歷史大概範圍隨機產生，過往表現不代表將來；遊戲不會刻意調高或調低任何虧損機率。'],
  ['名稱純屬虛構', '遊戲中的機構、彩票、建築同活動名稱（例如六星彩、保幼局、公開試）均為虛構或改編，並非指任何真實機構或產品。本遊戲不提及、亦不推介任何保險公司或金融產品。'],
  ['敏感內容', '遊戲內容涉及疾病、意外、失業、離婚同死亡等情節，建議 15 歲或以上人士遊玩。如果你感到困擾或有情緒需要，可致電 18111「情緒通」精神健康支援熱線（24 小時）。'],
  ['私隱', '遊戲不設登入，不會收集或上傳任何個人資料。成績、成就同設定只儲存在你自己部機的瀏覽器入面，清除瀏覽器資料就會刪除。排行榜暱稱亦只會留喺你部機。'],
  ['查詢', '遊戲入面「點擊查詢更多」只會顯示 IG 專頁同聯絡電話，係咪聯絡由你自己決定。'],
  ['靈感來源', '玩法概念受 1in8b.life 啟發，內容、程式同美術均為本遊戲自行製作，與原作並無關連。'],
];
function fullDisclaimer() {
  const wrap = h('div', { class: 'mwrap in' });
  const close = () => wrap.remove();
  wrap.append(h('div', { class: 'modal disc', role: 'dialog', 'aria-modal': 'true', 'aria-label': '免責聲明' },
    h('button', { class: 'mx', type: 'button', 'aria-label': '關閉', onclick: close }, '✕'),
    h('h3', { class: 'ctitle' }, '免責聲明'),
    DISCLAIMER.map(([t, d]) => h('section', null, h('h4', null, t), h('p', null, d))),
    h('button', { class: 'btn', type: 'button', onclick: close }, '明白')));
  wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });
  root.append(wrap);
}

function boardScreen() {
  fab(true);
  clear(root).append(h('div', { class: 'screen sub' }, h('h2', null, '排行榜（呢部機）'), boardTable(),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => title() }, '返回')));
}
function achScreen() {
  fab(true);
  const got = new Set(store.achs());
  clear(root).append(h('div', { class: 'screen sub' }, h('h2', null, `成就 ${ACHIEVEMENTS.filter((a) => got.has(a.id)).length} / ${ACHIEVEMENTS.length}`),
    achGrid(got),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => title() }, '返回')));
}

// ---------- 免責聲明 ----------
function disclaimer() {
  fab(true);
  const ok = h('button', { class: 'btn big', type: 'button', disabled: true, onclick: () => setup() }, '我明白');
  clear(root).append(h('div', { class: 'screen center-card' }, h('div', { class: 'paper' },
    h('h2', null, '開始之前'),
    h('p', null, '「七百萬分之我」是一個模擬遊戲，只供娛樂及理財教育用途，不構成任何保險、投資或財務建議。遊戲內容涉及疾病、意外及死亡，建議 15 歲或以上人士遊玩。'),
    ok)));
  setTimeout(() => { ok.disabled = false; ok.focus(); }, 800);
}

// ---------- 設定 ----------
function setup() {
  fab(true);
  const second = store.runs() >= 1;
  const speedSeg = h('div', { class: 'seg' }, ([1, 2, 4, 8, 16] as const).map((v) => h('button', {
    type: 'button', class: settings.speed === v ? 'on' : '', onclick: (e: Event) => {
      settings.speed = v;
      (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === `${v}×`));
    },
  }, `${v}×`)));
  const autoBox = h('input', { type: 'checkbox', id: 'autopick', checked: settings.autoPick });
  const periodSel = h('div', { class: 'periods' }, Object.keys(PERIODS).map((p) => h('button', {
    type: 'button', class: `period ${settings.period === p ? 'on' : ''}`, onclick: (e: Event) => {
      settings.period = p;
      periodSel.querySelectorAll('.period').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    },
  }, h('b', null, p), h('span', null, PERIOD_NOTE[p] ?? ''))));
  const next = h('button', { class: 'btn', type: 'button', onclick: () => {
    settings.autoPick = second && autoBox.checked;
    if (!second) settings.period = '隨機時段';
    store.saveSettings(settings);
    const period = settings.period === '隨機時段' ? null : settings.period;
    originCard(new Game(newSeed(), period), period);
  } }, '下一步 ›');
  clear(root).append(h('div', { class: 'screen center-card' }, h('div', { class: 'paper' },
    h('div', { class: 'setup-head' }, h('h2', null, '投胎設定'), next),
    h('p', { class: 'muted' }, '名字會喺出世嗰刻隨機抽，屋企人改嘅，你揀唔到。'),
    h('h4', null, '速度'), speedSeg,
    h('p', { class: 'muted small' }, '1× 大約 45 秒一年，等候期間可以調整投資同強積金，亦可以撳「下一年」直接跳。遊戲中隨時可以改速度。'),
    second ? [
      h('h4', null, '出生時段'), periodSel,
      h('label', { class: 'check' }, autoBox, h('span', null, '自動揀：系統幫你揀人生抉擇，測驗同公開試仍然要自己答。')),
    ] : h('p', { class: 'muted small' }, '玩完第一局會解鎖「揀出生時段」同「自動揀」。'))));
}

function dateOf(year: number, day: number) {
  const d = new Date(Date.UTC(year, 0, day));
  return `${year} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
}
function parentText(p?: ParentInfo) {
  if (!p) return '—';
  if (p.status === '工作') return p.job ?? '有返工';
  return p.status;
}
function originLine(g: Game) {
  const o = g.s.origin;
  const place = placeOf(g);
  if (o.isBaoyou) {
    if (o.baoyouBranch === '寄養家庭') return `你出世之後由保幼局安排，住喺${o.district}一個寄養家庭。`;
    if (o.baoyouBranch === '被領養') return '你出世之後被送到保幼局，喺院舍度過最初嘅日子。';
    return `你出世之後被送到${o.district}嘅保幼局。今日起，院舍嘅姑娘同其他小朋友就係你嘅家人。`;
  }
  if (o.family === '雙非') return `你喺香港出世，屋企喺深圳，之後每日過關去${o.district}返學。`;
  if (o.family === '三代同堂') return `你喺${place}出世，同爸爸媽媽、爺爺嫲嫲一齊住。`;
  if (o.family === '隔代照顧') return `你喺${place}出世，主要由爺爺嫲嫲湊大。`;
  return `你喺${place}出世，屋企係${o.family ?? '普通家庭'}。`;
}

function originCard(g: Game, period: string | null) {
  fab(true);
  const s = g.s;
  const o = s.origin;
  const stamps: string[] = [];
  const pro = (c?: string) => c === '經理及行政級' || c === '專業人員';
  if (pro(o.father?.cat) && pro(o.mother?.cat)) stamps.push('含住金鎖匙');
  if (o.isBaoyou) stamps.push('保幼局');
  if (o.birthYear === 1997) stamps.push('九七一代');
  const stat = (k: 'H' | 'J' | 'K' | 'R', n: string) => h('div', { class: `ostat s-${k}` }, h('span', null, n), h('span', { class: 'bar' }, h('span', { style: `width:${Math.round(s[k])}%` })), h('b', null, String(Math.round(s[k]))));
  const sib = o.siblings ? `${o.siblings} 個（排第 ${o.birthOrder}）` : '獨生';
  const tile = (label: string, val: string, cls = '') => h('div', { class: `otile ${cls}` }, h('span', null, label), h('b', null, val));
  const cv = h('canvas', { class: 'oscene', width: SW, height: SH, 'aria-hidden': 'true' });
  drawScene(cv.getContext('2d')!, s, 0);
  const regNo = `No. HKG-${o.birthYear}-${String(s.seed % 10000000).padStart(7, '0')}`;
  clear(root).append(h('div', { class: 'screen center-card' }, h('div', { class: 'paper origin' },
    h('div', { class: 'reg-h' }, h('span', null, '出生登記'), h('small', null, regNo)),
    h('div', { class: 'reg-b' },
      h('div', { class: 'o-name' }, h('span', null, '名字'), h('h2', null, s.name)),
      h('p', { class: 'lead' }, `${dateOf(o.birthYear, o.birthDay)}，${originLine(g)}`),
      stamps.length ? h('div', { class: 'stamps' }, stamps.map((t) => h('span', { class: 'stamp' }, t))) : null,
      cv,
      h('div', { class: 'otiles' },
        tile('性別', o.gender === 'M' ? '男' : '女'), tile('出生年份', `${o.birthYear} 年`), tile('地區', `${o.district}`),
        tile('住屋', o.housing), tile('家庭', o.family ?? (o.isBaoyou ? '保幼局' : '—')), tile('兄弟姊妹', sib),
        !o.isBaoyou ? [tile('父親', parentText(o.father)), tile('母親', parentText(o.mother))] : null,
        tile('家庭財務', WEALTH_LABEL[o.wealthTier])),
      h('div', { class: 'ostats' }, stat('H', '健康'), stat('J', '快樂'), stat('K', '知識'), stat('R', '人際')),
      h('div', { class: 'row2' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => originCard(new Game(newSeed(), period), period) }, '重洗'),
        h('button', { class: 'btn', type: 'button', onclick: () => start(g, period) }, '開始這一生'))))));
}

function start(g: Game, period: string | null) {
  fab(false);
  // 平行人生：等畫面出咗先喺背景行（約 0.1 秒），玩家 18 歲前一定行完
  setTimeout(() => { g.parallel = simulateParallel(g, period); }, 300);
  playGame(root, g, settings, (gg) => { fab(true); showEnding(root, gg, period, () => { settings = store.settings(); disclaimer(); }); }, () => title());
}

title();
