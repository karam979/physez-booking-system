import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'

// Matches the server's REMOVAL_REASON_MIN_LENGTH; the server decides, this only
// stops an obviously empty submit.
const REASON_MIN = 5
const REASON_MAX = 500

// A two-step confirm rather than window.confirm(): removing a question hides a
// whole thread from students, so the admin has to say why first.
export function QuestionRemovalForm({ busy, onRemove }) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')

  function submit(event) {
    event.preventDefault()
    onRemove(reason.trim())
  }

  if (!isOpen) {
    return (
      <button type="button" className="button-danger" onClick={() => setIsOpen(true)}>
        {t('removal.remove')}
      </button>
    )
  }

  return (
    <form className="card stack removal-form" onSubmit={submit}>
      <strong>{t('removal.confirmTitle')}</strong>
      <p className="muted">{t('removal.confirmHint')}</p>
      <label>
        {t('removal.reason')}
        <textarea
          required
          rows={2}
          minLength={REASON_MIN}
          maxLength={REASON_MAX}
          value={reason}
          placeholder={t('removal.reasonPlaceholder')}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="report-actions">
        <button
          className="button-danger"
          type="submit"
          disabled={busy || reason.trim().length < REASON_MIN}
        >
          {t('removal.confirm')}
        </button>
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => setIsOpen(false)}
        >
          {t('removal.cancel')}
        </button>
      </div>
    </form>
  )
}
