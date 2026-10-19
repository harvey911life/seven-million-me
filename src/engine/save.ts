// v1.5 存檔：每年完結後存一次（年同年之間嘅狀態係完整嘅，唔使存卡同隨機流）
import { Game } from './game';
import type { State } from './state';

export interface SaveData {
  v: 1;
  ver: string; // 存檔時嘅遊戲版本（改版之後讀唔到就棄檔）
  seed0: number; // 開局局號（「重來一次」之後 s.seed 會變，平行人生要用返原本嗰個）
  period: string | null;
  s: State;
  redoAt: number | null;
  redoSnap: State | null;
  parMinor: { y: number };
  at: number;
}

export function makeSave(g: Game, seed0: number, period: string | null, ver: string): SaveData {
  return { v: 1, ver, seed0, period, s: g.s, redoAt: g.redoAt, redoSnap: g.redoSnap, parMinor: g.parMinor, at: Date.now() };
}

/** 由存檔重建：用原本局號重新生成市場同歷史，再換入存低嘅人生狀態（新版加嘅欄位保留預設值） */
export function restoreSave(d: SaveData): Game {
  if (d.v !== 1 || !d.s || typeof d.seed0 !== 'number') throw new Error('bad save');
  const g = new Game(d.seed0, d.period);
  Object.assign(g.s, d.s);
  g.redoAt = d.redoAt;
  g.redoSnap = d.redoSnap;
  g.parMinor = d.parMinor ?? { y: -99 };
  return g;
}
