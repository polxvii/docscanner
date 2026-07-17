import { useEffect, useState } from 'react';
import { FILTERS, applyFilter, makeThumbnail } from '../lib/imaging.js';
import './FilterScreen.css';

export default function FilterScreen({
  cv,
  image,
  initialFilter = 'original',
  onConfirm,
  onCancel,
}) {
  const [selected, setSelected] = useState(initialFilter);
  const [previews, setPreviews] = useState({});
  const [busy, setBusy] = useState(false);

  // Build small previews for each filter once.
  useEffect(() => {
    if (!cv) return;
    let alive = true;
    (async () => {
      const small = await makeThumbnail(image, 700);
      const out = {};
      for (const f of FILTERS) {
        out[f.id] = await applyFilter(cv, small, f.id);
        if (!alive) return;
      }
      if (alive) setPreviews(out);
    })();
    return () => {
      alive = false;
    };
  }, [cv, image]);

  const confirm = async () => {
    setBusy(true);
    try {
      const full = await applyFilter(cv, image, selected);
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
        <button className="btn primary" onClick={confirm} disabled={busy || !cv}>
          {busy ? '…' : 'Done'}
        </button>
      </div>

      <div className="filter-preview">
        <img src={previews[selected] || image} alt="Preview" />
      </div>

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
