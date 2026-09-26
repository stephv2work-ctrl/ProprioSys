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

/** Maps source pixels onto the canvas like CSS `object-fit` (cover or contain). */
function fit(cw, ch, sw, sh, mode) {
  const scale = mode === 'contain' ? Math.min(cw / sw, ch / sh) : Math.max(cw / sw, ch / sh);
  return { scale, ox: (cw - sw * scale) / 2, oy: (ch - sh * scale) / 2 };
}

function drawBox(ctx, p, t, color, dpr, { label = true, width = 3 } = {}) {
  const [x, y, w, h] = p.bbox;
  const rx = t.ox + x * t.scale;
  const ry = t.oy + y * t.scale;
  ctx.lineWidth = width * dpr;
  ctx.strokeStyle = color;
  ctx.strokeRect(rx, ry, w * t.scale, h * t.scale);
  if (!label) return;

  const fontPx = 15 * dpr;
  const pad = 4 * dpr;
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const text = `${p.class} ${Math.round(p.score * 100)}%`;
  const tw = ctx.measureText(text).width + pad * 2;
  const th = fontPx + pad * 2;
  const ly = ry - th < 0 ? ry : ry - th;
  ctx.fillStyle = color;
  ctx.fillRect(rx, ly, tw, th);
  ctx.fillStyle = '#000';
  ctx.fillText(text, rx + pad, ly + pad);
}

export function clearCanvas(canvas) {
  canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

/** Draws boxes in video coordinates onto a canvas that mirrors the video's `object-fit: cover`. */
export function drawDetections(canvas, video, preds) {
  if (!canvas || !video) return;
  const dpr = syncSize(canvas);
  const ctx = canvas.getContext('2d');
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!vw || !vh) return;

  const t = fit(canvas.width, canvas.height, vw, vh, 'cover');
  const frame = vw * vh;
  for (const p of preds) {
    const [, , w, h] = p.bbox;
    drawBox(ctx, p, t, COLORS[proximityOf((w * h) / frame) ?? 'far'], dpr);
  }
}

/**
 * Draws a captured still (letterboxed so nothing is cropped) with its detections.
 * Boxes in `highlight` (bbox array references) are emphasised and the rest dimmed.
 */
export function drawSnapshot(canvas, image, preds, highlight = []) {
  if (!canvas || !image) return;
  const dpr = syncSize(canvas);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const t = fit(canvas.width, canvas.height, image.width, image.height, 'contain');
  ctx.drawImage(image, t.ox, t.oy, image.width * t.scale, image.height * t.scale);

  const on = new Set(highlight);
  for (const p of preds) {
    if (on.size && !on.has(p.bbox)) drawBox(ctx, p, t, 'rgba(255,255,255,0.35)', dpr, { label: false, width: 2 });
  }
  for (const p of preds) {
    if (!on.size || on.has(p.bbox)) drawBox(ctx, p, t, '#facc15', dpr, { width: on.size ? 4 : 3 });
  }
}
