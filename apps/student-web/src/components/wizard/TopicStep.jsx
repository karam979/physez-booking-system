import { useEffect, useState } from 'react'
import { listTopics } from '../../api/topics.js'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { ErrorMessage } from '../ErrorMessage.jsx'
import { topicName } from '../../lib/format.js'

export function TopicStep({ draft, onChange }) {
  const { t, language } = useLanguage()
  const [topics, setTopics] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    listTopics().then(setTopics).catch(setError)
  }, [])

  if (error) return <ErrorMessage error={error} />
  if (!topics) return <p className="muted">{t('app.loading')}</p>

  return (
    <div className="stack">
      {topics.map((topic) => (
        <button
          key={topic.id}
          type="button"
          className={`choice choice-wide ${draft.topicId === topic.id ? 'choice-selected' : ''}`}
          onClick={() => onChange({ topicId: topic.id, topic })}
        >
          <strong>{topicName(topic, language)}</strong>
          {topic.educationLevel && <span className="muted"> · {topic.educationLevel}</span>}
        </button>
      ))}
    </div>
  )
}
