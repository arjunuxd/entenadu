import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { authorityApi, ApiError } from '../../services/api'
import StatusBadge from '../../components/StatusBadge'
import ConfirmModal from '../../components/ConfirmModal'
import { formatDate } from '../../utils/format'
import type { ComplaintDetail, ComplaintStatus } from '../../types/complaint'

const NEXT_ACTION: Partial<Record<ComplaintStatus, { to: ComplaintStatus; label: string }>> = {
  assigned: { to: 'under_review', label: 'Mark under review' },
  under_review: { to: 'in_progress', label: 'Mark in progress' },
  in_progress: { to: 'completed', label: 'Mark completed' },
}

export default function AuthorityComplaintDetail() {
  const { complaintId } = useParams<{ complaintId: string }>()
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [note, setNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function handleAuthFailure(err: unknown): boolean {
    if (err instanceof ApiError && err.status === 401) {
      logout()
      navigate('/login', { replace: true })
      return true
    }
    return false
  }

  useEffect(() => {
    if (!token || !complaintId) return
    let cancelled = false

    authorityApi
      .getComplaint(token, complaintId)
      .then((response) => {
        if (cancelled) return
        setComplaint(response.complaint)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (handleAuthFailure(err)) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load complaint.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, complaintId])

  async function refresh(): Promise<void> {
    if (!token || !complaintId) return
    try {
      const response = await authorityApi.getComplaint(token, complaintId)
      setComplaint(response.complaint)
      setLoadError(null)
    } catch (err: unknown) {
      if (handleAuthFailure(err)) return
      setLoadError(err instanceof Error ? err.message : 'Failed to refresh complaint.')
    }
  }

  async function performTransition(): Promise<void> {
    if (!token || !complaintId || !nextAction) return
    setActionBusy(true)
    setActionError(null)
    try {
      await authorityApi.updateStatus(token, complaintId, nextAction.to, note.trim() || undefined)
      setModalOpen(false)
      setNote('')
      await refresh()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Status update failed.')
    } finally {
      setActionBusy(false)
    }
  }

  if (loading) {
    return <p className="muted">Loading…</p>
  }

  if (loadError) {
    return <p className="error">{loadError}</p>
  }

  if (!complaint) {
    return <p className="empty">Complaint not found.</p>
  }

  const nextAction = NEXT_ACTION[complaint.status]
  const history = [...complaint.history].reverse()

  return (
    <div className="page">
      <p>
        <Link className="link" to="/authority/complaints">
          ← Back to my complaints
        </Link>
      </p>

      <div className="page-head">
        <div>
          <h2 className="page-title">{complaint.complaintId}</h2>
          <p className="muted">
            Created {formatDate(complaint.createdAt)} · Assigned to {complaint.authority?.name ?? 'your authority'}
          </p>
        </div>
        <div className="page-actions">
          <StatusBadge status={complaint.status} />
          {nextAction && (
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                setNote('')
                setActionError(null)
                setModalOpen(true)
              }}
            >
              {nextAction.label}
            </button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <h3 className="card-title">Complaint</h3>
          <p className="label">Original description</p>
          <p>{complaint.originalDescription}</p>
          {complaint.aiDescription && (
            <>
              <p className="label">AI-summarised description</p>
              <p className="muted">{complaint.aiDescription}</p>
            </>
          )}
          {complaint.photoUrl && (
            <p className="photo">
              <img src={complaint.photoUrl} alt="Complaint photo" />
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Details</h3>
          <div className="kv">
            <div>
              <span className="label">Category</span>
              <span>{complaint.category ?? '—'}</span>
            </div>
            <div>
              <span className="label">Severity</span>
              <span>{complaint.severity ?? '—'}</span>
            </div>
            <div>
              <span className="label">Language</span>
              <span>{complaint.language ?? '—'}</span>
            </div>
            <div>
              <span className="label">District</span>
              <span>{complaint.district ?? '—'}</span>
            </div>
            <div>
              <span className="label">Place</span>
              <span>{complaint.place ? `${complaint.place.name} (${complaint.place.district})` : '—'}</span>
            </div>
            <div>
              <span className="label">Location</span>
              <span>
                {complaint.location ? `${complaint.location.latitude.toFixed(5)}, ${complaint.location.longitude.toFixed(5)}` : '—'}
              </span>
            </div>
            <div>
              <span className="label">Completed</span>
              <span>{formatDate(complaint.completedAt)}</span>
            </div>
            <div>
              <span className="label">Completed by</span>
              <span>{complaint.completedBy?.name ?? '—'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Status history</h3>
          {history.length === 0 ? (
            <p className="empty">No status changes recorded.</p>
          ) : (
            <ol className="timeline">
              {history.map((entry, index) => (
                <li key={index} className="tl-item">
                  <span className="tl-dot" />
                  <div className="tl-body">
                    <p>
                      <StatusBadge status={entry.newStatus} />
                      <span className="muted">
                        {' '}
                        · changed by {entry.changedBy?.name ?? 'system'} ({entry.changedByRole})
                      </span>
                    </p>
                    {entry.note && <p className="muted">{entry.note}</p>}
                    <p className="tl-time">{formatDate(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {modalOpen && nextAction && (
        <ConfirmModal
          title={nextAction.label}
          confirmLabel={nextAction.label}
          busy={actionBusy}
          error={actionError}
          onConfirm={() => void performTransition()}
          onCancel={() => setModalOpen(false)}
        >
          <p>
            This moves <strong>{complaint.complaintId}</strong> to{' '}
            <StatusBadge status={nextAction.to} />.
            {nextAction.to === 'completed' && ' This marks the complaint as resolved and closes it.'}
          </p>
          <label className="field">
            <span className="field-label">Optional note</span>
            <textarea
              className="input textarea"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Progress note…"
            />
          </label>
        </ConfirmModal>
      )}
    </div>
  )
}