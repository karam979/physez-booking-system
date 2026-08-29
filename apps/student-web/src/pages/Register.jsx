import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ErrorMessage } from '../components/ErrorMessage.jsx'

export function Register() {
  const { register } = useAuth()
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await register({ name, email, password, preferredLanguage: language })
      navigate('/dashboard')
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="card form-card">
      <h1>{t('auth.registerTitle')}</h1>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {t('auth.name')}
          <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('auth.email')}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <ErrorMessage error={error} />
        <button className="button" type="submit" disabled={submitting}>
          {t('auth.registerCta')}
        </button>
      </form>
      <p className="muted">
        {t('auth.haveAccount')} <Link to="/login">{t('nav.login')}</Link>
      </p>
    </section>
  )
}
