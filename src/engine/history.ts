// 歷史改寫（快照 + 11.15）：每個標「可改寫」嘅歷史事件，每局各有 2% 機會冇發生，改為另一個時空
import type { Game } from './game';
import type { Market } from './market';
import { streamRng, type RNG } from './rng';
import type { EventDef } from './cards';

interface Rewrite { id: string; year: number; name: string; alt: string; apply: (m: Market, r: RNG) => void }
const calm = (m: Market, r: RNG, y: number) => { const e = m.get(y); e.ridx = 0.07 + 0.1 * r.normal(); e.crash = e.ridx <= -0.2; };
const unemp = (m: Market, y: number, u: number) => { m.get(y).u = u; };

export const REWRITES: Rewrite[] = [
  { id: '1987', year: 1987, name: '十月股災', alt: '呢個時空，1987 年十月冇股災，股市平平穩穩過咗一年。', apply: (m, r) => calm(m, r, 1987) },
  { id: '1997', year: 1998, name: '亞洲金融風暴', alt: '呢個時空，亞洲金融風暴冇吹到香港，1998 年經濟照樣暢旺。', apply: (m, r) => { calm(m, r, 1997); calm(m, r, 1998); unemp(m, 1998, 2.5); unemp(m, 1999, 3.0); } },
  { id: '2003', year: 2003, name: '沙士', alt: '呢個時空，2003 年冇爆發沙士，學校照常上課，七人欖球賽照舊舉行。', apply: (m) => { unemp(m, 2003, 5.5); } },
  { id: '2008', year: 2008, name: '金融海嘯', alt: '呢個時空，雷曼兄弟冇倒閉，2008 年冇金融海嘯。', apply: (m, r) => { calm(m, r, 2008); unemp(m, 2009, 3.6); } },
  { id: '2017', year: 2017, name: '十號風球', alt: '呢個時空，2017 年夏天冇十號風球，風平浪靜。', apply: () => {} },
  { id: '2020', year: 2020, name: '新冠疫情', alt: '呢個時空冇新冠疫情，2020 年大家照常上學、返工、去旅行。', apply: (m, r) => { calm(m, r, 2020); for (const y of [2020, 2021, 2022]) unemp(m, y, 3.2); } },
];

/** 開局時決定邊啲歷史會被改寫（只計出世之後先發生嘅事件），同時改埋經濟數據 */
export function rollRewrites(seed: number, birthYear: number, m: Market): string[] {
  const out: string[] = [];
  for (const rw of REWRITES) {
    if (rw.year < birthYear) continue;
    const r = streamRng(seed, 'rewrite', rw.id);
    if (r() < 0.02) { out.push(rw.id); rw.apply(m, r); }
  }
  return out;
}

export const rewritten = (g: Game, id: string) => g.s.rewritten.includes(id);

/** 改寫咗嘅年份：彈紫色字幕，解鎖隱藏成就「另一個時空」 */
export const HISTORY_EVENTS: EventDef[] = REWRITES.map((rw) => ({
  id: `RW-${rw.id}`, pri: 95, years: [rw.year, rw.year] as [number, number], cat: '時代事件' as const,
  when: (g: Game) => (rewritten(g, rw.id) ? 1 : 0),
  tick: (g: Game) => { g.ach('history_rewrite'); g.log(`【時空改寫】${rw.alt}`, '時代事件', true); return `【時空改寫】${rw.alt}`; },
}));
