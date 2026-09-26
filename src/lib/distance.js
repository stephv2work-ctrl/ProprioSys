// Pure helpers for turning a depth map into per-object distances.

/** Resize (w, h) so the long side is ~longSide and both sides are multiples of `multiple`. */
export function inputSize(w, h, { multiple = 28, longSide = 448 } = {}) {
  const scale = longSide / Math.max(w, h);
  const snap = (v) => Math.max(multiple, Math.round((v * scale) / multiple) * multiple);
  return { width: snap(w), height: snap(h) };
}

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = Float32Array.from(values).sort();
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Distance to an object from a depth map (metres). Uses the central half of
 * the box, where the object itself usually is, and takes the 25th percentile:
 * boxes also contain background, which is farther away than the object.
 *
 * @param {{ data: ArrayLike<number>, width: number, height: number }} depth
 * @param {number[]} bbox [x, y, w, h] in source-image pixels
 */
export function boxDistance(depth, bbox, srcW, srcH) {
  const [x, y, w, h] = bbox;
  const sx = depth.width / srcW;
  const sy = depth.height / srcH;
  const x0 = Math.max(0, Math.floor((x + w * 0.25) * sx));
  const x1 = Math.min(depth.width, Math.ceil((x + w * 0.75) * sx));
  const y0 = Math.max(0, Math.floor((y + h * 0.25) * sy));
  const y1 = Math.min(depth.height, Math.ceil((y + h * 0.75) * sy));
  const values = [];
  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      const v = depth.data[row * depth.width + col];
      if (Number.isFinite(v) && v > 0) values.push(v);
    }
  }
  return percentile(values, 0.25);
}

/** Speech-friendly distance: one decimal under 3 m, whole metres beyond. */
export function formatDistance(m) {
  if (m == null) return null;
  const v = m < 3 ? Math.round(m * 10) / 10 : Math.round(m);
  return `${v} ${v === 1 ? 'metre' : 'metres'}`;
}
