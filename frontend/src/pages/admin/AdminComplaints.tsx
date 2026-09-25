import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { adminApi, ApiError } from '../../services/api'
import ComplaintTable, { PaginationBar } from '../../components/ComplaintTable'
import { STATUS_LABEL } from '../../components/StatusBadge'
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES,
  type AuthoritySummary,
  type PagedComplaints,
} from '../../types/complaint'

interface Filters {
  status: string
  category: string
  severity: string
  authorityId: string
  search: string
}

const EMPTY_FILTERS: Filters = { status: '', category: '', severity: '', authorityId: '', search: '' }

export default function AdminComplaints() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PagedComplaints | null>(null)
  const [authorities, setAuthorities] = useState<AuthoritySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    adminApi
      .listAuthorities(token)
      .then((response) => {
        if (!cancelled) setAuthorities(response.authorities)
      })
      .catch(() => {
        // Authority filter best-effort; list still works without it.
      })

    return () => {
      cancelled = true
    }
  }, [token])

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
      if (filters.category) params.set('category', filters.category)
      if (filters.severity) params.set('severity', filters.severity)
      if (filters.authorityId) params.set('authorityId', filters.authorityId)
      if (filters.search) params.set('search', filters.search)
      if (page > 1) params.set('page', String(page))

      adminApi
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
        <h2 className="page-title">Complaints</h2>
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

        <label className="field">
          <span className="field-label">Category</span>
          <select className="input" value={filters.category} onChange={(e) => setStatusField('category')(e.target.value)}>
            <option value="">All categories</option>
            {COMPLAINT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Severity</span>
          <select className="input" value={filters.severity} onChange={(e) => setStatusField('severity')(e.target.value)}>
            <option value="">All severities</option>
            {COMPLAINT_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Authority</span>
          <select
            className="input"
            value={filters.authorityId}
            onChange={(e) => setStatusField('authorityId')(e.target.value)}
          >
            <option value="">All authorities</option>
            {authorities.map((authority) => (
              <option key={authority.id} value={authority.id}>
                {authority.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-grow">
          <span className="field-label">Search</span>
          <input
            className="input"
            type="search"
            placeholder="Description or complaint ID…"
            value={filters.search}
            onChange={(e) => setStatusField('search')(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {data && !loading && (
        <>
          <ComplaintTable items={data.items} detailPath={(complaintId) => `/admin/complaints/${complaintId}`} />
          <PaginationBar pagination={data.pagination} onChange={setPage} />
        </>
      )}
    </div>
  )
}