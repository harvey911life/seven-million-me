// 某某人（有規劃嘅普通人）同自動揀：無畫面跑完一生
import { Game } from './game';
import { firstEnabled, type Card } from './cards';
import { computeEnding, endAchievements, type Ending } from './ending';
import { focusList } from './yearly';

export type Policy = 'agui' | 'auto' | 'def';

export function pickFor(c: Card, mode: Policy): number {
  const want = mode === 'agui' ? c.agui ?? c.auto ?? c.def : mode === 'auto' ? c.auto ?? c.def : c.def;
  return firstEnabled(c, want);
}

/** 某某人嘅年度設定：焦點、理財 */
export function aguiYear(g: Game) {
  const s = g.s;
  const list = focusList(g).map((f) => f.id);
  const want = s.focusStage === 'student' ? (s.age >= 15 && s.age <= 17 ? '發奮圖強' : '平衡人生')
    : s.focusStage === 'work' ? (s.age < 35 ? '精打細算' : s.age < 45 ? '平衡人生' : '強身健體')
      : '養生保健';
  if (list.includes(want)) s.focus = want;
  else if (list.length) s.focus = list[list.length - 1];
  if (s.status === 'work' && s.investRatio === 0) {
    s.investRatio = 0.1;
    s.alloc = { deposit: 0, plan: 0, index: 100, stock: 0, crypto: 0 };
    s.emergTarget = 6;
  }
  s.mpfFund = s.age < 45 ? '增長' : s.age < 60 ? '均衡' : '保守';
  s.panel = s.age >= 40 ? ['checkup', 'dinner'] : s.age >= 18 ? ['dinner'] : [];
}

/** 自動揀模式嘅焦點（5.12.4 簡化） */
export function autoFocus(g: Game) {
  const s = g.s;
  const list = focusList(g).map((f) => f.id);
  if (!list.length) return;
  const low = (['H', 'J', 'K', 'R'] as const).reduce((a, k) => (s[k] < s[a] ? k : a), 'H');
  const map: Record<string, string[]> = {
    H: ['強身健體', '養生保健', '平衡人生'], J: ['培養嗜好', '放飛自我', '周遊列國', '平衡人生'],
    K: ['發奮圖強', '增值進修', '平衡人生'], R: ['廣結朋友', '家庭優先', '含飴弄孫', '服務社區'],
  };
  s.focus = map[low].find((f) => list.includes(f)) ?? list[list.length - 1];
}

export function playHeadless(seed: number, period: string | null, mode: Policy, maxAge = 120, force?: { year: number; day: number }, onYear?: (g: Game) => void, noTianma = false): Game {
  const g = new Game(seed, period, force);
  // 天馬行空只會發生喺玩家身上（12.7）：某某人同平行人生唔抽
  if (mode === 'agui' || noTianma) { g.noTianma = true; g.redoAt = null; }
  // 某某人係「每一步都有規劃」嘅示範人物：佢遇到財困會即刻重組，唔會行到破產結局
  if (mode === 'agui') g.s.flags['planner'] = true;
  while (g.s.alive && g.s.age < maxAge) {
    if (mode === 'agui') aguiYear(g);
    const st = g.startYear();
    if (mode !== 'agui' && (st.needFocus || !g.s.focus)) autoFocus(g);
    if (mode === 'agui') aguiYear(g);
    let guard = 0;
    while (g.queue.length && guard++ < 40) {
      const c = g.queue.shift()!;
      g.choose(c, pickFor(c, mode));
    }
    const end = g.endYear();
    onYear?.(g);
    if (end.dead) break;
  }
  return g;
}

const aguiCache = new Map<string, Ending>();
/** 平行人生已經行過某某人，直接放入快取，結局唔使再行一次 */
export function cacheAgui(seed: number, period: string | null, e: Ending) { aguiCache.set(`${seed}|${period}`, e); }
export function aguiEnding(seed: number, period: string | null): Ending {
  const key = `${seed}|${period}`;
  const hit = aguiCache.get(key);
  if (hit) return hit;
  const g = playHeadless(seed, period, 'agui');
  const e = computeEnding(g);
  endAchievements(g, e);
  aguiCache.set(key, e);
  return e;
}
