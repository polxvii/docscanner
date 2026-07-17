import { useState } from 'react';
import Modal from './Modal.jsx';
import {
  exportPdf,
  exportPageImage,
  shareOrDownload,
} from '../lib/exporter.js';

export default function ExportDialog({ doc, page, onClose }) {
  const [kind, setKind] = useState('pdf'); // 'pdf' | 'image'
  const [pageSize, setPageSize] = useState('a4');
  const [orientation, setOrientation] = useState('portrait');
  const [imgFormat, setImgFormat] = useState('png');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const run = async () => {
    setBusy(true);
    setStatus(null);
    try {
      let result;
      if (kind === 'pdf') {
        result = await exportPdf(doc, { pageSize, orientation });
      } else {
        result = await exportPageImage(doc, page, imgFormat);
      }
      const outcome = await shareOrDownload(result.blob, result.filename);
      setStatus(
        outcome === 'shared'
          ? 'Shared.'
          : outcome === 'cancelled'
            ? 'Share cancelled.'
            : `Downloaded ${result.filename}`
      );
    } catch (err) {
      setStatus('Export failed: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export" onClose={onClose}>
      <div className="chip-row" style={{ marginBottom: 8 }}>
        <button
          className={`chip ${kind === 'pdf' ? 'active' : ''}`}
          onClick={() => setKind('pdf')}
        >
          PDF (whole document)
        </button>
        <button
          className={`chip ${kind === 'image' ? 'active' : ''}`}
          onClick={() => setKind('image')}
          disabled={!page}
        >
          Image (this page)
        </button>
      </div>

      {kind === 'pdf' ? (
        <>
          <div className="row">
            <label>Page size</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value)}
            >
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
              <option value="fit">Fit to image</option>
            </select>
          </div>
          <div className="row">
            <label>Orientation</label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
              disabled={pageSize === 'fit'}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            {doc.pages.length} page{doc.pages.length === 1 ? '' : 's'}, no
            watermark.
          </p>
        </>
      ) : (
        <div className="row">
          <label>Format</label>
          <select
            value={imgFormat}
            onChange={(e) => setImgFormat(e.target.value)}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </div>
      )}

      {status && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>{status}</p>
      )}

      <div className="actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
        <button
          className="btn primary"
          onClick={run}
          disabled={busy || !doc.pages.length}
        >
          {busy ? 'Exporting…' : 'Export / Share'}
        </button>
      </div>
    </Modal>
  );
}
