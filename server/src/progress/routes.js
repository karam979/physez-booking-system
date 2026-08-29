import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth, requireRole } from '../auth/middleware.js'

const router = Router()

router.use(requireAuth, requireRole('student'))

// GET /api/progress/me — completed lessons with their summaries, plus quiz
// scores over time. Read-only aggregation of what the student already owns.
router.get('/me', async (req, res, next) => {
  try {
    const lessons = await query(
      `SELECT b.id AS booking_id, b.start_at, b.lesson_type,
              t.name_en, t.name_ar, t.name_he,
              l.attendance, l.summary, l.homework, l.feedback
       FROM bookings b
       JOIN topics t ON t.id = b.topic_id
       LEFT JOIN lessons l ON l.booking_id = b.id
       WHERE b.student_id = $1 AND b.status = 'completed'
       ORDER BY b.start_at DESC`,
      [req.user.id],
    )

    const attempts = await query(
      `SELECT a.id, a.score, a.submitted_at, q.title,
              t.name_en, t.name_ar, t.name_he
       FROM quiz_attempts a
       JOIN diagnostic_quizzes q ON q.id = a.quiz_id
       JOIN topics t ON t.id = q.topic_id
       WHERE a.student_id = $1
       ORDER BY a.submitted_at DESC`,
      [req.user.id],
    )

    const scores = attempts.rows.map((row) => Number(row.score))
    const averageScore =
      scores.length === 0
        ? null
        : Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2))

    res.json({
      completedLessons: lessons.rows.length,
      quizAttempts: scores.length,
      averageScore,
      lessons: lessons.rows.map((row) => ({
        bookingId: row.booking_id,
        startAt: row.start_at.toISOString(),
        lessonType: row.lesson_type,
        topic: { nameEn: row.name_en, nameAr: row.name_ar, nameHe: row.name_he },
        attendance: row.attendance,
        summary: row.summary,
        homework: row.homework,
        feedback: row.feedback,
      })),
      attempts: attempts.rows.map((row) => ({
        id: row.id,
        title: row.title,
        score: Number(row.score),
        submittedAt: row.submitted_at.toISOString(),
        topic: { nameEn: row.name_en, nameAr: row.name_ar, nameHe: row.name_he },
      })),
    })
  } catch (err) {
    next(err)
  }
})

export default router
