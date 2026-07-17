import { useEffect, useRef } from 'react';
import { clamp } from '../lib/geometry.js';
import './AnnotationLayer.css';

/**
 * Renders annotations over the page image content `rect` (px, relative to the
 * layer). All positions/sizes are ratios (0..1) of that rect, so they stay
 * aligned across page sizes and at export resolution.
 */
export default function AnnotationLayer({
  annotations,
  rect,
  selectedId,
  onSelect,
  onChange,
  editable = true,
}) {
  const layerRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!editable || !rect) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const dx = (e.clientX - d.px) / rect.w;
      const dy = (e.clientY - d.py) / rect.h;

      if (d.mode === 'move') {
        onChange(d.id, {
          x: clamp(d.x0 + dx, 0, 1 - d.w0),
          y: clamp(d.y0 + dy, 0, 1 - d.h0),
        });
      } else if (d.mode === 'resize') {
        let w = Math.max(0.03, d.w0 + dx);
        let h = d.aspect ? w * d.aspect : Math.max(0.015, d.h0 + dy);
        w = Math.min(w, 1 - d.x0);
        h = Math.min(h, 1 - d.y0);
        const patch = { width: w, height: h };
        if (!d.aspect) patch.content = { ...d.content, fontSize: h };
        onChange(d.id, patch);
      } else if (d.mode === 'rotate') {
        const ang =
          (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI;
        onChange(d.id, { rotation: Math.round(d.rot0 + (ang - d.ang0)) });
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
  }, [rect, editable, onChange]);

  if (!rect) return null;

  const startMove = (ann) => (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(ann.id);
    dragRef.current = {
      mode: 'move',
      id: ann.id,
      px: e.clientX,
      py: e.clientY,
      x0: ann.x,
      y0: ann.y,
      w0: ann.width,
      h0: ann.height,
    };
  };

  const startResize = (ann) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      mode: 'resize',
      id: ann.id,
      px: e.clientX,
      py: e.clientY,
      x0: ann.x,
      y0: ann.y,
      w0: ann.width,
      h0: ann.height,
      aspect: ann.type === 'signature' ? ann.height / ann.width : 0,
      content: ann.content,
    };
  };

  const startRotate = (ann) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const box = layerRef.current.getBoundingClientRect();
    const cx = box.left + rect.x + (ann.x + ann.width / 2) * rect.w;
    const cy = box.top + rect.y + (ann.y + ann.height / 2) * rect.h;
    dragRef.current = {
      mode: 'rotate',
      id: ann.id,
      cx,
      cy,
      ang0: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI,
      rot0: ann.rotation || 0,
    };
  };

  return (
    <div className="annotation-layer" ref={layerRef}>
      {annotations.map((ann) => {
        const style = {
          left: rect.x + ann.x * rect.w,
          top: rect.y + ann.y * rect.h,
          width: ann.width * rect.w,
          height: ann.height * rect.h,
          transform: `rotate(${ann.rotation || 0}deg)`,
        };
        const selected = editable && ann.id === selectedId;
        return (
          <div
            key={ann.id}
            className={`annotation ${selected ? 'selected' : ''}`}
            style={style}
            onPointerDown={startMove(ann)}
          >
            {ann.type === 'signature' ? (
              <img
                src={ann.content.dataUrl}
                alt="Signature"
                draggable={false}
              />
            ) : (
              <span
                className="ann-text"
                style={{
                  fontSize: ann.height * rect.h,
                  color: ann.content.color || '#111111',
                }}
              >
                {ann.content.text || ' '}
              </span>
            )}

            {selected && (
              <>
                <div
                  className="ann-handle rotate"
                  onPointerDown={startRotate(ann)}
                />
                <div
                  className="ann-handle resize"
                  onPointerDown={startResize(ann)}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
