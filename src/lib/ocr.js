// OCR via Tesseract.js with Thai + English (documents are bilingual).
// Opt-in per page; reports progress. Language data is fetched/cached by
// Tesseract from its CDN on first use.

import { createWorker } from 'tesseract.js';

/**
 * Recognise text in an image.
 * @param {string} imageSrc data URL / object URL
 * @param {(progress:number)=>void} [onProgress] 0..1 during recognition
 * @returns {Promise<string>} extracted text (trimmed)
 */
export async function runOcr(imageSrc, onProgress) {
  const worker = await createWorker('tha+eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress);
      }
    },
  });
  try {
    const { data } = await worker.recognize(imageSrc);
    return (data.text || '').trim();
  } finally {
    await worker.terminate();
  }
}
