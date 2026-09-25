import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/auth'

interface ProtectedRouteProps {
  roles: UserRole[]
  children: ReactNode
}

export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return (
      <main className="screen">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />
  }

  if (!roles.includes(user.role)) {
    const fallback = user.role === 'admin' ? '/admin' : '/authority'
    return <Navigate to={fallback} replace />
  }

  return <>{children}</>
}