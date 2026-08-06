import { useEffect, useRef, useState } from 'react';

/**
 * Pinch-to-zoom + pan for a container. Attach `onPointerDown` to the container
 * and give it `ref`; apply `transform` to an inner wrapper (transform-origin
 * 0 0). Zoom buttons: `zoomIn` / `zoomOut` / `reset`.
 */
export function usePinchZoom(maxScale = 6) {
  const ref = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });

  const zoomBy = (factor, focal) =>
    setView((v) => {
      const s = Math.min(maxScale, Math.max(1, v.scale * factor));
      if (s <= 1) return { scale: 1, tx: 0, ty: 0 };
      const cx = (focal.x - v.tx) / v.scale;
      const cy = (focal.y - v.ty) / v.scale;
      return { scale: s, tx: focal.x - cx * s, ty: focal.y - cy * s };
    });

  const center = () => {
    const el = ref.current;
    return { x: (el?.clientWidth || 0) / 2, y: (el?.clientHeight || 0) / 2 };
  };
  const zoomIn = () => zoomBy(1.5, center());
  const zoomOut = () => zoomBy(1 / 1.5, center());
  const reset = () => setView({ scale: 1, tx: 0, ty: 0 });

  const onPointerDown = (e) => {
    if (e.target.closest?.('.zoom-controls')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const box = ref.current.getBoundingClientRect();
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = {
        x: (pts[0].x + pts[1].x) / 2 - box.left,
        y: (pts[0].y + pts[1].y) / 2 - box.top,
      };
      gesture.current = {
        mode: 'pinch',
        startDist: dist,
        startScale: view.scale,
        contentMid: {
          x: (mid.x - view.tx) / view.scale,
          y: (mid.y - view.ty) / view.scale,
        },
      };
    } else if (pts.length === 1 && view.scale > 1) {
      gesture.current = {
        mode: 'pan',
        start: { x: e.clientX, y: e.clientY },
        startView: { ...view },
      };
    }
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g || !ref.current) return;
      const box = ref.current.getBoundingClientRect();
      const pts = [...pointers.current.values()];
      if (g.mode === 'pinch' && pts.length >= 2) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = {
          x: (pts[0].x + pts[1].x) / 2 - box.left,
          y: (pts[0].y + pts[1].y) / 2 - box.top,
        };
        const s = Math.min(
          maxScale,
          Math.max(1, (g.startScale * dist) / g.startDist)
        );
        if (s <= 1) setView({ scale: 1, tx: 0, ty: 0 });
        else
          setView({
            scale: s,
            tx: mid.x - g.contentMid.x * s,
            ty: mid.y - g.contentMid.y * s,
          });
      } else if (g.mode === 'pan') {
        setView({
          scale: g.startView.scale,
          tx: g.startView.tx + (e.clientX - g.start.x),
          ty: g.startView.ty + (e.clientY - g.start.y),
        });
      }
    };
    const onUp = (e) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) gesture.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [maxScale]);

  return {
    ref,
    view,
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
    onPointerDown,
    zoomIn,
    zoomOut,
    reset,
  };
}
