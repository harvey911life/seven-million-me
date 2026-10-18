// 像素場景：192 × 108 原圖，整數倍放大（第 3 章 3.11）
import type { State } from '../engine/state';

export const SW = 192;
export const SH = 108;

type Ctx = CanvasRenderingContext2D;
const R = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };

// 小圖示（5 × 5），焦點氣泡用
const ICONS: Record<string, string[]> = {
  book: ['.###.', '#.#.#', '#.#.#', '#.#.#', '.###.'],
  heart: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  ball: ['.###.', '#.#.#', '#####', '#.#.#', '.###.'],
  note: ['..###', '..#.#', '..#.#', '###.#', '##...'],
  coin: ['.###.', '#.#.#', '#.##.', '.##.#', '.###.'],
  case: ['.###.', '#####', '#...#', '#####', '#####'],
  star: ['..#..', '.###.', '#####', '.#.#.', '#...#'],
  plane: ['..#..', '.###.', '#####', '..#..', '.###.'],
  cross: ['.###.', '..#..', '#####', '..#..', '..#..'],
  hand: ['#.#.#', '#.#.#', '#####', '#####', '.###.'],
  scale: ['..#..', '#####', '#.#.#', '#.#.#', '.###.'],
};
const FOCUS_ICON: Record<string, string> = {
  發奮圖強: 'book', 增值進修: 'book', 家庭優先: 'heart', 含飴弄孫: 'heart', 強身健體: 'ball', 廣結朋友: 'ball',
  培養興趣: 'note', 培養嗜好: 'note', 精打細算: 'coin', 做兼職: 'coin', 事業衝刺: 'case', 退而不休: 'case',
  放飛自我: 'star', 享受當下: 'star', 周遊列國: 'plane', 養生保健: 'cross', 服務社區: 'hand', 幫手頂家: 'hand', 平衡人生: 'scale',
};

function icon(c: Ctx, name: string, x: number, y: number, col: string) {
  const m = ICONS[name];
  if (!m) return;
  m.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') R(c, x + i, y + j, 1, 1, col); }));
}

// 天色：童年白天、打工黃昏、退休夜晚
function sky(age: number): { bands: string[]; stars: boolean; sun: string | null } {
  if (age < 18) return { bands: ['#5aa9e6', '#7cc0ee', '#a2d4f2', '#cbe7f5'], stars: false, sun: '#fff1a8' };
  if (age < 65) return { bands: ['#2b2d63', '#6b3f7a', '#c4607a', '#f29e6b'], stars: false, sun: '#ffd27a' };
  return { bands: ['#0c1030', '#141a44', '#1d2558', '#2a3470'], stars: true, sun: null };
}

function hash(n: number) { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; }

function lionRock(c: Ctx, col: string) {
  // 獅子山剪影：由左至右嘅高度
  const h = [30, 31, 33, 35, 38, 40, 43, 45, 47, 49, 52, 55, 58, 60, 61, 62, 61, 59, 56, 54, 53, 52, 52, 51, 50, 48, 46, 44, 42, 40, 38, 36, 34, 33, 32, 31, 30];
  const step = SW / (h.length - 1);
  for (let i = 0; i < SW; i++) {
    const k = i / step;
    const a = h[Math.floor(k)];
    const b = h[Math.min(h.length - 1, Math.ceil(k))];
    const v = a + (b - a) * (k - Math.floor(k));
    R(c, i, SH - 38 - v * 0.55, 1, v * 0.55 + 2, col);
  }
}

function windows(c: Ctx, x: number, y: number, w: number, h: number, gx: number, gy: number, lit: string, dark: string, seed: number, night: boolean, t: number) {
  for (let j = y + 2; j < y + h - 3; j += gy) {
    for (let i = x + 2; i < x + w - 2; i += gx) {
      const r = hash(seed + i * 31 + j * 17);
      const on = night ? r % 3 !== 0 : r % 5 === 0;
      const flick = night && r % 23 === 0 && (t >> 3) % 2 === 0;
      R(c, i, j, 2, 2, on && !flick ? lit : dark);
    }
  }
}

function building(c: Ctx, home: State['home'], night: boolean, t: number, year: number) {
  const lit = night ? '#ffd86b' : '#e8f4ff';
  const base = SH - 22;
  switch (home) {
    case 'public': {
      // 公屋：兩座長型大廈，粉色外牆
      R(c, 8, base - 70, 44, 70, '#e7b6a8'); R(c, 8, base - 70, 44, 3, '#c98f84');
      windows(c, 8, base - 66, 44, 66, 4, 5, lit, '#8a6f78', 11, night, t);
      R(c, 56, base - 58, 36, 58, '#a9d0c4'); R(c, 56, base - 58, 36, 3, '#7fb0a3');
      windows(c, 56, base - 54, 36, 54, 4, 5, lit, '#5f7d7a', 23, night, t);
      break;
    }
    case 'subdiv': {
      // 劏房：舊唐樓、冷氣機、招牌
      R(c, 14, base - 52, 60, 52, '#9b8a73'); R(c, 14, base - 52, 60, 2, '#6f604f');
      windows(c, 14, base - 48, 60, 48, 6, 7, lit, '#4c4238', 37, night, t);
      for (let j = 0; j < 6; j++) R(c, 16 + (j % 2) * 40, base - 46 + j * 7, 4, 3, '#d8d3c8');
      R(c, 76, base - 40, 10, 22, night ? '#ff4f6d' : '#c2364f'); R(c, 78, base - 37, 6, 2, '#ffe1a8'); R(c, 78, base - 31, 6, 2, '#ffe1a8');
      break;
    }
    case 'own': {
      // 私樓：玻璃幕牆
      R(c, 18, base - 80, 34, 80, '#4a6d96'); R(c, 18, base - 80, 34, 2, '#7fa6cf');
      windows(c, 18, base - 77, 34, 77, 3, 4, lit, '#36557a', 41, night, t);
      R(c, 56, base - 62, 30, 62, '#5b7fa6');
      windows(c, 56, base - 58, 30, 58, 3, 4, lit, '#3d5f86', 43, night, t);
      R(c, 14, base - 4, 76, 4, '#8aa36a');
      break;
    }
    case 'village': {
      // 村屋：三層高、斜瓦頂
      R(c, 22, base - 36, 52, 36, '#efe3c6');
      for (let j = 0; j < 8; j++) R(c, 20 + j, base - 44 + j, 56 - j * 2, 1, '#b5523b');
      windows(c, 22, base - 34, 52, 34, 8, 11, lit, '#7a6a52', 53, night, t);
      R(c, 10, base - 18, 8, 18, '#4f7a3a'); R(c, 6, base - 26, 16, 10, '#5f9446');
      break;
    }
    case 'institution': {
      R(c, 14, base - 34, 74, 34, '#d9d2c3'); R(c, 14, base - 34, 74, 3, '#a89f8e');
      windows(c, 14, base - 30, 74, 30, 6, 8, lit, '#7c7468', 61, night, t);
      R(c, 48, base - 52, 1, 18, '#555'); R(c, 49, base - 52, 8, 5, '#f2b134');
      break;
    }
    default: {
      // 租樓 / 同父母住 / 合租：普通住宅
      R(c, 12, base - 60, 40, 60, '#c9c3b6'); R(c, 12, base - 60, 40, 2, '#a39d90');
      windows(c, 12, base - 56, 40, 56, 5, 6, lit, '#6d685f', 71, night, t);
      R(c, 56, base - 46, 34, 46, '#b8b0a0');
      windows(c, 56, base - 42, 34, 42, 5, 6, lit, '#625c52', 73, night, t);
    }
  }
  // 未來年代：天空飛車
  if (year >= 2035) { const fx = (t * 2) % (SW + 20) - 10; R(c, fx, 18, 6, 2, '#7ff0ff'); R(c, fx + 1, 17, 3, 1, '#c8fbff'); }
}

interface Look { skin: string; hair: string; top: string; bottom: string }
function lookOf(s: State, who: 'me' | 'partner' | 'kid', age: number): Look {
  const hair = age >= 65 ? '#e8e8e8' : age >= 48 ? '#8d8d8d' : '#2b2420';
  const skin = '#f2c7a1';
  if (who === 'kid') return { skin, hair, top: ['#f2b134', '#5ec4a0', '#e86a8a'][age % 3], bottom: '#3b4a7a' };
  if (who === 'partner') return { skin, hair, top: '#8e7cc3', bottom: '#3d3d55' };
  let top = '#e86a5c';
  if (age >= 6 && age < 18 && s.status === 'study') top = '#f4f4f4';
  else if (s.status === 'work') top = s.job && s.job.level >= 3 ? '#2f3d5c' : '#4d8fd1';
  else if (s.status === 'retired') top = '#c98b4a';
  else if (s.status === 'unemp') top = '#8b8b8b';
  return { skin, hair, top, bottom: age >= 6 && age < 18 ? '#2d4a8a' : '#353a4a' };
}

function person(c: Ctx, x: number, feet: number, age: number, lk: Look, t: number, cane = false, phase = 0) {
  if (age < 3) {
    // BB 車
    R(c, x - 6, feet - 9, 13, 6, '#6fa8dc'); R(c, x - 6, feet - 12, 5, 4, '#6fa8dc');
    R(c, x - 1, feet - 12, 4, 4, lk.skin); R(c, x - 1, feet - 13, 4, 1, lk.hair);
    R(c, x - 5, feet - 2, 3, 2, '#333'); R(c, x + 3, feet - 2, 3, 2, '#333');
    return;
  }
  const h = age < 6 ? 14 : age < 12 ? 18 : age < 16 ? 21 : 24;
  const bob = ((t + phase) >> 2) % 2;
  const top = feet - h - bob;
  const head = age < 12 ? 6 : 6;
  const legH = Math.round(h * 0.38);
  const bodyH = h - head - legH;
  // 頭
  R(c, x - 3, top, 6, head, lk.skin);
  R(c, x - 3, top, 6, 2, lk.hair); R(c, x - 3, top, 1, 4, lk.hair);
  R(c, x + 1, top + 3, 1, 1, '#222');
  // 身
  R(c, x - 3, top + head, 6, bodyH, lk.top);
  const sw = ((t + phase) >> 3) % 2 ? 1 : 0;
  R(c, x - 4, top + head + sw, 1, bodyH - 1, lk.skin); R(c, x + 3, top + head + 1 - sw, 1, bodyH - 1, lk.skin);
  // 腳
  R(c, x - 3, feet - legH, 2, legH, lk.bottom); R(c, x + 1, feet - legH, 2, legH, lk.bottom);
  R(c, x - 3, feet - 1, 2, 1, '#222'); R(c, x + 1, feet - 1, 2, 1, '#222');
  if (cane) { R(c, x + 5, feet - 12, 1, 12, '#7a5a3a'); R(c, x + 4, feet - 12, 2, 1, '#7a5a3a'); }
}

export function drawScene(c: Ctx, s: State, t: number) {
  const age = s.age;
  const sk = sky(age);
  const night = sk.stars || (age >= 18 && age < 65 && false);
  const bh = Math.ceil((SH - 20) / sk.bands.length);
  sk.bands.forEach((col, i) => R(c, 0, i * bh, SW, bh + 1, col));
  if (sk.stars) for (let i = 0; i < 26; i++) { const r = hash(i * 97); if ((t + i) % 17 !== 0) R(c, r % SW, (r >> 8) % 50, 1, 1, '#fff6d0'); }
  if (sk.sun) { const sy = age < 18 ? 14 : 40; R(c, 150, sy, 10, 10, sk.sun); R(c, 148, sy + 2, 14, 6, sk.sun); }
  else { R(c, 152, 12, 8, 8, '#f3f0d8'); R(c, 155, 12, 5, 6, sk.bands[1]); }
  // 雲
  if (!sk.stars) for (let i = 0; i < 3; i++) { const cx = ((t / 3 + i * 70) % (SW + 40)) - 20; R(c, cx, 20 + i * 9, 18, 3, 'rgba(255,255,255,.55)'); R(c, cx + 4, 18 + i * 9, 9, 2, 'rgba(255,255,255,.55)'); }
  lionRock(c, age < 18 ? '#4f7f6a' : age < 65 ? '#3d3557' : '#10162e');
  // 遠景樓群
  for (let i = 0; i < 12; i++) { const r = hash(i * 13 + 5); const w = 10 + (r % 8); const hh = 14 + (r >> 4) % 22; R(c, 96 + i * 9, SH - 22 - hh, w, hh, age < 18 ? '#8fa9b8' : age < 65 ? '#5a4a6e' : '#1c2448'); }
  building(c, s.home, sk.stars, t, s.year);
  // 街
  R(c, 0, SH - 22, SW, 4, '#9a9a92'); R(c, 0, SH - 18, SW, 18, '#4b4d55');
  for (let i = 0; i < SW; i += 16) R(c, (i + (t % 16)) % SW, SH - 9, 8, 1, '#d8d27a');
  // 人物
  const feet = SH - 20;
  const me = lookOf(s, 'me', age);
  const meX = 132;
  if (s.partner && s.partner.alive && (s.married || s.datingYears > 0) && age >= 15) person(c, meX + 12, feet, Math.max(16, s.partner.age), lookOf(s, 'partner', s.partner.age), t, false, 3);
  const kids = s.kids.filter((k) => !k.away && !k.emigrated && k.age < 18).slice(0, 3);
  kids.forEach((k, i) => person(c, meX - 12 - i * 10, feet, Math.max(1, k.age), lookOf(s, 'kid', k.age), t, false, i + 1));
  person(c, meX, feet, age, me, t, age >= 65 && s.H < 30);
  // 焦點氣泡
  const ic = s.focus ? FOCUS_ICON[s.focus] : null;
  if (ic && age >= 6) {
    const by = feet - 40 - (((t >> 3) % 2) ? 1 : 0);
    R(c, meX + 4, by, 9, 9, '#fffaf0'); R(c, meX + 4, by + 9, 2, 2, '#fffaf0');
    icon(c, ic, meX + 6, by + 2, '#2b2d63');
  }
  void night;
}

/** 頭像（排行榜、結局用）：攞場景中間一格 */
export function drawPortrait(c: Ctx, s: State) {
  R(c, 0, 0, 32, 32, '#1e2640');
  person(c, 16, 30, Math.max(6, s.age), lookOf(s, 'me', s.age), 0, s.age >= 65 && s.H < 30);
}

/** 標題畫面：維港夜景，天星小輪橫過 */
export function drawTitle(c: Ctx, t: number, day: boolean) {
  const bands = day ? ['#5aa9e6', '#7cc0ee', '#a2d4f2', '#cbe7f5'] : ['#0c1030', '#141a44', '#1d2558', '#2a3470'];
  bands.forEach((col, i) => R(c, 0, i * 16, SW, 17, col));
  if (!day) for (let i = 0; i < 30; i++) { const r = hash(i * 131); if ((t + i) % 13 !== 0) R(c, r % SW, (r >> 8) % 44, 1, 1, '#fff6d0'); }
  lionRock(c, day ? '#4f7f6a' : '#141c3c');
  // 港島天際線
  for (let i = 0; i < 26; i++) {
    const r = hash(i * 29 + 3);
    const w = 5 + (r % 6);
    const hh = 16 + ((r >> 5) % 34) + (i === 11 ? 18 : 0);
    const x = i * 7.6;
    R(c, x, 74 - hh, w, hh, day ? '#7f97ab' : '#232c55');
    for (let j = 74 - hh + 2; j < 72; j += 3) for (let k = x + 1; k < x + w - 1; k += 2) {
      const on = hash((k | 0) * 7 + j * 3 + i) % (day ? 9 : 3) === 0;
      if (on) R(c, k, j, 1, 1, day ? '#dfeaf2' : ['#ffd86b', '#7ff0ff', '#ff7aa8'][(i + j) % 3]);
    }
  }
  // 海
  R(c, 0, 74, SW, 34, day ? '#3f7fb3' : '#0f1a3d');
  for (let j = 0; j < 8; j++) for (let i = 0; i < SW; i += 12) R(c, (i + j * 5 + (t >> 1)) % SW, 78 + j * 4, 5, 1, day ? '#78b3db' : '#2a3c78');
  // 天星小輪
  const fx = ((t * 1.2) % (SW + 40)) - 30;
  R(c, fx, 88, 26, 5, '#2f6b4f'); R(c, fx + 2, 85, 22, 3, '#f4f1e6'); R(c, fx + 4, 83, 18, 2, '#2f6b4f');
  for (let i = 0; i < 5; i++) R(c, fx + 5 + i * 4, 86, 2, 1, '#2f6b4f');
}
