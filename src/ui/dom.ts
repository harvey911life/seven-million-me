// 細 DOM 工具
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function clear(el: HTMLElement) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** 抄去剪貼簿，唔得就揀住段字 */
export async function copyText(text: string, fallbackEl?: HTMLElement): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
    return false;
  }
}

export type Chip = { t: string; up: boolean };
export function toast(text: string, kind: 'ach' | 'info' | 'result' = 'info', ms = 2600, chips: Chip[] = []) {
  let host = $('#toasts');
  if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div', { class: `toast ${kind}` }, h('span', { class: 'tt' }, text),
    chips.length ? h('span', { class: 'chips' }, chips.map((c, i) => h('i', { class: `chip ${c.up ? 'up' : 'dn'}`, style: `animation-delay:${0.12 + i * 0.07}s` }, c.t))) : null);
  // 最多同時顯示 2 個，舊嘅即刻收起，避免遮住畫面
  while (host.children.length >= 2) host.firstElementChild!.remove();
  host.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}
