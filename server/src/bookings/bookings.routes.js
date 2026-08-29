import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { requireRole } from '../auth/middleware.js'
import { isUuid, parseIsoDateTime, isValidDuration, LANGUAGES, LESSON_TYPES } from '../validate.js'
import { serializeBooking } from './serialize.js'
import { notifyBookingCreated } from './calendar-sync.js'
import { bookingLimiter } from '../middleware/rate-limit.js'

const router = Router()

// POST /api/bookings — student creates a PENDING booking.
// end_at is derived server-side from startAt + durationMinutes (DESIGN.md §4).
router.post('/', bookingLimiter, requireRole('student'), async (req, res, next) => {
  try {
    const { lessonType, durationMinutes, language, topicId, startAt, notes } = req.body ?? {}

    const details = {}
    if (!LESSON_TYPES.includes(lessonType)) details.lessonType = 'INVALID'
    if (!isValidDuration(durationMinutes)) details.durationMinutes = 'INVALID'
    if (!LANGUAGES.includes(language)) details.language = 'INVALID'
    if (!isUuid(topicId)) details.topicId = 'INVALID'
    const start = parseIsoDateTime(startAt)
    if (!start) details.startAt = 'INVALID'
    if (notes != null && (typeof notes !== 'string' || notes.length > 2000))
      details.notes = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid booking data.', details))
    }
    if (start <= new Date()) {
      return res.status(422).json(
        apiError('START_IN_PAST', 'The lesson start time must be in the future.', {
          startAt: 'PAST',
        }),
      )
    }

    const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

    const topic = await query(
      `SELECT id, name_en, name_ar, name_he FROM topics WHERE id = $1 AND active = true`,
      [topicId],
    )
    if (topic.rows.length === 0) {
      return res
        .status(422)
        .json(apiError('TOPIC_NOT_FOUND', 'The selected topic does not exist or is inactive.'))
    }

    // The requested interval must fit inside a single active availability slot.
    const slot = await query(
      `SELECT 1 FROM availability_slots
       WHERE is_active = true AND start_at <= $1 AND end_at >= $2 LIMIT 1`,
      [start, end],
    )
    if (slot.rows.length === 0) {
      return res
        .status(409)
        .json(
          apiError(
            'SLOT_UNAVAILABLE',
            'The selected time is not within the available lesson hours.',
          ),
        )
    }

    // Fast fail against already-confirmed lessons (the DB exclusion constraint
    // remains the guarantee at confirmation time).
    const conflict = await query(
      `SELECT 1 FROM bookings
       WHERE status = 'confirmed'
         AND tstzrange(start_at, end_at, '[)') && tstzrange($1, $2, '[)')
       LIMIT 1`,
      [start, end],
    )
    if (conflict.rows.length > 0) {
      return res
        .status(409)
        .json(apiError('BOOKING_CONFLICT', 'The selected lesson time is no longer available.'))
    }

    const { rows } = await query(
      `INSERT INTO bookings (student_id, topic_id, lesson_type, language, start_at, end_at, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [req.user.id, topicId, lessonType, language, start, end, notes ?? null],
    )

    const student = await query(`SELECT name, email FROM users WHERE id = $1`, [req.user.id])
    await notifyBookingCreated(rows[0], student.rows[0], {
      nameEn: topic.rows[0].name_en,
      nameAr: topic.rows[0].name_ar,
      nameHe: topic.rows[0].name_he,
    })

    res.status(201).json(serializeBooking(rows[0]))
  } catch (err) {
    next(err)
  }
})

// GET /api/bookings/me — current student's bookings, newest lesson first.
router.get('/me', requireRole('student'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, t.name_en, t.name_ar, t.name_he
       FROM bookings b JOIN topics t ON t.id = b.topic_id
       WHERE b.student_id = $1
       ORDER BY b.start_at DESC`,
      [req.user.id],
    )
    res.json(
      rows.map((r) => ({
        ...serializeBooking(r),
        topic: { nameEn: r.name_en, nameAr: r.name_ar, nameHe: r.name_he },
      })),
    )
  } catch (err) {
    next(err)
  }
})

// GET /api/bookings/:id — owner or admin only.
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
    }
    const { rows } = await query(
      `SELECT b.*, t.name_en, t.name_ar, t.name_he
       FROM bookings b JOIN topics t ON t.id = b.topic_id
       WHERE b.id = $1`,
      [id],
    )
    const row = rows[0]
    if (!row) {
      return res.status(404).json(apiError('NOT_FOUND', 'Booking not found.'))
    }
    if (req.user.role !== 'admin' && row.student_id !== req.user.id) {
      return res.status(403).json(apiError('FORBIDDEN', 'You do not have access to this booking.'))
    }

    // The pending reschedule request, when one is awaiting an admin decision.
    const reschedule = await query(
      `SELECT id, requested_start_at, requested_end_at, status, created_at
       FROM reschedule_requests
       WHERE booking_id = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [id],
    )

    res.json({
      ...serializeBooking(row),
      topic: { nameEn: row.name_en, nameAr: row.name_ar, nameHe: row.name_he },
      rescheduleRequest: reschedule.rows[0]
        ? {
            id: reschedule.rows[0].id,
            requestedStartAt: reschedule.rows[0].requested_start_at.toISOString(),
            requestedEndAt: reschedule.rows[0].requested_end_at.toISOString(),
            status: reschedule.rows[0].status,
          }
        : null,
    })
  } catch (err) {
    next(err)
  }
})

export default router
