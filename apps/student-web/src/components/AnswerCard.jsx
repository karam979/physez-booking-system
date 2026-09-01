import { useLanguage } from '../context/LanguageContext.jsx'
import { formatDateTime } from '../lib/format.js'
import { ReportControl } from './ReportControl.jsx'

export function AnswerCard({ answer, canAccept, busy, onVote, onUnvote, onAccept }) {
  const { t, language } = useLanguage()

  return (
    <article className={`card stack ${answer.isAccepted ? 'answer-accepted' : ''}`}>
      {answer.isAccepted && <p className="accepted-flag">✓ {t('community.acceptedAnswer')}</p>}

      {/* Student-written text: its own direction, not the UI's. */}
      <p className="answer-body" dir="auto">
        {answer.body}
      </p>

      <div className="booking-card-row muted">
        <span>{t('community.answeredBy', { name: answer.author.name })}</span>
        <span>{formatDateTime(answer.createdAt, language)}</span>
      </div>

      <div className="answer-actions">
        <span className="vote-count">{t('community.helpfulCount', { n: answer.voteCount })}</span>

        {/* Voting for your own answer is refused server-side; hide the control. */}
        {!answer.isOwn &&
          (answer.viewerHasVoted ? (
            <button type="button" className="link-button" disabled={busy} onClick={onUnvote}>
              {t('community.undoHelpful')}
            </button>
          ) : (
            <button type="button" className="button-secondary" disabled={busy} onClick={onVote}>
              {t('community.markHelpful')}
            </button>
          ))}

        {canAccept && (
          <button type="button" className="button" disabled={busy} onClick={onAccept}>
            {t('community.accept')}
          </button>
        )}
      </div>

      {/* Reporting your own answer helps nobody, so the control is hidden. */}
      {!answer.isOwn && (
        <div className="report-row">
          <ReportControl targetType="answer" targetId={answer.id} />
        </div>
      )}
    </article>
  )
}
