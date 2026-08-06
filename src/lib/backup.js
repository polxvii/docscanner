// Backup / restore all local data (folders, documents, signatures) to a single
// JSON file. Client-side only — the safety net for the local-only storage
// model (clearing the browser wipes IndexedDB otherwise).

import * as db from './db.js';

export async function buildBackup() {
  const [folders, documents, signatures] = await Promise.all([
    db.getAllFolders(),
    db.getAllDocuments(),
    db.getAllSignatures(),
  ]);
  return {
    app: 'docscanner',
    version: 1,
    exportedAt: Date.now(),
    folders,
    documents,
    signatures,
  };
}

/** Build the backup and trigger a download. Returns counts. */
export async function exportBackupFile() {
  const data = await buildBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `docscanner-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {
    folders: data.folders.length,
    documents: data.documents.length,
    signatures: data.signatures.length,
  };
}

/**
 * Restore from a backup file. Default merges (upsert by id); `replace: true`
 * wipes existing data first.
 */
export async function importBackupFile(file, { replace = false } = {}) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data.app !== 'docscanner' || !Array.isArray(data.documents)) {
    throw new Error('That is not a DocScanner backup file.');
  }

  if (replace) {
    const [folders, documents, signatures] = await Promise.all([
      db.getAllFolders(),
      db.getAllDocuments(),
      db.getAllSignatures(),
    ]);
    await Promise.all([
      ...folders.map((f) => db.deleteFolder(f.id)),
      ...documents.map((d) => db.deleteDocument(d.id)),
      ...signatures.map((s) => db.deleteSignature(s.id)),
    ]);
  }

  for (const f of data.folders || []) await db.putFolder(f);
  for (const d of data.documents || []) await db.putDocument(d);
  for (const s of data.signatures || []) await db.putSignature(s);

  return {
    folders: (data.folders || []).length,
    documents: (data.documents || []).length,
    signatures: (data.signatures || []).length,
  };
}
