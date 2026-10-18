// 結局畫面（第 12 章，v0.1 精簡版）：離世 → 身後 → 退休 → 蜘蛛網 → 計分 → 賺錢 → 上榜 → 成就 → 最後一頁
import type { Game } from '../engine/game';
import { computeEnding, endAchievements, spiderLine, type Ending, type Spider } from '../engine/ending';
import { aguiEnding } from '../engine/agui';
import { ACHIEVEMENTS, ACH_BY_ID } from '../engine/achievements';
import { fmtMoney } from '../engine/util';
import { h, clear, copyText } from './dom';
import { store } from './store';
import { drawPortrait } from './scene';
import QR from '../assets/ig-qr.png';

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

function spiderCanvas(me: Spider, ag: Spider): HTMLCanvasElement {
  const size = 280;
  const dpr = Math.min(3, Math.max(1, Math.round(devicePixelRatio || 1)));
  const cv = h('canvas', { class: 'spider', width: size * dpr, height: size * dpr, 'aria-label': '蜘蛛網圖：你同阿規' });
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
  const ag = aguiEnding(s.seed, period);
  const e: Ending = computeEnding(g, ag);
  const fresh = endAchievements(g, e, ag);
  const minor = s.age < 18;
  store.addRun();
  store.addAchs(s.ach);
  const firstRun = store.runs() === 1;
  let boardRank: number | null = null;
  let boardDone = false;

  type Page = { id: string; render: () => HTMLElement };
  const pages: Page[] = [];
  const P = (id: string, render: () => HTMLElement) => pages.push({ id, render });

  P('death', () => {
    const pc = h('canvas', { class: 'portrait', width: 24, height: 24 });
    drawPortrait(pc.getContext('2d')!, s);
    return h('div', { class: 'epage death' }, pc,
      h('h2', null, `${s.name}`),
      h('p', { class: 'years' }, `${s.birthYear}–${s.year}，享年 ${s.age} 歲`),
      h('p', { class: 'cause' }, s.deathCause ?? '離世'),
      h('ul', { class: 'moments' }, moments(g).map((m) => h('li', null, m))));
  });
  P('after', () => {
    const f = e.fpi;
    if (minor) return h('div', { class: 'epage' }, h('h2', null, '你走咗之後'), h('p', null, '爸爸媽媽好長一段時間都唔習慣屋企少咗一個人。佢哋會一直記住你。'));
    return h('div', { class: 'epage' }, h('h2', null, '你走咗之後'),
      h('div', { class: `meter b-${f.band}` }, h('span', null, '家人壓力指數'), h('b', null, `${Math.round(f.fpi)}`), h('em', null, f.band)),
      h('div', { class: 'mbar' }, h('span', { style: `width:${Math.round(f.fpi)}%` })),
      h('ul', { class: 'plain' }, f.text.map((t) => h('li', null, t))),
      f.lifePayout > 0 ? h('p', { class: 'muted' }, `人壽保險賠償大約 ${fmtMoney(f.lifePayout)}。`) : null);
  });
  if (!minor) P('retire', () => {
    const r = e.retire;
    const reached = r.aRet65 !== null;
    return h('div', { class: 'epage' }, h('h2', null, reached ? '退休財務成績表' : '退休準備度'),
      h('div', { class: `grade g-${r.grade}` }, r.grade),
      h('p', { class: 'lead' }, r.comment),
      h('dl', { class: 'facts' },
        reached ? [h('dt', null, '65 歲可動用資產'), h('dd', null, `${fmtMoney(r.aRet65!)}（2026 年幣值）`)] : null,
        r.monthly65 !== null ? [h('dt', null, '每月可以安全咁用'), h('dd', null, fmtMoney(r.monthly65))] : null,
        h('dt', null, '錢用到'), h('dd', null, r.M >= 100 ? '100 歲以上' : `${r.M} 歲`),
        h('dt', null, '阿規嘅錢用到'), h('dd', null, ag.retire.M >= 100 ? '100 歲以上' : `${ag.retire.M} 歲`)),
      h('p', { class: 'fine' }, '每月可用金額按 4% 提取法估算。內容為模擬，不構成投資建議。'));
  });
  P('spider', () => h('div', { class: 'epage' }, h('h2', null, '你 vs 阿規'),
    h('p', { class: 'muted' }, '阿規同你同一個出身，但每一步都有規劃：每月投資一成、留六個月備用金、買夠保險。'),
    spiderCanvas(e.spider, ag.spider),
    h('div', { class: 'legend' }, h('span', { class: 'lg me' }, '你'), h('span', { class: 'lg ag' }, '阿規')),
    h('p', { class: 'lead' }, spiderLine(e.spider, ag.spider))));
  P('score', () => {
    const rows = e.items.map((it) => h('div', { class: 'srow' }, h('span', null, it.name), h('span', { class: 'sbar' }, h('span', { style: `width:${Math.round(it.v)}%` })), h('b', null, String(Math.round(it.v)))));
    const beat = e.nine > ag.nine;
    return h('div', { class: 'epage' }, h('h2', null, '人生排行榜計分'), h('div', { class: 'scores' }, rows),
      e.wonder ? h('p', { class: 'wonder' }, `天馬行空奇遇 +${e.wonder}`) : null,
      h('div', { class: 'total' }, h('span', null, '總分'), h('b', null, String(e.total)), h('small', null, '/ 1,000')),
      h('p', { class: beat ? 'lead good' : 'lead' }, beat ? `你贏咗阿規！（阿規 ${Math.round(ag.total)} 分）` : `阿規有 ${Math.round(ag.total)} 分。下一世再試吓贏佢。`));
  });
  P('earn', () => h('div', { class: 'epage' }, h('h2', null, '賺錢榜'),
    h('div', { class: 'total' }, h('span', null, '一生收入'), h('b', null, fmtMoney(s.earnReal)), h('small', null, '2026 年幣值')),
    h('p', { class: 'lead' }, `阿規一生賺咗 ${fmtMoney(ag.earnReal)}。${s.earnReal > ag.earnReal ? '你賺得比佢多，但賺得多唔等於夠用。' : '賺得少唔緊要，規劃先係關鍵。'}`)));
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
    const mine = s.ach.map((id) => ACH_BY_ID[id]).filter(Boolean);
    return h('div', { class: 'epage' }, h('h2', null, `成就（${mine.length} 個）`),
      h('div', { class: 'achs' }, mine.map((a) => h('div', { class: `ach ${fresh.includes(a.id) ? 'new' : ''}` }, h('b', null, a.name), h('span', null, a.desc), a.pts ? h('em', null, `${a.pts} 分`) : null))),
      h('p', { class: 'muted' }, `累積解鎖 ${store.achs().filter((id) => ACH_BY_ID[id]).length} / ${ACHIEVEMENTS.length} 個成就。`));
  });
  P('last', () => {
    const lines = ['同一個起點，有冇規劃，結局差好遠。', '下一世，你想點過？', '人生唔可以重嚟，但遊戲可以。'];
    const sad = s.tragedies > 0 || !!s.mental || !!s.flags['mentalEver'];
    return h('div', { class: 'epage last' }, h('h2', null, '呢一世完咗。'),
      h('p', { class: 'lead' }, lines[s.seed % 3]),
      firstRun ? h('p', { class: 'unlock' }, '解鎖：自動揀、揀出生時段') : null,
      h('button', { class: 'btn big', type: 'button', onclick: () => onRestart() }, '再投胎一次'),
      h('button', { class: 'btn outline big', type: 'button', onclick: () => booking(root) }, '點擊查詢更多'),
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

export function boardTable(hi: number | null = null): HTMLElement {
  const b = store.board();
  if (!b.length) return h('p', { class: 'muted' }, '未有人上榜。玩完一局就可以上榜。');
  return h('ol', { class: 'board' }, b.slice(0, 10).map((r, i) => h('li', { class: i === hi ? 'me' : '' },
    h('span', { class: 'rk' }, String(i + 1)), h('span', { class: 'nk' }, r.nick, h('small', null, `${r.born} 年${r.place}出世・${r.age} 歲`)), h('b', null, String(r.score)))));
}

export function booking(root: HTMLElement) {
  const num = h('span', { class: 'num' }, '+852 5196 6602');
  const note = h('small', { class: 'copied' }, '');
  const wrap = h('div', { class: 'mwrap in' });
  const close = () => wrap.remove();
  wrap.append(h('div', { class: 'modal booking', role: 'dialog', 'aria-modal': 'true', 'aria-label': '點擊查詢更多' },
    h('button', { class: 'mx', type: 'button', 'aria-label': '關閉', onclick: close }, '✕'),
    h('h3', { class: 'ctitle' }, '15 分鐘免費理財健康檢查'),
    h('img', { src: QR, alt: 'IG 專頁 QR code', class: 'qr', width: 180, height: 180 }),
    h('a', { href: 'https://instagram.com/life_balance_adventure', target: '_blank', rel: 'noopener' }, 'IG：@life_balance_adventure'),
    h('div', { class: 'phone' }, h('span', null, 'Harvey Wong'), num,
      h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { note.textContent = (await copyText('+85251966602', num)) ? '已複製' : '已揀住號碼，可以自己複製'; } }, '複製號碼'),
      h('a', { href: 'https://wa.me/85251966602', target: '_blank', rel: 'noopener' }, 'WhatsApp')),
    note,
    h('p', { class: 'fine' }, '你可以自己決定係咪聯絡。遊戲唔會收集任何玩家資料。內容為模擬，不構成投資建議。')));
  wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });
  root.append(wrap);
}
