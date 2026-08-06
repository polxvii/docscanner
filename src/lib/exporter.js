// Export: no-watermark PDF (jsPDF), plus JPG/PNG, with Web Share + download
// fallback. Each page image is composited with its applicable annotations
// (document-scoped + that page's own) at ratio positions scaled to page size.

import { jsPDF } from 'jspdf';
import { loadImage } from './imaging.js';
import { contentRect } from './geometry.js';
import { applicableAnnotations } from './annotations.js';

export { applicableAnnotations };

const PT_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

function safeName(name) {
  return (name || 'document').replace(/[^\w\-]+/g, '_').slice(0, 80) || 'document';
}

/** Draw one annotation onto ctx, positioned relative to the image `rect`. */
function drawAnnotation(ctx, ann, rect, sigImg) {
  const bw = ann.width * rect.w;
  const bh = ann.height * rect.h;
  const cx = rect.x + (ann.x + ann.width / 2) * rect.w;
  const cy = rect.y + (ann.y + ann.height / 2) * rect.h;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((ann.rotation || 0) * Math.PI) / 180);
  if ((ann.type === 'signature' || ann.type === 'image') && sigImg) {
    ctx.drawImage(sigImg, -bw / 2, -bh / 2, bw, bh);
  } else if (ann.type === 'text') {
    // Font size is driven by the box height ratio (matches the editor).
    const fontPx = ann.height * rect.h;
    ctx.font = `${fontPx}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = ann.content.color || '#111111';
    ctx.fillText(ann.content.text || '', -bw / 2, 0);
  }
  ctx.restore();
}

/** Render a page (image + annotations) onto a page-sized canvas. */
async function composePageCanvas(doc, page, pageW, pageH, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pageW * scale));
  canvas.height = Math.max(1, Math.round(pageH * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = await loadImage(page.processedImage);
  const rect = contentRect(
    canvas.width,
    canvas.height,
    img.naturalWidth,
    img.naturalHeight
  );
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);

  for (const ann of applicableAnnotations(doc, page)) {
    let sigImg = null;
    if (
      (ann.type === 'signature' || ann.type === 'image') &&
      ann.content?.dataUrl
    ) {
      sigImg = await loadImage(ann.content.dataUrl);
    }
    drawAnnotation(ctx, ann, rect, sigImg);
  }
  return canvas;
}

/**
 * @param {object} doc
 * @param {{pageSize:'a4'|'letter'|'fit', orientation:'portrait'|'landscape'}} opts
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportPdf(doc, opts) {
  const { pageSize = 'a4', orientation = 'portrait' } = opts || {};
  let pdf = null;

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    let pageW, pageH, scale;

    if (pageSize === 'fit') {
      const img = await loadImage(page.processedImage);
      pageW = img.naturalWidth;
      pageH = img.naturalHeight;
      scale = 1;
    } else {
      let [w, h] = PT_SIZES[pageSize] || PT_SIZES.a4;
      if (orientation === 'landscape') [w, h] = [h, w];
      pageW = w;
      pageH = h;
      scale = 2; // supersample for crisp text/lines
    }

    const canvas = await composePageCanvas(doc, page, pageW, pageH, scale);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const orient = pageW >= pageH ? 'landscape' : 'portrait';
    const format = [pageW, pageH];

    if (i === 0) {
      pdf = new jsPDF({ orientation: orient, unit: 'pt', format });
    } else {
      pdf.addPage(format, orient);
    }
    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
  }

  return { blob: pdf.output('blob'), filename: `${safeName(doc.name)}.pdf` };
}

/**
 * Export a single page as PNG/JPG (fit to the page image, annotations included).
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportPageImage(doc, page, format = 'png') {
  const img = await loadImage(page.processedImage);
  const canvas = await composePageCanvas(
    doc,
    page,
    img.naturalWidth,
    img.naturalHeight,
    1
  );
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';
  const blob = await new Promise((res) => canvas.toBlob(res, mime, 0.92));
  return { blob, filename: `${safeName(doc.name)}.${ext}` };
}

/** Share via the Web Share API (mobile), fall back to a download (desktop). */
export async function shareOrDownload(blob, filename) {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
    // otherwise fall through to download
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
