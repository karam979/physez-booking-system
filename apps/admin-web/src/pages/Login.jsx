import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { ApiError } from '../api/client.js'

export function Login() {
  const { login, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const user = await login({ email, password })
      // A student session is useless in the admin app — reject it here.
      if (user.role !== 'admin') {
        await logout()
        throw new ApiError(403, 'FORBIDDEN')
      }
      navigate('/')
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="card form-card">
      <h1>{t('auth.loginTitle')}</h1>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {t('auth.email')}
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <ErrorMessage error={error} />
        <button className="button" type="submit" disabled={submitting}>
          {t('auth.loginCta')}
        </button>
      </form>
    </section>
  )
}
