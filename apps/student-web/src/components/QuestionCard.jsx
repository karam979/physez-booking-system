import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { formatDateTime, topicName } from '../lib/format.js'
import { LANGUAGE_NAMES } from '../i18n/index.js'

export function QuestionCard({ question }) {
  const { t, language } = useLanguage()

  return (
    <Link to={`/community/questions/${question.id}`} className="card booking-card">
      <div className="booking-card-row">
        <strong>{question.title}</strong>
        <span className={`badge badge-${question.isSolved ? 'confirmed' : 'pending'}`}>
          {t(question.isSolved ? 'community.solved' : 'community.open')}
        </span>
      </div>
      <div className="booking-card-row muted">
        <span>
          {topicName(question.topic, language)} · {LANGUAGE_NAMES[question.language]}
        </span>
        <span>
          {t('community.answerCount', { n: question.answerCount })} ·{' '}
          {formatDateTime(question.createdAt, language)}
        </span>
      </div>
      <p className="muted">{t('community.askedBy', { name: question.author.name })}</p>
    </Link>
  )
}
