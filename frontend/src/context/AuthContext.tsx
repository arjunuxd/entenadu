import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchMe, loginRequest } from '../services/api'
import type { SafeUser } from '../types/auth'

const TOKEN_STORAGE_KEY = 'ente_nadu_token'

export type AuthStatus = 'loading' | 'authenticated' | 'guest'

interface AuthContextValue {
  status: AuthStatus
  user: SafeUser | null
  token: string | null
  login: (username: string, password: string) => Promise<SafeUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function clearStoredToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Storage unavailable (e.g. blocked by the browser); nothing to clear.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<SafeUser | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const storedToken = readStoredToken()

    if (!storedToken) {
      setStatus('guest')
      return
    }

    let cancelled = false

    fetchMe(storedToken)
      .then((response) => {
        if (cancelled) return
        setToken(storedToken)
        setUser(response.user)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        clearStoredToken()
        setToken(null)
        setUser(null)
        setStatus('guest')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<SafeUser> => {
    const response = await loginRequest(username, password)
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.token)
    } catch {
      // Token survives only in memory for this session when storage is blocked.
    }
    setToken(response.token)
    setUser(response.user)
    setStatus('authenticated')
    return response.user
  }, [])

  const logout = useCallback(() => {
    clearStoredToken()
    setToken(null)
    setUser(null)
    setStatus('guest')
  }, [])

  const value = useMemo(
    () => ({ status, user, token, login, logout }),
    [status, user, token, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}