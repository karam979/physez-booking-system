import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, appTimezone } from '../validate.js'

const router = Router()

// n8n callbacks authenticate with the shared secret only — never with a user
// session, and they never get general admin privileges (DESIGN.md §7).
function requireSharedSecret(req, res, next) {
  const secret = process.env.N8N_SHARED_SECRET
  const provided = req.get('X-PhysEZ-Secret')
  if (!secret || !provided || provided !== secret) {
    return res.status(401).json(apiError('UNAUTHENTICATED', 'Invalid internal credentials.'))
  }
  next()
}

router.use(requireSharedSecret)

// POST /api/internal/n8n/calendar-result
// n8n reports the outcome of a calendar workflow. A failure leaves the
// booking confirmed and its slot blocked; only the sync status changes, so
// the admin sees a retry state instead of a lost lesson.
router.post('/n8n/calendar-result', async (req, res, next) => {
  try {
    const { bookingId, status, calendarEventId } = req.body ?? {}
    const details = {}
    if (!isUuid(bookingId)) details.bookingId = 'INVALID'
    if (status !== 'synced' && status !== 'failed' && status !== 'deleted') {
      details.status = 'INVALID'
    }
    if (status === 'synced' && (typeof calendarEventId !== 'string' || !calendarEventId)) {
      details.calendarEventId = 'REQUIRED'
    }
    if (Object.keys(details).length > 0) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid callback payload.', details))
    }

    const existing = await query(`SELECT id FROM bookings WHERE id = $1`, [bookingId])
    if (existing.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'Booking not found.'))
    }

    // 'deleted' clears the event id; 'failed' keeps whatever id we had so a
    // retry can still target the existing event.
    const { rows } = await query(
      `UPDATE bookings
       SET calendar_sync_status = $2::text,
           calendar_event_id = CASE
             WHEN $2::text = 'synced' THEN $3::text
             WHEN $2::text = 'deleted' THEN NULL
             ELSE calendar_event_id
           END
       WHERE id = $1
       RETURNING id, calendar_event_id, calendar_sync_status`,
      [bookingId, status, calendarEventId ?? null],
    )

    res.json({
      id: rows[0].id,
      calendarEventId: rows[0].calendar_event_id,
      calendarSyncStatus: rows[0].calendar_sync_status,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/internal/reminders/tomorrow
// Feeds the scheduled Telegram reminder workflow. n8n reads lesson data
// through the API rather than the database, so Express stays the only writer
// and reader of business state (DESIGN.md §3).
router.get('/reminders/tomorrow', async (req, res, next) => {
  try {
    const timezone = appTimezone()
    // "Tomorrow" is a calendar day in APP_TIMEZONE, converted to the UTC
    // instants that bound it — the same day-boundary rule the availability
    // endpoint uses, so reminders and availability never disagree.
    const { rows } = await query(
      `SELECT b.id, b.start_at, b.end_at, b.lesson_type, b.language, b.notes,
              u.name AS student_name, u.email AS student_email,
              t.name_en, t.name_ar, t.name_he
       FROM bookings b
       JOIN users u ON u.id = b.student_id
       JOIN topics t ON t.id = b.topic_id
       WHERE b.status = 'confirmed'
         AND b.start_at >= timezone($1, ((timezone($1, now()))::date + 1)::timestamp)
         AND b.start_at <  timezone($1, ((timezone($1, now()))::date + 2)::timestamp)
       ORDER BY b.start_at`,
      [timezone],
    )

    const dateResult = await query(`SELECT ((timezone($1, now()))::date + 1)::text AS date`, [
      timezone,
    ])

    res.json({
      date: dateResult.rows[0].date,
      timezone,
      count: rows.length,
      lessons: rows.map((row) => ({
        id: row.id,
        startAt: row.start_at.toISOString(),
        endAt: row.end_at.toISOString(),
        lessonType: row.lesson_type,
        language: row.language,
        notes: row.notes,
        student: { name: row.student_name, email: row.student_email },
        topic: { nameEn: row.name_en, nameAr: row.name_ar, nameHe: row.name_he },
      })),
    })
  } catch (err) {
    next(err)
  }
})

export default router
