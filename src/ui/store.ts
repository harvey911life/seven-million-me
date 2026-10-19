// 本地儲存：設定、局數、本機排行榜、累積成就（讀唔到就當冇）
export interface Settings { speed: 1 | 2 | 4 | 8 | 16 | 20; autoPick: boolean; autoQuiz?: boolean; period: string }
export interface BoardRow { nick: string; score: number; age: number; born: number; place: string; date: string }

const K = { settings: '7m:settings', runs: '7m:runs', exam6: '7m:exam6', board: '7m:board', ach: '7m:ach' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 忽略 */ }
}

export const store = {
  settings(): Settings { return { speed: 1, autoPick: false, autoQuiz: false, period: '隨機時段', ...read<Partial<Settings>>(K.settings, {}) }; },
  saveSettings(s: Settings) { write(K.settings, s); },
  runs(): number { return read<number>(K.runs, 0); },
  addRun() { write(K.runs, this.runs() + 1); },
  /** v1.3：自己答公開試答啱 6 題或以上（最少一次）先解鎖自動答題 */
  autoQuizOk(): boolean { return read<boolean>(K.exam6, false); },
  unlockAutoQuiz() { write(K.exam6, true); },
  board(): BoardRow[] { return read<BoardRow[]>(K.board, []); },
  addBoard(r: BoardRow): number {
    const b = this.board().concat(r).sort((a, z) => z.score - a.score).slice(0, 30);
    write(K.board, b);
    return b.indexOf(r);
  },
  achs(): string[] { return read<string[]>(K.ach, []); },
  addAchs(ids: string[]) { write(K.ach, Array.from(new Set(this.achs().concat(ids)))); },
};

/** v1.3：玩完三局之後（第四局起）多一個 20 倍速 */
export function speedList(): Settings['speed'][] {
  return store.runs() >= 3 ? [1, 2, 4, 8, 16, 20] : [1, 2, 4, 8, 16];
}
