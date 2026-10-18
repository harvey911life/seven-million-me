// 平行人生：同你同年同日出世嘅另外幾個人（包括某某人），佢哋嘅人生大事會喺你玩緊嘅時候彈出嚟，結局再一齊比較
import type { Game } from './game';
import { playHeadless, cacheAgui, type Policy } from './agui';
import { computeEnding, endAchievements, lifeGrade } from './ending';
import { hash32 } from './rng';
import { jobName } from './career';
import { bizName } from './biz';
import { fmtMoney } from './util';

export interface ParallelNews { year: number; age: number; text: string; key: boolean }
export interface ParallelLife {
  who: string; name: string; planner: boolean; district: string; subArea: string; housing: string;
  news: ParallelNews[];
  end: { age: number; year: number; cause: string; total: number; grade: string; earn: number; bankrupt: boolean };
}

type Snap = { emp: boolean; married: boolean; kids: number; prop: boolean; biz: string | null; emig: boolean; div: number; won: number; ret: boolean; level: number; status: string; sold: boolean };
const snap = (g: Game): Snap => {
  const s = g.s;
  return {
    emp: s.everEmployed, married: s.married, kids: s.kids.length, prop: !!s.prop, biz: s.biz?.id ?? null, emig: s.emigrated,
    div: s.divorces, won: s.lotteryWon, ret: s.retiredAt !== null, level: s.job?.level ?? 0, status: s.status, sold: s.ach.includes('biz_exit'),
  };
};

function lifeOf(seed: number, period: string | null, mode: Policy, who: string, force?: { year: number; day: number }): ParallelLife {
  const news: ParallelNews[] = [];
  let prev: Snap | null = null;
  const g = playHeadless(seed, period, mode, 120, force, (g) => {
    const s = g.s;
    const now = snap(g);
    const p = prev ?? now;
    const add = (text: string, key = false) => news.push({ year: s.year, age: s.age, text, key });
    if (!p.emp && now.emp && s.job) add(`做咗第一份工：${jobName(g, s.job.id)}`);
    else if (now.level > p.level && p.level > 0 && now.status === 'work') add('升職');
    if (!p.married && now.married) add('結婚', true);
    if (p.married && !now.married && now.div > p.div) add('離婚', true);
    if (now.kids > p.kids) add(now.kids === 1 ? '生咗第一個 BB' : `生咗第 ${now.kids} 個 BB`, now.kids === 1);
    if (!p.prop && now.prop) add('買樓上車', true);
    if (now.biz && now.biz !== p.biz) add(`開咗${bizName(g, now.biz)}`, true);
    if (p.biz && !now.biz) add(now.sold && !p.sold ? '賣盤套現' : '盤生意結束咗', now.sold && !p.sold);
    if (!p.emig && now.emig) add('移民', true);
    if (p.emig && !now.emig) add('回流香港');
    if (now.won - p.won >= 1_000_000) add(`中咗六星彩頭獎（${fmtMoney(now.won - p.won)}）`, true);
    if (!p.ret && now.ret) add('退休', true);
    if (p.status === 'work' && now.status === 'unemp') add('失業');
    if (!s.alive) add(s.flags['bankrupt'] ? '破產' : `離世，享年 ${s.age} 歲`, true);
    prev = now;
  });
  const s = g.s;
  const e = computeEnding(g);
  endAchievements(g, e);
  if (mode === 'agui' && !force) cacheAgui(seed, period, e);
  return {
    who, name: mode === 'agui' ? '某某人' : s.name, planner: mode === 'agui',
    district: s.origin.district, subArea: s.origin.subArea, housing: s.origin.housing, news,
    end: { age: s.age, year: s.year, cause: s.deathCause ?? '', total: e.total, grade: lifeGrade(e.total), earn: s.earnReal, bankrupt: !!s.flags['bankrupt'] },
  };
}

/** 某某人（同你同一個出身，每步有規劃）＋ 三個同你同年同日喺唔同地方出世嘅人 */
export function simulateParallel(g: Game, period: string | null): ParallelLife[] {
  const s = g.s;
  const force = { year: s.birthYear, day: s.origin.birthDay };
  const out = [lifeOf(s.seed, period, 'agui', '同你同一個出身')];
  const modes: Policy[] = ['def', 'auto', 'def'];
  for (let i = 0; i < 3; i++) out.push(lifeOf(hash32(s.seed, 'parallel', i), period, modes[i], '同年同日出世', force));
  return out;
}

/** 今年要喺人生紀錄出現嘅平行人生新聞：大事一定出；細事最多三年一次 */
export function parallelNewsFor(lives: ParallelLife[], year: number, lastMinor: { y: number }): { text: string; key: boolean }[] {
  const out: { text: string; key: boolean }[] = [];
  for (const l of lives) {
    for (const n of l.news) {
      if (n.year !== year) continue;
      if (!n.key) {
        if (year - lastMinor.y < 3) continue;
        lastMinor.y = year;
      }
      out.push({ text: `【平行人生】${l.name} ${n.age} 歲${n.text}。`, key: n.key });
    }
  }
  return out;
}
