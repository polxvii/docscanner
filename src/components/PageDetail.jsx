import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { contentRect } from '../lib/geometry.js';
import { loadImage } from '../lib/imaging.js';
import { applicableAnnotations } from '../lib/annotations.js';
import { uid } from '../lib/id.js';
import AnnotationLayer from './AnnotationLayer.jsx';
import SignatureManager from './SignatureManager.jsx';
import ExportDialog from './ExportDialog.jsx';
import './PageDetail.css';

const MAX_ZOOM = 5;

export default function PageDetail({ doc, page, onBack, onReEdit }) {
  const { saveDocument } = useStore();
  const stageRef = useRef(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const [sigOpen, setSigOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  // Zoom / pan of the page (pinch or buttons).
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);

  // Transient annotation editing (see below) — persist once per interaction.
  const liveRef = useRef(null);
  const annsRef = useRef([]);
  const debounceRef = useRef(null);
  const [, bump] = useReducer((x) => x + 1, 0);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rect =
    natural && stage.w
      ? contentRect(stage.w, stage.h, natural.w, natural.h)
      : null;

  const anns = useMemo(() => applicableAnnotations(doc, page), [doc, page]);
  annsRef.current = anns;
  const renderAnns = liveRef.current ?? anns;
  const selected = renderAnns.find((a) => a.id === selectedId) || null;

  const applyLive = useCallback((id, patch) => {
    const base = liveRef.current ?? annsRef.current;
    liveRef.current = base.map((a) =>
      a.id === id
        ? {
            ...a,
            ...patch,
            content: patch.content
              ? { ...a.content, ...patch.content }
              : a.content,
          }
        : a
    );
    bump();
  }, []);

  const flush = useCallback(async () => {
    const working = liveRef.current;
    if (!working) return;
    const byId = new Map(working.map((a) => [a.id, a]));
    const merged = (doc.annotations || []).map((a) => byId.get(a.id) || a);
    await saveDocument({ ...doc, annotations: merged });
    liveRef.current = null;
    bump();
  }, [doc, saveDocument]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const persistFull = useCallback(
    (annotations) => {
      liveRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return saveDocument({ ...doc, annotations });
    },
    [doc, saveDocument]
  );

  const editContent = useCallback(
    (id, patch) => {
      applyLive(id, patch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => flushRef.current(), 350);
    },
    [applyLive]
  );

  // Immediate single-shot change (buttons).
  const setNow = (id, patch) => {
    applyLive(id, patch);
    flushRef.current();
  };

  // --- Zoom / pan --- (functional so repeated taps compound correctly)
  const zoomBy = useCallback((factor, focal) => {
    setView((v) => {
      const s = Math.min(MAX_ZOOM, Math.max(1, v.scale * factor));
      if (s <= 1) return { scale: 1, tx: 0, ty: 0 };
      const cx = (focal.x - v.tx) / v.scale;
      const cy = (focal.y - v.ty) / v.scale;
      return { scale: s, tx: focal.x - cx * s, ty: focal.y - cy * s };
    });
  }, []);

  const stageCenter = () => {
    const el = stageRef.current;
    return { x: (el?.clientWidth || 0) / 2, y: (el?.clientHeight || 0) / 2 };
  };
  const zoomIn = () => zoomBy(1.5, stageCenter());
  const zoomOut = () => zoomBy(1 / 1.5, stageCenter());
  const resetZoom = () => setView({ scale: 1, tx: 0, ty: 0 });

  const onStagePointerDown = (e) => {
    // Zoom controls are inside the stage — don't treat their taps as a
    // deselect/pan gesture.
    if (e.target.closest('.zoom-controls')) return;
    // Empty/image tap → deselect (annotations stop propagation).
    setSelectedId(null);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    const box = stageRef.current.getBoundingClientRect();
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = {
        x: (pts[0].x + pts[1].x) / 2 - box.left,
        y: (pts[0].y + pts[1].y) / 2 - box.top,
      };
      gestureRef.current = {
        mode: 'pinch',
        startDist: dist,
        startScale: view.scale,
        contentMid: {
          x: (mid.x - view.tx) / view.scale,
          y: (mid.y - view.ty) / view.scale,
        },
      };
    } else if (pts.length === 1 && view.scale > 1) {
      gestureRef.current = {
        mode: 'pan',
        start: { x: e.clientX, y: e.clientY },
        startView: { ...view },
      };
    }
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gestureRef.current;
      if (!g) return;
      const pts = [...pointersRef.current.values()];
      const box = stageRef.current.getBoundingClientRect();
      if (g.mode === 'pinch' && pts.length >= 2) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = {
          x: (pts[0].x + pts[1].x) / 2 - box.left,
          y: (pts[0].y + pts[1].y) / 2 - box.top,
        };
        let s = Math.min(
          MAX_ZOOM,
          Math.max(1, (g.startScale * dist) / g.startDist)
        );
        if (s <= 1) {
          setView({ scale: 1, tx: 0, ty: 0 });
        } else {
          setView({
            scale: s,
            tx: mid.x - g.contentMid.x * s,
            ty: mid.y - g.contentMid.y * s,
          });
        }
      } else if (g.mode === 'pan') {
        setView({
          scale: g.startView.scale,
          tx: g.startView.tx + (e.clientX - g.start.x),
          ty: g.startView.ty + (e.clientY - g.start.y),
        });
      }
    };
    const onUp = (e) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) gestureRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // --- Annotation actions ---
  const deleteAnnotation = (id) => {
    persistFull((doc.annotations || []).filter((a) => a.id !== id));
    setSelectedId(null);
  };

  const addText = () => {
    const ann = {
      id: uid(),
      type: 'text',
      content: { text: 'Text', color: '#111111', fontSize: 0.05 },
      x: 0.3,
      y: 0.3,
      width: 0.4,
      height: 0.05,
      rotation: 0,
      scope: 'page',
      pageId: page.id,
    };
    persistFull([...(doc.annotations || []), ann]);
    setSelectedId(ann.id);
  };

  const addImageLike = async (type, dataUrl) => {
    const img = await loadImage(dataUrl);
    const width = type === 'signature' ? 0.35 : 0.4;
    let height = width * 0.5;
    if (rect) {
      height =
        (width * (rect.w / rect.h) * img.naturalHeight) / img.naturalWidth;
    }
    const ann = {
      id: uid(),
      type,
      content: { dataUrl },
      x: 0.3,
      y: type === 'signature' ? 0.55 : 0.3,
      width,
      height,
      rotation: 0,
      scope: 'page',
      pageId: page.id,
    };
    persistFull([...(doc.annotations || []), ann]);
    setSelectedId(ann.id);
  };

  const addSignature = (dataUrl) => {
    setSigOpen(false);
    addImageLike('signature', dataUrl);
  };

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => addImageLike('image', String(r.result));
    r.readAsDataURL(f);
  };

  const toggleScope = (ann) => {
    const next = (doc.annotations || []).map((a) =>
      a.id === ann.id
        ? {
            ...a,
            scope: a.scope === 'document' ? 'page' : 'document',
            pageId: page.id,
          }
        : a
    );
    persistFull(next);
  };

  const rotateBy = (delta) =>
    setNow(selected.id, {
      rotation: ((((selected.rotation || 0) + delta) % 360) + 360) % 360,
    });

  const onSizeChange = (v) => {
    if (selected.type === 'text') {
      editContent(selected.id, { height: v, content: { fontSize: v } });
    } else {
      const aspect = selected.height / selected.width || 0.5;
      editContent(selected.id, { width: v, height: v * aspect });
    }
  };
  const sizeProps =
    selected?.type === 'text'
      ? { min: 0.02, max: 0.15, step: 0.005, value: selected.height }
      : { min: 0.1, max: 0.95, step: 0.01, value: selected?.width ?? 0.4 };

  const runPageOcr = async () => {
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const { runOcr } = await import('../lib/ocr.js'); // lazy: loads Tesseract on demand
      const text = await runOcr(page.processedImage, setOcrProgress);
      const pages = doc.pages.map((p) =>
        p.id === page.id ? { ...p, ocrText: text || '' } : p
      );
      await saveDocument({ ...doc, pages });
    } finally {
      setOcrBusy(false);
    }
  };

  const transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn ghost icon" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h2>Page</h2>
        <button className="btn small" onClick={() => onReEdit(page)}>
          Re-edit
        </button>
        <button className="btn small" onClick={() => setExportOpen(true)}>
          Export
        </button>
      </div>

      <div
        className="page-stage"
        ref={stageRef}
        onPointerDown={onStagePointerDown}
      >
        <div className="page-transform" style={{ transform }}>
          {rect && (
            <img
              className="page-image"
              src={page.processedImage}
              alt="Page"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
              }}
              draggable={false}
            />
          )}
          <AnnotationLayer
            annotations={renderAnns}
            rect={rect}
            scale={view.scale}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={applyLive}
            onCommit={() => flushRef.current()}
          />
        </div>

        <img
          src={page.processedImage}
          alt=""
          style={{ display: 'none' }}
          onLoad={(e) =>
            setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })
          }
        />

        <div className="zoom-controls">
          <button className="zoom-btn" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
          <button className="zoom-btn" onClick={resetZoom}>
            {Math.round(view.scale * 100)}%
          </button>
          <button className="zoom-btn" onClick={zoomIn} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>

      {selected && (
        <div className="ann-editor">
          <div className="row" style={{ margin: 0, gap: 8 }}>
            <button
              className={`chip ${selected.scope === 'page' ? 'active' : ''}`}
              onClick={() => toggleScope(selected)}
            >
              {selected.scope === 'document' ? 'All pages' : 'This page'}
            </button>
            <div className="grow" />
            <button
              className="btn danger small"
              onClick={() => deleteAnnotation(selected.id)}
            >
              Delete
            </button>
          </div>

          <div className="row" style={{ margin: '8px 0 0', gap: 6, alignItems: 'center' }}>
            <button className="btn small" onClick={() => rotateBy(-90)} aria-label="Rotate left">
              ⟲
            </button>
            <button className="btn small" onClick={() => rotateBy(90)} aria-label="Rotate right">
              ⟳
            </button>
            <span
              style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 38, textAlign: 'center' }}
            >
              {selected.rotation || 0}°
            </span>
            <input
              type="range"
              aria-label="Size"
              {...sizeProps}
              onChange={(e) => onSizeChange(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>

          {selected.type === 'text' && (
            <div className="row" style={{ marginBottom: 0 }}>
              <input
                type="text"
                value={selected.content.text}
                onChange={(e) =>
                  editContent(selected.id, { content: { text: e.target.value } })
                }
                style={{ flex: 1 }}
              />
              <input
                type="color"
                value={selected.content.color}
                onChange={(e) =>
                  editContent(selected.id, {
                    content: { color: e.target.value },
                  })
                }
                aria-label="Text color"
              />
            </div>
          )}
        </div>
      )}

      {(page.ocrText != null || ocrBusy) && (
        <div className="ocr-panel">
          {ocrBusy ? (
            <>
              <div className="progress">
                <span style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
              </div>
              <p className="dim">
                Recognising text… {Math.round(ocrProgress * 100)}%
              </p>
            </>
          ) : page.ocrText ? (
            <>
              <textarea readOnly value={page.ocrText} rows={4} />
              <button
                className="btn small"
                onClick={() => navigator.clipboard?.writeText(page.ocrText)}
              >
                Copy text
              </button>
            </>
          ) : (
            <p className="dim">OCR found no text on this page.</p>
          )}
        </div>
      )}

      <div className="toolbar">
        <button className="btn small" onClick={addText}>
          + Text
        </button>
        <button className="btn small" onClick={() => setSigOpen(true)}>
          + Signature
        </button>
        <label className="btn small">
          + Image
          <input type="file" accept="image/*" hidden onChange={onPickImage} />
        </label>
        <div className="grow" />
        <button className="btn small" onClick={runPageOcr} disabled={ocrBusy}>
          {ocrBusy ? 'OCR…' : 'OCR'}
        </button>
      </div>

      {sigOpen && (
        <SignatureManager onPick={addSignature} onClose={() => setSigOpen(false)} />
      )}
      {exportOpen && (
        <ExportDialog doc={doc} page={page} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}
