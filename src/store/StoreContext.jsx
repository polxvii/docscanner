import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as db from '../lib/db.js';
import { uid } from '../lib/id.js';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [signatures, setSignatures] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [f, d, s] = await Promise.all([
          db.getAllFolders(),
          db.getAllDocuments(),
          db.getAllSignatures(),
        ]);
        setFolders(f);
        setDocuments(d);
        setSignatures(s);
      } catch (err) {
        console.error('Failed to load from IndexedDB', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --- Folders ---
  const createFolder = useCallback(async (name) => {
    const folder = { id: uid(), name: name || 'Untitled', createdAt: Date.now() };
    await db.putFolder(folder);
    setFolders((prev) => [...prev, folder]);
    return folder;
  }, []);

  const renameFolder = useCallback(async (id, name) => {
    let updated;
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? (updated = { ...f, name }) : f))
    );
    if (updated) await db.putFolder(updated);
  }, []);

  const deleteFolder = useCallback(async (id) => {
    await db.deleteFolder(id);
    // Delete documents inside the folder too.
    const inFolder = (await db.getAllDocuments()).filter(
      (d) => d.folderId === id
    );
    await Promise.all(inFolder.map((d) => db.deleteDocument(d.id)));
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setDocuments((prev) => prev.filter((d) => d.folderId !== id));
  }, []);

  // --- Documents ---
  const saveDocument = useCallback(async (doc) => {
    const next = { ...doc, updatedAt: Date.now() };
    await db.putDocument(next);
    setDocuments((prev) => {
      const exists = prev.some((d) => d.id === next.id);
      return exists
        ? prev.map((d) => (d.id === next.id ? next : d))
        : [...prev, next];
    });
    return next;
  }, []);

  const createDocument = useCallback(
    async ({ folderId = null, name } = {}) => {
      const now = Date.now();
      const doc = {
        id: uid(),
        folderId,
        name: name || 'Scan ' + new Date(now).toLocaleDateString(),
        createdAt: now,
        updatedAt: now,
        thumbnail: null,
        pages: [],
        annotations: [],
      };
      await db.putDocument(doc);
      setDocuments((prev) => [...prev, doc]);
      return doc;
    },
    []
  );

  const deleteDocument = useCallback(async (id) => {
    await db.deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const duplicateDocument = useCallback(
    async (id) => {
      const src = documents.find((d) => d.id === id);
      if (!src) return null;
      const now = Date.now();
      const copy = {
        ...src,
        id: uid(),
        name: src.name + ' copy',
        createdAt: now,
        updatedAt: now,
        pages: src.pages.map((p) => ({ ...p, id: uid() })),
        annotations: (src.annotations || []).map((a) => ({ ...a, id: uid() })),
      };
      await db.putDocument(copy);
      setDocuments((prev) => [...prev, copy]);
      return copy;
    },
    [documents]
  );

  // --- Signatures ---
  const saveSignature = useCallback(async (sig) => {
    const full = {
      id: sig.id || uid(),
      name: sig.name || 'Signature',
      dataUrl: sig.dataUrl,
      createdAt: sig.createdAt || Date.now(),
    };
    await db.putSignature(full);
    setSignatures((prev) => {
      const exists = prev.some((s) => s.id === full.id);
      return exists
        ? prev.map((s) => (s.id === full.id ? full : s))
        : [...prev, full];
    });
    return full;
  }, []);

  const deleteSignature = useCallback(async (id) => {
    await db.deleteSignature(id);
    setSignatures((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      loading,
      folders,
      documents,
      signatures,
      createFolder,
      renameFolder,
      deleteFolder,
      saveDocument,
      createDocument,
      deleteDocument,
      duplicateDocument,
      saveSignature,
      deleteSignature,
    }),
    [
      loading,
      folders,
      documents,
      signatures,
      createFolder,
      renameFolder,
      deleteFolder,
      saveDocument,
      createDocument,
      deleteDocument,
      duplicateDocument,
      saveSignature,
      deleteSignature,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
