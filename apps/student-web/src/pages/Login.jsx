import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ErrorMessage } from '../components/ErrorMessage.jsx'

export function Login() {
  const { login } = useAuth()
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
      await login({ email, password })
      navigate('/dashboard')
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
      <p className="muted">
        {t('auth.noAccount')} <Link to="/register">{t('nav.register')}</Link>
      </p>
    </section>
  )
}
