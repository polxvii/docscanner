// Render an uploaded PDF into page images so each page becomes a normal
// scanner page (annotate / sign / export like any scan).
//
// This whole module (and pdfjs) is loaded lazily via dynamic import, so the
// PDF engine is only fetched when the user actually imports a PDF.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const TARGET_WIDTH = 1600; // render width in px (crisp enough for signing/print)

/**
 * @param {File|Blob} file
 * @param {(progress:number)=>void} [onProgress] 0..1 per page
 * @returns {Promise<string[]>} one JPEG data URL per page
 */
export async function pdfToPageImages(file, onProgress) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const out = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, TARGET_WIDTH / base.width);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      out.push(canvas.toDataURL('image/jpeg', 0.9));
      page.cleanup?.();
      onProgress?.(i / pdf.numPages);
    }
  } finally {
    await pdf.destroy?.();
  }
  return out;
}
