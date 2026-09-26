// Depth estimation with Transformers.js (ONNX Runtime Web). Loaded lazily, so
// users who never enable a depth model never download the runtime.
import { getDepthModel } from './models.js';
import { inputSize } from './distance.js';

let T = null; // the @huggingface/transformers module
let backend = null;
const sessions = new Map(); // model id → Promise<{ proc, model, spec, device }>

/** WebGPU makes depth usable on phones (~0.5 s); the WASM fallback can take 15 s+. */
export async function detectBackend() {
  if (backend) return backend;
  backend = { device: 'wasm', f16: false };
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) backend = { device: 'webgpu', f16: adapter.features.has('shader-f16') };
  } catch {
    /* no WebGPU */
  }
  return backend;
}

export function loadDepthModel(id, onProgress) {
  if (sessions.has(id)) return sessions.get(id);
  const spec = getDepthModel(id);
  const session = (async () => {
    T ??= await import('@huggingface/transformers');
    const { device, f16 } = await detectBackend();
    const dtype = device === 'webgpu' && f16 ? spec.dtype.gpuF16 : spec.dtype.fallback;

    // Aggregate per-file download progress into one percentage.
    const files = new Map();
    const progress_callback = (e) => {
      if (e.status !== 'progress' || !e.total) return;
      files.set(e.file, { loaded: e.loaded, total: e.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      onProgress?.(Math.round((loaded / total) * 100));
    };

    const [proc, model] = await Promise.all([
      T.AutoProcessor.from_pretrained(spec.repo),
      T.AutoModelForDepthEstimation.from_pretrained(spec.repo, { device, dtype, progress_callback }),
    ]);

    // Warm-up: the first run compiles GPU shaders (several seconds). Do it now,
    // at the size real photos use, so the first capture isn't slow.
    const { width, height } = inputSize(640, 480, spec.input);
    const blank = document.createElement('canvas');
    blank.width = width;
    blank.height = height;
    await model(await proc(T.RawImage.fromCanvas(blank)));

    return { proc, model, spec, device };
  })();
  session.catch(() => sessions.delete(id));
  sessions.set(id, session);
  return session;
}

/**
 * @param {HTMLCanvasElement} source full-resolution still
 * @returns {Promise<{ data: Float32Array, width: number, height: number }>} depth in metres
 */
export async function estimateDepth(id, source) {
  const s = await loadDepthModel(id);
  const { width, height } = inputSize(source.width, source.height, s.spec.input);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d').drawImage(source, 0, 0, width, height);
  try {
    const inputs = await s.proc(T.RawImage.fromCanvas(c));
    const { predicted_depth } = await s.model(inputs);
    const t = predicted_depth.type === 'float32' ? predicted_depth : predicted_depth.to('float32');
    const [h, w] = t.dims.slice(-2);
    return { data: t.data, width: w, height: h };
  } catch (err) {
    // A failed run can leave the ONNX session unusable; drop it so the next call reloads.
    sessions.delete(id);
    s.model.dispose?.();
    throw err;
  }
}
