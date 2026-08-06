import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { removeBackground } from '../lib/signature.js';
import { loadImage, makeThumbnail } from '../lib/imaging.js';
import { clamp, contentRect } from '../lib/geometry.js';
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
  const [cropSrc, setCropSrc] = useState(null); // uploaded photo awaiting crop

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
    reader.onload = () => setCropSrc(String(reader.result)); // crop first
    reader.readAsDataURL(file);
    e.target.value = '';
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

      {mode === 'upload' && !cropSrc && !raw && (
        <label className="btn" style={{ width: '100%', marginBottom: 10 }}>
          Choose a photo of a signature
          <input type="file" accept="image/*" onChange={onUpload} hidden />
        </label>
      )}

      {cropSrc && (
        <SignatureCrop
          src={cropSrc}
          onDone={(cropped) => {
            setCropSrc(null);
            setRaw(cropped);
          }}
          onCancel={() => setCropSrc(null)}
        />
      )}

      {raw && !cropSrc && (
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

/** Simple axis-aligned crop for an uploaded signature photo. */
function SignatureCrop({ src, onDone, onCancel }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [natural, setNatural] = useState(null);
  const [wrap, setWrap] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ x: 0.1, y: 0.2, w: 0.8, h: 0.45 });
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrap({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const disp =
    natural && wrap.w
      ? contentRect(wrap.w, wrap.h, natural.w, natural.h)
      : null;

  const normFromEvent = (e) => {
    const b = wrapRef.current.getBoundingClientRect();
    return {
      x: clamp((e.clientX - b.left - disp.x) / disp.w, 0, 1),
      y: clamp((e.clientY - b.top - disp.y) / disp.h, 0, 1),
    };
  };

  useEffect(() => {
    if (!disp) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const n = normFromEvent(e);
      if (d.mode === 'move') {
        setBox({
          ...d.box0,
          x: clamp(d.box0.x + (n.x - d.start.x), 0, 1 - d.box0.w),
          y: clamp(d.box0.y + (n.y - d.start.y), 0, 1 - d.box0.h),
        });
      } else if (d.mode === 'tl') {
        const x1 = d.box0.x + d.box0.w;
        const y1 = d.box0.y + d.box0.h;
        const nx = clamp(n.x, 0, x1 - 0.05);
        const ny = clamp(n.y, 0, y1 - 0.05);
        setBox({ x: nx, y: ny, w: x1 - nx, h: y1 - ny });
      } else if (d.mode === 'br') {
        setBox({
          x: d.box0.x,
          y: d.box0.y,
          w: clamp(n.x, d.box0.x + 0.05, 1) - d.box0.x,
          h: clamp(n.y, d.box0.y + 0.05, 1) - d.box0.y,
        });
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disp]);

  const start = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, start: normFromEvent(e), box0: { ...box } };
  };

  const apply = async () => {
    setBusy(true);
    try {
      const img = await loadImage(src);
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const sw = Math.max(1, box.w * W);
      const sh = Math.max(1, box.h * H);
      const c = document.createElement('canvas');
      c.width = Math.round(sw);
      c.height = Math.round(sh);
      c.getContext('2d').drawImage(
        img,
        box.x * W,
        box.y * H,
        sw,
        sh,
        0,
        0,
        c.width,
        c.height
      );
      onDone(c.toDataURL('image/png'));
    } finally {
      setBusy(false);
    }
  };

  const px = disp && {
    x: disp.x + box.x * disp.w,
    y: disp.y + box.y * disp.h,
    w: box.w * disp.w,
    h: box.h * disp.h,
  };

  return (
    <div>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '0 0 8px' }}>
        Crop to the signature, then remove the background.
      </p>
      <div className="sig-crop-wrap" ref={wrapRef}>
        <img
          src={src}
          alt=""
          className="sig-crop-img"
          draggable={false}
          onLoad={(e) =>
            setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })
          }
        />
        {px && (
          <>
            <div
              className="sig-crop-box"
              style={{ left: px.x, top: px.y, width: px.w, height: px.h }}
              onPointerDown={start('move')}
            />
            <div
              className="sig-crop-handle"
              style={{ left: px.x, top: px.y }}
              onPointerDown={start('tl')}
            />
            <div
              className="sig-crop-handle"
              style={{ left: px.x + px.w, top: px.y + px.h }}
              onPointerDown={start('br')}
            />
          </>
        )}
      </div>
      <div className="actions">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={apply} disabled={busy}>
          {busy ? '…' : 'Crop'}
        </button>
      </div>
    </div>
  );
}
