import type { ReactNode } from 'react'

interface ConfirmModalProps {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">{children}</div>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : ''}`} type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}