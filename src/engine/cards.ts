// 抉擇卡 / 事件卡共用格式（第 5 章 5.1、第 11 章 11.4）
import type { Game } from './game';
import type { Cat, StatKey } from './state';
import { fmtMoney } from './util';

export interface Question { id: string; subj: string; diff: 0 | 1 | 2; q: string; opts: string[]; ans: number; expl: string }

export interface Opt {
  label: string;
  note?: string; // 細字（例：金額）
  disabled?: string; // 灰色原因
  fx?: Partial<Record<StatKey, number>>; // 顯示用指標箭咀
  money?: number; // 顯示用金額（負數 = 支出）
}

export type CardKind = 'choice' | 'quiz' | 'exam' | 'system';

export interface Card {
  id: string;
  title: string;
  text: string;
  reason?: string; // 細字提示：點解會出現
  cat?: Cat;
  options: Opt[];
  def: number; // 預設選項（過期 / 冇時間諗）
  auto?: number; // 自動揀（安全規則）
  agui?: number; // 某某人會揀
  run: (g: Game, idx: number) => string | void;
  kind?: CardKind;
  pri: number;
  hotline?: boolean; // 情緒病：顯示 18111
  scene?: string; // 像素場景提示
  quiz?: Question[];
  mock?: boolean;
  deferrable?: boolean;
  defId?: string; // 延後時用嘅事件 ID
  resultDeltas?: Record<StatKey, number>;
}

export type OptIn = string | Opt;

export function mkCard(
  id: string,
  title: string,
  text: string,
  options: OptIn[],
  run: (g: Game, idx: number) => string | void,
  extra: Partial<Card> = {},
): Card {
  return {
    id, title, text, run, pri: 500, def: 0, kind: 'choice',
    options: options.map((o) => withPrice(typeof o === 'string' ? { label: o } : o)),
    ...extra,
  };
}

/** v1.3：有 money 但細字冇寫價錢嘅選項，自動補返金額，確保使錢嘅選項全部標價 */
function withPrice(o: Opt): Opt {
  if (!o.money || /\$/.test(`${o.label}${o.note ?? ''}`)) return o;
  const verb = o.money > 0 ? '收' : /借/.test(o.label) ? '借出' : '使';
  return { ...o, note: `${verb} ${fmtMoney(Math.abs(o.money))}${o.note ? '；' + o.note : ''}` };
}

/** 第一個可以揀嘅選項 */
export function firstEnabled(c: Card, prefer: number): number {
  if (!c.options[prefer]?.disabled) return prefer;
  const i = c.options.findIndex((o) => !o.disabled);
  return i < 0 ? 0 : i;
}

export interface EventDef {
  id: string;
  pri: number;
  cat?: Cat;
  ages?: [number, number];
  years?: [number, number];
  once?: boolean; // 預設 true
  cool?: number;
  group?: string;
  groupCool?: number;
  tragedy?: boolean;
  fixed?: boolean; // 固定抉擇（可以延後）
  when: (g: Game) => number; // 今年機率
  make?: (g: Game) => Card | null;
  tick?: (g: Game) => string | void;
}

/** 每張卡最多 4 個選項；多過 4 個就隨機留 4 個（保留預設選項，盡量留可以揀嘅） */
export function capOptions(c: Card, rnd: () => number, max = 4): Card {
  if (c.options.length <= max || c.kind === 'quiz' || c.kind === 'exam') return c;
  const idx = c.options.map((_, i) => i);
  const keep = new Set<number>([c.def]);
  const pool = idx.filter((i) => i !== c.def).sort(() => rnd() - 0.5).sort((a, b) => Number(!!c.options[a].disabled) - Number(!!c.options[b].disabled));
  for (const i of pool) { if (keep.size >= max) break; keep.add(i); }
  const map = [...keep].sort((a, b) => a - b);
  const run = c.run;
  const back = (i?: number) => (i === undefined ? undefined : Math.max(0, map.indexOf(i)));
  return { ...c, options: map.map((i) => c.options[i]), def: back(c.def)!, auto: back(c.auto), agui: back(c.agui), run: (g, i) => run(g, map[i] ?? map[0]) };
}
