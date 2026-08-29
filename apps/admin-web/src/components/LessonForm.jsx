import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ErrorMessage } from './ErrorMessage.jsx'

const ATTENDANCE_VALUES = ['present', 'absent', 'late']

// Initialized from `initial` once. The parent remounts this with a key when a
// different lesson loads, so the draft never needs syncing in an effect.
export function LessonForm({ initial, saving, error, notice, onSave }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(initial)

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSave(draft)
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <label>
        {t('lesson.attendance')}
        <select value={draft.attendance} onChange={(e) => update('attendance', e.target.value)}>
          {ATTENDANCE_VALUES.map((value) => (
            <option key={value} value={value}>
              {t(`attendance.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('lesson.summary')}
        <textarea
          rows={4}
          maxLength={5000}
          value={draft.summary}
          onChange={(e) => update('summary', e.target.value)}
        />
      </label>
      <label>
        {t('lesson.homework')}
        <textarea
          rows={3}
          maxLength={5000}
          value={draft.homework}
          onChange={(e) => update('homework', e.target.value)}
        />
      </label>
      <label>
        {t('lesson.feedback')}
        <textarea
          rows={3}
          maxLength={5000}
          value={draft.feedback}
          onChange={(e) => update('feedback', e.target.value)}
        />
      </label>

      <ErrorMessage error={error} />
      {notice && <p className="notice">{notice}</p>}

      <button className="button" type="submit" disabled={saving}>
        {t('lesson.save')}
      </button>
    </form>
  )
}
