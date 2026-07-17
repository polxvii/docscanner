// Signature background removal — plain canvas, no OpenCV.
// Strips white/light background to transparent using a luminance threshold
// with a soft ramp for clean edges. Exports PNG to preserve transparency.

import { loadImage } from './imaging.js';

/**
 * Alpha (0..255) for a pixel given its luminance.
 * - lum >= threshold           -> 0   (background, transparent)
 * - lum <= threshold - ramp    -> 255 (ink, opaque)
 * - in between                 -> linear ramp
 * Pure function, unit-testable.
 */
export function alphaForLuminance(lum, threshold, ramp) {
  if (ramp <= 0) return lum >= threshold ? 0 : 255;
  if (lum >= threshold) return 0;
  if (lum <= threshold - ramp) return 255;
  return Math.round(((threshold - lum) / ramp) * 255);
}

/**
 * Remove the light background from a signature image.
 * @param {string} srcDataUrl
 * @param {number} threshold 0..255 (higher = removes more)
 * @param {number} ramp soft-edge width in luminance units
 * @returns {Promise<string>} transparent PNG data URL
 */
export async function removeBackground(srcDataUrl, threshold = 200, ramp = 30) {
  const img = await loadImage(srcDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const a = alphaForLuminance(lum, threshold, ramp);
    // Combine with any existing alpha so re-processing stays stable.
    d[i + 3] = Math.min(d[i + 3], a);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
