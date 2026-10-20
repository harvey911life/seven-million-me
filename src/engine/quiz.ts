// 第 6 章 6.3–6.6 突擊測驗同公開試
import type { Game } from './game';
import { streamRng, type RNG } from './rng';
import { clamp } from './util';
import { mkCard, type Card, type Question } from './cards';
import RAW from '../data/questions.json';
import EXTRA from '../data/questions_extra.json';

type Raw = [string, number, number, number, number, string, string, string, string, string, number, string];
export const SUBJ = ['中文', '英文', '數學', '公民與社會發展', '物理', '化學', '生物', '經濟'];
const BANK: (Question & { age: number; exam: boolean; s: number })[] = (RAW as Raw[]).concat(EXTRA as Raw[]).filter((r) => r[1] !== 3).map((r) => ({
  id: r[0], s: r[1], subj: SUBJ[r[1]], diff: r[2] as 0 | 1 | 2, age: r[3], exam: r[4] === 1, q: r[5], opts: [r[6], r[7], r[8], r[9]], ans: r[10], expl: r[11],
}));

export interface QuizAnswer { correct: boolean; timeout: boolean; ms: number }

/** 跨局避重複：最近 300 條（localStorage，讀唔到就當冇） */
function recentSeen(): Set<string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('7m:seenQ') : null;
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
export function rememberSeen(ids: string[]) {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('7m:seenQ');
    const arr = (raw ? (JSON.parse(raw) as string[]) : []).concat(ids).slice(-300);
    localStorage.setItem('7m:seenQ', JSON.stringify(arr));
  } catch { /* 忽略 */ }
}

export function scheduleQuizzes(g: Game) {
  const r = streamRng(g.s.seed, 'quiz', 'schedule');
  // v1.1：一生 1–3 次突擊測驗（平均約 1.5 次，比之前少）
  const x0 = r();
  const n = x0 < 0.55 ? 1 : x0 < 0.9 ? 2 : 3;
  // 公開試前兩年（16、17 歲）唔出測驗，免得似模擬試
  const ages = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const all: number[][] = [];
  const rec = (start: number, cur: number[]) => {
    if (cur.length === n) { if (n === 1 || (cur.some((a) => a <= 11) && cur.some((a) => a >= 12))) all.push([...cur]); return; }
    for (let i = start; i < ages.length; i++) {
      if (cur.length && ages[i] - cur[cur.length - 1] < 2) continue;
      cur.push(ages[i]); rec(i + 1, cur); cur.pop();
    }
  };
  rec(0, []);
  g.s.quizAges = all[Math.floor(r() * all.length)];
}

// 科目權重（6.4.3，冇中史、地理、資通就併入其他）
function subjWeights(age: number, stream?: string): number[] {
  // 中文 英文 數學 公社 物理 化學 生物 經濟
  // 公民與社會發展（index 3）暫時移除
  // v1.1：中英數以外嘅科目大減
  let w = age <= 8 ? [33, 33, 33, 0, 0, 0, 1, 0] : age <= 11 ? [30, 30, 30, 0, 1, 1, 2, 1] : age <= 14 ? [28, 28, 28, 0, 2, 2, 3, 2] : [26, 26, 26, 0, 3, 3, 3, 3];
  if (age >= 15 && stream) {
    const m = stream === '理科' ? [1, 1, 1, 0, 2, 2, 2, 0.5] : stream === '商科' ? [1, 1, 1, 0, 0.5, 0.5, 1, 3] : [1.5, 1.5, 1, 0, 0.5, 0.5, 1, 1];
    w = w.map((v, i) => v * m[i]);
  }
  return w;
}
// v1.0：用家話題目太難，再調易（大部分係易題，難題好少）
const DIFF_W = (age: number) => (age <= 8 ? [85, 15, 0] : age <= 11 ? [75, 23, 2] : age <= 14 ? [65, 31, 4] : [55, 38, 7]);
const pickIdx = (r: RNG, w: number[]) => { const t = w.reduce((a, b) => a + b, 0); let x = r() * t; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; } return w.length - 1; };

function draw(g: Game, r: RNG, n: number, spec: (i: number) => { subj?: number; diff: number; exam: boolean; exclude: Set<number> }): Question[] {
  const s = g.s;
  const seen = new Set(s.seenQ);
  const cross = recentSeen();
  const out: Question[] = [];
  for (let i = 0; i < n; i++) {
    const sp = spec(i);
    const subj = sp.subj ?? pickIdx(r, subjWeights(s.age, s.stream).map((w, k) => (sp.exclude.has(k) ? 0 : w)));
    const okAge = (q: (typeof BANK)[number]) => (sp.exam ? q.exam : !q.exam && q.age <= s.age);
    const tiers = [
      (q: (typeof BANK)[number]) => q.s === subj && q.diff === sp.diff && okAge(q) && !seen.has(q.id) && !cross.has(q.id),
      (q: (typeof BANK)[number]) => q.s === subj && q.diff === sp.diff && okAge(q) && !seen.has(q.id),
      (q: (typeof BANK)[number]) => q.s === subj && okAge(q) && !seen.has(q.id),
      (q: (typeof BANK)[number]) => okAge(q) && !seen.has(q.id),
      (q: (typeof BANK)[number]) => okAge(q),
    ];
    let pool: typeof BANK = [];
    for (const t of tiers) { pool = BANK.filter(t); if (pool.length) break; }
    // 偏向接近當前年齡嘅題目
    if (!sp.exam) {
      const near = pool.filter((q) => q.age >= s.age - 4);
      if (near.length && r() < 0.75) pool = near;
    }
    const q = pool[Math.floor(r() * pool.length)];
    seen.add(q.id);
    s.seenQ.push(q.id);
    sp.exclude.add(q.s);
    // 選項隨機排列
    const order = [0, 1, 2, 3].sort(() => r() - 0.5);
    out.push({ id: q.id, subj: q.subj, diff: q.diff, q: q.q, opts: order.map((k) => q.opts[k]), ans: order.indexOf(q.ans), expl: q.expl });
  }
  return out;
}

export function quizCard(g: Game): Card {
  const s = g.s;
  const r = streamRng(s.seed, 'quiz', s.age);
  const exclude = new Set<number>();
  const qs = draw(g, r, 3, () => ({ diff: pickIdx(r, DIFF_W(s.age)), exam: false, exclude }));
  const mock = s.age === 17;
  const c = mkCard('QUIZ', mock ? '模擬考！' : '突擊測驗！', mock ? '公開試之前嘅模擬考，3 條題目，每條 10 秒。' : '老師突然派卷：3 條題目，每條 10 秒。', [{ label: '開始' }], (g2) => applyQuiz(g2, c), { kind: 'quiz', pri: 860, quiz: qs, mock, scene: 'school' });
  return c;
}

export function autoAnswers(g: Game, qs: Question[], r: RNG): QuizAnswer[] {
  return qs.map((q) => ({ correct: r() < clamp(0.35 + 0.5 * g.s.K / 100 + [0.15, 0, -0.15][q.diff], 0.1, 0.95), timeout: false, ms: 5000 }));
}

function applyQuiz(g: Game, c: Card): string {
  const s = g.s;
  const ans: QuizAnswer[] = (c as Card & { answers?: QuizAnswer[] }).answers ?? autoAnswers(g, c.quiz!, streamRng(s.seed, 'autoquiz', s.age));
  let right = 0;
  let k = 0;
  ans.forEach((a, i) => {
    s.quizTotal++;
    if (a.timeout) s.quizTimeouts++;
    if (a.correct) { right++; k += [1, 2, 3][c.quiz![i].diff]; } else g.add('J', -0.5);
  });
  s.quizCorrect += right;
  if (right < 3) s.quizPerfectAll = false;
  g.add('K', k, '測驗');
  if (right === 3) { g.add('K', 1); g.add('J', 2, '測驗滿分'); }
  if (right === 0) g.add('J', -1);
  rememberSeen(c.quiz!.map((q) => q.id));
  // 最後一次測驗後判定突擊測驗王
  const last = s.quizAges[s.quizAges.length - 1];
  if (s.age === last && s.quizPerfectAll && !(c as Card & { auto?: boolean }).auto && !s.flags['autoQuiz']) g.ach('quiz_king');
  return right === 3 ? '滿分！' : right === 0 ? '下次努力。' : `答啱 ${right} 題。`;
}

// ---------- 公開試 ----------
const P_UNI = (k: number) => (k >= 80 ? 0.85 : k >= 60 ? 0.5 : k >= 40 ? 0.15 : 0.03);
const P_SUB = (k: number) => (k >= 80 ? 0.99 : k >= 60 ? 0.9 : k >= 40 ? 0.65 : 0.3);
const DELTA = (c: number) => (c >= 8 ? 15 : c === 7 ? 10 : c === 6 ? 5 : c === 5 ? 0 : c === 4 ? -5 : c === 3 ? -10 : -15);
export const GRADE = (c: number) => (c >= 8 ? 'S' : c === 7 ? 'A' : c === 6 ? 'B' : c === 5 ? 'C' : c === 4 ? 'D' : c === 3 ? 'E' : 'F');
const eraUni = (y: number) => (y < 2000 ? 0.5 : y < 2012 ? 0.75 : 1);
// v1.7：8 題全對必入大學；4–6 題收緊（用戶 10-20），少過 4 題入唔到
const C_UNI: Record<number, number> = { 4: 0.2, 5: 0.55, 6: 0.65, 7: 1 };
const UNI_MIN = 4;
const pUni = (k: number, c: number, y: number) => (c >= 8 ? 1 : c < UNI_MIN ? 0 : P_UNI(k) * eraUni(y) * C_UNI[c]);

export function examCard(g: Game, onDone: (g: Game) => void): Card {
  const s = g.s;
  const r = streamRng(s.seed, 'exam', s.age);
  const exclude = new Set<number>();
  const electives = s.stream === '理科' ? [4, 5, 6] : s.stream === '商科' ? [7, 2] : [7, 0];
  const spec = [
    { subj: 0, diff: 0 }, { subj: 1, diff: 0 }, { subj: 2, diff: 0 }, { subj: 2, diff: 0 },
    // v1.0：調易，5 條易、3 條中等，冇難題
    // v1.1：中英數佔大多數，選修只得一條，另一條按科目權重抽
    { subj: r.pick(electives), diff: 0 }, { subj: 0, diff: 1 }, { subj: 1, diff: 1 }, { subj: undefined, diff: 1 },
  ];
  const qs = draw(g, r, 8, (i) => ({ subj: spec[i].subj, diff: spec[i].diff, exam: true, exclude: i === 7 ? new Set<number>() : exclude }));
  qs.sort(() => r() - 0.5);
  const c = mkCard('EXAM', s.examTries ? '重考公開試' : '公開試', '8 條題目連續作答，每條 15 秒，中間唔會停。入大學最少要答啱 4 題，全對就一定入到。', [{ label: '入試場' }], (g2) => {
    const res = applyExam(g2, c);
    onDone(g2);
    return res;
  }, { kind: 'exam', pri: 865, quiz: qs, scene: 'exam' });
  return c;
}

function applyExam(g: Game, c: Card): string {
  const s = g.s;
  const ans: QuizAnswer[] = (c as Card & { answers?: QuizAnswer[] }).answers ?? autoAnswers(g, c.quiz!, streamRng(s.seed, 'autoexam', s.age));
  const C = ans.filter((a) => a.correct).length;
  rememberSeen(c.quiz!.map((q) => q.id));
  const r = streamRng(s.seed, 'examResult', s.age);
  const kBefore = s.K;
  const kEff = clamp(kBefore + DELTA(C), 0, 100);
  const pu = pUni(kEff, C, s.year);
  const ps = Math.max(P_SUB(kEff), pu);
  const x = r();
  const result = x < pu ? '達大學要求' : x < ps ? '達副學位要求' : '未達副學位要求';
  const short = result !== '達大學要求' && x < pUni(clamp(kBefore + DELTA(C + 1), 0, 100), C + 1, s.year);
  g.add('K', (C - 4) * 0.5);
  s.examTries++;
  // 取較好嘅結果
  const rank = (t?: string) => (t === '達大學要求' ? 2 : t === '達副學位要求' ? 1 : 0);
  if (s.examCorrect === null || C > s.examCorrect) s.examCorrect = C;
  if (rank(result) >= rank(s.examResult)) { s.examResult = result; s.examR = kEff; }
  if (C === 8 && !s.flags['autoQuiz']) g.ach('exam_top');
  if (short) { g.ach('one_mark_short'); g.add('J', -8, '差一分入大學'); }
  if (result === '達大學要求') g.add('J', 3, '放榜');
  const grade = GRADE(C);
  const t = `答啱 ${C}/8，成績 ${grade}。結果：${s.examResult}${short ? '（差一題就入到大學！）' : ''}。`;
  g.flag('examText', t);
  return t;
}
