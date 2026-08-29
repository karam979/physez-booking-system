import { createContext, useContext, useEffect, useState } from 'react'
import * as authApi from '../api/auth.js'

const AuthContext = createContext(null)

// Hydrates the session from the HttpOnly cookie via GET /api/auth/me —
// the token itself is never readable from JS.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(credentials) {
    const loggedIn = await authApi.login(credentials)
    setUser(loggedIn)
    return loggedIn
  }

  async function register(details) {
    const created = await authApi.register(details)
    setUser(created)
    return created
  }

  async function logout() {
    await authApi.logout().catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
