import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { exportBackupFile, importBackupFile } from '../lib/backup.js';
import PromptModal from './PromptModal.jsx';
import Modal from './Modal.jsx';
import './LibraryScreen.css';

export default function LibraryScreen({
  onNewScan,
  onUploadImage,
  onOpenDoc,
  onImportPdf,
  importing,
  onDismissImportError,
}) {
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
    reloadAll,
  } = useStore();

  const [selectedFolder, setSelectedFolder] = useState('all'); // 'all' | id
  const [menuId, setMenuId] = useState(null);
  const [prompt, setPrompt] = useState(null); // {type, ...}
  const [backupOpen, setBackupOpen] = useState(false);

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
        <button
          className="btn small ghost"
          onClick={() => setBackupOpen(true)}
          aria-label="Backup and restore"
          title="Backup & restore"
        >
          ⋯
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
        <label className="btn">
          🖼 Upload
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file)
                onUploadImage(
                  file,
                  selectedFolder === 'all' ? null : selectedFolder
                );
            }}
          />
        </label>
        <label className="btn">
          📄 Import PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file)
                onImportPdf(
                  file,
                  selectedFolder === 'all' ? null : selectedFolder
                );
            }}
          />
        </label>
      </div>

      {importing && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 320, textAlign: 'center' }}>
            {importing.error ? (
              <>
                <h3>Couldn’t import PDF</h3>
                <p style={{ color: 'var(--text-dim)' }}>{importing.error}</p>
                <div className="actions">
                  <button className="btn" onClick={onDismissImportError}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Importing PDF…</h3>
                <div className="progress" style={{ margin: '12px 0' }}>
                  <span
                    style={{ width: `${Math.round(importing.progress * 100)}%` }}
                  />
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                  Rendering pages… {Math.round(importing.progress * 100)}%
                </p>
              </>
            )}
          </div>
        </div>
      )}

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
      {backupOpen && (
        <BackupModal onReload={reloadAll} onClose={() => setBackupOpen(false)} />
      )}
    </div>
  );
}

function BackupModal({ onReload, onClose }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const c = await exportBackupFile();
      setStatus(
        `Saved backup: ${c.documents} docs, ${c.folders} folders, ${c.signatures} signatures.`
      );
    } catch (e) {
      setStatus('Export failed: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const c = await importBackupFile(file, { replace });
      await onReload();
      setStatus(
        `Restored ${c.documents} docs, ${c.folders} folders, ${c.signatures} signatures.`
      );
    } catch (e) {
      setStatus('Restore failed: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Backup & restore" onClose={onClose}>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
        Your scans live only in this browser. Export a backup file to keep them
        safe or move them to another device.
      </p>
      <button
        className="btn primary"
        style={{ width: '100%' }}
        onClick={doExport}
        disabled={busy}
      >
        ⤓ Export backup (.json)
      </button>

      <hr style={{ border: 0, borderTop: '1px solid #2a323b', margin: '16px 0' }} />

      <label
        className="row"
        style={{ margin: '0 0 10px', cursor: 'pointer', gap: 8 }}
      >
        <input
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />
        <span style={{ fontSize: 13 }}>
          Replace everything (otherwise merge)
        </span>
      </label>
      <label className="btn" style={{ width: '100%' }}>
        ⤒ Restore from backup
        <input
          type="file"
          accept="application/json,.json"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            doImport(f);
          }}
        />
      </label>

      {status && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>{status}</p>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </Modal>
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
