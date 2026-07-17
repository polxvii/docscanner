import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { removeBackground } from '../lib/signature.js';
import { makeThumbnail } from '../lib/imaging.js';
import Modal from './Modal.jsx';
import './SignatureManager.css';

export default function SignatureManager({ onPick, onClose }) {
  const { signatures, saveSignature, deleteSignature } = useStore();
  const [tab, setTab] = useState(signatures.length ? 'saved' : 'create');

  return (
    <Modal title="Signatures" onClose={onClose}>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button
          className={`chip ${tab === 'saved' ? 'active' : ''}`}
          onClick={() => setTab('saved')}
        >
          Saved ({signatures.length})
        </button>
        <button
          className={`chip ${tab === 'create' ? 'active' : ''}`}
          onClick={() => setTab('create')}
        >
          + New
        </button>
      </div>

      {tab === 'saved' ? (
        <SavedTray
          signatures={signatures}
          onPick={onPick}
          onDelete={deleteSignature}
          onEmptyCreate={() => setTab('create')}
        />
      ) : (
        <CreateSignature
          onSaved={async (sig) => {
            await saveSignature(sig);
            setTab('saved');
          }}
          onUse={onPick}
        />
      )}
    </Modal>
  );
}

function SavedTray({ signatures, onPick, onDelete, onEmptyCreate }) {
  if (!signatures.length) {
    return (
      <div className="empty" style={{ padding: '24px 8px' }}>
        <p>No saved signatures yet.</p>
        <button className="btn primary" onClick={onEmptyCreate}>
          Create one
        </button>
      </div>
    );
  }
  return (
    <div className="sig-tray">
      {signatures.map((s) => (
        <div key={s.id} className="sig-item">
          <button className="sig-pick" onClick={() => onPick?.(s.dataUrl)}>
            <img src={s.dataUrl} alt={s.name} />
          </button>
          <div className="sig-row">
            <span title={s.name}>{s.name}</span>
            <button
              className="btn danger small"
              onClick={() => onDelete(s.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateSignature({ onSaved, onUse }) {
  const [mode, setMode] = useState('draw'); // 'draw' | 'upload'
  const [raw, setRaw] = useState(null); // source data URL
  const [threshold, setThreshold] = useState(200);
  const [ramp, setRamp] = useState(30);
  const [processed, setProcessed] = useState(null);
  const [name, setName] = useState('Signature');

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  // Recompute the transparent PNG whenever source or sliders change.
  useEffect(() => {
    if (!raw) {
      setProcessed(null);
      return;
    }
    let alive = true;
    (async () => {
      const small = await makeThumbnail(raw, 1000);
      const out = await removeBackground(small, threshold, ramp);
      if (alive) setProcessed(out);
    })();
    return () => {
      alive = false;
    };
  }, [raw, threshold, ramp]);

  // --- Drawing pad ---
  const initPad = (canvas) => {
    if (!canvas) return;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  const padPoint = (e) => {
    const c = canvasRef.current;
    const b = c.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * c.width,
      y: ((e.clientY - b.top) / b.height) * c.height,
    };
  };
  const padDown = (e) => {
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = padPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111111';
  };
  const padMove = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const p = padPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const padUp = () => {
    drawingRef.current = false;
  };
  const clearPad = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    setRaw(null);
  };
  const useDrawing = () => setRaw(canvasRef.current.toDataURL('image/png'));

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button
          className={`chip ${mode === 'draw' ? 'active' : ''}`}
          onClick={() => setMode('draw')}
        >
          Draw
        </button>
        <button
          className={`chip ${mode === 'upload' ? 'active' : ''}`}
          onClick={() => setMode('upload')}
        >
          Upload photo
        </button>
      </div>

      {mode === 'draw' && (
        <div className="sig-pad-wrap">
          <canvas
            ref={initPad}
            width={500}
            height={200}
            className="sig-pad"
            onPointerDown={padDown}
            onPointerMove={padMove}
            onPointerUp={padUp}
            onPointerLeave={padUp}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn small" onClick={clearPad}>
              Clear
            </button>
            <button className="btn small primary" onClick={useDrawing}>
              Remove background
            </button>
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <label className="btn" style={{ width: '100%', marginBottom: 10 }}>
          Choose a photo of a signature
          <input type="file" accept="image/*" onChange={onUpload} hidden />
        </label>
      )}

      {raw && (
        <>
          <div className="sig-preview">
            {processed ? (
              <img src={processed} alt="Processed signature" />
            ) : (
              <div className="spinner" />
            )}
          </div>
          <div className="row">
            <label>Threshold</label>
            <input
              type="range"
              min="100"
              max="255"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </div>
          <div className="row">
            <label>Softness</label>
            <input
              type="range"
              min="0"
              max="80"
              value={ramp}
              onChange={(e) => setRamp(Number(e.target.value))}
            />
          </div>
          <div className="row">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <div className="actions">
            <button
              className="btn"
              disabled={!processed}
              onClick={() => onSaved({ name, dataUrl: processed })}
            >
              Save to tray
            </button>
            <button
              className="btn primary"
              disabled={!processed}
              onClick={async () => {
                await onSaved({ name, dataUrl: processed });
                onUse?.(processed);
              }}
            >
              Save &amp; use
            </button>
          </div>
        </>
      )}
    </div>
  );
}
