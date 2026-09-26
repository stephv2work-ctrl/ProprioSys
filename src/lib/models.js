// The models a user can choose between. Object models say *what* things are;
// depth models say *how far* every pixel is. Add new entries here — Settings,
// loading and download-size labels all read from this list.

export const OBJECT_MODELS = [
  {
    id: 'fast',
    base: 'lite_mobilenet_v2',
    label: 'Fast',
    detail: 'COCO-SSD Lite · 18 MB · smooth on most phones',
  },
  {
    id: 'balanced',
    base: 'mobilenet_v1',
    label: 'Balanced',
    detail: 'COCO-SSD MobileNet v1 · 27 MB',
  },
  {
    id: 'accurate',
    base: 'mobilenet_v2',
    label: 'Accurate',
    detail: 'COCO-SSD MobileNet v2 · 67 MB · finds more objects, slower',
  },
];

export const DEPTH_MODELS = [
  {
    id: 'off',
    label: 'Off',
    detail: 'Distance guessed from object size (close / far)',
  },
  {
    id: 'dpt-nyu',
    label: 'Indoor distances',
    detail: 'DPT-DINOv2 (NYU) · about 40 MB · distances in metres, most reliable indoors up to about 8 m',
    repo: 'onnx-community/dpt-dinov2-small-nyu', // Apache-2.0
    // q4f16 needs WebGPU with shader-f16; q8 runs everywhere else.
    dtype: { gpuF16: 'q4f16', fallback: 'q8' },
    // DPT halves its patch grid internally, so both sides must be multiples of 2 × 14 px.
    input: { multiple: 28, longSide: 448 },
  },
];

export const getObjectModel = (id) => OBJECT_MODELS.find((m) => m.id === id) ?? OBJECT_MODELS[0];
export const getDepthModel = (id) => DEPTH_MODELS.find((m) => m.id === id) ?? DEPTH_MODELS[0];
