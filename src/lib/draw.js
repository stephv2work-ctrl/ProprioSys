import { proximityOf } from './announcer.js';

const COLORS = { 'very close': '#f87171', close: '#fb923c', far: '#facc15' };

function syncSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return dpr;
}

export function clearCanvas(canvas) {
  canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

/** Draws boxes in video coordinates onto a canvas that mirrors the video's `object-fit: cover`. */
export function drawDetections(canvas, video, preds) {
  if (!canvas || !video) return;
  const dpr = syncSize(canvas);
  const ctx = canvas.getContext('2d');
  const cw = canvas.width;
  const ch = canvas.height;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  ctx.clearRect(0, 0, cw, ch);
  if (!vw || !vh) return;

  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2;
  const oy = (ch - vh * scale) / 2;
  const frame = vw * vh;
  const fontPx = 15 * dpr;
  const pad = 4 * dpr;

  ctx.lineWidth = 3 * dpr;
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';

  for (const p of preds) {
    const [x, y, w, h] = p.bbox;
    const color = COLORS[proximityOf((w * h) / frame) ?? 'far'];
    const rx = ox + x * scale;
    const ry = oy + y * scale;
    const rw = w * scale;
    const rh = h * scale;

    ctx.strokeStyle = color;
    ctx.strokeRect(rx, ry, rw, rh);

    const label = `${p.class} ${Math.round(p.score * 100)}%`;
    const tw = ctx.measureText(label).width + pad * 2;
    const th = fontPx + pad * 2;
    const ly = ry - th < 0 ? ry : ry - th;
    ctx.fillStyle = color;
    ctx.fillRect(rx, ly, tw, th);
    ctx.fillStyle = '#000';
    ctx.fillText(label, rx + pad, ly + pad);
  }
}
