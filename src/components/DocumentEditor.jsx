import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { makeThumbnail } from '../lib/imaging.js';
import { composePagePreview } from '../lib/exporter.js';
import { applicableAnnotations } from '../lib/annotations.js';
import PageDetail from './PageDetail.jsx';
import ExportDialog from './ExportDialog.jsx';
import ImportingOverlay from './ImportingOverlay.jsx';
import './DocumentEditor.css';

export default function DocumentEditor({
  documentId,
  onBack,
  onAddPage,
  onUploadImage,
  onImportPdf,
  importing,
  onDismissImportError,
  onReEditPage,
}) {
  const { documents, saveDocument } = useStore();
  const doc = documents.find((d) => d.id === documentId);

  const [openPageId, setOpenPageId] = useState(null);
  const [exportTarget, setExportTarget] = useState(null);
  const [editingName, setEditingName] = useState(false);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [thumbs, setThumbs] = useState({}); // pageId → preview WITH annotations

  // Composite thumbnails for pages that have annotations so the grid shows the
  // real page (text/signature included).
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    (async () => {
      const next = {};
      for (const p of doc.pages) {
        if (applicableAnnotations(doc, p).length > 0) {
          try {
            next[p.id] = await composePagePreview(doc, p, 420);
          } catch {
            /* fall back to processedImage */
          }
          if (!alive) return;
        }
      }
      if (alive) setThumbs(next);
    })();
    return () => {
      alive = false;
    };
  }, [doc]);

  // Pointer-drag reorder (works on touch).
  const [dragId, setDragId] = useState(null);
  const [order, setOrder] = useState(null); // array of page ids while dragging
  const dragIdRef = useRef(null);
  const orderRef = useRef(null);
  dragIdRef.current = dragId;
  orderRef.current = order;

  useEffect(() => {
    if (!doc) return;
    const onMove = (e) => {
      if (!dragIdRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest?.('.page-card');
      const overId = card?.dataset.pid;
      if (!overId || overId === dragIdRef.current) return;
      setOrder((prev) => {
        if (!prev) return prev;
        const arr = [...prev];
        const from = arr.indexOf(dragIdRef.current);
        const to = arr.indexOf(overId);
        if (from < 0 || to < 0) return prev;
        arr.splice(from, 1);
        arr.splice(to, 0, dragIdRef.current);
        return arr;
      });
    };
    const onUp = async () => {
      const id = dragIdRef.current;
      if (!id) return;
      const ord = orderRef.current;
      setDragId(null);
      setOrder(null);
      if (!ord) return;
      const pages = ord
        .map((pid) => doc.pages.find((p) => p.id === pid))
        .filter(Boolean);
      const thumbnail = pages[0]
        ? await makeThumbnail(pages[0].processedImage)
        : null;
      await saveDocument({ ...doc, pages, thumbnail });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [doc, saveDocument]);

  if (!doc) {
    return (
      <div className="screen">
        <div className="topbar">
          <button className="btn ghost icon" onClick={onBack}>
            ‹
          </button>
          <h2>Document</h2>
        </div>
        <div className="empty">This document no longer exists.</div>
      </div>
    );
  }

  const openPage = openPageId
    ? doc.pages.find((p) => p.id === openPageId)
    : null;

  if (openPage) {
    const idx = doc.pages.findIndex((p) => p.id === openPageId);
    return (
      <PageDetail
        doc={doc}
        page={openPage}
        pageIndex={idx}
        pageCount={doc.pages.length}
        onBack={() => setOpenPageId(null)}
        onReEdit={(page) => onReEditPage(page)}
        onPrev={
          idx > 0 ? () => setOpenPageId(doc.pages[idx - 1].id) : null
        }
        onNext={
          idx < doc.pages.length - 1
            ? () => setOpenPageId(doc.pages[idx + 1].id)
            : null
        }
      />
    );
  }

  const refreshThumb = async (pages) =>
    pages[0] ? await makeThumbnail(pages[0].processedImage) : null;

  const deletePage = async (pageId) => {
    const pages = doc.pages.filter((p) => p.id !== pageId);
    const annotations = (doc.annotations || []).filter(
      (a) => a.scope === 'document' || a.pageId !== pageId
    );
    const thumbnail = await refreshThumb(pages);
    await saveDocument({ ...doc, pages, annotations, thumbnail });
  };

  const toggleSelect = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const exportSelected = () => {
    const pages = doc.pages.filter((p) => selected.has(p.id));
    if (!pages.length) return;
    setExportTarget({ ...doc, pages });
  };

  const deleteSelected = async () => {
    const pages = doc.pages.filter((p) => !selected.has(p.id));
    const annotations = (doc.annotations || []).filter(
      (a) => a.scope === 'document' || !selected.has(a.pageId)
    );
    const thumbnail = await refreshThumb(pages);
    await saveDocument({ ...doc, pages, annotations, thumbnail });
    exitSelect();
  };

  const renderPages = order
    ? order.map((id) => doc.pages.find((p) => p.id === id)).filter(Boolean)
    : doc.pages;

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn ghost icon" onClick={onBack} aria-label="Back">
          ‹
        </button>
        {editingName ? (
          <input
            type="text"
            autoFocus
            defaultValue={doc.name}
            onBlur={(e) => {
              saveDocument({ ...doc, name: e.target.value || doc.name });
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
            }}
            style={{ flex: 1 }}
          />
        ) : (
          <h2 onClick={() => setEditingName(true)}>{doc.name}</h2>
        )}
        {doc.pages.length > 0 &&
          (selecting ? (
            <button className="btn small" onClick={exitSelect}>
              Cancel
            </button>
          ) : (
            <>
              <button className="btn small" onClick={() => setSelecting(true)}>
                Select
              </button>
              <button className="btn small" onClick={() => setExportTarget(doc)}>
                Export
              </button>
            </>
          ))}
      </div>

      <div className="scroll">
        {doc.pages.length === 0 ? (
          <div className="empty">
            <h3>No pages yet</h3>
            <p>Add a page to start this document.</p>
            <button className="btn primary" onClick={() => onAddPage(doc.id)}>
              Add page
            </button>
          </div>
        ) : (
          <div className="page-grid">
            {renderPages.map((p, i) => (
              <div
                key={p.id}
                data-pid={p.id}
                className={`page-card ${dragId === p.id ? 'dragging' : ''} ${
                  selecting && selected.has(p.id) ? 'selected' : ''
                }`}
              >
                <button
                  className="page-thumb"
                  onClick={() =>
                    selecting ? toggleSelect(p.id) : setOpenPageId(p.id)
                  }
                >
                  <img src={thumbs[p.id] || p.processedImage} alt={`Page ${i + 1}`} />
                  <span className="page-num">{i + 1}</span>
                  {selecting && (
                    <span className="page-check">
                      {selected.has(p.id) ? '✓' : ''}
                    </span>
                  )}
                </button>
                {!selecting && (
                  <div className="page-card-foot">
                    <div
                      className="drag-handle"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setDragId(p.id);
                        setOrder(doc.pages.map((pg) => pg.id));
                      }}
                      aria-label="Drag to reorder"
                    >
                      ⠿
                    </div>
                    <button
                      className="btn danger icon small"
                      onClick={() => deletePage(p.id)}
                      aria-label="Delete page"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selecting ? (
        <div className="toolbar">
          <button
            className="btn danger"
            onClick={deleteSelected}
            disabled={!selected.size}
          >
            Delete ({selected.size})
          </button>
          <div className="grow" />
          <button
            className="btn primary"
            onClick={exportSelected}
            disabled={!selected.size}
          >
            Export ({selected.size})
          </button>
        </div>
      ) : (
        <div className="toolbar">
          <button className="btn primary grow" onClick={() => onAddPage(doc.id)}>
            📷 Scan
          </button>
          <label className="btn">
            🖼 Upload
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onUploadImage(f, { documentId: doc.id });
              }}
            />
          </label>
          <label className="btn">
            📄 PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onImportPdf(f, { documentId: doc.id });
              }}
            />
          </label>
        </div>
      )}

      {exportTarget && (
        <ExportDialog
          doc={exportTarget}
          page={exportTarget.pages[0]}
          onClose={() => setExportTarget(null)}
        />
      )}
      <ImportingOverlay importing={importing} onDismiss={onDismissImportError} />
    </div>
  );
}
