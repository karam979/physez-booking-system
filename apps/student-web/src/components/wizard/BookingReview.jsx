import { useLanguage } from '../../context/LanguageContext.jsx'
import { LANGUAGE_NAMES } from '../../i18n/index.js'
import { formatDateTime, topicName } from '../../lib/format.js'

export function BookingReview({ draft, onChange }) {
  const { t, language } = useLanguage()

  const rows = [
    [t('booking.type'), t(`wizard.lessonType.${draft.lessonType}`)],
    [t('booking.duration'), t('wizard.minutes', { n: draft.durationMinutes })],
    [t('booking.language'), LANGUAGE_NAMES[draft.language]],
    [t('booking.topic'), topicName(draft.topic, language)],
    [t('booking.time'), draft.startAt ? formatDateTime(draft.startAt, language) : '—'],
  ]

  return (
    <div className="stack">
      <dl className="summary">
        {rows.map(([label, value]) => (
          <div key={label} className="summary-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <label>
        {t('wizard.notes')}
        <textarea
          rows={3}
          maxLength={2000}
          value={draft.notes}
          placeholder={t('wizard.notesPlaceholder')}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </label>
    </div>
  )
}
