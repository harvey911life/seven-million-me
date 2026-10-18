export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

// 指標乘數（共用常數）
export const Mneg = (s: number) => clamp(Math.pow(2, (50 - s) / 50), 0.5, 2);
export const Mpos = (s: number) => clamp(Math.pow(2, (s - 50) / 50), 0.5, 2);
export const mult = (...xs: number[]) => clamp(xs.reduce((a, b) => a * b, 1), 0.25, 3);

// 直線插值查表：keys 遞增
export function interp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1e8) return `${sign}$${(a / 1e8).toFixed(a >= 1e9 ? 0 : 1)}億`;
  if (a >= 1e4) return `${sign}$${(a / 1e4).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '')}萬`;
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
}

export function fmtExact(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

export const round = Math.round;
