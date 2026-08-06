import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  autoDetectCorners,
  loadImage,
  rotateImageAny,
  warpPerspective,
} from '../lib/imaging.js';
import { FULL_CORNERS, clamp, contentRect } from '../lib/geometry.js';
import './CropScreen.css';

// Edges connect corner pairs (indices into [TL,TR,BR,BL]).
const EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

const INSET_CORNERS = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

const LOUPE_SIZE = 140; // px
const LOUPE_ZOOM = 2.6;

export default function CropScreen({ image, initialCorners, onConfirm, onCancel }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const [base, setBase] = useState(image);
  const [corners, setCorners] = useState(
    initialCorners && initialCorners.length === 4 ? initialCorners : INSET_CORNERS
  );
  const [natural, setNatural] = useState(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [loupe, setLoupe] = useState(null); // {x,y} normalised, while dragging
  const [angle, setAngle] = useState(0); // rotation applied to the source image
  const appliedAngleRef = useRef(0);

  // On first open (fresh capture), try to auto-detect the document.
  useEffect(() => {
    if (initialCorners && initialCorners.length === 4) return;
    let alive = true;
    (async () => {
      try {
        const det = await autoDetectCorners(image);
        if (alive && det) setCorners(det);
      } catch {
        /* keep inset default */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    loadImage(base).then((img) => {
      if (alive) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    });
    return () => {
      alive = false;
    };
  }, [base]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
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
      setLoupe(n);
      if (drag.type === 'corner') {
        setCorners((prev) => prev.map((c, i) => (i === drag.index ? n : c)));
      } else {
        const dx = n.x - drag.start.x;
        const dy = n.y - drag.start.y;
        const [a, b] = EDGES[drag.index];
        setCorners((prev) =>
          prev.map((c, i) => {
            if (i !== a && i !== b) return c;
            const s = drag.snapshot[i];
            return { x: clamp(s.x + dx, 0, 1), y: clamp(s.y + dy, 0, 1) };
          })
        );
      }
    };
    const onUp = () => {
      dragRef.current = null;
      setLoupe(null);
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
      const det = await autoDetectCorners(base);
      setCorners(det || FULL_CORNERS);
    } finally {
      setBusy(false);
    }
  }, [base]);

  // Bake the chosen rotation into the working image (debounced for the slider).
  // Rotating always starts from the original `image`, so the slider is smooth
  // and reversible. Corners reset since orientation changed.
  useEffect(() => {
    if (angle === appliedAngleRef.current) return;
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const rotated = await rotateImageAny(image, angle);
        if (!alive) return;
        appliedAngleRef.current = angle;
        setBase(rotated);
        setCorners(INSET_CORNERS);
      } finally {
        if (alive) setBusy(false);
      }
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [angle, image]);

  const wrapAngle = (a) => {
    let v = ((a % 360) + 360) % 360;
    if (v > 180) v -= 360;
    return v;
  };
  const bumpAngle = (delta) => setAngle((a) => wrapAngle(a + delta));
  const normAngle = (((angle % 360) + 360) % 360);

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      const out = await warpPerspective(base, corners);
      onConfirm(out, corners, base);
    } finally {
      setBusy(false);
    }
  }, [base, corners, onConfirm]);

  const toPx = (c) => ({ x: rect.x + c.x * rect.w, y: rect.y + c.y * rect.h });

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn ghost icon" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h2>Crop &amp; adjust</h2>
        <button className="btn primary" onClick={confirm} disabled={busy}>
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
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            />
            <svg
              className="crop-svg"
              width={stage.w}
              height={stage.h}
              style={{ pointerEvents: 'none' }}
            >
              <polygon
                points={corners
                  .map((c) => {
                    const p = toPx(c);
                    return `${p.x},${p.y}`;
                  })
                  .join(' ')}
                fill="rgba(0,230,118,0.12)"
                stroke="#00e676"
                strokeWidth="2"
              />
            </svg>

            {EDGES.map(([a, b], i) => {
              const pa = toPx(corners[a]);
              const pb = toPx(corners[b]);
              return (
                <div
                  key={'e' + i}
                  className="handle edge"
                  style={{ left: (pa.x + pb.x) / 2, top: (pa.y + pb.y) / 2 }}
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

        {loupe && rect && (
          <div
            className="crop-loupe"
            style={{
              width: LOUPE_SIZE,
              height: LOUPE_SIZE,
              backgroundImage: `url(${base})`,
              backgroundSize: `${rect.w * LOUPE_ZOOM}px ${rect.h * LOUPE_ZOOM}px`,
              backgroundPosition: `${LOUPE_SIZE / 2 - loupe.x * rect.w * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - loupe.y * rect.h * LOUPE_ZOOM}px`,
            }}
          >
            <div className="crop-loupe-cross-h" />
            <div className="crop-loupe-cross-v" />
          </div>
        )}

        {busy && (
          <div className="crop-busy">
            <div className="spinner" />
          </div>
        )}
      </div>

      <div className="crop-rotate">
        <button
          className="btn icon"
          onClick={() => bumpAngle(-90)}
          disabled={busy}
          aria-label="Rotate left"
        >
          ⟲
        </button>
        <input
          type="range"
          min="-180"
          max="180"
          step="1"
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value))}
          aria-label="Rotate"
          className="crop-rotate-range"
        />
        <button
          className="btn icon"
          onClick={() => bumpAngle(90)}
          disabled={busy}
          aria-label="Rotate right"
        >
          ⟳
        </button>
        <span className="crop-angle">{normAngle}°</span>
      </div>
      <div className="chip-row crop-presets">
        {[0, 90, 180, 270].map((a) => (
          <button
            key={a}
            className={`chip ${normAngle === a ? 'active' : ''}`}
            onClick={() => setAngle(a > 180 ? a - 360 : a)}
            disabled={busy}
          >
            {a}°
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button className="btn small" onClick={autoCrop} disabled={busy}>
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
      </div>
    </div>
  );
}
