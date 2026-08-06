import { useEffect, useRef, useState } from 'react';
import {
  ADJUST_DEFAULTS,
  FILTERS,
  applyAdjustments,
  applyFilter,
  makeThumbnail,
} from '../lib/imaging.js';
import { usePinchZoom } from '../hooks/usePinchZoom.js';
import './FilterScreen.css';

const ADJUSTS = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'warmth', label: 'White balance', min: -100, max: 100 },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'clarity', label: 'Clarity', min: 0, max: 100 },
];

export default function FilterScreen({
  image,
  initialFilter = 'original',
  onConfirm,
  onCancel,
}) {
  const [selected, setSelected] = useState(initialFilter);
  const [intensity, setIntensity] = useState(1);
  const [adj, setAdj] = useState(ADJUST_DEFAULTS);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [previews, setPreviews] = useState({});
  const [bigPreview, setBigPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const smallRef = useRef(null);
  const zoom = usePinchZoom(6);

  useEffect(() => {
    let alive = true;
    (async () => {
      const small = await makeThumbnail(image, 700);
      smallRef.current = small;
      const out = {};
      for (const f of FILTERS) {
        out[f.id] = await applyFilter(small, f.id);
        if (!alive) return;
      }
      if (alive) setPreviews(out);
    })();
    return () => {
      alive = false;
    };
  }, [image]);

  // Big preview reflects filter + intensity + adjustments.
  useEffect(() => {
    if (!smallRef.current) return;
    let alive = true;
    const t = setTimeout(async () => {
      const filtered = await applyFilter(smallRef.current, selected, intensity);
      const out = await applyAdjustments(filtered, adj);
      if (alive) setBigPreview(out);
    }, 110);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [selected, intensity, adj, previews]);

  const confirm = async () => {
    setBusy(true);
    try {
      const filtered = await applyFilter(image, selected, intensity);
      const full = await applyAdjustments(filtered, adj);
      onConfirm(selected, full);
    } finally {
      setBusy(false);
    }
  };

  const setAdjVal = (key, v) => setAdj((a) => ({ ...a, [key]: v }));
  const resetAdj = () => setAdj(ADJUST_DEFAULTS);
  const adjActive = ADJUSTS.some((a) => adj[a.key] !== 0);

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn ghost icon" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h2>Filter &amp; adjust</h2>
        <button className="btn primary" onClick={confirm} disabled={busy}>
          {busy ? '…' : 'Done'}
        </button>
      </div>

      <div
        className="filter-preview"
        ref={zoom.ref}
        onPointerDown={zoom.onPointerDown}
      >
        <div className="filter-preview-zoom" style={{ transform: zoom.transform }}>
          <img src={bigPreview || previews[selected] || image} alt="Preview" />
        </div>
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={zoom.zoomOut} aria-label="Zoom out">
            −
          </button>
          <button className="zoom-btn" onClick={zoom.reset}>
            {Math.round(zoom.view.scale * 100)}%
          </button>
          <button className="zoom-btn" onClick={zoom.zoomIn} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>

      <div className="adjust-bar">
        <button
          className={`btn small ${adjustOpen ? 'primary' : ''}`}
          onClick={() => setAdjustOpen((o) => !o)}
        >
          Adjust{adjActive ? ' •' : ''} {adjustOpen ? '▲' : '▾'}
        </button>
        {selected !== 'original' && (
          <div className="filter-intensity">
            <span>Intensity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              aria-label="Filter intensity"
            />
            <span className="filter-intensity-val">
              {Math.round(intensity * 100)}%
            </span>
          </div>
        )}
      </div>

      {adjustOpen && (
        <div className="adjust-panel">
          {ADJUSTS.map((a) => (
            <div className="adjust-row" key={a.key}>
              <span className="adjust-label">{a.label}</span>
              <input
                type="range"
                min={a.min}
                max={a.max}
                step="1"
                value={adj[a.key]}
                onChange={(e) => setAdjVal(a.key, Number(e.target.value))}
                aria-label={a.label}
              />
              <span className="adjust-val">{adj[a.key]}</span>
            </div>
          ))}
          <button className="btn small" onClick={resetAdj} disabled={!adjActive}>
            Reset
          </button>
        </div>
      )}

      <div className="filter-strip">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`filter-thumb ${selected === f.id ? 'active' : ''}`}
            onClick={() => setSelected(f.id)}
          >
            <img src={previews[f.id] || image} alt={f.label} />
            <span>{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
