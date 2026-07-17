export default function Spinner({ label }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        color: 'var(--text-dim)',
      }}
    >
      <div className="spinner" />
      {label && <div>{label}</div>}
    </div>
  );
}
