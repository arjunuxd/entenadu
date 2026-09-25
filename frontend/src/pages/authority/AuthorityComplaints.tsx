import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { authorityApi, ApiError } from '../../services/api'
import ComplaintTable, { PaginationBar } from '../../components/ComplaintTable'
import { STATUS_LABEL } from '../../components/StatusBadge'
import { COMPLAINT_STATUSES, type PagedComplaints } from '../../types/complaint'

interface Filters {
  status: string
  search: string
}

const EMPTY_FILTERS: Filters = { status: '', search: '' }

export default function AuthorityComplaints() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PagedComplaints | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function handleAuthFailure(err: unknown): boolean {
    if (err instanceof ApiError && err.status === 401) {
      logout()
      navigate('/login', { replace: true })
      return true
    }
    return false
  }

  useEffect(() => {
    if (!token) return
    const timer = window.setTimeout(() => {
      let cancelled = false
      setLoading(true)

      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.search) params.set('search', filters.search)
      if (page > 1) params.set('page', String(page))

      authorityApi
        .listComplaints(token, params)
        .then((response) => {
          if (cancelled) return
          setData(response)
          setError(null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          if (handleAuthFailure(err)) return
          setError(err instanceof Error ? err.message : 'Failed to load complaints.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })

      return () => {
        cancelled = true
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [token, filters, page])

  function setStatusField(field: keyof Filters): (value: string) => void {
    return (value: string) => {
      setFilters((prev) => ({ ...prev, [field]: value }))
      setPage(1)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">My complaints</h2>
      </div>

      <div className="filters">
        <label className="field">
          <span className="field-label">Status</span>
          <select className="input" value={filters.status} onChange={(e) => setStatusField('status')(e.target.value)}>
            <option value="">All statuses</option>
            {COMPLAINT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-grow">
          <span className="field-label">Search</span>
          <input
            className="input"
            type="search"
            placeholder="Complaint ID…"
            value={filters.search}
            onChange={(e) => setStatusField('search')(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {data && !loading && (
        <>
          <ComplaintTable items={data.items} detailPath={(complaintId) => `/authority/complaints/${complaintId}`} />
          <PaginationBar pagination={data.pagination} onChange={setPage} />
        </>
      )}
    </div>
  )
}