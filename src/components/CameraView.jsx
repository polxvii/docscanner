import { useCallback, useEffect, useRef, useState } from 'react';
import './CameraView.css';

export default function CameraView({ onCapture, onBack }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const trackRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(null);
  const [canFocus, setCanFocus] = useState(false);
  const [focusRing, setFocusRing] = useState(null); // { x, y, id }

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
        const track = stream.getVideoTracks()[0] || null;
        trackRef.current = track;
        const caps = track?.getCapabilities?.() || {};
        setCanFocus(
          'pointsOfInterest' in caps ||
            (Array.isArray(caps.focusMode) && caps.focusMode.length > 0)
        );
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
      trackRef.current = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Clear the focus ring shortly after it appears (animation is ~0.7s).
  useEffect(() => {
    if (!focusRing) return;
    const t = setTimeout(() => setFocusRing(null), 750);
    return () => clearTimeout(t);
  }, [focusRing]);

  // Ask the camera to focus on the tapped point. Coordinates are normalised to
  // the image frame (object-fit: contain, so the whole frame is visible).
  const focusAt = useCallback(async (nx, ny) => {
    const track = trackRef.current;
    if (!track?.getCapabilities || !track.applyConstraints) return;
    const caps = track.getCapabilities() || {};
    const adv = {};
    if ('pointsOfInterest' in caps) adv.pointsOfInterest = [{ x: nx, y: ny }];
    if (Array.isArray(caps.focusMode)) {
      if (caps.focusMode.includes('single-shot')) adv.focusMode = 'single-shot';
      else if (caps.focusMode.includes('continuous'))
        adv.focusMode = 'continuous';
      else if (caps.focusMode.includes('manual')) adv.focusMode = 'manual';
    }
    if (!Object.keys(adv).length) return;
    try {
      await track.applyConstraints({ advanced: [adv] });
    } catch {
      /* device rejected the focus request; the ring cue still fired */
    }
  }, []);

  const onStageTap = useCallback(
    (e) => {
      const video = videoRef.current;
      const stage = stageRef.current;
      if (!video || !video.videoWidth || !stage || camError) return;
      const vr = video.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      // Ring position, relative to the stage.
      setFocusRing({ x: e.clientX - sr.left, y: e.clientY - sr.top, id: Date.now() });
      // Map the tap to normalised image coordinates (letterboxed "contain").
      const scale = Math.min(vr.width / video.videoWidth, vr.height / video.videoHeight);
      const dispW = video.videoWidth * scale;
      const dispH = video.videoHeight * scale;
      const offX = (vr.width - dispW) / 2;
      const offY = (vr.height - dispH) / 2;
      const nx = Math.min(1, Math.max(0, (e.clientX - vr.left - offX) / dispW));
      const ny = Math.min(1, Math.max(0, (e.clientY - vr.top - offY) / dispH));
      focusAt(nx, ny);
    },
    [camError, focusAt]
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    onCapture?.(canvas.toDataURL('image/jpeg', 0.95));
  }, [onCapture]);

  const onUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => onCapture?.(String(reader.result));
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

      <div className="camera-stage" ref={stageRef} onClick={onStageTap}>
        <video
          ref={videoRef}
          className="camera-video"
          playsInline
          muted
          autoPlay
        />

        {camReady && !camError && (
          <>
            <div className="frame-guide" aria-hidden="true">
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner br" />
              <span className="corner bl" />
            </div>
            <div className="badge badge-top muted">
              {canFocus
                ? 'Tap to focus, then capture'
                : 'Fit the document in view, then capture'}
            </div>
          </>
        )}

        {focusRing && (
          <span
            key={focusRing.id}
            className="focus-ring"
            style={{ left: focusRing.x, top: focusRing.y }}
            aria-hidden="true"
          />
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
