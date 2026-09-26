// Runs the depth model off the main thread. Owning the worker ourselves (rather
// than ONNX Runtime's `wasm.proxy`) means it is a same-origin, Vite-built script
// that works under our CSP, and a slow WASM run can never freeze the page.
import { AutoModelForDepthEstimation, AutoProcessor, RawImage, env } from '@huggingface/transformers';

// Use the ONNX Runtime files Vite bundles into our /assets, never a CDN.
env.backends.onnx.wasm.wasmPaths = undefined;
env.backends.onnx.wasm.proxy = false; // already in a worker
env.allowLocalModels = false;

let session = null; // { proc, model, spec, device }

async function detectBackend(forceWasm) {
  if (!forceWasm) {
    try {
      const adapter = await self.navigator.gpu?.requestAdapter();
      if (adapter) return { device: 'webgpu', f16: adapter.features.has('shader-f16') };
    } catch {
      /* no WebGPU in this worker */
    }
  }
  return { device: 'wasm', f16: false };
}

async function load({ spec, forceWasm, warmup }) {
  const { device, f16 } = await detectBackend(forceWasm);
  const dtype = device === 'webgpu' && f16 ? spec.dtype.gpuF16 : spec.dtype.fallback;

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
    self.postMessage({ type: 'progress', progress: Math.round((loaded / total) * 100) });
  };

  const opts = { revision: spec.revision };
  const [proc, model] = await Promise.all([
    AutoProcessor.from_pretrained(spec.repo, opts),
    AutoModelForDepthEstimation.from_pretrained(spec.repo, { ...opts, device, dtype, progress_callback }),
  ]);
  session = { proc, model, spec, device };

  // Warm-up compiles GPU shaders now instead of on the first real photo.
  const { width, height } = warmup;
  await run({ data: new Uint8ClampedArray(width * height * 4), width, height });
  return { device };
}

async function run({ data, width, height }) {
  const { proc, model } = session;
  const inputs = await proc(new RawImage(data, width, height, 4));
  const { predicted_depth } = await model(inputs);
  const t = predicted_depth.type === 'float32' ? predicted_depth : predicted_depth.to('float32');
  const [h, w] = t.dims.slice(-2);
  // Copy before transferring: the tensor's buffer may belong to the runtime.
  return { data: new Float32Array(t.data), width: w, height: h };
}

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'load') {
      const result = await load(msg);
      self.postMessage({ type: 'ready', ...result });
    } else if (msg.type === 'run') {
      const out = await run(msg.image);
      self.postMessage({ type: 'result', id: msg.id, ...out }, [out.data.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err?.message ?? String(err) });
  }
};
