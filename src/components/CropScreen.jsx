import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { detectDocument } from '../lib/detectDocument.js';
import {
  loadImage,
  rotateImage,
  rotateCornersNorm,
  warpPerspective,
} from '../lib/imaging.js';
import { FULL_CORNERS, clamp, contentRect, orderCorners } from '../lib/geometry.js';
import './CropScreen.css';

// Edges connect corner pairs (indices into [TL,TR,BR,BL]).
const EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

export default function CropScreen({ cv, image, initialCorners, onConfirm, onCancel }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const [base, setBase] = useState(image);
  const [corners, setCorners] = useState(
    initialCorners && initialCorners.length === 4 ? initialCorners : FULL_CORNERS
  );
  const [natural, setNatural] = useState(null); // {w,h}
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);

  // Natural size whenever the base image changes.
  useEffect(() => {
    let alive = true;
    loadImage(base).then((img) => {
      if (alive) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    });
    return () => {
      alive = false;
    };
  }, [base]);

  // Track stage size.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () =>
      setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rect =
    natural && stage.w
      ? contentRect(stage.w, stage.h, natural.w, natural.h)
      : null;

  const normFromEvent = useCallback(
    (e) => {
      const box = stageRef.current.getBoundingClientRect();
      const px = e.clientX - box.left - rect.x;
      const py = e.clientY - box.top - rect.y;
      return { x: clamp(px / rect.w, 0, 1), y: clamp(py / rect.h, 0, 1) };
    },
    [rect]
  );

  useEffect(() => {
    if (!rect) return;
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const n = normFromEvent(e);
      if (drag.type === 'corner') {
        setCorners((prev) =>
          prev.map((c, i) => (i === drag.index ? n : c))
        );
      } else {
        const dx = n.x - drag.start.x;
        const dy = n.y - drag.start.y;
        const [a, b] = EDGES[drag.index];
        setCorners((prev) =>
          prev.map((c, i) => {
            if (i !== a && i !== b) return c;
            const s = drag.snapshot[i];
            return {
              x: clamp(s.x + dx, 0, 1),
              y: clamp(s.y + dy, 0, 1),
            };
          })
        );
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
  }, [rect, normFromEvent]);

  const startCornerDrag = (index) => (e) => {
    e.preventDefault();
    dragRef.current = { type: 'corner', index };
  };
  const startEdgeDrag = (index) => (e) => {
    e.preventDefault();
    dragRef.current = {
      type: 'edge',
      index,
      start: normFromEvent(e),
      snapshot: corners.map((c) => ({ ...c })),
    };
  };

  const autoCrop = useCallback(async () => {
    setBusy(true);
    try {
      const img = await loadImage(base);
      const dW = Math.min(500, img.naturalWidth);
      const dH = Math.round((dW * img.naturalHeight) / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = dW;
      c.height = dH;
      c.getContext('2d').drawImage(img, 0, 0, dW, dH);
      const det = detectDocument(cv, c);
      setCorners(det || FULL_CORNERS);
    } finally {
      setBusy(false);
    }
  }, [base, cv]);

  const rotate = useCallback(
    async (deg) => {
      setBusy(true);
      try {
        const rotated = await rotateImage(base, deg);
        setCorners((prev) => orderCorners(rotateCornersNorm(prev, deg)));
        setBase(rotated);
      } finally {
        setBusy(false);
      }
    },
    [base]
  );

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      const out = await warpPerspective(cv, base, corners);
      onConfirm(out, corners, base);
    } finally {
      setBusy(false);
    }
  }, [cv, base, corners, onConfirm]);

  // Handle positions in stage px.
  const toPx = (c) => ({ x: rect.x + c.x * rect.w, y: rect.y + c.y * rect.h });

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn ghost icon" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h2>Crop &amp; adjust</h2>
        <button className="btn primary" onClick={confirm} disabled={busy || !cv}>
          Confirm
        </button>
      </div>

      <div className="crop-stage" ref={stageRef}>
        {rect && (
          <>
            <img
              className="crop-image"
              src={base}
              alt="To crop"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
              }}
            />
            <svg
              className="crop-svg"
              width={stage.w}
              height={stage.h}
              style={{ pointerEvents: 'none' }}
            >
              <polygon
                points={corners.map((c) => {
                  const p = toPx(c);
                  return `${p.x},${p.y}`;
                }).join(' ')}
                fill="rgba(0,230,118,0.12)"
                stroke="#00e676"
                strokeWidth="2"
              />
            </svg>

            {EDGES.map(([a, b], i) => {
              const pa = toPx(corners[a]);
              const pb = toPx(corners[b]);
              const mx = (pa.x + pb.x) / 2;
              const my = (pa.y + pb.y) / 2;
              return (
                <div
                  key={'e' + i}
                  className="handle edge"
                  style={{ left: mx, top: my }}
                  onPointerDown={startEdgeDrag(i)}
                />
              );
            })}

            {corners.map((c, i) => {
              const p = toPx(c);
              return (
                <div
                  key={'c' + i}
                  className="handle corner"
                  style={{ left: p.x, top: p.y }}
                  onPointerDown={startCornerDrag(i)}
                />
              );
            })}
          </>
        )}
        {busy && (
          <div className="crop-busy">
            <div className="spinner" />
          </div>
        )}
      </div>

      <div className="toolbar">
        <button className="btn small" onClick={autoCrop} disabled={busy || !cv}>
          Auto Crop
        </button>
        <button
          className="btn small"
          onClick={() => setCorners(FULL_CORNERS)}
          disabled={busy}
        >
          All
        </button>
        <div className="grow" />
        <button
          className="btn icon"
          onClick={() => rotate(270)}
          disabled={busy}
          aria-label="Rotate left"
        >
          ⟲
        </button>
        <button
          className="btn icon"
          onClick={() => rotate(90)}
          disabled={busy}
          aria-label="Rotate right"
        >
          ⟳
        </button>
      </div>
    </div>
  );
}
