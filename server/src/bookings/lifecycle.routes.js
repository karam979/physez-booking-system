import { Router } from 'express'
import { query, getPool } from '../db.js'
import { apiError } from '../errors.js'
import { requireRole } from '../auth/middleware.js'
import {
  isUuid,
  parseIsoDateTime,
  isValidDuration,
  CANCELLABLE_STATUSES,
  RESCHEDULABLE_STATUSES,
} from '../validate.js'
import { serializeBooking } from './serialize.js'
import { requestCalendarDelete } from './calendar-sync.js'

const router = Router()

// PATCH /api/bookings/:id/cancel — owner or admin.
// Cancelling a confirmed lesson frees its slot and asks n8n to remove the
// calendar event; the DB state is authoritative either way.
router.patch('/:id/cancel', async (req, res, next) => {
  const { id } = req.params
  if (!isUuid(id)) {
    return res
      .status(400)
      .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
  }
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [id])
    const booking = rows[0]
    if (!booking) {
      await client.query('ROLLBACK')
      return res.status(404).json(apiError('NOT_FOUND', 'Booking not found.'))
    }
    if (req.user.role !== 'admin' && booking.student_id !== req.user.id) {
      await client.query('ROLLBACK')
      return res.status(403).json(apiError('FORBIDDEN', 'You do not have access to this booking.'))
    }
    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
      await client.query('ROLLBACK')
      return res.status(422).json(
        apiError('INVALID_BOOKING_STATUS', 'Only pending or confirmed bookings can be cancelled.', {
          status: booking.status,
        }),
      )
    }

    const updated = await client.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [id],
    )
    // A pending reschedule request is meaningless once the lesson is gone.
    await client.query(
      `UPDATE reschedule_requests SET status = 'rejected'
       WHERE booking_id = $1 AND status = 'pending'`,
      [id],
    )
    await client.query('COMMIT')

    await requestCalendarDelete(updated.rows[0])

    const fresh = await query(`SELECT * FROM bookings WHERE id = $1`, [id])
    res.json(serializeBooking(fresh.rows[0]))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
})

// POST /api/bookings/:id/reschedule — student asks for a new time.
// This only records the request: the original booking keeps its status and
// its slot until an admin approves (DESIGN.md §4).
router.post('/:id/reschedule', requireRole('student'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { startAt, durationMinutes } = req.body ?? {}

    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
    }
    const details = {}
    const start = parseIsoDateTime(startAt)
    if (!start) details.startAt = 'INVALID'
    if (durationMinutes != null && !isValidDuration(durationMinutes)) {
      details.durationMinutes = 'INVALID'
    }
    if (Object.keys(details).length > 0) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid reschedule request.', details))
    }

    const bookingResult = await query(`SELECT * FROM bookings WHERE id = $1`, [id])
    const booking = bookingResult.rows[0]
    if (!booking) {
      return res.status(404).json(apiError('NOT_FOUND', 'Booking not found.'))
    }
    if (booking.student_id !== req.user.id) {
      return res.status(403).json(apiError('FORBIDDEN', 'You do not have access to this booking.'))
    }
    if (!RESCHEDULABLE_STATUSES.includes(booking.status)) {
      return res.status(422).json(
        apiError(
          'INVALID_BOOKING_STATUS',
          'Only pending or confirmed bookings can be rescheduled.',
          {
            status: booking.status,
          },
        ),
      )
    }
    if (start <= new Date()) {
      return res.status(422).json(
        apiError('START_IN_PAST', 'The lesson start time must be in the future.', {
          startAt: 'PAST',
        }),
      )
    }

    // Keep the original lesson length unless the student asks for a new one.
    const minutes = durationMinutes ?? Math.round((booking.end_at - booking.start_at) / 60000)
    const end = new Date(start.getTime() + minutes * 60 * 1000)

    const existing = await query(
      `SELECT 1 FROM reschedule_requests WHERE booking_id = $1 AND status = 'pending' LIMIT 1`,
      [id],
    )
    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json(apiError('RESCHEDULE_PENDING', 'A reschedule request is already awaiting review.'))
    }

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

    // Fast fail only — the authoritative check runs when the admin approves.
    const conflict = await query(
      `SELECT 1 FROM bookings
       WHERE status = 'confirmed' AND id <> $1
         AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
       LIMIT 1`,
      [id, start, end],
    )
    if (conflict.rows.length > 0) {
      return res
        .status(409)
        .json(apiError('BOOKING_CONFLICT', 'The requested lesson time is not available.'))
    }

    const { rows } = await query(
      `INSERT INTO reschedule_requests (booking_id, requested_start_at, requested_end_at)
       VALUES ($1, $2, $3)
       RETURNING id, requested_start_at, requested_end_at, status, created_at`,
      [id, start, end],
    )
    res.status(201).json({
      id: rows[0].id,
      bookingId: id,
      requestedStartAt: rows[0].requested_start_at.toISOString(),
      requestedEndAt: rows[0].requested_end_at.toISOString(),
      status: rows[0].status,
    })
  } catch (err) {
    next(err)
  }
})

export default router
