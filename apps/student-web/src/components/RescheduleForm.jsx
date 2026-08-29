import { useCallback, useState } from 'react'
import { getAvailability } from '../api/availability.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { formatTime } from '../lib/format.js'
import { startTimesInWindows } from '../lib/timeSlots.js'
import { ErrorMessage } from './ErrorMessage.jsx'

// Picks a new time for an existing booking; the lesson keeps its length.
export function RescheduleForm({ durationMinutes, submitting, onSubmit, onCancel }) {
  const { t, language } = useLanguage()
  const [date, setDate] = useState('')
  const [startAt, setStartAt] = useState(null)

  const fetchWindows = useCallback(
    () => (date ? getAvailability(date, durationMinutes) : Promise.resolve(null)),
    [date, durationMinutes],
  )
  const { data, error } = useFetch(fetchWindows)

  const startTimes = startTimesInWindows(data?.windows, durationMinutes)

  return (
    <div className="card stack">
      <strong>{t('reschedule.title')}</strong>
      <label>
        {t('wizard.date')}
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value)
            setStartAt(null)
          }}
        />
      </label>

      <ErrorMessage error={error} />

      {date && startTimes.length === 0 && <p className="muted">{t('wizard.noWindows')}</p>}
      {startTimes.length > 0 && (
        <div className="choice-grid">
          {startTimes.map((iso) => (
            <button
              key={iso}
              type="button"
              className={`choice ${startAt === iso ? 'choice-selected' : ''}`}
              onClick={() => setStartAt(iso)}
            >
              {formatTime(iso, language)}
            </button>
          ))}
        </div>
      )}

      <div className="wizard-nav">
        <button type="button" className="button-secondary" onClick={onCancel}>
          {t('reschedule.back')}
        </button>
        <button
          type="button"
          className="button"
          disabled={!startAt || submitting}
          onClick={() => onSubmit(startAt)}
        >
          {t('reschedule.submit')}
        </button>
      </div>
    </div>
  )
}
