import { useState } from 'react';
import Modal from './Modal.jsx';

export default function PromptModal({
  title,
  label = 'Name',
  initial = '',
  confirmText = 'Save',
  onConfirm,
  onClose,
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="row">
        <label>{label}</label>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConfirm(value.trim());
            }
          }}
          style={{ flex: 1 }}
        />
      </div>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => onConfirm(value.trim())}
          disabled={!value.trim()}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
