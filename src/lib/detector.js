// Loaded via dynamic import so TF.js (~1.5 MB) stays out of the initial bundle.
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import { load } from '@tensorflow-models/coco-ssd';

let backendReady = null;
const pending = new Map(); // COCO-SSD base → Promise<{ model, backend }>

function initBackend() {
  backendReady ??= (async () => {
    let ok = false;
    try {
      ok = await tf.setBackend('webgl');
    } catch {
      ok = false;
    }
    if (!ok) await tf.setBackend('cpu');
    await tf.ready();
  })();
  return backendReady;
}

async function init(base) {
  await initBackend();
  const model = await load({
    base,
    // Self-hosted weights override only the default (Fast) model.
    modelUrl: base === 'lite_mobilenet_v2' ? import.meta.env.VITE_COCO_MODEL_URL || undefined : undefined,
  });

  // Warm-up: the first inference compiles WebGL shaders (can take ~1s on mobile).
  // Doing it now keeps the first real frame from stalling.
  const dummy = tf.zeros([300, 300, 3], 'int32');
  try {
    await model.detect(dummy);
  } finally {
    dummy.dispose();
  }

  return { model, backend: tf.getBackend() };
}

/** Memoised per model so React StrictMode / remounts never load a model twice. */
export function createDetector(base = 'lite_mobilenet_v2') {
  if (!pending.has(base)) {
    const p = init(base).catch((err) => {
      pending.delete(base); // allow retry
      throw err;
    });
    pending.set(base, p);
  }
  return pending.get(base);
}
