// Loaded via dynamic import so TF.js (~1.5 MB) stays out of the initial bundle.
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import { load } from '@tensorflow-models/coco-ssd';

let pending = null;

async function init() {
  let ok = false;
  try {
    ok = await tf.setBackend('webgl');
  } catch {
    ok = false;
  }
  if (!ok) await tf.setBackend('cpu');
  await tf.ready();

  const model = await load({
    // lite_mobilenet_v2 is the smallest/fastest variant — right trade-off for phones.
    base: 'lite_mobilenet_v2',
    modelUrl: import.meta.env.VITE_COCO_MODEL_URL || undefined,
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

/** Memoised so React StrictMode / remounts never load the model twice. */
export function createDetector() {
  if (!pending) {
    pending = init().catch((err) => {
      pending = null; // allow retry
      throw err;
    });
  }
  return pending;
}
