// 無畫面模擬：npm run sim -- 300
import { playHeadless } from '../src/engine/agui';
import { computeEnding, endAchievements } from '../src/engine/ending';

const N = Number(process.argv[2] ?? 200);
const mode = (process.argv[3] ?? 'def') as 'def' | 'auto' | 'agui';
const st = { age: 0, married: 0, divorced: 0, kids: 0, own: 0, scammed: 0, total: 0, M: 0, cards: 0, years: 0, uni: 0, errors: 0, ach: 0, net: 0, earn: 0 };
const causes: Record<string, number> = {};
const achCount: Record<string, number> = {};
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seed = 1000 + i * 7919;
  try {
    const g = playHeadless(seed, null, mode);
    const e = computeEnding(g);
    endAchievements(g, e);
    const s = g.s;
    st.age += s.age;
    if (s.marriedAt !== null || s.divorces || s.widowed) st.married++;
    if (s.divorces) st.divorced++;
    st.kids += s.kids.length;
    if (s.flags['ownedBefore']) st.own++;
    if (s.ach.includes('scammed')) st.scammed++;
    if (s.edu >= 5) st.uni++;
    st.total += e.total;
    st.M += e.retire.M;
    st.ach += s.ach.length;
    st.earn += s.earnReal;
    st.net += (s.hist[s.hist.length - 1]?.net ?? 0) / g.P;
    st.cards += s.log.filter((l) => l.big).length;
    st.years += s.age;
    causes[s.deathCause ?? '?'] = (causes[s.deathCause ?? '?'] ?? 0) + 1;
    for (const a of s.ach) achCount[a] = (achCount[a] ?? 0) + 1;
  } catch (err) {
    st.errors++;
    if (st.errors <= 3) console.error('seed', seed, err);
  }
}
const ok = N - st.errors;
const pct = (x: number) => `${((x / ok) * 100).toFixed(1)}%`;
console.log(`模式 ${mode}，${N} 局，${((Date.now() - t0) / N).toFixed(0)}ms/局，錯誤 ${st.errors}`);
console.log(`平均壽命 ${(st.age / ok).toFixed(1)}；結婚 ${pct(st.married)}；離婚 ${pct(st.divorced)}（佔已婚 ${((st.divorced / Math.max(1, st.married)) * 100).toFixed(1)}%）；平均子女 ${(st.kids / ok).toFixed(2)}`);
console.log(`上車 ${pct(st.own)}；中招 ${pct(st.scammed)}；學士 ${pct(st.uni)}；平均總分 ${(st.total / ok).toFixed(0)}；退休錢用到 ${(st.M / ok).toFixed(1)} 歲`);
console.log(`平均一生收入（2026 幣值）$${(st.earn / ok / 1e6).toFixed(1)}M；離世淨資產 $${(st.net / ok / 1e6).toFixed(2)}M；成就 ${(st.ach / ok).toFixed(1)} 個；每年抉擇 ${(st.cards / st.years).toFixed(2)}`);
console.log('死因', Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join('，'));
console.log('成就', Object.entries(achCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join('，'));
