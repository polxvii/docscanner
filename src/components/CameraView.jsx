import { useCallback, useEffect, useRef, useState } from 'react';
import './CameraView.css';

export default function CameraView({ onCapture, onBack }) {
  const videoRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(null);

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

      <div className="camera-stage">
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
              Fit the document in view, then capture
            </div>
          </>
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
