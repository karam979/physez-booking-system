import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid } from '../validate.js'
import {
  REPORT_TARGET_TYPES,
  REPORT_REASON_MIN_LENGTH,
  REPORT_REASON_MAX_LENGTH,
} from './rewards.js'

const router = Router()

const UNIQUE_VIOLATION = '23505'

// Each reportable kind maps to the table the target must exist in. The table
// name is only ever read from this allow-list, never from the request body.
const TARGET_TABLES = {
  question: 'community_questions',
  answer: 'community_answers',
}

// POST /api/community/reports — a student flags a question or an answer.
// Reporting never changes the content or any credits; it only queues the item
// for an admin to look at through /api/admin/community/reports.
router.post('/', async (req, res, next) => {
  try {
    // The database columns are target_type/target_id, but the JSON API stays
    // camelCase like every other endpoint, so both spellings are accepted.
    const body = req.body ?? {}
    const targetType = body.targetType ?? body.target_type
    const targetId = body.targetId ?? body.target_id
    const { reason } = body

    const details = {}
    if (!REPORT_TARGET_TYPES.includes(targetType)) details.targetType = 'INVALID'
    if (!isUuid(targetId)) details.targetId = 'INVALID'
    if (
      typeof reason !== 'string' ||
      reason.trim().length < REPORT_REASON_MIN_LENGTH ||
      reason.length > REPORT_REASON_MAX_LENGTH
    ) {
      details.reason = 'REQUIRED'
    }
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid report.', details))
    }

    const target = await query(`SELECT id FROM ${TARGET_TABLES[targetType]} WHERE id = $1`, [
      targetId,
    ])
    if (target.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'The reported content does not exist.'))
    }

    let row
    try {
      const inserted = await query(
        `INSERT INTO community_reports (reporter_user_id, target_type, target_id, reason)
         VALUES ($1, $2, $3, $4)
         RETURNING id, target_type, target_id, status, created_at`,
        [req.user.id, targetType, targetId, reason.trim()],
      )
      row = inserted.rows[0]
    } catch (err) {
      // The partial unique index is the guard, so two simultaneous submits
      // cannot both land: one open report per student per target.
      if (err.code === UNIQUE_VIOLATION) {
        return res
          .status(409)
          .json(apiError('ALREADY_REPORTED', 'You have already reported this content.'))
      }
      throw err
    }

    res.status(201).json({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

export default router
