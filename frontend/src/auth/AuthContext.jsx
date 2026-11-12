import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getToken, onUnauthorized, setToken } from '../api/client'
import { api } from '../api/endpoints'

const AuthContext = createContext(null)

export const HOME_BY_ROLE = { student: '/home', agent: '/agent', admin: '/admin' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [sessionMessage, setSessionMessage] = useState(null)

  const logout = useCallback((message = null) => {
    setToken(null)
    setUser(null)
    setSessionMessage(message)
  }, [])

  const refreshUser = useCallback(async () => {
    const me = await api.me()
    setUser(me)
    return me
  }, [])

  // Restore session from sessionStorage on first load.
  useEffect(() => {
    if (!getToken()) return
    refreshUser()
      .catch(() => logout())
      .finally(() => setLoading(false))
  }, [refreshUser, logout])

  useEffect(() => {
    onUnauthorized(() => logout('Your session expired. Please log in again.'))
    return () => onUnauthorized(null)
  }, [logout])

  const adoptToken = useCallback(
    async (accessToken) => {
      setToken(accessToken)
      setSessionMessage(null)
      try {
        return await refreshUser() // role routing comes from GET /auth/me
      } catch (err) {
        setToken(null)
        throw err
      }
    },
    [refreshUser],
  )

  const login = useCallback(
    async (phone, password) => {
      const res = await api.login(phone, password)
      return adoptToken(res.access_token)
    },
    [adoptToken],
  )

  const register = useCallback(
    async (data) => {
      const res = await api.register(data)
      return adoptToken(res.access_token)
    },
    [adoptToken],
  )

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, sessionMessage }),
    [user, loading, login, register, logout, refreshUser, sessionMessage],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
