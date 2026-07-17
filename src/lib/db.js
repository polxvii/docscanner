// IndexedDB persistence via idb. Image data is far too large for localStorage,
// so documents (with embedded pages + annotations), folders and saved
// signatures all live here.

import { openDB } from 'idb';

const DB_NAME = 'docscanner';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('signatures')) {
          db.createObjectStore('signatures', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// --- Folders ---
export async function getAllFolders() {
  return (await getDB()).getAll('folders');
}
export async function putFolder(folder) {
  return (await getDB()).put('folders', folder);
}
export async function deleteFolder(id) {
  return (await getDB()).delete('folders', id);
}

// --- Documents ---
export async function getAllDocuments() {
  return (await getDB()).getAll('documents');
}
export async function putDocument(doc) {
  return (await getDB()).put('documents', doc);
}
export async function deleteDocument(id) {
  return (await getDB()).delete('documents', id);
}

// --- Signatures ---
export async function getAllSignatures() {
  return (await getDB()).getAll('signatures');
}
export async function putSignature(sig) {
  return (await getDB()).put('signatures', sig);
}
export async function deleteSignature(id) {
  return (await getDB()).delete('signatures', id);
}
