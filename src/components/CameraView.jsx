import { useCallback, useEffect, useRef, useState } from 'react';
import { detectDocument } from '../lib/detectDocument.js';
import { averageCorners, contentRect, normToDisplay } from '../lib/geometry.js';
import './CameraView.css';

// ~12 fps detection cadence — never per-frame, never full-res.
const DETECT_INTERVAL_MS = 1000 / 12;
// Downscaled detection frame width (px). Detection runs on this only.
const DETECT_WIDTH = 300;
// Moving-average window for corner smoothing (frames).
const SMOOTH_WINDOW = 5;
// Consecutive misses before the overlay is hidden.
const MISS_LIMIT = 4;

/** Draw the green quad overlay in DISPLAY space from normalised corners. */
function drawOverlay(video, overlay, corners) {
  const cssW = video.clientWidth;
  const cssH = video.clientHeight;
  if (!cssW || !cssH) return;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (overlay.width !== bw || overlay.height !== bh) {
    overlay.width = bw;
    overlay.height = bh;
  }
  overlay.style.width = `${cssW}px`;
  overlay.style.height = `${cssH}px`;

  const ctx = overlay.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!corners) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const r = contentRect(cssW, cssH, vw, vh);
  const pts = corners.map((c) => normToDisplay(c, r));

  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 230, 118, 0.15)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#00e676';
  ctx.stroke();

  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#00e676';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0b3d24';
    ctx.stroke();
  }
}

export default function CameraView({ cvStatus, cv, cvError, onCapture, onBack }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const detCanvasRef = useRef(null);
  const smoothedRef = useRef(null); // latest smoothed normalised corners

  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(null);
  const [detecting, setDetecting] = useState(false);

  // --- Camera lifecycle -----------------------------------------------------
  useEffect(() => {
    let stream = null;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCamReady(true);
        setCamError(null);
      } catch (err) {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          setCamError('denied');
        } else if (err?.name === 'NotFoundError') {
          setCamError('nocamera');
        } else {
          setCamError('unknown');
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- Detection loop -------------------------------------------------------
  useEffect(() => {
    if (cvStatus !== 'ready' || !cv || !camReady) return;

    let raf = 0;
    let lastDetect = 0;
    let misses = 0;
    const buffer = [];

    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const overlay = overlayRef.current;
      const det = detCanvasRef.current;
      if (!video || !overlay || !det || video.readyState < 2) return;

      if (t - lastDetect >= DETECT_INTERVAL_MS) {
        lastDetect = t;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh) {
          const dW = DETECT_WIDTH;
          const dH = Math.round((dW * vh) / vw);
          if (det.width !== dW || det.height !== dH) {
            det.width = dW;
            det.height = dH;
          }
          const dctx = det.getContext('2d', { willReadFrequently: true });
          dctx.drawImage(video, 0, 0, dW, dH);

          let corners = null;
          try {
            corners = detectDocument(cv, det);
          } catch {
            corners = null;
          }

          if (corners) {
            buffer.push(corners);
            if (buffer.length > SMOOTH_WINDOW) buffer.shift();
            misses = 0;
            smoothedRef.current = averageCorners(buffer);
            setDetecting(true);
          } else {
            misses++;
            if (misses > MISS_LIMIT) {
              buffer.length = 0;
              smoothedRef.current = null;
              setDetecting(false);
            }
          }
        }
      }

      drawOverlay(video, overlay, smoothedRef.current);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cvStatus, cv, camReady]);

  // --- Capture / upload -----------------------------------------------------
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const url = canvas.toDataURL('image/jpeg', 0.95);
    onCapture?.(url, smoothedRef.current);
  }, [onCapture]);

  const onUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => onCapture?.(String(reader.result), null);
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [onCapture]
  );

  return (
    <div className="camera-screen">
      <div className="camera-topbar">
        <button className="btn ghost icon" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <span>New scan</span>
      </div>

      <div className="camera-stage">
        <video
          ref={videoRef}
          className="camera-video"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={overlayRef} className="camera-overlay" />
        <canvas ref={detCanvasRef} className="det-canvas" />

        {cvStatus === 'loading' && (
          <div className="badge badge-top">Loading detector…</div>
        )}
        {cvStatus === 'ready' && camReady && (
          <div className={`badge badge-top ${detecting ? 'ok' : 'muted'}`}>
            {detecting ? 'Document detected' : 'Point at a document'}
          </div>
        )}

        {cvStatus === 'error' && (
          <div className="overlay-message">
            <p>Couldn’t load the document detector.</p>
            <p className="dim">{cvError}</p>
            <p className="dim">
              You can still capture or upload — detection just won’t draw.
            </p>
          </div>
        )}

        {camError && <CameraError kind={camError} />}
      </div>

      <div className="controls">
        <label className="btn btn-secondary">
          🖼 Upload
          <input type="file" accept="image/*" onChange={onUpload} hidden />
        </label>

        <button
          className="shutter"
          onClick={capture}
          disabled={!camReady}
          aria-label="Capture"
        >
          <span className="shutter-inner" />
        </button>

        <div className="btn-spacer" aria-hidden="true" />
      </div>
    </div>
  );
}

function CameraError({ kind }) {
  const messages = {
    denied: {
      title: 'Camera access blocked',
      body: 'Enable camera permission for this site in your browser settings, then reload. You can also upload a photo instead.',
    },
    nocamera: {
      title: 'No camera found',
      body: 'This device has no available camera. Upload a photo instead.',
    },
    unsupported: {
      title: 'Camera not supported',
      body: 'This browser doesn’t support camera capture. Upload a photo instead.',
    },
    unknown: {
      title: 'Camera unavailable',
      body: 'Something went wrong starting the camera. It may be in use by another app. Upload a photo instead.',
    },
  };
  const m = messages[kind] ?? messages.unknown;
  return (
    <div className="overlay-message">
      <p className="strong">{m.title}</p>
      <p className="dim">{m.body}</p>
      <p className="dim">
        Note: the camera requires <strong>HTTPS or localhost</strong>.
      </p>
    </div>
  );
}
