import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { adminApi, ApiError } from '../../services/api'
import { formatDate } from '../../utils/format'
import type { AuthoritySummary, AuthorityUserView } from '../../types/complaint'

export default function AdminAuthorities() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [authorities, setAuthorities] = useState<AuthoritySummary[] | null>(null)
  const [users, setUsers] = useState<AuthorityUserView[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    Promise.all([adminApi.listAuthorities(token), adminApi.listAuthorityUsers(token)])
      .then(([listResponse, usersResponse]) => {
        if (cancelled) return
        setAuthorities(listResponse.authorities)
        setUsers(usersResponse.users)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          logout()
          navigate('/login', { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load authorities.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, logout, navigate])

  async function toggleAccess(user: AuthorityUserView): Promise<void> {
    if (!token) return
    try {
      const response = await adminApi.updateAuthorityUserAccess(token, user.id, {
        isActive: !user.isActive,
      })
      setUsers((current) => current?.map((entry) => (entry.id === user.id ? response.user : entry)) ?? null)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate('/login', { replace: true })
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to update account.')
    }
  }

  if (loading) {
    return <p className="muted">Loading…</p>
  }

  if (error) {
    return <p className="error">{error}</p>
  }

  if (!authorities) {
    return <p className="empty">No authorities available.</p>
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Authorities</h2>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>District</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {authorities.map((authority) => (
              <tr key={authority.id}>
                <td className="mono">{authority.code}</td>
                <td>{authority.name}</td>
                <td>{authority.type}</td>
                <td>{authority.district}</td>
                <td>
                  {authority.isActive ? (
                    <span className="status-badge status-active">Active</span>
                  ) : (
                    <span className="status-badge status-inactive">Inactive</span>
                  )}
                </td>
                <td>{formatDate(authority.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users !== null && (
        <>
          <div className="page-head">
            <h3 className="page-title">Authority accounts</h3>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Linked local body</th>
                  <th>Status</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="mono">{user.username}</td>
                    <td>{user.name}</td>
                    <td>{user.authority?.name ?? '—'}</td>
                    <td>
                      {user.isActive ? (
                        <span className="status-badge status-active">Active</span>
                      ) : (
                        <span className="status-badge status-inactive">Inactive</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm" onClick={() => void toggleAccess(user)}>
                        {user.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}