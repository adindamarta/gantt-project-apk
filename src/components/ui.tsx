import type { ReactNode } from 'react';
import { PRIORITY_LABEL_ID, priorityColor } from '../lib/color';
import type { Priority } from '../types';

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="badge badge-priority" style={{ background: priorityColor(priority) }}>
      {PRIORITY_LABEL_ID[priority]}
    </span>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="avatar" style={{ background: color }} title={name}>
      {initials || '?'}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="progress" title={`${Math.round(pct)}%`}>
      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
