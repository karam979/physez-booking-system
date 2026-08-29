import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { isUuid } from '../validate.js'
import { scoreAttempt } from './scoring.js'
import { serializeQuiz, serializeAttempt } from './serialize.js'

const router = Router()

router.use(requireAuth, requireRole('student'))

// GET /api/quizzes/topic/:topicId — the active quiz for a topic, questions
// and options only. The SELECT never lists correct_answer so the column
// cannot leak through a serializer change.
router.get('/topic/:topicId', async (req, res, next) => {
  try {
    const { topicId } = req.params
    if (!isUuid(topicId)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Topic id must be a UUID.', { topicId: 'INVALID' }))
    }

    const quizResult = await query(
      `SELECT id, topic_id, title FROM diagnostic_quizzes
       WHERE topic_id = $1 AND active = true
       ORDER BY created_at DESC LIMIT 1`,
      [topicId],
    )
    const quiz = quizResult.rows[0]
    if (!quiz) {
      return res
        .status(404)
        .json(apiError('QUIZ_NOT_FOUND', 'No quiz is available for this topic.'))
    }

    const questions = await query(
      `SELECT id, question_text, options, position FROM quiz_questions
       WHERE quiz_id = $1 ORDER BY position`,
      [quiz.id],
    )
    res.json(serializeQuiz(quiz, questions.rows))
  } catch (err) {
    next(err)
  }
})

// POST /api/quizzes/:id/attempts — submit answers, scored server-side.
router.post('/:id/attempts', async (req, res, next) => {
  try {
    const { id } = req.params
    const { answers, bookingId } = req.body ?? {}

    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Quiz id must be a UUID.', { id: 'INVALID' }))
    }
    const details = {}
    if (!Array.isArray(answers)) {
      details.answers = 'INVALID'
    } else if (
      answers.some(
        (entry) => !entry || !isUuid(entry.questionId) || typeof entry.answer !== 'string',
      )
    ) {
      details.answers = 'INVALID_ENTRY'
    }
    if (bookingId != null && !isUuid(bookingId)) details.bookingId = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid quiz submission.', details))
    }

    const quizResult = await query(
      `SELECT id FROM diagnostic_quizzes WHERE id = $1 AND active = true`,
      [id],
    )
    if (quizResult.rows.length === 0) {
      return res.status(404).json(apiError('QUIZ_NOT_FOUND', 'No quiz is available.'))
    }

    if (bookingId != null) {
      const booking = await query(`SELECT student_id FROM bookings WHERE id = $1`, [bookingId])
      if (booking.rows.length === 0) {
        return res.status(404).json(apiError('NOT_FOUND', 'Booking not found.'))
      }
      if (booking.rows[0].student_id !== req.user.id) {
        return res
          .status(403)
          .json(apiError('FORBIDDEN', 'You do not have access to this booking.'))
      }
    }

    const questions = await query(
      `SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = $1`,
      [id],
    )
    const { correctCount, totalQuestions, score } = scoreAttempt(questions.rows, answers)

    const { rows } = await query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, booking_id, score)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, req.user.id, bookingId ?? null, score],
    )

    // Only the aggregate goes back: per-question results would let a student
    // recover the answer key by resubmitting.
    res.status(201).json({ ...serializeAttempt(rows[0]), correctCount, totalQuestions })
  } catch (err) {
    next(err)
  }
})

export default router
