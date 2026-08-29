import { useCallback } from 'react'
import { getAvailability } from '../../api/availability.js'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useFetch } from '../../lib/useFetch.js'
import { ErrorMessage } from '../ErrorMessage.jsx'
import { formatTime } from '../../lib/format.js'
import { startTimesInWindows } from '../../lib/timeSlots.js'

export function AvailabilityPicker({ draft, onChange }) {
  const { t, language } = useLanguage()

  const fetchWindows = useCallback(() => {
    if (!draft.date) return Promise.resolve(null)
    return getAvailability(draft.date, draft.durationMinutes)
  }, [draft.date, draft.durationMinutes])

  const { data, error, loading } = useFetch(fetchWindows)
  const windows = data?.windows ?? null
  const startTimes = startTimesInWindows(windows, draft.durationMinutes)

  return (
    <div className="stack">
      <label>
        {t('wizard.date')}
        <input
          type="date"
          value={draft.date}
          onChange={(event) => onChange({ date: event.target.value, startAt: null })}
        />
      </label>

      <ErrorMessage error={error} />
      {draft.date && loading && <p className="muted">{t('app.loading')}</p>}

      {windows && (
        <>
          <p>{t('wizard.freeWindows')}</p>
          {startTimes.length === 0 ? (
            <p className="muted">{t('wizard.noWindows')}</p>
          ) : (
            <div className="choice-grid">
              {startTimes.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  className={`choice ${draft.startAt === iso ? 'choice-selected' : ''}`}
                  onClick={() => onChange({ startAt: iso })}
                >
                  {formatTime(iso, language)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
