import { useCallback, useEffect, useState } from 'react';
import { loadOpenCV, resetOpenCVLoader } from '../lib/loadOpenCV.js';

/**
 * Loads OpenCV.js (once) and reports its status. Loading is deferred until
 * `enabled` is true so the heavy ~11MB WASM isn't fetched on screens that don't
 * need it (e.g. the library).
 * @param {boolean} [enabled=true]
 * @returns {{ status:'idle'|'loading'|'ready'|'error', cv:object|null, error:string|null, retry:()=>void }}
 */
export function useOpenCV(enabled = true) {
  const [state, setState] = useState({
    status: 'idle',
    cv: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setState((s) => (s.status === 'ready' ? s : { ...s, status: 'loading' }));
    loadOpenCV()
      .then((cv) => {
        if (mounted) setState({ status: 'ready', cv, error: null });
      })
      .catch((err) => {
        if (mounted)
          setState({ status: 'error', cv: null, error: err.message });
      });
    return () => {
      mounted = false;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    resetOpenCVLoader();
    setState({ status: 'loading', cv: null, error: null });
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
