import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createBooking } from '../api/bookings.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { LessonTypeStep } from '../components/wizard/LessonTypeStep.jsx'
import { TopicStep } from '../components/wizard/TopicStep.jsx'
import { AvailabilityPicker } from '../components/wizard/AvailabilityPicker.jsx'
import { BookingReview } from '../components/wizard/BookingReview.jsx'

const STEPS = [
  { key: 'wizard.stepLessonType', component: LessonTypeStep, isComplete: (d) => d.lessonType },
  { key: 'wizard.stepTopic', component: TopicStep, isComplete: (d) => d.topicId },
  { key: 'wizard.stepTime', component: AvailabilityPicker, isComplete: (d) => d.startAt },
  { key: 'wizard.stepReview', component: BookingReview, isComplete: () => true },
]

const initialDraft = {
  lessonType: 'zoom',
  durationMinutes: 60,
  language: 'en',
  topicId: null,
  topic: null,
  date: '',
  startAt: null,
  notes: '',
}

export function Book() {
  const { t } = useLanguage()
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState(initialDraft)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)

  const step = STEPS[stepIndex]
  const StepComponent = step.component

  function updateDraft(changes) {
    setDraft((current) => ({ ...current, ...changes }))
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const booking = await createBooking(draft)
      setCreated(booking)
    } catch (err) {
      setError(err)
      // A conflict means the picked time is stale — send the student back
      // to the time step to pick again.
      if (err.code === 'BOOKING_CONFLICT' || err.code === 'SLOT_UNAVAILABLE') {
        setStepIndex(2)
        updateDraft({ startAt: null })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <section className="card stack">
        <h1>{t('wizard.submitted')}</h1>
        <Link className="button" to="/dashboard">
          {t('wizard.goToDashboard')}
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <h1>{t('wizard.title')}</h1>

      <ol className="steps">
        {STEPS.map((s, index) => (
          <li key={s.key} className={index === stepIndex ? 'step-active' : ''}>
            {t(s.key)}
          </li>
        ))}
      </ol>

      <div className="card">
        <StepComponent draft={draft} onChange={updateDraft} />
      </div>

      <ErrorMessage error={error} />

      <div className="wizard-nav">
        {stepIndex > 0 && (
          <button
            type="button"
            className="button-secondary"
            onClick={() => setStepIndex(stepIndex - 1)}
          >
            {t('wizard.back')}
          </button>
        )}
        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            className="button"
            disabled={!step.isComplete(draft)}
            onClick={() => setStepIndex(stepIndex + 1)}
          >
            {t('wizard.next')}
          </button>
        ) : (
          <button type="button" className="button" disabled={submitting} onClick={submit}>
            {t('wizard.submit')}
          </button>
        )}
      </div>
    </section>
  )
}
