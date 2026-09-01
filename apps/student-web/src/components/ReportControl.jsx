import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { reportContent } from '../api/community.js'
import { ErrorMessage } from './ErrorMessage.jsx'

// Kept in step with REPORT_REASON_MIN_LENGTH on the server, which is the rule
// that actually decides; this only stops an obviously empty submit.
const REASON_MIN = 10
const REASON_MAX = 500

export function ReportControl({ targetType, targetId }) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await reportContent({ targetType, targetId, reason })
      setIsSubmitted(true)
      setIsOpen(false)
      setReason('')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (isSubmitted) {
    return <p className="report-sent">{t('community.reportSubmitted')}</p>
  }

  if (!isOpen) {
    return (
      <button type="button" className="link-button" onClick={() => setIsOpen(true)}>
        {t('community.report')}
      </button>
    )
  }

  return (
    <form className="stack report-form" onSubmit={submit}>
      <strong>{t('community.reportContent')}</strong>
      <label>
        {t('community.reportReason')}
        <textarea
          required
          rows={3}
          minLength={REASON_MIN}
          maxLength={REASON_MAX}
          value={reason}
          placeholder={t('community.reportReasonPlaceholder')}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <ErrorMessage error={error} />
      <div className="answer-actions">
        <button
          className="button"
          type="submit"
          disabled={busy || reason.trim().length < REASON_MIN}
        >
          {t('community.submitReport')}
        </button>
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => {
            setIsOpen(false)
            setError(null)
          }}
        >
          {t('community.reportCancel')}
        </button>
      </div>
    </form>
  )
}
