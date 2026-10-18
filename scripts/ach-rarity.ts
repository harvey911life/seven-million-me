// 成就稀有度表：三種玩法各跑 N 局，計每個成就嘅解鎖率，寫入 src/data/ach_rarity.json
// 用法：npx esbuild scripts/ach-rarity.ts --bundle --platform=node --format=esm --outfile=.sim/rar.mjs && node .sim/rar.mjs 2000
import { writeFileSync } from 'node:fs';
import { playHeadless, aguiEnding } from '../src/engine/agui';
import { computeEnding, endAchievements } from '../src/engine/ending';
import { ACHIEVEMENTS } from '../src/engine/achievements';

const N = Number(process.argv[2] ?? 1000);
const modes = ['def', 'auto', 'agui'] as const;
const cnt: Record<string, number> = {};
const totals: number[] = [];
for (const mode of modes) for (let i = 0; i < N; i++) {
  const seed = 50000 + i * 104729;
  const g = playHeadless(seed, null, mode);
  const ag = aguiEnding(seed, null);
  const e = computeEnding(g, ag);
  endAchievements(g, e, ag);
  totals.push(e.total);
  for (const a of new Set(g.s.ach)) cnt[a] = (cnt[a] ?? 0) + 1;
}
const runs = N * modes.length;
const out: Record<string, number> = {};
// 未出現過嘅成就當 0.05%（天馬行空事件合計每局 ≤0.1%）
for (const a of ACHIEVEMENTS) out[a.id] = Math.max(0.0005, Math.round(((cnt[a.id] ?? 0) / runs) * 10000) / 10000);
writeFileSync('src/data/ach_rarity.json', JSON.stringify(out, null, 0) + '\n');
totals.sort((a, b) => a - b);
const q = (p: number) => totals[Math.floor(p * (totals.length - 1))];
console.log(`${runs} 局；總分分位 p5 ${q(0.05)} p10 ${q(0.1)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} p97 ${q(0.97)} max ${q(1)}`);
for (const t of [300, 400, 500, 600, 700, 800]) console.log(`< ${t}: ${((totals.filter((x) => x < t).length / runs) * 100).toFixed(1)}%`);
console.log(Object.entries(out).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(2)}%`).join('，'));
