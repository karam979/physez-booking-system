import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'

const EMPTY = { amount: '', creditKind: 'paid', reason: '' }

// A reason is required by the API, so the form makes it required too — the
// history is an audit trail, not a balance patch.
export function CreditAdjustmentForm({ busy, onSubmit }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(EMPTY)

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit({
      amount: Number(draft.amount),
      creditKind: draft.creditKind,
      reason: draft.reason.trim(),
    })
    setDraft(EMPTY)
  }

  const amount = Number(draft.amount)
  const isValid =
    draft.amount !== '' &&
    Number.isInteger(amount) &&
    amount !== 0 &&
    draft.reason.trim().length >= 3

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <strong>{t('credits.adjust')}</strong>
      <p className="muted">{t('credits.adjustHint')}</p>

      <label>
        {t('credits.amount')}
        <input
          type="number"
          step="1"
          required
          value={draft.amount}
          placeholder={t('credits.amountPlaceholder')}
          onChange={(e) => update('amount', e.target.value)}
        />
      </label>

      <label>
        {t('credits.kind')}
        <select value={draft.creditKind} onChange={(e) => update('creditKind', e.target.value)}>
          <option value="paid">{t('credits.paid')}</option>
          <option value="reward">{t('credits.reward')}</option>
        </select>
      </label>

      <label>
        {t('credits.reason')}
        <input
          required
          minLength={3}
          maxLength={500}
          value={draft.reason}
          placeholder={t('credits.reasonPlaceholder')}
          onChange={(e) => update('reason', e.target.value)}
        />
      </label>

      <button className="button" type="submit" disabled={busy || !isValid}>
        {t('credits.apply')}
      </button>
    </form>
  )
}
