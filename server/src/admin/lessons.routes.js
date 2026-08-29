import { Router } from 'express'
import { getPool, query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, SUMMARISABLE_STATUSES } from '../validate.js'

const router = Router()

function serializeLesson(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    attendance: row.attendance,
    summary: row.summary,
    homework: row.homework,
    feedback: row.feedback,
    createdAt: row.created_at.toISOString(),
  }
}

const ATTENDANCE_VALUES = ['present', 'absent', 'late']

function validate(body) {
  const { attendance, summary, homework, feedback } = body ?? {}
  const details = {}
  if (!ATTENDANCE_VALUES.includes(attendance)) details.attendance = 'INVALID'
  for (const [field, value] of Object.entries({ summary, homework, feedback })) {
    if (value != null && (typeof value !== 'string' || value.length > 5000)) {
      details[field] = 'INVALID'
    }
  }
  return details
}

// POST /api/admin/bookings/:id/lesson — create or update the one lesson
// record for a booking and mark the booking completed. lessons.booking_id is
// UNIQUE, so the upsert is the constraint doing the work.
router.post('/:id/lesson', async (req, res, next) => {
  const { id } = req.params
  if (!isUuid(id)) {
    return res
      .status(400)
      .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
  }
  const details = validate(req.body)
  if (Object.keys(details).length > 0) {
    return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid lesson summary.', details))
  }

  const { attendance, summary, homework, feedback } = req.body
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    const bookingResult = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [
      id,
    ])
    const booking = bookingResult.rows[0]
    if (!booking) {
      await client.query('ROLLBACK')
      return res.status(404).json(apiError('NOT_FOUND', 'Booking not found.'))
    }
    if (!SUMMARISABLE_STATUSES.includes(booking.status)) {
      await client.query('ROLLBACK')
      return res.status(422).json(
        apiError('INVALID_BOOKING_STATUS', 'Only a confirmed lesson can be summarised.', {
          status: booking.status,
        }),
      )
    }

    const lesson = await client.query(
      `INSERT INTO lessons (booking_id, attendance, summary, homework, feedback)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (booking_id) DO UPDATE
         SET attendance = EXCLUDED.attendance,
             summary = EXCLUDED.summary,
             homework = EXCLUDED.homework,
             feedback = EXCLUDED.feedback
       RETURNING *`,
      [id, attendance, summary ?? null, homework ?? null, feedback ?? null],
    )
    await client.query(`UPDATE bookings SET status = 'completed' WHERE id = $1`, [id])
    await client.query('COMMIT')

    res.status(201).json(serializeLesson(lesson.rows[0]))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
})

// GET /api/admin/bookings/:id/lesson — load an existing summary for editing.
router.get('/:id/lesson', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
    }
    const { rows } = await query(`SELECT * FROM lessons WHERE booking_id = $1`, [id])
    if (rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'No lesson summary yet.'))
    }
    res.json(serializeLesson(rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
