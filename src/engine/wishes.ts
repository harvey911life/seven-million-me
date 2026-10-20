// v1.6（用家揀）：人生心願清單：18 歲許三個心願，達成有額外分數同成就
import type { Game } from './game';
import type { State } from './state';
import { netWorth } from './finance';
import { streamRng } from './rng';
import { mkCard, type EventDef } from './cards';

interface Wish { id: string; short: string; label: string; check: (g: Game) => boolean }
const has = (s: State, id: string) => s.ach.includes(id);

// 三類：事業錢財 / 家庭 / 生活夢想；每個組合每類抽一個
const CAREER: Wish[] = [
  { id: 'million', short: '百萬年薪', label: '年薪過百萬', check: (g) => has(g.s, 'million_salary') },
  { id: 'tenM', short: '千萬身家', label: '60 歲前有千萬身家', check: (g) => g.s.age <= 60 && netWorth(g) / g.P >= 10_000_000 },
  { id: 'boss', short: '做老細', label: '自己做老細', check: (g) => g.s.biz0 >= 1 },
  { id: 'retire60', short: '早退休', label: '60 歲前退休', check: (g) => g.s.retiredAt !== null && g.s.retiredAt < 60 },
  { id: 'mortfree', short: '供滿樓', label: '供完層樓', check: (g) => has(g.s, 'mortgage_free') },
];
const FAMILY: Wish[] = [
  { id: 'married', short: '結婚', label: '搵到另一半結婚', check: (g) => g.s.married || g.s.marriedAt !== null },
  { id: 'kids2', short: '兩個仔女', label: '生兩個或以上小朋友', check: (g) => g.s.kids.length >= 2 },
  { id: 'grand', short: '湊孫', label: '做爺爺嫲嫲或公公婆婆', check: (g) => has(g.s, 'grandparent') },
  { id: 'pets3', short: '養三隻', label: '養過 3 隻寵物', check: (g) => Number(g.s.flags['petsEver'] ?? 0) >= 3 },
];
const DREAM: Wish[] = [
  { id: 'home40', short: '40 前上車', label: '40 歲前上車', check: (g) => Number(g.s.flags['firstHomeAge'] ?? 99) <= 40 },
  { id: 'abroad', short: '出國生活', label: '喺外國生活過一段時間', check: (g) => g.s.overseas || g.s.emigrated || !!g.s.flags['whv'] || has(g.s, 'expat') },
  { id: 'health70', short: '健康到老', label: '70 歲時健康仲有 60 分', check: (g) => g.s.age === 70 && g.s.H >= 60 },
  { id: 'live90', short: '活到 90', label: '活到 90 歲', check: (g) => g.s.age >= 90 },
];
const ALL = [...CAREER, ...FAMILY, ...DREAM];
const BY_ID = Object.fromEntries(ALL.map((w) => [w.id, w]));

export const myWishes = (s: State): string[] => String(s.flags['wishes'] ?? '').split(',').filter((id) => BY_ID[id]);
export const wishDone = (s: State, id: string) => s.flags['wish_' + id] !== undefined;
export const wishLabel = (id: string) => BY_ID[id]?.label ?? id;
/** 結局用：每個達成嘅心願 +10 分 */
export function wishResult(s: State): { label: string; done: boolean }[] {
  return myWishes(s).map((id) => ({ label: wishLabel(id), done: wishDone(s, id) }));
}
export const WISH_PTS = 10;

/** 每年完結時檢查（喺成就檢查度叫） */
export function checkWishes(g: Game) {
  const s = g.s;
  const list = myWishes(s);
  if (!list.length) return;
  for (const id of list) {
    if (wishDone(s, id) || !BY_ID[id].check(g)) continue;
    g.flag('wish_' + id, s.age);
    g.log(`⭐ 心願達成：${BY_ID[id].label}`, '人生抉擇', true);
    g.tick(`⭐ 心願達成：${BY_ID[id].label}`);
  }
  if (list.every((id) => wishDone(s, id))) g.ach('wish_all');
}

function packs(g: Game): Wish[][] {
  const r = streamRng(g.s.seed, 'wish');
  const shuf = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = r.int(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const [a, b, c] = [shuf(CAREER), shuf(FAMILY), shuf(DREAM)];
  return [0, 1, 2, 3].map((k) => [a[k % a.length], b[k % b.length], c[k % c.length]]);
}

export const WISH_EVENTS: EventDef[] = [
  {
    id: 'C-WISH', pri: 845, fixed: true, ages: [18, 18], cat: '人生抉擇',
    when: (g) => (g.s.flags['wishes'] ? 0 : 1),
    make: (g) => {
      const ps = packs(g);
      return mkCard('C-WISH', '許三個心願', '18 歲生日，吹蠟燭之前，你閉埋眼許咗三個心願。達成一個有額外 10 分。', ps.map((p) => ({
        label: p.map((w) => w.short).join('・'),
        note: p.map((w) => w.label).join('；'),
      })), (g2, i) => {
        g2.flag('wishes', ps[i].map((w) => w.id).join(','));
        return `你許咗：${ps[i].map((w) => w.label).join('、')}。`;
      }, { pri: 845, def: 0, auto: 0, agui: 0, cat: '人生抉擇' });
    },
  },
];
