import { useLanguage } from '../../context/LanguageContext.jsx'
import { LANGUAGE_NAMES } from '../../i18n/index.js'

const DURATIONS = [45, 60, 90, 120]
const LESSON_TYPES = ['zoom', 'in_person']

export function LessonTypeStep({ draft, onChange }) {
  const { t } = useLanguage()

  return (
    <div className="stack">
      <div className="choice-row">
        {LESSON_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`choice ${draft.lessonType === type ? 'choice-selected' : ''}`}
            onClick={() => onChange({ lessonType: type })}
          >
            {t(`wizard.lessonType.${type}`)}
          </button>
        ))}
      </div>

      <label>
        {t('wizard.duration')}
        <select
          value={draft.durationMinutes}
          onChange={(event) => onChange({ durationMinutes: Number(event.target.value) })}
        >
          {DURATIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t('wizard.minutes', { n: minutes })}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t('wizard.lessonLanguage')}
        <select
          value={draft.language}
          onChange={(event) => onChange({ language: event.target.value })}
        >
          {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
