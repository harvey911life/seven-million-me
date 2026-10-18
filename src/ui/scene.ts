// 像素場景：160 × 64 原圖，只畫背景同人物（其他 UI 用普通網頁元素）
import type { State } from '../engine/state';

export const SW = 160;
export const SH = 64;
const GROUND = SH - 8; // 人企喺呢條線

type Ctx = CanvasRenderingContext2D;
const R = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };
function hash(n: number) { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; }

// ---------- 人物造型 ----------
// h 頭髮 s 皮膚 e 眼 m 嘴（女仔紅唇）t 上衣 b 褲 / 裙 k 鞋 w 白（領 / 蝴蝶結）
const SPR: Record<string, string[]> = {
  baby: [
    '..hhh..',
    '.hssss.',
    '.seses.',
    '.sssss.',
    '..www..',
  ],
  kidM: [
    '..hhhh..',
    '.hhhhhh.',
    '.hssssh.',
    '.sesses.',
    '.ssssss.',
    '..ssss..',
    '.tttttt.',
    'stttttts',
    's.tttt.s',
    '..tttt..',
    '..bbbb..',
    '..b..b..',
    '..b..b..',
    '..k..k..',
  ],
  kidF: [
    'w.hhhh.w',
    'hhhhhhhh',
    'hhssssh.',
    '.sesses.',
    '.smssms.',
    '..ssss..',
    '.tttttt.',
    'stttttts',
    's.tttt.s',
    '.bbbbbb.',
    'bbbbbbbb',
    '..s..s..',
    '..s..s..',
    '..k..k..',
  ],
  teenM: [
    '...hhhh...',
    '..hhhhhh..',
    '..hssssh..',
    '..sesses..',
    '..ssssss..',
    '...ssss...',
    '..wtwwtw..',
    '.tttttttt.',
    's.tttttt.s',
    's.tttttt.s',
    '..tttttt..',
    '..bbbbbb..',
    '..bb..bb..',
    '..bb..bb..',
    '..bb..bb..',
    '..bb..bb..',
    '..kk..kk..',
  ],
  teenF: [
    '...hhhh...',
    '..hhhhhh..',
    '.hhssssh..',
    '.hsesseh..',
    '.hssssssh.',
    '.hhsmmshh.',
    '.hh.ss.hh.',
    '..wtwwtw..',
    '.tttttttt.',
    's.tttttt.s',
    's.tttttt.s',
    '..bbbbbb..',
    '.bbbbbbbb.',
    '.bbbbbbbb.',
    '...s..s...',
    '...s..s...',
    '...k..k...',
  ],
  adultM: [
    '...hhhh...',
    '..hhhhhh..',
    '..hssssh..',
    '..sesses..',
    '..ssssss..',
    '...ssss...',
    '....ss....',
    '..tttttt..',
    '.tttttttt.',
    's.tttttt.s',
    's.tttttt.s',
    's.tttttt.s',
    '..tttttt..',
    '..bbbbbb..',
    '..bb..bb..',
    '..bb..bb..',
    '..bb..bb..',
    '..bb..bb..',
    '..bb..bb..',
    '..kk..kk..',
  ],
  adultF: [
    '...hhhh...',
    '..hhhhhh..',
    '.hhssssh..',
    '.hsesseh..',
    '.hssssssh.',
    '.hhsmmshh.',
    '.hh.ss.hh.',
    '.hhttttthh',
    '.tttttttt.',
    's.tttttt.s',
    's.tttttt.s',
    '..tttttt..',
    '..tttttt..',
    '.bbbbbbbb.',
    '.bbbbbbbb.',
    'bbbbbbbbbb',
    '...s..s...',
    '...s..s...',
    '...s..s...',
    '...k..k...',
  ],
  elderM: [
    '..........',
    '..hh..hh..',
    '..hssssh..',
    '..sesses..',
    '..ssssss..',
    '...ssss...',
    '....ss....',
    '..tttttt..',
    '.tttttttt.',
    's.tttttt.s',
    's.tttttt.s',
    '..tttttt..',
    '..bbbbbb..',
    '..bb..bb..',
    '..bb..bb..',
    '..bb..bb..',
    '..bb..bb..',
    '..kk..kk..',
  ],
  elderF: [
    '....hh....',
    '...hhhh...',
    '..hhhhhh..',
    '..hssssh..',
    '..sesses..',
    '..smssms..',
    '...ssss...',
    '..tttttt..',
    '.tttttttt.',
    's.tttttt.s',
    's.tttttt.s',
    '..tttttt..',
    '.bbbbbbbb.',
    '.bbbbbbbb.',
    '...s..s...',
    '...s..s...',
    '...k..k...',
  ],
};

interface Pal { h: string; s: string; t: string; b: string; k: string; m: string }
const BASE: Record<string, string> = { e: '#2a1e1a', w: '#ffffff' };

function drawSprite(c: Ctx, rows: string[], x: number, feet: number, pal: Pal, bob = 0) {
  const top = feet - rows.length - bob;
  const left = Math.round(x - rows[0].length / 2);
  const map = pal as unknown as Record<string, string>;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const col = map[ch] ?? BASE[ch];
      if (col) R(c, left + i, top + j, 1, 1, col);
    }
  });
}

type Who = { sex: 'M' | 'F'; age: number; role: 'me' | 'partner' | 'kid'; status?: State['status']; level?: number };

function palette(w: Who): Pal {
  const female = w.sex === 'F';
  const hair = w.age >= 70 ? '#e9e9ef' : w.age >= 52 ? '#9a9aa6' : female ? '#5a2e1c' : '#1f1a18';
  const skin = '#f5c9a6';
  let t = female ? '#ee6f9a' : '#3f7fd8';
  let b = female ? '#7a4fc2' : '#33415e';
  if (w.age >= 6 && w.age < 18) { t = '#ffffff'; b = female ? '#4f8fd8' : '#7d8597'; } // 校服：女仔藍色裙、男仔灰褲
  else if (w.role === 'me' && w.status === 'work' && (w.level ?? 0) >= 3) { t = female ? '#3a3f63' : '#2c3550'; b = female ? '#3a3f63' : '#23293d'; }
  else if (w.role === 'partner') { t = female ? '#f29a4a' : '#3fa37a'; b = female ? '#c4543c' : '#3a4256'; }
  else if (w.age >= 65) { t = female ? '#c27aa8' : '#b98a52'; b = female ? '#6a5a8a' : '#5a5148'; }
  return { h: hair, s: skin, t, b, k: '#2a2a33', m: female ? '#e2475f' : skin };
}

function spriteFor(w: Who): string[] {
  const f = w.sex === 'F' ? 'F' : 'M';
  if (w.age < 3) return SPR.baby;
  if (w.age < 12) return SPR['kid' + f];
  if (w.age < 18) return SPR['teen' + f];
  if (w.age < 65) return SPR['adult' + f];
  return SPR['elder' + f];
}

function person(c: Ctx, x: number, w: Who, t: number, phase = 0, cane = false) {
  if (w.age < 3) {
    // BB 車
    R(c, x - 6, GROUND - 7, 12, 4, '#7fb6ea'); R(c, x - 6, GROUND - 10, 4, 4, '#7fb6ea');
    R(c, x - 5, GROUND - 2, 2, 2, '#333'); R(c, x + 3, GROUND - 2, 2, 2, '#333');
    drawSprite(c, SPR.baby, x + 1, GROUND - 6, palette(w));
    return;
  }
  const bob = ((t + phase) >> 2) % 2;
  drawSprite(c, spriteFor(w), x, GROUND, palette(w), bob);
  if (cane) { R(c, x + 6, GROUND - 11, 1, 11, '#7a5a3a'); R(c, x + 5, GROUND - 11, 2, 1, '#7a5a3a'); }
}

// ---------- 寵物（貓 / 狗，按數量顯示） ----------
const PET_SPR: Record<'cat' | 'dog', string[]> = {
  cat: ['k...k..', 'kak.ak.', 'aeaeaa.', 'aaaaa.k', '.aaaaak', '.a.a.a.'],
  dog: ['kk......', 'kaa.....', 'aeaa...k', 'aaaaaaak', '.aaaaaa.', '.a.a.aa.', '.a.a..a.'],
};
const PET_COL = ['#f0a04b', '#8a6a4a', '#d9d4c7', '#444a52'];
function pet(c: Ctx, x: number, kind: 'cat' | 'dog', i: number, t: number) {
  const col = PET_COL[(hash(i * 31 + (kind === 'cat' ? 1 : 7)) >> 3) % PET_COL.length];
  const bob = ((t + i * 3) >> 3) % 2;
  drawSprite(c, PET_SPR[kind], x, GROUND, { h: col, s: col, t: col, b: col, k: '#2a2a33', m: col, a: col } as unknown as Pal, bob);
}

// ---------- 背景 ----------
function sky(age: number) {
  if (age < 18) return { bands: ['#7cc4f2', '#9bd3f5', '#bde3f8', '#dcf1fb'], sun: '#fff1a8', stars: false, hill: '#6aa784', far: '#a9c6d6' };
  if (age < 65) return { bands: ['#ffb38a', '#ffc9a0', '#ffdcb6', '#ffeccd'], sun: '#fff3c4', stars: false, hill: '#8a7aa8', far: '#c9b3c9' };
  return { bands: ['#28305e', '#34407a', '#45528f', '#5a67a3'], sun: null, stars: true, hill: '#2a3360', far: '#3b4677' };
}

function lionRock(c: Ctx, col: string) {
  const h = [10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 27, 28, 28, 27, 25, 23, 22, 21, 20, 19, 17, 15, 13, 12, 11, 10];
  const step = SW / (h.length - 1);
  for (let i = 0; i < SW; i++) {
    const k = i / step;
    const a = h[Math.floor(k)];
    const b = h[Math.min(h.length - 1, Math.ceil(k))];
    const v = a + (b - a) * (k - Math.floor(k));
    R(c, i, GROUND - 14 - v, 1, v + 2, col);
  }
}

function windows(c: Ctx, x: number, y: number, w: number, h: number, gx: number, gy: number, lit: string, dark: string, seed: number, night: boolean) {
  for (let j = y + 2; j < y + h - 2; j += gy) for (let i = x + 2; i < x + w - 2; i += gx) {
    const r = hash(seed + i * 31 + j * 17);
    R(c, i, j, 1, 1, (night ? r % 3 !== 0 : r % 6 === 0) ? lit : dark);
  }
}

function home(c: Ctx, kind: State['home'], night: boolean) {
  const lit = night ? '#ffd86b' : '#ffffff';
  const g = GROUND;
  switch (kind) {
    case 'public':
      R(c, 6, g - 44, 28, 44, '#f0b9a9'); windows(c, 6, g - 42, 28, 42, 3, 3, lit, '#b88a86', 11, night);
      R(c, 36, g - 36, 22, 36, '#a9d9c6'); windows(c, 36, g - 34, 22, 34, 3, 3, lit, '#76a596', 23, night);
      break;
    case 'subdiv':
      R(c, 8, g - 32, 40, 32, '#bba58a'); windows(c, 8, g - 30, 40, 30, 4, 4, lit, '#7f6c58', 37, night);
      R(c, 50, g - 26, 7, 14, night ? '#ff5f7e' : '#d9435e'); R(c, 51, g - 24, 5, 1, '#ffe1a8'); R(c, 51, g - 20, 5, 1, '#ffe1a8');
      break;
    case 'own':
      R(c, 8, g - 50, 22, 50, '#6d9ccc'); windows(c, 8, g - 48, 22, 48, 2, 3, lit, '#4f7eae', 41, night);
      R(c, 32, g - 40, 20, 40, '#86b0da'); windows(c, 32, g - 38, 20, 38, 2, 3, lit, '#5f8cbc', 43, night);
      R(c, 4, g - 3, 52, 3, '#8cc26e');
      break;
    case 'village':
      R(c, 12, g - 22, 34, 22, '#fbefd2'); for (let j = 0; j < 6; j++) R(c, 10 + j, g - 28 + j, 38 - j * 2, 1, '#d0613f');
      windows(c, 12, g - 20, 34, 20, 6, 7, lit, '#a8946e', 53, night);
      R(c, 2, g - 16, 6, 16, '#5a8f3e'); R(c, 0, g - 22, 10, 8, '#6fae4c');
      break;
    case 'institution':
      R(c, 8, g - 22, 48, 22, '#ece4d4'); windows(c, 8, g - 20, 48, 20, 5, 5, lit, '#b2a892', 61, night);
      R(c, 32, g - 32, 1, 10, '#666'); R(c, 33, g - 32, 6, 4, '#ffb03a');
      break;
    default:
      R(c, 6, g - 38, 26, 38, '#dcd5c8'); windows(c, 6, g - 36, 26, 36, 3, 4, lit, '#a29b8e', 71, night);
      R(c, 34, g - 30, 22, 30, '#cbc2b2'); windows(c, 34, g - 28, 22, 28, 3, 4, lit, '#938a7b', 73, night);
  }
}

export function drawScene(c: Ctx, s: State, t: number) {
  const sk = sky(s.age);
  const bh = Math.ceil(GROUND / sk.bands.length);
  sk.bands.forEach((col, i) => R(c, 0, i * bh, SW, bh + 1, col));
  if (sk.stars) for (let i = 0; i < 20; i++) { const r = hash(i * 97); if ((t + i) % 17 !== 0) R(c, r % SW, (r >> 8) % 28, 1, 1, '#fff6d0'); }
  if (sk.sun) { R(c, 124, 7, 8, 8, sk.sun); R(c, 122, 9, 12, 4, sk.sun); } else { R(c, 128, 6, 6, 6, '#f3f0d8'); R(c, 130, 6, 4, 4, sk.bands[0]); }
  if (!sk.stars) for (let i = 0; i < 3; i++) { const cx = ((t / 3 + i * 60) % (SW + 30)) - 15; R(c, cx, 10 + i * 6, 14, 2, 'rgba(255,255,255,.7)'); R(c, cx + 3, 9 + i * 6, 7, 1, 'rgba(255,255,255,.7)'); }
  lionRock(c, sk.hill);
  for (let i = 0; i < 12; i++) { const r = hash(i * 13 + 5); const w = 7 + (r % 6); const hh = 8 + (r >> 4) % 16; R(c, 62 + i * 8, GROUND - hh, w, hh, sk.far); }
  home(c, s.home, sk.stars);
  if (s.year >= 2035) { const fx = (t * 2) % (SW + 20) - 10; R(c, fx, 14, 5, 2, '#7ff0ff'); }
  // 地面
  R(c, 0, GROUND, SW, 2, '#b9b6ad'); R(c, 0, GROUND + 2, SW, SH - GROUND - 2, '#5a5d66');
  for (let i = 0; i < SW; i += 14) R(c, (i + (t % 14)) % SW, SH - 3, 7, 1, '#e3d98a');
  // 人物：自己、伴侶、細路
  const meX = 104;
  const p = s.partner;
  if (p && p.alive && (s.married || s.datingYears > 0) && s.age >= 15) person(c, meX + 13, { sex: p.sex, age: Math.max(18, p.age), role: 'partner' }, t, 3);
  const kids = s.kids.filter((k) => !k.away && !k.emigrated && k.age < 18).slice(0, 3);
  kids.forEach((k, i) => person(c, meX - 12 - i * 10, { sex: k.sex ?? (hash(k.name.length * 7 + i) % 2 ? 'M' : 'F'), age: Math.max(1, k.age), role: 'kid' }, t, i + 1));
  person(c, meX, { sex: s.gender, age: s.age, role: 'me', status: s.status, level: s.job?.level }, t, 0, s.age >= 65 && s.H < 30);
  // 寵物排喺右邊
  (s.pets ?? []).slice(0, 4).forEach((pt, i) => pet(c, 127 + i * 9, pt.kind, i, t));
}

/** 頭像（結局用） */
export function drawPortrait(c: Ctx, s: State) {
  R(c, 0, 0, 24, 24, '#e8eefb');
  const w: Who = { sex: s.gender, age: Math.max(18, s.age), role: 'me', status: s.status, level: s.job?.level };
  drawSprite(c, spriteFor(w), 12, 22, palette(w));
}

/** 標題畫面：維港，天星小輪橫過 */
export function drawTitle(c: Ctx, t: number, day: boolean) {
  const bands = day ? ['#7cc4f2', '#9bd3f5', '#bde3f8', '#dcf1fb'] : ['#28305e', '#34407a', '#45528f', '#5a67a3'];
  bands.forEach((col, i) => R(c, 0, i * 10, SW, 11, col));
  if (!day) for (let i = 0; i < 24; i++) { const r = hash(i * 131); if ((t + i) % 13 !== 0) R(c, r % SW, (r >> 8) % 26, 1, 1, '#fff6d0'); }
  const h = [8, 10, 13, 16, 20, 24, 26, 27, 25, 22, 20, 18, 15, 12, 10, 9];
  for (let i = 0; i < SW; i++) { const v = h[Math.floor((i / SW) * h.length)]; R(c, i, 40 - v, 1, v, day ? '#6aa784' : '#2a3360'); }
  for (let i = 0; i < 22; i++) {
    const r = hash(i * 29 + 3);
    const w = 4 + (r % 4);
    const hh = 8 + ((r >> 5) % 20) + (i === 9 ? 10 : 0);
    const x = i * 7.4;
    R(c, x, 44 - hh, w, hh, day ? '#9fb3c4' : '#3b4677');
    for (let j = 44 - hh + 2; j < 43; j += 2) for (let k = x + 1; k < x + w - 1; k += 2) if (hash((k | 0) * 7 + j * 3 + i) % (day ? 7 : 3) === 0) R(c, k, j, 1, 1, day ? '#ffffff' : ['#ffd86b', '#7ff0ff', '#ff9ac0'][(i + j) % 3]);
  }
  R(c, 0, 44, SW, 20, day ? '#4a8cc4' : '#1d2a5c');
  for (let j = 0; j < 5; j++) for (let i = 0; i < SW; i += 10) R(c, (i + j * 4 + (t >> 1)) % SW, 47 + j * 3, 4, 1, day ? '#8cc3e8' : '#3a4c8c');
  const fx = ((t * 1.2) % (SW + 36)) - 28;
  R(c, fx, 52, 22, 4, '#2f7a57'); R(c, fx + 2, 49, 18, 3, '#fbf8ee'); R(c, fx + 4, 47, 14, 2, '#2f7a57');
}
