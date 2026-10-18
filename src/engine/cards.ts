// 抉擇卡 / 事件卡共用格式（第 5 章 5.1、第 11 章 11.4）
import type { Game } from './game';
import type { Cat, StatKey } from './state';

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
  agui?: number; // 阿規會揀
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
    options: options.map((o) => (typeof o === 'string' ? { label: o } : o)),
    ...extra,
  };
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
