// Singleton loader for OpenCV.js.
//
// OpenCV.js is a large (~9MB) WASM bundle. We load it once via a <script> tag
// and only resolve when the runtime is actually initialised — `window.cv`
// exists before the WASM is ready, so we must wait for either
// `onRuntimeInitialized` or (in some builds) a Promise resolution.

const OPENCV_URL = 'https://docs.opencv.org/4.x/opencv.js';

let loaderPromise = null;

export function loadOpenCV() {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    // Already present (e.g. hot reload).
    if (window.cv && window.cv.Mat) {
      resolve(window.cv);
      return;
    }

    const finish = () => {
      const cv = window.cv;
      if (!cv) {
        reject(new Error('OpenCV.js loaded but window.cv is undefined.'));
        return;
      }
      // Some builds expose `cv` as a Promise.
      if (typeof cv.then === 'function') {
        cv.then((resolved) => {
          window.cv = resolved;
          resolve(resolved);
        }).catch(reject);
        return;
      }
      // Runtime already initialised.
      if (cv.Mat) {
        resolve(cv);
        return;
      }
      // Wait for the WASM runtime.
      cv.onRuntimeInitialized = () => resolve(cv);
    };

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = finish;
    script.onerror = () =>
      reject(new Error('Failed to load OpenCV.js from the CDN.'));
    document.body.appendChild(script);
  });

  return loaderPromise;
}
