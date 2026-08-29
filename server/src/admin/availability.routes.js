import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, parseIsoDateTime } from '../validate.js'

const router = Router()

// POST /api/admin/availability — create one availability slot.
router.post('/', async (req, res, next) => {
  try {
    const { startAt, endAt } = req.body ?? {}
    const start = parseIsoDateTime(startAt)
    const end = parseIsoDateTime(endAt)
    const details = {}
    if (!start) details.startAt = 'INVALID'
    if (!end) details.endAt = 'INVALID'
    if (start && end && end <= start) details.endAt = 'BEFORE_START'
    if (Object.keys(details).length > 0) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid availability slot.', details))
    }
    const { rows } = await query(
      `INSERT INTO availability_slots (start_at, end_at) VALUES ($1, $2)
       RETURNING id, start_at, end_at, is_active, created_at`,
      [start, end],
    )
    const row = rows[0]
    res.status(201).json({
      id: row.id,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/availability/:id — remove an unused slot. A slot with a
// pending or confirmed booking inside its window is considered in use.
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Slot id must be a UUID.', { id: 'INVALID' }))
    }
    const slot = await query(`SELECT start_at, end_at FROM availability_slots WHERE id = $1`, [id])
    if (slot.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'Availability slot not found.'))
    }
    const inUse = await query(
      `SELECT 1 FROM bookings
       WHERE status IN ('pending', 'confirmed')
         AND tstzrange(start_at, end_at, '[)') && tstzrange($1, $2, '[)')
       LIMIT 1`,
      [slot.rows[0].start_at, slot.rows[0].end_at],
    )
    if (inUse.rows.length > 0) {
      return res
        .status(409)
        .json(
          apiError(
            'SLOT_IN_USE',
            'The slot has pending or confirmed bookings and cannot be removed.',
          ),
        )
    }
    await query(`DELETE FROM availability_slots WHERE id = $1`, [id])
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
