// 七百萬分之我：入口（標題 → 免責 → 設定 → 出身抽籤 → 出身卡 → 人生 → 結局）
import './ui/style.css';
import { Game } from './engine/game';
import { PERIODS, type ParentInfo } from './engine/origin';
import { WEALTH_LABEL } from './data/origin';
import { ACHIEVEMENTS } from './engine/achievements';
import { h, clear, sleep, reduceMotion } from './ui/dom';
import { drawTitle, SW, SH } from './ui/scene';
import { store, type Settings } from './ui/store';
import { playGame } from './ui/play';
import { showEnding, boardTable, booking, placeOf } from './ui/ending';

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

// ---------- 標題 ----------
function title() {
  cancelAnimationFrame(titleAnim);
  const cv = h('canvas', { class: 'title-scene', width: SW, height: SH, 'aria-hidden': 'true' });
  const c = cv.getContext('2d')!;
  const hr = new Date().getHours();
  const day = hr >= 6 && hr < 18;
  let t = 0, last = 0;
  const loop = (ts: number) => { if (ts - last > 120) { last = ts; t++; drawTitle(c, t, day); } titleAnim = requestAnimationFrame(loop); };
  titleAnim = requestAnimationFrame(loop);
  const runs = store.runs();
  clear(root).append(h('div', { class: 'screen title' },
    cv,
    h('div', { class: 'title-box' },
      h('h1', { class: 'logo' }, '七百萬分之我'),
      h('p', { class: 'tagline' }, '同一個起點，有冇規劃，結局差好遠。'),
      h('button', { class: 'primary big', type: 'button', onclick: () => { cancelAnimationFrame(titleAnim); disclaimer(); } }, '開始人生'),
      runs ? h('p', { class: 'muted small' }, `已經投胎 ${runs} 次${runs >= 1 ? '・已解鎖：揀出生時段、自動揀' : ''}`) : null,
      h('div', { class: 'title-row' },
        h('button', { class: 'ghost', type: 'button', onclick: () => boardScreen() }, '排行榜'),
        h('button', { class: 'ghost', type: 'button', onclick: () => achScreen() }, '成就'),
        h('button', { class: 'ghost', type: 'button', onclick: () => booking(root) }, '理財健康檢查'))),
    h('footer', { class: 'title-foot' }, h('span', null, 'v0.1 試玩版'), h('span', null, '內容為模擬，不構成投資建議'))));
}

function boardScreen() {
  clear(root).append(h('div', { class: 'screen sub' }, h('h2', null, '排行榜（呢部機）'), boardTable(),
    h('button', { class: 'primary', type: 'button', onclick: () => title() }, '返回')));
}
function achScreen() {
  const got = new Set(store.achs());
  clear(root).append(h('div', { class: 'screen sub' }, h('h2', null, `成就 ${ACHIEVEMENTS.filter((a) => got.has(a.id)).length} / ${ACHIEVEMENTS.length}`),
    h('div', { class: 'achs' }, ACHIEVEMENTS.map((a) => {
      const on = got.has(a.id);
      return h('div', { class: `ach ${on ? '' : 'locked'}` }, h('b', null, on || !a.hidden ? a.name : '？？？'), h('span', null, on || !a.hidden ? a.desc : '隱藏成就'), a.pts ? h('em', null, `${a.pts} 分`) : null);
    })),
    h('button', { class: 'primary', type: 'button', onclick: () => title() }, '返回')));
}

// ---------- 免責聲明 ----------
function disclaimer() {
  const ok = h('button', { class: 'primary big', type: 'button', disabled: true, onclick: () => setup() }, '我明白');
  clear(root).append(h('div', { class: 'screen center-card' }, h('div', { class: 'paper' },
    h('h2', null, '開始之前'),
    h('p', null, '「七百萬分之我」是一個模擬遊戲，只供娛樂及理財教育用途，不構成任何保險、投資或財務建議。遊戲內容涉及疾病、意外及死亡，建議 15 歲或以上人士遊玩。'),
    ok)));
  setTimeout(() => { ok.disabled = false; ok.focus(); }, 800);
}

// ---------- 設定 ----------
function setup() {
  const second = store.runs() >= 1;
  const speedSeg = h('div', { class: 'seg' }, ([1, 2, 4, 8] as const).map((v) => h('button', {
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
  clear(root).append(h('div', { class: 'screen center-card' }, h('div', { class: 'paper wide' },
    h('h2', null, '投胎設定'),
    h('p', { class: 'muted' }, '名字會喺出世嗰刻隨機抽，屋企人改嘅，你揀唔到。'),
    h('h4', null, '速度'), speedSeg,
    h('p', { class: 'muted small' }, '平淡嘅年份會自動行，有事發生先停低。遊戲中隨時可以改速度。'),
    second ? [
      h('h4', null, '出生時段'), periodSel,
      h('label', { class: 'check' }, autoBox, h('span', null, '自動揀：系統幫你揀人生抉擇，測驗同公開試仍然要自己答。')),
    ] : h('p', { class: 'muted small' }, '玩完第一局會解鎖「揀出生時段」同「自動揀」。'),
    h('button', { class: 'primary big', type: 'button', onclick: () => {
      settings.autoPick = second && autoBox.checked;
      if (!second) settings.period = '隨機時段';
      store.saveSettings(settings);
      lottery();
    } }, '下一步'))));
}

// ---------- 出身抽籤 ----------
async function lottery() {
  const period = settings.period === '隨機時段' ? null : settings.period;
  const g = new Game(newSeed(), period);
  const o = g.s.origin;
  let skip = false;
  const big = h('div', { class: 'roll' });
  const cap = h('p', { class: 'roll-cap' });
  clear(root).append(h('div', { class: 'screen lottery', onclick: () => { skip = true; } },
    h('button', { class: 'skip', type: 'button', onclick: () => { skip = true; } }, '跳過 ▶▶'),
    h('p', { class: 'muted' }, '投胎中……'), big, cap));
  const fast = reduceMotion();
  const step = async (label: string, frames: string[], final: string, ms: number) => {
    cap.textContent = label;
    if (!skip && !fast) {
      const n = Math.max(6, Math.round(ms / 70));
      for (let i = 0; i < n && !skip; i++) { big.textContent = frames[i % frames.length]; await sleep(40 + (i * i * 2) / n); }
    }
    big.textContent = final;
    big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
    if (!skip) await sleep(fast ? 300 : 650);
  };
  const [y0, y1] = PERIODS[settings.period] ?? [1975, 2015];
  await step('出生年份', Array.from({ length: 24 }, (_, i) => String(y0 + ((i * 7) % (y1 - y0 + 1)))), `${o.birthYear} 年`, 1200);
  await step('性別', ['男', '女'], o.gender === 'M' ? '男仔' : '女仔', 500);
  await step('十八區', ['觀塘', '沙田', '元朗', '深水埗', '中西區', '屯門', '黃大仙', '大埔', '灣仔', '葵青', '北區', '東區'], o.district, 1400);
  await step('住屋', ['公屋', '居屋', '私樓', '劏房', '村屋'], placeOf(g).replace(o.subArea, '') || o.housing, 700);
  originCard(g, period);
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
  const s = g.s;
  const o = s.origin;
  const stamps: string[] = [];
  const pro = (c?: string) => c === '經理及行政級' || c === '專業人員';
  if (pro(o.father?.cat) && pro(o.mother?.cat)) stamps.push('含住金鎖匙');
  if (o.isBaoyou) stamps.push('保幼局');
  if (o.birthYear === 1997) stamps.push('九七一代');
  const stat = (k: 'H' | 'J' | 'K' | 'R', n: string) => h('div', { class: `ostat s-${k}` }, h('span', null, n), h('span', { class: 'bar' }, h('span', { style: `width:${Math.round(s[k])}%` })), h('b', null, String(Math.round(s[k]))));
  const sib = o.siblings ? `${o.siblings} 個（你排第 ${o.birthOrder}）` : '獨生';
  clear(root).append(h('div', { class: 'screen center-card' }, h('div', { class: 'paper origin' },
    h('div', { class: 'o-head' }, h('h2', null, s.name), h('span', { class: 'muted' }, `${o.gender === 'M' ? '男' : '女'}・${dateOf(o.birthYear, o.birthDay)}`)),
    stamps.length ? h('div', { class: 'stamps' }, stamps.map((t) => h('span', { class: 'stamp' }, t))) : null,
    h('p', { class: 'lead' }, originLine(g)),
    h('dl', { class: 'facts' },
      h('dt', null, '地區'), h('dd', null, `${o.district}・${o.subArea}`),
      h('dt', null, '住屋'), h('dd', null, o.housing),
      o.family ? [h('dt', null, '家庭背景'), h('dd', null, o.family)] : null,
      !o.isBaoyou ? [h('dt', null, '父親'), h('dd', null, parentText(o.father)), h('dt', null, '母親'), h('dd', null, parentText(o.mother))] : null,
      h('dt', null, '兄弟姊妹'), h('dd', null, sib),
      h('dt', null, '家庭財務'), h('dd', null, WEALTH_LABEL[o.wealthTier])),
    h('div', { class: 'ostats' }, stat('H', '健康'), stat('J', '快樂'), stat('K', '知識'), stat('R', '人際')),
    h('p', { class: 'muted small' }, '出身由天，冇得重抽。'),
    h('button', { class: 'primary big', type: 'button', onclick: () => start(g, period) }, '開始人生'))));
}

function start(g: Game, period: string | null) {
  playGame(root, g, settings, (gg) => showEnding(root, gg, period, () => { settings = store.settings(); disclaimer(); }), () => title());
}

title();
