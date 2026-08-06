import { useEffect, useRef, useState } from 'react';
import { FILTERS, applyFilter, makeThumbnail } from '../lib/imaging.js';
import './FilterScreen.css';

export default function FilterScreen({
  image,
  initialFilter = 'original',
  onConfirm,
  onCancel,
}) {
  const [selected, setSelected] = useState(initialFilter);
  const [intensity, setIntensity] = useState(1);
  const [previews, setPreviews] = useState({});
  const [bigPreview, setBigPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const smallRef = useRef(null);

  // Build the working thumbnail + per-filter chips once.
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

  // Big preview reflects the current filter + intensity.
  useEffect(() => {
    if (!smallRef.current) return;
    let alive = true;
    const t = setTimeout(async () => {
      const out = await applyFilter(smallRef.current, selected, intensity);
      if (alive) setBigPreview(out);
    }, 50);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [selected, intensity, previews]);

  const confirm = async () => {
    setBusy(true);
    try {
      const full = await applyFilter(image, selected, intensity);
      onConfirm(selected, full);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn ghost icon" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h2>Filter</h2>
        <button className="btn primary" onClick={confirm} disabled={busy}>
          {busy ? '…' : 'Done'}
        </button>
      </div>

      <div className="filter-preview">
        <img src={bigPreview || previews[selected] || image} alt="Preview" />
      </div>

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
