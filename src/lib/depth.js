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

async function loadRuntime() {
  if (T) return T;
  T = await import('@huggingface/transformers');
  const onnx = T.env.backends.onnx;
  // Transformers.js points ONNX Runtime at jsDelivr by default, which means
  // executing remote code. Clearing wasmPaths makes it use the copy Vite
  // bundles into our own /assets instead.
  onnx.wasm.wasmPaths = undefined;
  // Only fetch model files from the Hugging Face Hub, never probe our origin.
  T.env.allowLocalModels = false;
  return T;
}

export function loadDepthModel(id, onProgress) {
  if (sessions.has(id)) return sessions.get(id);
  const spec = getDepthModel(id);
  const session = (async () => {
    if (!spec.repo) throw new Error(`Unknown depth model: ${id}`);
    await loadRuntime();
    const { device, f16 } = await detectBackend();
    // On the slow WASM path, run inference in a worker so a 15–30 s job can't
    // freeze the page (and the screen reader with it).
    T.env.backends.onnx.wasm.proxy = device === 'wasm';
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

    // Pinned to a reviewed commit so the model can't change underneath us.
    const opts = { revision: spec.revision };
    const [proc, model] = await Promise.all([
      T.AutoProcessor.from_pretrained(spec.repo, opts),
      T.AutoModelForDepthEstimation.from_pretrained(spec.repo, { ...opts, device, dtype, progress_callback }),
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

/** Frees the model's GPU/WASM memory, e.g. when the user turns depth off. */
export function unloadDepthModel(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  session.then((s) => s.model.dispose?.()).catch(() => {});
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
    unloadDepthModel(id);
    throw err;
  }
}
