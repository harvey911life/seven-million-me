// 分享卡圖片：1080×1350 PNG（適合 IG / WhatsApp），用 canvas 畫，唔經任何伺服器
/** 分享卡底部金句（每世隨機一句） */
export const QUOTES = [
  '同一個起點，有冇規劃，結局差好遠。',
  '人生冇得重嚟，但可以早啲準備。',
  '複息係時間送俾有耐性嘅人嘅禮物。',
  '今日慳落嘅一蚊，係將來自由嘅一步。',
  '意外唔會預先通知，備用金會。',
  '賺得多唔等於夠用，識用先係本事。',
  '健康同家人，係最值錢嘅資產。',
  '唔使同人比起跑線，同昨日嘅自己比。',
  '每一個選擇，都喺度寫緊你嘅結局。',
  '計清楚數，先至瀟灑得起。',
];
export const quoteFor = (seed: number) => QUOTES[(Math.imul(seed, 2654435761) >>> 0) % QUOTES.length];

export interface ShareImgInput {
  quote: string;
  scene: HTMLCanvasElement; // SW×SH 像素場景
  name: string;
  line: string; // 「我在…出世，享年…」
  grade: string; gradeColor: string;
  total: number; achCount: number;
  star: { emblem: HTMLCanvasElement; name: string; tier: string; desc: string; rate: string } | null;
  spider: HTMLCanvasElement;
}

const FONT = "'PingFang HK','PingFang TC','Noto Sans HK','Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif";
const SERIF = "'Noto Serif HK','Noto Serif TC','Songti TC','PMingLiU',serif";

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** 字太長就縮細，再唔夠就截短 */
function fitText(c: CanvasRenderingContext2D, t: string, maxW: number, size: number, weight: string, family: string, min = 20): string {
  let s = size;
  c.font = `${weight} ${s}px ${family}`;
  while (c.measureText(t).width > maxW && s > min) { s -= 2; c.font = `${weight} ${s}px ${family}`; }
  let out = t;
  while (c.measureText(out).width > maxW && out.length > 1) out = out.slice(0, -2) + '…';
  return out;
}

export function makeShareImage(d: ShareImgInput): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const bg = c.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, '#fbf7f2'); bg.addColorStop(0.6, '#f3ebe4'); bg.addColorStop(1, '#efe3e8');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';

  // 頂部
  c.fillStyle = '#8e1f3f'; c.font = `800 52px ${SERIF}`; c.fillText('七百萬分之', 60, 92);
  const lw = c.measureText('七百萬分之').width;
  c.fillStyle = '#c0392b'; c.font = `800 64px ${SERIF}`; c.fillText('我', 60 + lw + 4, 96);
  c.fillStyle = '#637277'; c.font = `600 28px ${FONT}`; c.textAlign = 'right'; c.fillText('人生分享卡', W - 60, 88); c.textAlign = 'left';

  // 像素場景（放大 6 倍，唔平滑）
  c.save(); rrect(c, 60, 124, 960, 384, 28); c.clip();
  c.imageSmoothingEnabled = false;
  c.drawImage(d.scene, 0, 0, d.scene.width, d.scene.height, 60, 124, 960, 384);
  c.restore();
  c.strokeStyle = 'rgba(142,31,63,.25)'; c.lineWidth = 2; rrect(c, 60, 124, 960, 384, 28); c.stroke();

  // 名同一句總結
  c.fillStyle = '#15232b';
  c.fillText(fitText(c, d.name, 960, 68, '800', SERIF), 60, 600);
  c.fillStyle = '#44545b';
  c.fillText(fitText(c, d.line, 960, 34, '500', FONT), 60, 656);

  // 評級 + 分數
  c.fillStyle = d.gradeColor; rrect(c, 60, 700, 180, 180, 32); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `800 ${d.grade.length > 1 ? 104 : 120}px ${SERIF}`; c.fillText(d.grade, 150, 832);
  c.textAlign = 'left';
  c.fillStyle = '#637277'; c.font = `600 28px ${FONT}`; c.fillText('人生總分', 272, 742);
  c.fillStyle = '#15232b'; c.font = `800 100px ${SERIF}`; c.fillText(String(d.total), 268, 840);
  c.fillStyle = '#637277'; c.font = `500 26px ${FONT}`; c.fillText(`/ 1,000・${d.achCount} 個成就`, 272, 878);

  // 最稀有成就
  if (d.star) {
    c.imageSmoothingEnabled = false;
    c.drawImage(d.star.emblem, 0, 0, d.star.emblem.width, d.star.emblem.height, 60, 920, 150, 150);
    c.fillStyle = '#8e1f3f'; c.fillText(fitText(c, d.star.tier, 330, 24, '700', FONT), 232, 950);
    c.fillStyle = '#15232b'; c.fillText(fitText(c, d.star.name, 330, 42, '800', SERIF), 232, 1000);
    c.fillStyle = '#44545b'; c.fillText(fitText(c, d.star.desc, 330, 26, '500', FONT, 18), 232, 1042);
    c.fillStyle = '#637277'; c.fillText(fitText(c, d.star.rate, 330, 22, '500', FONT, 16), 232, 1078);
  }

  // 蜘蛛網圖
  c.imageSmoothingEnabled = true;
  c.fillStyle = 'rgba(255,255,255,.55)'; rrect(c, 590, 690, 430, 470, 28); c.fill();
  c.drawImage(d.spider, 0, 0, d.spider.width, d.spider.height, 600, 700, 410, 410);
  c.font = `600 24px ${FONT}`;
  c.strokeStyle = '#8e1f3f'; c.lineWidth = 4; c.beginPath(); c.moveTo(660, 1132); c.lineTo(700, 1132); c.stroke();
  c.fillStyle = '#15232b'; c.fillText('你', 710, 1140);
  c.strokeStyle = '#637277'; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(790, 1132); c.lineTo(830, 1132); c.stroke(); c.setLineDash([]);
  c.fillText('某某人', 840, 1140);

  // 底部
  c.strokeStyle = 'rgba(142,31,63,.2)'; c.lineWidth = 2; c.beginPath(); c.moveTo(60, 1200); c.lineTo(W - 60, 1200); c.stroke();
  c.fillStyle = '#15232b'; c.fillText(fitText(c, d.quote, 960, 32, '700', SERIF), 60, 1256);
  c.fillStyle = '#637277'; c.font = `500 24px ${FONT}`; c.fillText('內容為模擬，不構成投資建議', 60, 1300);
  c.textAlign = 'right'; c.fillText('你又會點過？', W - 60, 1300); c.textAlign = 'left';
  return cv;
}

/** 分享：手機用系統分享（連圖），唔得就彈出圖片俾人長按儲存或者下載 */
// 喺 claude.ai 入面，下載要經 downloads 能力（會問viewer確認）；獨立 HTML 檔就用普通下載連結
type Dl = { save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null;
const cw = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
const dlReady: Promise<Dl> = cw ? cw.use('downloads').then((d) => d as Dl).catch(() => null) : Promise.resolve(null);

export async function shareImage(cv: HTMLCanvasElement, text: string, host: HTMLElement): Promise<string> {
  const blob: Blob | null = await new Promise((res) => cv.toBlob(res, 'image/png'));
  if (!blob) return '整唔到圖片，可以直接截圖。';
  const file = new File([blob], 'seven-million-me.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text }); return '已打開分享。'; } catch (err) { if ((err as Error).name === 'AbortError') return ''; }
  }
  const url = URL.createObjectURL(blob);
  const wrap = document.createElement('div');
  wrap.className = 'mwrap in';
  const close = () => { wrap.remove(); URL.revokeObjectURL(url); };
  const box = document.createElement('div');
  box.className = 'modal shareimg';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '分享圖片');
  const x = document.createElement('button'); x.className = 'mx'; x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '關閉'); x.onclick = close;
  const img = document.createElement('img'); img.src = url; img.alt = '人生分享卡';
  const p = document.createElement('p'); p.className = 'muted'; p.textContent = '手機長按圖片就可以儲存；電腦可以撳下面下載。';
  const dl = await Promise.race([dlReady, new Promise<Dl>((r) => setTimeout(() => r(null), 1500))]);
  let a: HTMLElement;
  if (dl) {
    a = document.createElement('button'); a.className = 'btn'; (a as HTMLButtonElement).type = 'button'; a.textContent = '下載圖片';
    a.onclick = async () => {
      try { await dl.save({ filename: 'seven-million-me.png', data: blob }); p.textContent = '已經儲存。'; }
      catch (err) { const c = (err as { code?: string }).code; p.textContent = c === 'declined' ? '你取消咗下載。' : '呢度下載唔到，可以長按圖片儲存或者截圖。'; }
    };
  } else if (cw) {
    a = document.createElement('span'); p.textContent = '手機長按圖片就可以儲存，或者直接截圖。';
  } else {
    const l = document.createElement('a'); l.className = 'btn'; l.href = url; l.download = 'seven-million-me.png'; l.textContent = '下載圖片'; a = l;
  }
  box.append(x, img, p, a);
  wrap.append(box);
  wrap.addEventListener('click', (ev) => { if (ev.target === wrap) close(); });
  host.append(wrap);
  return '';
}
