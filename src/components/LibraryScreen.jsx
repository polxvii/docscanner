import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import PromptModal from './PromptModal.jsx';
import './LibraryScreen.css';

export default function LibraryScreen({ onNewScan, onOpenDoc }) {
  const {
    loading,
    folders,
    documents,
    createFolder,
    renameFolder,
    deleteFolder,
    deleteDocument,
    duplicateDocument,
    saveDocument,
  } = useStore();

  const [selectedFolder, setSelectedFolder] = useState('all'); // 'all' | id
  const [menuId, setMenuId] = useState(null);
  const [prompt, setPrompt] = useState(null); // {type, ...}

  const visibleDocs = documents
    .filter((d) => selectedFolder === 'all' || d.folderId === selectedFolder)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const currentFolder = folders.find((f) => f.id === selectedFolder);

  const closePrompt = () => setPrompt(null);

  return (
    <div className="screen">
      <div className="topbar">
        <h1>DocScanner</h1>
        <button
          className="btn small"
          onClick={() => setPrompt({ type: 'new-folder' })}
        >
          + Folder
        </button>
      </div>

      <div className="folder-bar">
        <div className="chip-row">
          <button
            className={`chip ${selectedFolder === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedFolder('all')}
          >
            All
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={`chip ${selectedFolder === f.id ? 'active' : ''}`}
              onClick={() => setSelectedFolder(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
        {currentFolder && (
          <div className="folder-actions">
            <button
              className="btn small ghost"
              onClick={() =>
                setPrompt({
                  type: 'rename-folder',
                  id: currentFolder.id,
                  initial: currentFolder.name,
                })
              }
            >
              Rename folder
            </button>
            <button
              className="btn small danger"
              onClick={() =>
                setPrompt({
                  type: 'delete-folder',
                  id: currentFolder.id,
                  name: currentFolder.name,
                })
              }
            >
              Delete folder
            </button>
          </div>
        )}
      </div>

      <div className="scroll">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : visibleDocs.length === 0 ? (
          <div className="empty">
            <h3>No documents yet</h3>
            <p>Start a new scan to capture your first document.</p>
            <button
              className="btn primary"
              onClick={() =>
                onNewScan(selectedFolder === 'all' ? null : selectedFolder)
              }
            >
              New scan
            </button>
          </div>
        ) : (
          <div className="doc-grid">
            {visibleDocs.map((d) => (
              <div key={d.id} className="doc-card">
                <button
                  className="doc-thumb"
                  onClick={() => onOpenDoc(d.id)}
                >
                  {d.thumbnail ? (
                    <img src={d.thumbnail} alt={d.name} />
                  ) : (
                    <div className="doc-noimg">No pages</div>
                  )}
                </button>
                <div className="doc-meta">
                  <div className="doc-name" title={d.name}>
                    {d.name}
                  </div>
                  <div className="doc-sub">
                    {d.pages.length} pg ·{' '}
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="doc-menu-btn"
                  onClick={() => setMenuId(menuId === d.id ? null : d.id)}
                  aria-label="Document menu"
                >
                  ⋯
                </button>
                {menuId === d.id && (
                  <div className="doc-menu" onMouseLeave={() => setMenuId(null)}>
                    <button
                      onClick={() => {
                        setMenuId(null);
                        onOpenDoc(d.id);
                      }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => {
                        setMenuId(null);
                        setPrompt({
                          type: 'rename-doc',
                          id: d.id,
                          initial: d.name,
                        });
                      }}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        setMenuId(null);
                        duplicateDocument(d.id);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        setMenuId(null);
                        setPrompt({
                          type: 'delete-doc',
                          id: d.id,
                          name: d.name,
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar">
        <button
          className="btn primary grow"
          onClick={() =>
            onNewScan(selectedFolder === 'all' ? null : selectedFolder)
          }
        >
          📷 New scan
        </button>
      </div>

      {/* Prompts / confirmations */}
      {prompt?.type === 'new-folder' && (
        <PromptModal
          title="New folder"
          confirmText="Create"
          onConfirm={async (name) => {
            if (name) await createFolder(name);
            closePrompt();
          }}
          onClose={closePrompt}
        />
      )}
      {prompt?.type === 'rename-folder' && (
        <PromptModal
          title="Rename folder"
          initial={prompt.initial}
          onConfirm={async (name) => {
            if (name) await renameFolder(prompt.id, name);
            closePrompt();
          }}
          onClose={closePrompt}
        />
      )}
      {prompt?.type === 'rename-doc' && (
        <PromptModal
          title="Rename document"
          initial={prompt.initial}
          onConfirm={async (name) => {
            const d = documents.find((x) => x.id === prompt.id);
            if (d && name) await saveDocument({ ...d, name });
            closePrompt();
          }}
          onClose={closePrompt}
        />
      )}
      {prompt?.type === 'delete-folder' && (
        <ConfirmModal
          title="Delete folder?"
          body={`“${prompt.name}” and all documents inside it will be deleted.`}
          onConfirm={async () => {
            await deleteFolder(prompt.id);
            setSelectedFolder('all');
            closePrompt();
          }}
          onClose={closePrompt}
        />
      )}
      {prompt?.type === 'delete-doc' && (
        <ConfirmModal
          title="Delete document?"
          body={`“${prompt.name}” will be permanently deleted.`}
          onConfirm={async () => {
            await deleteDocument(prompt.id);
            closePrompt();
          }}
          onClose={closePrompt}
        />
      )}
    </div>
  );
}

function ConfirmModal({ title, body, onConfirm, onClose }) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <h3>{title}</h3>
        <p style={{ color: 'var(--text-dim)' }}>{body}</p>
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
