// Loader for OpenCV.js (~11MB WASM bundle).
//
// Robustness matters here — a stuck loader means the whole scan pipeline is
// dead. So we:
//   1. Try the self-hosted copy first (same origin, fast + reliable), then the
//      official CDN as a fallback.
//   2. Detect readiness three ways (Promise resolve / `cv.Mat` present /
//      `onRuntimeInitialized`) AND poll as a race-proof backstop — assigning
//      `onRuntimeInitialized` after init already fired would otherwise hang
//      forever.
//   3. Time out instead of hanging, so the UI can show an error + retry.

const LOCAL_URL = `${import.meta.env.BASE_URL}opencv.js`;
const CDN_URL = 'https://docs.opencv.org/4.x/opencv.js';
const SOURCES = [LOCAL_URL, CDN_URL];
const LOAD_TIMEOUT_MS = 40000;

let loaderPromise = null;

export function loadOpenCV() {
  if (loaderPromise) return loaderPromise;
  loaderPromise = (async () => {
    let lastErr;
    for (const src of SOURCES) {
      try {
        return await loadFrom(src);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('OpenCV.js failed to load.');
  })();
  return loaderPromise;
}

/** Reset so a failed load can be retried. */
export function resetOpenCVLoader() {
  loaderPromise = null;
}

function loadFrom(src) {
  return new Promise((resolve, reject) => {
    // Already initialised (e.g. a previous source succeeded).
    if (window.cv && window.cv.Mat) {
      resolve(window.cv);
      return;
    }

    let done = false;
    let poll = 0;
    let timeout = 0;
    const cleanup = () => {
      if (poll) clearInterval(poll);
      if (timeout) clearTimeout(timeout);
    };
    const finish = (cv) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(cv);
    };
    const fail = (err) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };

    const onScriptReady = () => {
      const cv = window.cv;
      if (!cv) {
        fail(new Error('window.cv undefined after load: ' + src));
        return;
      }
      // Some builds expose `cv` as a Promise/factory result.
      if (typeof cv.then === 'function') {
        cv.then((m) => {
          window.cv = m;
          finish(m);
        }).catch(fail);
        return;
      }
      if (cv.Mat) {
        finish(cv);
        return;
      }
      // Emscripten hook — may or may not fire depending on timing…
      cv.onRuntimeInitialized = () => finish(window.cv);
      // …so poll as the definitive backstop.
      poll = setInterval(() => {
        if (window.cv && window.cv.Mat) finish(window.cv);
      }, 50);
    };

    timeout = setTimeout(
      () => fail(new Error('OpenCV.js load timed out: ' + src)),
      LOAD_TIMEOUT_MS
    );

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = onScriptReady;
    script.onerror = () => fail(new Error('Failed to fetch: ' + src));
    document.body.appendChild(script);
  });
}
