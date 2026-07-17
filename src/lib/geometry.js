// Pure geometry helpers shared by detection and rendering.
// No DOM, no OpenCV — kept side-effect free so they are unit-testable in Node.
// This is the spec's #1 bug source (coordinate mapping), so it lives on its own.

/** Full-image quad (no crop), normalised, ordered [TL,TR,BR,BL]. */
export const FULL_CORNERS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Clamp a value into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Order 4 points as [TL, TR, BR, BL] using coordinate sums/diffs.
 * For a roughly axis-aligned quad: TL has the smallest (x+y), BR the largest;
 * TR has the smallest (y-x), BL the largest.
 * @param {Array<{x:number,y:number}>} pts
 * @returns {Array<{x:number,y:number}>}
 */
export function orderCorners(pts) {
  const sum = (p) => p.x + p.y;
  const diff = (p) => p.y - p.x;
  const tl = pts.reduce((a, b) => (sum(b) < sum(a) ? b : a));
  const br = pts.reduce((a, b) => (sum(b) > sum(a) ? b : a));
  const tr = pts.reduce((a, b) => (diff(b) < diff(a) ? b : a));
  const bl = pts.reduce((a, b) => (diff(b) > diff(a) ? b : a));
  return [tl, tr, br, bl];
}

/**
 * Element-wise average of several ordered corner arrays (moving-average smooth).
 * @param {Array<Array<{x:number,y:number}>>} buffer
 * @returns {Array<{x:number,y:number}>}
 */
export function averageCorners(buffer) {
  const n = buffer.length;
  const out = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  for (const c of buffer) {
    for (let i = 0; i < 4; i++) {
      out[i].x += c[i].x;
      out[i].y += c[i].y;
    }
  }
  for (let i = 0; i < 4; i++) {
    out[i].x /= n;
    out[i].y /= n;
  }
  return out;
}

/**
 * On-screen rectangle actually occupied by video content under
 * `object-fit: contain` (letterboxing). All values in CSS px.
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function contentRect(cssW, cssH, videoW, videoH) {
  const videoAspect = videoW / videoH;
  const elAspect = cssW / cssH;
  if (videoAspect > elAspect) {
    const w = cssW;
    const h = cssW / videoAspect;
    return { x: 0, y: (cssH - h) / 2, w, h };
  }
  const h = cssH;
  const w = cssH * videoAspect;
  return { x: (cssW - w) / 2, y: 0, w, h };
}

/**
 * Map a normalised (0..1) point into the display-space content rect.
 * @param {{x:number,y:number}} pt
 * @param {{x:number,y:number,w:number,h:number}} rect
 */
export function normToDisplay(pt, rect) {
  return { x: rect.x + pt.x * rect.w, y: rect.y + pt.y * rect.h };
}
