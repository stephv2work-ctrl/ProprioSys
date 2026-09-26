// Plain-language help, shared by the first-run tutorial and the Help sheet.

export const INTRO = [
  'Welcome to ProprioSys.',
  'Hold your phone upright at chest height, with the camera facing forward. I will tell you about objects as they come into view.',
  'Tap anywhere on the screen to hear everything in view.',
  'To take a photo and hear a guided walkthrough, switch to Canvas mode at the top of the screen.',
  'For help at any time, use the Help button at the top right.',
];

export const HELP_SECTIONS = [
  {
    title: 'Live mode',
    items: [
      'Point the camera ahead. New objects are announced with their direction: on your left, ahead, or on your right.',
      'Objects that fill much of the view are called close or very close.',
      'Tap anywhere, or press Describe scene, to hear everything in view.',
      'Pause stops announcements until you resume.',
    ],
  },
  {
    title: 'Canvas mode',
    items: [
      'Tap anywhere, or press Capture, to take a photo.',
      'You will hear an overview, then each object from left to right using clock directions. 12 o’clock is straight ahead.',
      'Use Next and Previous, or the step slider, to move between items. With a screen reader, swipe up or down on the slider.',
      'Press New photo to take another.',
    ],
  },
  {
    title: 'Vibrations',
    items: [
      'One short tick: a new object was found, or a walkthrough step began.',
      'Two strong buzzes: something is very close.',
      'Vibration works on Android phones. iPhones do not allow it for web apps.',
    ],
  },
  {
    title: 'Earbuds and keyboard',
    items: [
      'Earbud play or pause button: describe the scene in Live mode, or take a photo and play or pause in Canvas mode.',
      'Earbud double press: next walkthrough item. Triple press: previous item.',
      'Keyboard: Space or Enter to describe or capture, left and right arrows to move between items, P to pause, M to switch mode, S for settings, H for help.',
    ],
  },
  {
    title: 'Privacy and limits',
    items: [
      'Everything runs on your phone. No images leave your device.',
      'ProprioSys recognises 80 common kinds of objects. It cannot read text or detect walls, doors or stairs.',
      'Distances are estimates. ProprioSys is not a replacement for a cane, guide dog or other mobility aid.',
    ],
  },
];

export const HELP_SPOKEN = HELP_SECTIONS.flatMap((s) => [`${s.title}.`, ...s.items]);
