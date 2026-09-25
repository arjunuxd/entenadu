import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AdminStats } from '../../types/complaint'
import StatCards from '../../components/StatCards'
import ComplaintTable from '../../components/ComplaintTable'
import { adminApi, ApiError } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function AdminDashboard() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    adminApi
      .getStats(token)
      .then((response) => {
        if (cancelled) return
        setStats(response.stats)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          logout()
          navigate('/login', { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load statistics.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, logout, navigate])

  if (loading) {
    return <p className="muted">Loading…</p>
  }

  if (error) {
    return <p className="error">{error}</p>
  }

  if (!stats) {
    return <p className="empty">No statistics available.</p>
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Overview</h2>
      </div>
      <StatCards totals={stats.totals} />
      <div className="card">
        <h3 className="card-title">Recent complaints</h3>
        <ComplaintTable items={stats.recent} detailPath={(complaintId) => `/admin/complaints/${complaintId}`} />
      </div>
    </div>
  )
}