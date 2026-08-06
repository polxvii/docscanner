import { useCallback, useState } from 'react';
import { useStore } from './store/StoreContext.jsx';
import { makeThumbnail } from './lib/imaging.js';
import { FULL_CORNERS } from './lib/geometry.js';
import { uid } from './lib/id.js';
import LibraryScreen from './components/LibraryScreen.jsx';
import CameraView from './components/CameraView.jsx';
import CropScreen from './components/CropScreen.jsx';
import FilterScreen from './components/FilterScreen.jsx';
import DocumentEditor from './components/DocumentEditor.jsx';
import './App.css';

export default function App() {
  const { documents, createDocument, saveDocument } = useStore();

  const [nav, setNav] = useState({ name: 'library' });
  const [draft, setDraft] = useState(null);
  const [importing, setImporting] = useState(null); // null | { progress, error }

  // --- Import an existing PDF as a new document (each page → a page) ---
  const importPdf = useCallback(
    async (file, folderId) => {
      if (!file) return;
      setImporting({ progress: 0, error: null });
      try {
        const { pdfToPageImages } = await import('./lib/pdf.js');
        const images = await pdfToPageImages(file, (p) =>
          setImporting({ progress: p, error: null })
        );
        if (!images.length) throw new Error('No pages found in PDF.');
        const doc = await createDocument({
          folderId: folderId || null,
          name: file.name.replace(/\.pdf$/i, '') || 'Imported PDF',
        });
        const pages = images.map((img) => ({
          id: uid(),
          originalImage: img,
          cropCorners: FULL_CORNERS,
          filter: 'original',
          processedImage: img,
        }));
        const thumbnail = await makeThumbnail(pages[0].processedImage);
        await saveDocument({ ...doc, pages, thumbnail });
        setImporting(null);
        setNav({ name: 'editor', documentId: doc.id });
      } catch (err) {
        setImporting({ progress: 0, error: err?.message || 'Import failed' });
      }
    },
    [createDocument, saveDocument]
  );

  // --- Scan session entry points ---
  const startNewScan = useCallback((folderId) => {
    setDraft({
      documentId: null,
      folderId: folderId || null,
      editingPageId: null,
      filter: 'original',
    });
    setNav({ name: 'camera' });
  }, []);

  const uploadImage = useCallback((file, folderId) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraft({
        documentId: null,
        folderId: folderId || null,
        editingPageId: null,
        filter: 'original',
        originalImage: String(reader.result),
      });
      setNav({ name: 'crop' });
    };
    reader.readAsDataURL(file);
  }, []);

  const addPageToDoc = useCallback(
    (documentId) => {
      const doc = documents.find((d) => d.id === documentId);
      setDraft({
        documentId,
        folderId: doc?.folderId || null,
        editingPageId: null,
        filter: 'original',
      });
      setNav({ name: 'camera' });
    },
    [documents]
  );

  const reEditPage = useCallback(
    (page, documentId) => {
      const doc = documents.find((d) => d.id === documentId);
      setDraft({
        documentId,
        folderId: doc?.folderId || null,
        editingPageId: page.id,
        originalImage: page.originalImage,
        cropCorners: page.cropCorners,
        filter: page.filter || 'original',
      });
      setNav({ name: 'crop' });
    },
    [documents]
  );

  // --- Pipeline transitions ---
  const onCameraCapture = useCallback((image) => {
    setDraft((d) => ({ ...d, originalImage: image }));
    setNav({ name: 'crop' });
  }, []);

  const onCropConfirm = useCallback((processed, corners, base) => {
    setDraft((d) => ({
      ...d,
      originalImage: base,
      cropCorners: corners,
      processedImage: processed,
    }));
    setNav({ name: 'filter' });
  }, []);

  const commitPage = useCallback(
    async (filter, filteredImage) => {
      const d = draft;
      let baseDoc;
      let docId = d.documentId;
      if (!docId) {
        baseDoc = await createDocument({ folderId: d.folderId });
        docId = baseDoc.id;
      } else {
        baseDoc = documents.find((x) => x.id === docId);
      }
      if (!baseDoc) {
        setDraft(null);
        setNav({ name: 'library' });
        return;
      }

      let pages;
      if (d.editingPageId) {
        pages = baseDoc.pages.map((p) =>
          p.id === d.editingPageId
            ? {
                ...p,
                originalImage: d.originalImage,
                cropCorners: d.cropCorners,
                filter,
                processedImage: filteredImage,
              }
            : p
        );
      } else {
        pages = [
          ...baseDoc.pages,
          {
            id: uid(),
            originalImage: d.originalImage,
            cropCorners: d.cropCorners,
            filter,
            processedImage: filteredImage,
          },
        ];
      }

      const thumbnail = await makeThumbnail(pages[0].processedImage);
      await saveDocument({ ...baseDoc, pages, thumbnail });
      setDraft(null);
      setNav({ name: 'editor', documentId: docId });
    },
    [draft, documents, createDocument, saveDocument]
  );

  // --- Cancels ---
  const cropCancel = useCallback(() => {
    setNav(
      draft?.editingPageId
        ? { name: 'editor', documentId: draft.documentId }
        : { name: 'camera' }
    );
  }, [draft]);

  const filterCancel = useCallback(() => setNav({ name: 'crop' }), []);
  const toLibrary = useCallback(() => {
    setDraft(null);
    setNav({ name: 'library' });
  }, []);

  // --- Render ---
  switch (nav.name) {
    case 'camera':
      return (
        <div className="app">
          <CameraView onCapture={onCameraCapture} onBack={toLibrary} />
        </div>
      );

    case 'crop':
      return (
        <div className="app">
          <CropScreen
            image={draft.originalImage}
            initialCorners={draft.cropCorners}
            onConfirm={onCropConfirm}
            onCancel={cropCancel}
          />
        </div>
      );

    case 'filter':
      return (
        <div className="app">
          <FilterScreen
            image={draft.processedImage}
            initialFilter={draft.filter}
            onConfirm={commitPage}
            onCancel={filterCancel}
          />
        </div>
      );

    case 'editor':
      return (
        <div className="app">
          <DocumentEditor
            documentId={nav.documentId}
            onBack={toLibrary}
            onAddPage={addPageToDoc}
            onReEditPage={(page) => reEditPage(page, nav.documentId)}
          />
        </div>
      );

    case 'library':
    default:
      return (
        <div className="app">
          <LibraryScreen
            onNewScan={startNewScan}
            onUploadImage={uploadImage}
            onOpenDoc={(id) => setNav({ name: 'editor', documentId: id })}
            onImportPdf={importPdf}
            importing={importing}
            onDismissImportError={() => setImporting(null)}
          />
        </div>
      );
  }
}
