import { useRef, useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { makeThumbnail } from '../lib/imaging.js';
import PageDetail from './PageDetail.jsx';
import ExportDialog from './ExportDialog.jsx';
import './DocumentEditor.css';

export default function DocumentEditor({
  documentId,
  cv,
  onBack,
  onAddPage,
  onReEditPage,
}) {
  const { documents, saveDocument } = useStore();
  const doc = documents.find((d) => d.id === documentId);

  const [openPageId, setOpenPageId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const dragIndex = useRef(null);

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
    return (
      <PageDetail
        doc={doc}
        page={openPage}
        cv={cv}
        onBack={() => setOpenPageId(null)}
        onReEdit={(page) => onReEditPage(page)}
      />
    );
  }

  const refreshThumb = async (pages) => {
    return pages[0] ? await makeThumbnail(pages[0].processedImage) : null;
  };

  const reorder = async (from, to) => {
    if (to < 0 || to >= doc.pages.length || from === to) return;
    const pages = [...doc.pages];
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved);
    const thumbnail = await refreshThumb(pages);
    await saveDocument({ ...doc, pages, thumbnail });
  };

  const deletePage = async (pageId) => {
    const pages = doc.pages.filter((p) => p.id !== pageId);
    // Drop annotations that were scoped to the removed page.
    const annotations = (doc.annotations || []).filter(
      (a) => a.scope === 'document' || a.pageId !== pageId
    );
    const thumbnail = await refreshThumb(pages);
    await saveDocument({ ...doc, pages, annotations, thumbnail });
  };

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
        <button
          className="btn small"
          onClick={() => setExportOpen(true)}
          disabled={!doc.pages.length}
        >
          Export
        </button>
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
          <div className="page-list">
            {doc.pages.map((p, i) => (
              <div
                key={p.id}
                className="page-card"
                draggable
                onDragStart={() => (dragIndex.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => reorder(dragIndex.current, i)}
              >
                <button
                  className="page-thumb"
                  onClick={() => setOpenPageId(p.id)}
                >
                  <img src={p.processedImage} alt={`Page ${i + 1}`} />
                  <span className="page-num">{i + 1}</span>
                </button>
                <div className="page-actions">
                  <button
                    className="btn icon small"
                    onClick={() => reorder(i, i - 1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="btn icon small"
                    onClick={() => reorder(i, i + 1)}
                    disabled={i === doc.pages.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className="btn danger icon small"
                    onClick={() => deletePage(p.id)}
                    aria-label="Delete page"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar">
        <button className="btn primary grow" onClick={() => onAddPage(doc.id)}>
          + Add page
        </button>
      </div>

      {exportOpen && (
        <ExportDialog
          doc={doc}
          page={doc.pages[0]}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
