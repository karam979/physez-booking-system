import { Router } from 'express'
import { query, getPool } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, isDateString, appTimezone, BOOKING_STATUSES } from '../validate.js'
import { serializeBooking } from '../bookings/serialize.js'
import { requestCalendarCreate } from '../bookings/calendar-sync.js'

const router = Router()

function serializeAdminBooking(row) {
  return {
    ...serializeBooking(row),
    student: { id: row.student_id, name: row.student_name, email: row.student_email },
    topic: { nameEn: row.name_en, nameAr: row.name_ar, nameHe: row.name_he },
  }
}

// GET /api/admin/bookings?status=&date=&studentId= — list with filters.
router.get('/', async (req, res, next) => {
  try {
    const { status, date, studentId } = req.query
    const details = {}
    if (status !== undefined && !BOOKING_STATUSES.includes(status)) details.status = 'INVALID'
    if (date !== undefined && !isDateString(date)) details.date = 'INVALID'
    if (studentId !== undefined && !isUuid(studentId)) details.studentId = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid filter parameters.', details))
    }

    const where = []
    const params = []
    if (status !== undefined) {
      params.push(status)
      where.push(`b.status = $${params.length}`)
    }
    if (date !== undefined) {
      // Day boundaries in APP_TIMEZONE, matching the availability endpoint.
      params.push(date, appTimezone())
      where.push(
        `b.start_at >= timezone($${params.length}, $${params.length - 1}::date::timestamp)
         AND b.start_at < timezone($${params.length}, ($${params.length - 1}::date + 1)::timestamp)`,
      )
    }
    if (studentId !== undefined) {
      params.push(studentId)
      where.push(`b.student_id = $${params.length}`)
    }

    const { rows } = await query(
      `SELECT b.*, u.name AS student_name, u.email AS student_email,
              t.name_en, t.name_ar, t.name_he
       FROM bookings b
       JOIN users u ON u.id = b.student_id
       JOIN topics t ON t.id = b.topic_id
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY b.start_at DESC`,
      params,
    )
    res.json(rows.map(serializeAdminBooking))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/bookings/:id/confirm — pending → confirmed.
// Conflict re-check runs inside the transaction as the fast fail; the
// no_overlapping_confirmed_bookings exclusion constraint is the guarantee
// under concurrency — either way the caller gets 409 BOOKING_CONFLICT.
router.patch('/:id/confirm', async (req, res, next) => {
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
    if (booking.status !== 'pending') {
      await client.query('ROLLBACK')
      return res.status(422).json(
        apiError('INVALID_BOOKING_STATUS', 'Only pending bookings can be confirmed.', {
          status: booking.status,
        }),
      )
    }

    const conflict = await client.query(
      `SELECT 1 FROM bookings
       WHERE status = 'confirmed' AND id <> $1
         AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
       LIMIT 1`,
      [id, booking.start_at, booking.end_at],
    )
    if (conflict.rows.length > 0) {
      await client.query('ROLLBACK')
      return res
        .status(409)
        .json(apiError('BOOKING_CONFLICT', 'The selected lesson time is no longer available.'))
    }

    const updated = await client.query(
      `UPDATE bookings SET status = 'confirmed', calendar_sync_status = 'pending'
       WHERE id = $1 RETURNING *`,
      [id],
    )
    await client.query('COMMIT')

    // Calendar work happens only after the slot is safely committed.
    await requestCalendarCreate(updated.rows[0])

    const fresh = await query(`SELECT * FROM bookings WHERE id = $1`, [id])
    res.json(serializeBooking(fresh.rows[0]))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23P01') {
      // Exclusion constraint fired: a concurrent confirm won the slot.
      return res
        .status(409)
        .json(apiError('BOOKING_CONFLICT', 'The selected lesson time is no longer available.'))
    }
    next(err)
  } finally {
    client.release()
  }
})

// PATCH /api/admin/bookings/:id/reject — pending → rejected.
router.patch('/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
    }
    const { rows } = await query(
      `UPDATE bookings SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id],
    )
    if (rows.length === 0) {
      const existing = await query(`SELECT status FROM bookings WHERE id = $1`, [id])
      if (existing.rows.length === 0) {
        return res.status(404).json(apiError('NOT_FOUND', 'Booking not found.'))
      }
      return res.status(422).json(
        apiError('INVALID_BOOKING_STATUS', 'Only pending bookings can be rejected.', {
          status: existing.rows[0].status,
        }),
      )
    }
    res.json(serializeBooking(rows[0]))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/bookings/:id/reschedule — decide the student's request.
// Body: { action: 'approve' | 'reject' }. Approving moves the booking to the
// requested time only if that time is still free; the original booking keeps
// its slot until then (DESIGN.md §4 rescheduling).
router.patch('/:id/reschedule', async (req, res, next) => {
  const { id } = req.params
  const action = req.body?.action
  if (!isUuid(id)) {
    return res
      .status(400)
      .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
  }
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json(
      apiError('VALIDATION_ERROR', 'Action must be "approve" or "reject".', {
        action: 'INVALID',
      }),
    )
  }

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

    const requestResult = await client.query(
      `SELECT * FROM reschedule_requests
       WHERE booking_id = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [id],
    )
    const request = requestResult.rows[0]
    if (!request) {
      await client.query('ROLLBACK')
      return res
        .status(404)
        .json(apiError('RESCHEDULE_NOT_FOUND', 'This booking has no pending reschedule request.'))
    }

    if (action === 'reject') {
      await client.query(`UPDATE reschedule_requests SET status = 'rejected' WHERE id = $1`, [
        request.id,
      ])
      await client.query('COMMIT')
      return res.json({
        booking: serializeBooking(booking),
        rescheduleRequest: { id: request.id, status: 'rejected' },
      })
    }

    const conflict = await client.query(
      `SELECT 1 FROM bookings
       WHERE status = 'confirmed' AND id <> $1
         AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
       LIMIT 1`,
      [id, request.requested_start_at, request.requested_end_at],
    )
    if (conflict.rows.length > 0) {
      await client.query('ROLLBACK')
      return res
        .status(409)
        .json(apiError('BOOKING_CONFLICT', 'The requested lesson time is no longer available.'))
    }

    const moved = await client.query(
      `UPDATE bookings
       SET start_at = $2, end_at = $3,
           calendar_sync_status = CASE WHEN status = 'confirmed' THEN 'pending' ELSE calendar_sync_status END
       WHERE id = $1 RETURNING *`,
      [id, request.requested_start_at, request.requested_end_at],
    )
    await client.query(`UPDATE reschedule_requests SET status = 'approved' WHERE id = $1`, [
      request.id,
    ])
    await client.query('COMMIT')

    // Existing event id travels with the payload so n8n updates in place.
    if (moved.rows[0].status === 'confirmed') {
      await requestCalendarCreate(moved.rows[0])
    }

    const fresh = await query(`SELECT * FROM bookings WHERE id = $1`, [id])
    res.json({
      booking: serializeBooking(fresh.rows[0]),
      rescheduleRequest: { id: request.id, status: 'approved' },
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23P01') {
      return res
        .status(409)
        .json(apiError('BOOKING_CONFLICT', 'The requested lesson time is no longer available.'))
    }
    next(err)
  } finally {
    client.release()
  }
})

export default router
