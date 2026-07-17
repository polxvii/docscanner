export default function Modal({ title, children, onClose }) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
