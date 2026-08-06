export default function ImportingOverlay({ importing, onDismiss }) {
  if (!importing) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 320, textAlign: 'center' }}>
        {importing.error ? (
          <>
            <h3>Couldn’t import PDF</h3>
            <p style={{ color: 'var(--text-dim)' }}>{importing.error}</p>
            <div className="actions">
              <button className="btn" onClick={onDismiss}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>Importing PDF…</h3>
            <div className="progress" style={{ margin: '12px 0' }}>
              <span style={{ width: `${Math.round(importing.progress * 100)}%` }} />
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              Rendering pages… {Math.round(importing.progress * 100)}%
            </p>
          </>
        )}
      </div>
    </div>
  );
}
