import { useCallback, useState } from 'react';
import { useOpenCV } from './hooks/useOpenCV.js';
import { useStore } from './store/StoreContext.jsx';
import { makeThumbnail } from './lib/imaging.js';
import { uid } from './lib/id.js';
import LibraryScreen from './components/LibraryScreen.jsx';
import CameraView from './components/CameraView.jsx';
import CropScreen from './components/CropScreen.jsx';
import FilterScreen from './components/FilterScreen.jsx';
import DocumentEditor from './components/DocumentEditor.jsx';
import './App.css';

export default function App() {
  const [nav, setNav] = useState({ name: 'library' });
  const [draft, setDraft] = useState(null);

  // Only load OpenCV once the user is in the scan pipeline.
  const needsCv = ['camera', 'crop', 'filter'].includes(nav.name);
  const { status: cvStatus, cv, error: cvError } = useOpenCV(needsCv);
  const { documents, createDocument, saveDocument } = useStore();

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
  const onCameraCapture = useCallback((image, corners) => {
    setDraft((d) => ({
      ...d,
      originalImage: image,
      cropCorners: corners || d?.cropCorners,
    }));
    setNav({ name: 'crop' });
  }, []);

  const onCropConfirm = useCallback((processed, corners, base) => {
    setDraft((d) => ({
      ...d,
      // `base` is the (possibly rotated) full-res source — keep it as the
      // originalImage so re-edit stays non-destructive.
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
          <CameraView
            cvStatus={cvStatus}
            cv={cv}
            cvError={cvError}
            onCapture={onCameraCapture}
            onBack={toLibrary}
          />
        </div>
      );

    case 'crop':
      return (
        <div className="app">
          <CropScreen
            cv={cv}
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
            cv={cv}
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
            cv={cv}
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
            onOpenDoc={(id) => setNav({ name: 'editor', documentId: id })}
          />
        </div>
      );
  }
}
