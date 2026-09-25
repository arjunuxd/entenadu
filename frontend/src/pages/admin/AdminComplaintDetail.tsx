import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { adminApi, ApiError } from '../../services/api'
import StatusBadge from '../../components/StatusBadge'
import ConfirmModal from '../../components/ConfirmModal'
import { formatDate } from '../../utils/format'
import type { AuthoritySummary, ComplaintDetail } from '../../types/complaint'

type ModalKind = 'verify' | 'reject' | 'assign' | 'reassign' | null

export default function AdminComplaintDetail() {
  const { complaintId } = useParams<{ complaintId: string }>()
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null)
  const [authorities, setAuthorities] = useState<AuthoritySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [modal, setModal] = useState<ModalKind>(null)
  const [note, setNote] = useState('')
  const [assignTo, setAssignTo] = useState('')
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

    adminApi
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

  useEffect(() => {
    if (!token) return
    let cancelled = false

    adminApi
      .listAuthorities(token)
      .then((response) => {
        if (!cancelled) setAuthorities(response.authorities)
      })
      .catch(() => {
        // Assignment select best-effort.
      })

    return () => {
      cancelled = true
    }
  }, [token])

  async function requestList(force: boolean): Promise<void> {
    if (!token || !complaintId) return
    try {
      const response = await adminApi.getComplaint(token, complaintId)
      setComplaint(response.complaint)
      setLoadError(null)
      if (force) {
        setLoading(false)
      }
    } catch (err: unknown) {
      if (handleAuthFailure(err)) return
      setLoadError(err instanceof Error ? err.message : 'Failed to refresh complaint.')
      setLoading(false)
    }
  }

  async function performVerify(): Promise<void> {
    if (!token || !complaintId) return
    setActionBusy(true)
    setActionError(null)
    try {
      await adminApi.verifyComplaint(token, complaintId, note.trim() || undefined)
      setModal(null)
      setNote('')
      await requestList(false)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Verification failed.')
    } finally {
      setActionBusy(false)
    }
  }

  async function performReject(): Promise<void> {
    if (!token || !complaintId) return
    setActionBusy(true)
    setActionError(null)
    try {
      await adminApi.rejectComplaint(token, complaintId, note.trim() || undefined)
      setModal(null)
      setNote('')
      await requestList(false)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Rejection failed.')
    } finally {
      setActionBusy(false)
    }
  }

  async function performAssign(): Promise<void> {
    if (!token || !complaintId || !assignTo) return
    setActionBusy(true)
    setActionError(null)
    try {
      if (modal === 'reassign') {
        await adminApi.reassignComplaint(token, complaintId, assignTo)
      } else {
        await adminApi.assignComplaint(token, complaintId, assignTo)
      }
      setModal(null)
      setAssignTo('')
      await requestList(false)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Assignment failed.')
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

  const activeAuthorities = authorities.filter((authority) => authority.isActive)
  const canVerify = complaint.status === 'submitted'
  const canReject = complaint.status === 'submitted'
  const canAssign = complaint.status === 'verified'
  const canReassign = complaint.status === 'assigned' || complaint.status === 'under_review' || complaint.status === 'in_progress'
  const history = [...complaint.history].reverse()
  const audit = [...complaint.audit].reverse()

  return (
    <div className="page">
      <p>
        <Link className="link" to="/admin/complaints">
          ← Back to complaints
        </Link>
      </p>

      <div className="page-head">
        <div>
          <h2 className="page-title">{complaint.complaintId}</h2>
          <p className="muted">Created {formatDate(complaint.createdAt)}</p>
        </div>
        <div className="page-actions">
          <StatusBadge status={complaint.status} />
          {canVerify && (
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                setNote('')
                setActionError(null)
                setModal('verify')
              }}
            >
              Verify
            </button>
          )}
          {canReject && (
            <button
              className="btn btn-sm btn-danger"
              type="button"
              onClick={() => {
                setNote('')
                setActionError(null)
                setModal('reject')
              }}
            >
              Reject
            </button>
          )}
          {canAssign && (
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                setAssignTo('')
                setActionError(null)
                setModal('assign')
              }}
            >
              Assign
            </button>
          )}
          {canReassign && (
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                setAssignTo('')
                setActionError(null)
                setModal('reassign')
              }}
            >
              Reassign
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
              <span className="label">Assigned authority</span>
              <span>{complaint.authority ? `${complaint.authority.name} (${complaint.authority.code})` : '—'}</span>
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

        <div className="card">
          <h3 className="card-title">Audit trail</h3>
          {audit.length === 0 ? (
            <p className="empty">No audit events recorded.</p>
          ) : (
            <ol className="timeline">
              {audit.map((entry, index) => (
                <li key={index} className="tl-item">
                  <span className="tl-dot" />
                  <div className="tl-body">
                    <p>
                      <strong>{entry.action}</strong>
                      <span className="muted"> · {entry.actorRole}</span>
                    </p>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <pre className="tl-meta">{JSON.stringify(entry.metadata)}</pre>
                    )}
                    <p className="tl-time">{formatDate(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {modal === 'verify' && (
        <ConfirmModal
          title="Verify complaint"
          confirmLabel="Verify"
          busy={actionBusy}
          error={actionError}
          onConfirm={() => void performVerify()}
          onCancel={() => setModal(null)}
        >
          <p>
            This moves <strong>{complaint.complaintId}</strong> from <em>Submitted</em> to <em>Verified</em>.
          </p>
          <label className="field">
            <span className="field-label">Optional note</span>
            <textarea
              className="input textarea"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Verification remarks…"
            />
          </label>
        </ConfirmModal>
      )}

      {modal === 'reject' && (
        <ConfirmModal
          title="Reject complaint"
          confirmLabel="Reject"
          danger
          busy={actionBusy}
          error={actionError}
          onConfirm={() => void performReject()}
          onCancel={() => setModal(null)}
        >
          <p>
            This moves <strong>{complaint.complaintId}</strong> from <em>Submitted</em> to <em>Rejected</em>.
          </p>
          <label className="field">
            <span className="field-label">Note</span>
            <textarea
              className="input textarea"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for rejection…"
            />
          </label>
        </ConfirmModal>
      )}

      {(modal === 'assign' || modal === 'reassign') && (
        <ConfirmModal
          title={modal === 'assign' ? 'Assign authority' : 'Reassign authority'}
          confirmLabel={modal === 'assign' ? 'Assign' : 'Reassign'}
          busy={actionBusy}
          error={actionError}
          onConfirm={() => void performAssign()}
          onCancel={() => setModal(null)}
        >
          <p>
            {modal === 'assign' ? 'Assign' : 'Reassign'} <strong>{complaint.complaintId}</strong>
            {modal === 'reassign' ? ` from ${complaint.authority?.name ?? 'current authority'}` : ''} to:
          </p>
          <label className="field">
            <span className="field-label">Authority</span>
            <select className="input" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Select an authority…</option>
              {activeAuthorities.map((authority) => (
                <option key={authority.id} value={authority.id}>
                  {authority.name} ({authority.code})
                </option>
              ))}
            </select>
          </label>
        </ConfirmModal>
      )}
    </div>
  )
}