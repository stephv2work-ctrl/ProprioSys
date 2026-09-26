// Main-thread client for the depth worker (depth.worker.js). One worker per
// loaded model; terminating it frees every byte of GPU/WASM memory at once.
import { getDepthModel } from './models.js';
import { inputSize } from './distance.js';

const sessions = new Map(); // model id → Promise<{ worker, spec, device }>
let nextId = 0;

// Lets testers exercise the no-WebGPU path on a WebGPU machine:
// localStorage.setItem('propriosys.debug.forceWasm', '1')
function forceWasm() {
  try {
    return localStorage.getItem('propriosys.debug.forceWasm') === '1';
  } catch {
    return false;
  }
}

export function loadDepthModel(id, onProgress) {
  if (sessions.has(id)) return sessions.get(id);
  const spec = getDepthModel(id);
  const session = new Promise((resolve, reject) => {
    if (!spec.repo) {
      reject(new Error(`Unknown depth model: ${id}`));
      return;
    }
    const worker = new Worker(new URL('./depth.worker.js', import.meta.url), { type: 'module' });
    const fail = (message) => {
      worker.terminate();
      reject(new Error(message));
    };
    worker.onerror = (e) => fail(e.message || 'The depth worker failed to start.');
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data.progress);
      else if (data.type === 'ready') {
        worker.onmessage = null;
        resolve({ worker, spec, device: data.device });
      } else if (data.type === 'error') fail(data.message);
    };
    worker.postMessage({ type: 'load', spec, forceWasm: forceWasm(), warmup: inputSize(640, 480, spec.input) });
  });
  session.catch(() => sessions.delete(id));
  sessions.set(id, session);
  return session;
}

/** Frees the model entirely, e.g. when the user turns depth off. */
export function unloadDepthModel(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  session.then((s) => s.worker.terminate()).catch(() => {});
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
  const ctx = c.getContext('2d');
  ctx.drawImage(source, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;

  const reqId = ++nextId;
  return new Promise((resolve, reject) => {
    const onMessage = ({ data }) => {
      if (data.id !== reqId) return;
      s.worker.removeEventListener('message', onMessage);
      if (data.type === 'result') resolve({ data: data.data, width: data.width, height: data.height });
      else {
        // A failed run can leave the ONNX session unusable; start fresh next time.
        unloadDepthModel(id);
        reject(new Error(data.message));
      }
    };
    s.worker.addEventListener('message', onMessage);
    s.worker.postMessage({ type: 'run', id: reqId, image: { data: pixels, width, height } }, [pixels.buffer]);
  });
}
