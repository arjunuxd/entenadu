import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { status, user, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated' && user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/authority'} replace />
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const signedInUser = await login(username, password)
      navigate(signedInUser.role === 'admin' ? '/admin' : '/authority', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="screen">
      <div className="panel">
        <h1 className="panel-title">Ente Nadu</h1>
        <p className="tagline">Report. Connect. Resolve.</p>
        <p className="muted">Staff sign in</p>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <Link className="link" to="/">
          Back to home
        </Link>
      </div>
    </main>
  )
}