import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { contentRect } from '../lib/geometry.js';
import { loadImage } from '../lib/imaging.js';
import { applicableAnnotations } from '../lib/exporter.js';
import { runOcr } from '../lib/ocr.js';
import { uid } from '../lib/id.js';
import AnnotationLayer from './AnnotationLayer.jsx';
import SignatureManager from './SignatureManager.jsx';
import ExportDialog from './ExportDialog.jsx';
import './PageDetail.css';

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

  // Transient working copy of the applicable annotations during a drag/resize/
  // rotate/type interaction. Rendering reads from this so it updates at 60fps
  // WITHOUT writing the (multi-MB) document to IndexedDB on every pointer move.
  // We persist once when the interaction ends (pointer up / debounced typing).
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

  // Transient in-memory update (no persistence).
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

  // Persist the working copy once, merged back into the full annotation list.
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

  // Structural change (add / delete / scope) — persist immediately.
  const persistFull = useCallback(
    (annotations) => {
      liveRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return saveDocument({ ...doc, annotations });
    },
    [doc, saveDocument]
  );

  // Text / colour edits — live update + debounced persist.
  const editContent = useCallback(
    (id, patch) => {
      applyLive(id, patch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => flushRef.current(), 350);
    },
    [applyLive]
  );

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

  const addSignature = async (dataUrl) => {
    setSigOpen(false);
    const img = await loadImage(dataUrl);
    const width = 0.35;
    let height = 0.15;
    if (rect) {
      height =
        (width * (rect.w / rect.h) * img.naturalHeight) / img.naturalWidth;
    }
    const ann = {
      id: uid(),
      type: 'signature',
      content: { dataUrl },
      x: 0.32,
      y: 0.55,
      width,
      height,
      rotation: 0,
      scope: 'page',
      pageId: page.id,
    };
    persistFull([...(doc.annotations || []), ann]);
    setSelectedId(ann.id);
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

  const runPageOcr = async () => {
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const text = await runOcr(page.processedImage, setOcrProgress);
      const pages = doc.pages.map((p) =>
        p.id === page.id ? { ...p, ocrText: text || '' } : p
      );
      await saveDocument({ ...doc, pages });
    } finally {
      setOcrBusy(false);
    }
  };

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
        onPointerDown={(e) => {
          if (e.target === stageRef.current) setSelectedId(null);
        }}
      >
        {rect && (
          <img
            className="page-image"
            src={page.processedImage}
            alt="Page"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            draggable={false}
          />
        )}
        <img
          src={page.processedImage}
          alt=""
          style={{ display: 'none' }}
          onLoad={(e) =>
            setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })
          }
        />
        <AnnotationLayer
          annotations={renderAnns}
          rect={rect}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={applyLive}
          onCommit={() => flushRef.current()}
        />
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
