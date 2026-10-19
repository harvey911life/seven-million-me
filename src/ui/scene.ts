// 像素場景：160 × 64 原圖，只畫背景同人物（其他 UI 用普通網頁元素）
import type { State } from '../engine/state';
import { HARBOUR_NIGHT } from '../assets/harbour';
import { atFamilyHome } from '../engine/family';

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

function drawSprite(c: Ctx, rows: string[], x: number, feet: number, pal: Pal, bob = 0, k = 1) {
  const top = feet - rows.length * k - bob;
  const left = Math.round(x - (rows[0].length * k) / 2);
  const map = pal as unknown as Record<string, string>;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const col = map[ch] ?? BASE[ch];
      if (col) R(c, left + i * k, top + j * k, k, k, col);
    }
  });
}

type Who = { sex: 'M' | 'F'; age: number; role: 'me' | 'partner' | 'kid' | 'parent'; status?: State['status']; level?: number };

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
  else if (w.role === 'parent') { t = female ? '#e0a640' : '#5f8f5a'; b = female ? '#8a5a3c' : '#4a4a58'; }
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
// 楊桃：白底啡花（a 白、b 啡）
const YT_SPR = ['k...k..', 'kbk.ak.', 'aeaebb.', 'abbaa.k', '.aabbak', '.a.a.b.'];
const PET_COL = ['#f0a04b', '#8a6a4a', '#d9d4c7', '#444a52'];
function pet(c: Ctx, x: number, kind: 'cat' | 'dog', i: number, t: number, giant = false, talk = false, yt = false) {
  const col = giant ? '#f0a04b' : PET_COL[(hash(i * 31 + (kind === 'cat' ? 1 : 7)) >> 3) % PET_COL.length];
  const bob = ((t + i * 3) >> 3) % 2;
  const k = giant ? 5 : 1;
  // 彩蛋：超巨型貓企喺最右邊，大過成棟樓
  const px = giant ? SW - 19 : x;
  const pal = yt ? { k: '#2a2a33', a: '#f6f2ea', b: '#9a6234' } : { h: col, s: col, t: col, b: col, k: '#2a2a33', m: col, a: col };
  drawSprite(c, yt ? YT_SPR : PET_SPR[kind], px, GROUND, pal as unknown as Pal, giant ? 0 : bob, k);
  if (talk && (t >> 4) % 3 !== 2) {
    // 對話氣泡：白色框 + 三點
    const bx = px - 2, by = GROUND - 6 * k - 9 - (giant ? 0 : bob);
    R(c, bx, by, 11, 6, '#2a2a33'); R(c, bx + 1, by + 1, 9, 4, '#ffffff'); R(c, bx + 1, by + 6, 2, 2, '#2a2a33'); R(c, bx + 2, by + 6, 1, 1, '#ffffff');
    const dots = ((t >> 2) % 3) + 1;
    for (let d = 0; d < dots; d++) R(c, bx + 3 + d * 2, by + 3, 1, 1, '#2a2a33');
  }
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

// 維港夜景相：有相先載入；每世 1% 機會（s.flags.harbourNight）喺夜晚場景代替像素背景
let harbour: HTMLImageElement | null = null;
if (HARBOUR_NIGHT && typeof Image !== 'undefined') { const im = new Image(); im.onload = () => { harbour = im; }; im.src = HARBOUR_NIGHT; }

export function drawScene(c: Ctx, s: State, t: number) {
  const sk = sky(s.age);
  if (sk.stars && harbour && s.flags['harbourNight']) {
    c.imageSmoothingEnabled = true;
    c.drawImage(harbour, 0, 0, harbour.width, harbour.height, 0, 0, SW, GROUND);
    ground(c, t);
    people(c, s, t);
    return;
  }
  const bh = Math.ceil(GROUND / sk.bands.length);
  sk.bands.forEach((col, i) => R(c, 0, i * bh, SW, bh + 1, col));
  if (sk.stars) for (let i = 0; i < 20; i++) { const r = hash(i * 97); if ((t + i) % 17 !== 0) R(c, r % SW, (r >> 8) % 28, 1, 1, '#fff6d0'); }
  if (sk.sun) { R(c, 124, 7, 8, 8, sk.sun); R(c, 122, 9, 12, 4, sk.sun); } else { R(c, 128, 6, 6, 6, '#f3f0d8'); R(c, 130, 6, 4, 4, sk.bands[0]); }
  if (!sk.stars) for (let i = 0; i < 3; i++) { const cx = ((t / 3 + i * 60) % (SW + 30)) - 15; R(c, cx, 10 + i * 6, 14, 2, 'rgba(255,255,255,.7)'); R(c, cx + 3, 9 + i * 6, 7, 1, 'rgba(255,255,255,.7)'); }
  lionRock(c, sk.hill);
  for (let i = 0; i < 12; i++) { const r = hash(i * 13 + 5); const w = 7 + (r % 6); const hh = 8 + (r >> 4) % 16; R(c, 62 + i * 8, GROUND - hh, w, hh, sk.far); }
  home(c, s.home, sk.stars);
  if (s.year >= 2035) { const fx = (t * 2) % (SW + 20) - 10; R(c, fx, 14, 5, 2, '#7ff0ff'); }
  ground(c, t);
  people(c, s, t);
}

function ground(c: Ctx, t: number) {
  R(c, 0, GROUND, SW, 2, '#b9b6ad'); R(c, 0, GROUND + 2, SW, SH - GROUND - 2, '#5a5d66');
  for (let i = 0; i < SW; i += 14) R(c, (i + (t % 14)) % SW, SH - 3, 7, 1, '#e3d98a');
}

/** 人物：自己、伴侶、細路、寵物 */
function people(c: Ctx, s: State, t: number) {
  const meX = 104;
  const p = s.partner;
  if (p && p.alive && (s.married || s.datingYears > 0) && s.age >= 15) person(c, meX + 13, { sex: p.sex, age: Math.max(18, p.age), role: 'partner' }, t, 3);
  const kids = s.kids.filter((k) => !k.away && !k.emigrated && k.age < 18).slice(0, 3);
  kids.forEach((k, i) => person(c, meX - 12 - i * 10, { sex: k.sex ?? (hash(k.name.length * 7 + i) % 2 ? 'M' : 'F'), age: Math.max(1, k.age), role: 'kid' }, t, i + 1));
  // v1.0：同父母住（細個、未搬出、或者接咗父母返嚟住）就畫埋爸爸媽媽
  const withParents = atFamilyHome(s) || (s.support === 'live' && s.home !== 'institution');
  if (withParents) {
    const x0 = meX - 16 - kids.length * 10;
    s.parents.filter((pa) => pa.alive).forEach((pa, i) => person(c, x0 - i * 11, { sex: pa.role === '父' ? 'M' : 'F', age: Math.max(25, pa.age), role: 'parent' }, t, 5 + i, pa.age >= 75 && pa.health < 40));
  }
  person(c, meX, { sex: s.gender, age: s.age, role: 'me', status: s.status, level: s.job?.level }, t, 0, s.age >= 65 && s.H < 30);
  // 寵物排喺右邊
  // 第 5 隻起（有自住物業最多 10 隻）排喺最左邊
  (s.pets ?? []).slice(0, 10).forEach((pt, i) => pet(c, i < 4 ? 127 + i * 9 : 2 + (i - 4) * 8, pt.kind, i, t, !!pt.giant, !!pt.talk, !!pt.yt));
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

/** 終局事件動畫（12.2）：外星人 = 維港上空飛碟光束、全城燈熄；殭屍 = 一堆綠色殭屍慢慢行近屋企 */
export function drawApocalypse(c: Ctx, kind: 'alien' | 'zombie', t: number, fridgeFull = false) {
  const alien = kind === 'alien';
  const bands = alien ? ['#120f2a', '#1b1740', '#262055', '#302a66'] : ['#2b3a2a', '#3a4d34', '#4f6340', '#6a7a4c'];
  bands.forEach((col, i) => R(c, 0, i * 14, SW, 15, col));
  for (let i = 0; i < 24; i++) { const r = hash(i * 61 + 7); if ((t + i) % 11 !== 0) R(c, r % SW, (r >> 8) % 30, 1, 1, alien ? '#fff6d0' : '#c9d6a0'); }
  // 天際線：外星人版全城燈熄
  for (let i = 0; i < 20; i++) {
    const r = hash(i * 37 + 11);
    const w = 6 + (r % 5), hh = 10 + ((r >> 4) % 22), x = i * 8;
    R(c, x, GROUND - hh, w, hh, alien ? '#0b0a1a' : '#26301f');
    if (!alien) for (let j = GROUND - hh + 2; j < GROUND - 2; j += 3) if (hash(x * 3 + j) % 5 === 0) R(c, x + 2, j, 1, 1, '#9ec26a');
  }
  if (alien) {
    const ux = 80 + Math.round(Math.sin(t / 12) * 18), uy = 12;
    // 光束
    const flick = (t >> 1) % 2 ? 'rgba(255,240,140,.30)' : 'rgba(255,240,140,.22)';
    for (let y = uy + 5; y < GROUND; y++) { const half = 3 + Math.floor((y - uy) * 0.45); R(c, ux - half, y, half * 2, 1, flick); }
    // 飛碟
    R(c, ux - 6, uy - 4, 12, 3, '#9fe7ff'); R(c, ux - 4, uy - 6, 8, 2, '#c9f3ff');
    R(c, ux - 16, uy - 1, 32, 3, '#8a93a6'); R(c, ux - 20, uy + 2, 40, 3, '#5d6578'); R(c, ux - 12, uy + 5, 24, 2, '#3f4657');
    for (let i = 0; i < 7; i++) R(c, ux - 18 + i * 6, uy + 3, 2, 1, (t + i * 3) % 8 < 4 ? '#ffde59' : '#ff5f7e');
    // 卡通像素煙花
    for (let k = 0; k < 3; k++) {
      const ph = (t + k * 17) % 34;
      if (ph > 16) continue;
      const cx = 24 + k * 52, cy = 18 + (k % 2) * 8, rr = ph >> 1;
      const col = ['#ff9ac0', '#7ff0ff', '#ffd86b'][k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) R(c, cx + dx * rr, cy + dy * rr, 1, 1, col);
    }
  } else {
    // 右邊屋企，窗口望入去見到角色食罐頭
    R(c, 118, GROUND - 30, 40, 30, '#7d6a55'); R(c, 116, GROUND - 32, 44, 3, '#4a3d30');
    R(c, 126, GROUND - 24, 14, 10, '#ffe7a3'); R(c, 132, GROUND - 24, 1, 10, '#4a3d30');
    R(c, 129, GROUND - 19, 3, 3, '#f3c9a4'); R(c, 130, GROUND - 16, 2, 2, '#c0c7cf');
    R(c, 146, GROUND - 26, 8, 14, '#e8edf0'); R(c, 147, GROUND - 25, 6, 12, fridgeFull ? '#f2c14e' : '#ffffff');
    if (fridgeFull) for (let j = 0; j < 3; j++) R(c, 148, GROUND - 24 + j * 4, 4, 2, ['#d6455d', '#4caf6d', '#f08a3c'][j]);
    // 殭屍
    for (let i = 0; i < 7; i++) {
      const x = ((t * 0.35 + i * 17) % 112) - 6;
      const bob = ((t >> 2) + i) % 2;
      R(c, x + 1, GROUND - 13 + bob, 4, 4, '#8fbf6a'); R(c, x + 2, GROUND - 12 + bob, 1, 1, '#d6455d');
      R(c, x, GROUND - 9 + bob, 6, 5, '#5b6e8a'); R(c, x + 5, GROUND - 9 + bob, 4, 1, '#8fbf6a');
      R(c, x + 1, GROUND - 4, 2, 4, '#3d4a5e'); R(c, x + 3, GROUND - 4, 2, 4, '#3d4a5e');
    }
  }
  ground(c, t);
}
