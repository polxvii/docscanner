import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

export default function PageDetail({ doc, page, cv, onBack, onReEdit }) {
  const { saveDocument } = useStore();
  const stageRef = useRef(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const [sigOpen, setSigOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

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
  const selected = anns.find((a) => a.id === selectedId) || null;

  const persist = useCallback(
    (annotations) => saveDocument({ ...doc, annotations }),
    [doc, saveDocument]
  );

  const updateAnnotation = useCallback(
    (id, patch) => {
      const next = (doc.annotations || []).map((a) =>
        a.id === id
          ? {
              ...a,
              ...patch,
              content: patch.content ? { ...a.content, ...patch.content } : a.content,
            }
          : a
      );
      persist(next);
    },
    [doc.annotations, persist]
  );

  const deleteAnnotation = (id) => {
    persist((doc.annotations || []).filter((a) => a.id !== id));
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
    persist([...(doc.annotations || []), ann]);
    setSelectedId(ann.id);
  };

  const addSignature = async (dataUrl) => {
    setSigOpen(false);
    const img = await loadImage(dataUrl);
    const width = 0.35;
    // Preserve the signature's aspect ratio relative to the page image rect.
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
    persist([...(doc.annotations || []), ann]);
    setSelectedId(ann.id);
  };

  const toggleScope = (ann) => {
    updateAnnotation(ann.id, {
      scope: ann.scope === 'document' ? 'page' : 'document',
      pageId: page.id,
    });
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
            setNatural({
              w: e.target.naturalWidth,
              h: e.target.naturalHeight,
            })
          }
        />
        <AnnotationLayer
          annotations={anns}
          rect={rect}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={updateAnnotation}
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
                  updateAnnotation(selected.id, {
                    content: { text: e.target.value },
                  })
                }
                style={{ flex: 1 }}
              />
              <input
                type="color"
                value={selected.content.color}
                onChange={(e) =>
                  updateAnnotation(selected.id, {
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
              <p className="dim">Recognising text… {Math.round(ocrProgress * 100)}%</p>
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
