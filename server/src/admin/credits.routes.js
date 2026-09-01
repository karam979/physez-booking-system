import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid } from '../validate.js'
import { getBalances, listTransactions, adjustCredits } from '../credits/service.js'
import { CREDIT_KINDS, ADJUSTMENT_REASON_MAX_LENGTH } from '../credits/constants.js'

const router = Router()

const MAX_ADJUSTMENT = 10000

async function loadStudent(userId) {
  const { rows } = await query(
    `SELECT id, name, email, role FROM users WHERE id = $1 AND role = 'student'`,
    [userId],
  )
  return rows[0]
}

// GET /api/admin/credits/students?search= — pick a student to inspect.
router.get('/students', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const { rows } = await query(
      `SELECT u.id, u.name, u.email,
              COALESCE(SUM(c.amount), 0)::int AS total
       FROM users u
       LEFT JOIN credit_transactions c ON c.user_id = u.id
       WHERE u.role = 'student'
         AND ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
       GROUP BY u.id
       ORDER BY u.name
       LIMIT 50`,
      [search],
    )
    res.json(
      rows.map((row) => ({ id: row.id, name: row.name, email: row.email, total: row.total })),
    )
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/credits/students/:userId — balances plus history.
router.get('/students/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    if (!isUuid(userId)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Student id must be a UUID.', { userId: 'INVALID' }))
    }
    const student = await loadStudent(userId)
    if (!student) {
      return res.status(404).json(apiError('NOT_FOUND', 'Student not found.'))
    }
    const balances = await getBalances(userId)
    const history = await listTransactions(userId, { limit: 50, offset: 0 })
    res.json({
      student: { id: student.id, name: student.name, email: student.email },
      // Spread last-to-first matters here: `total` is the balance, and the
      // number of ledger rows is reported separately.
      ...balances,
      transactions: history.transactions,
      transactionCount: history.total,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/credits/students/:userId/adjustments
// A reason is mandatory and stored on the transaction; past rows are never
// edited, so the history stays an audit trail.
router.post('/students/:userId/adjustments', async (req, res, next) => {
  try {
    const { userId } = req.params
    const { amount, creditKind, reason } = req.body ?? {}

    const details = {}
    if (!isUuid(userId)) details.userId = 'INVALID'
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUSTMENT) {
      details.amount = 'INVALID'
    }
    if (!CREDIT_KINDS.includes(creditKind)) details.creditKind = 'INVALID'
    if (
      typeof reason !== 'string' ||
      reason.trim().length < 3 ||
      reason.length > ADJUSTMENT_REASON_MAX_LENGTH
    ) {
      details.reason = 'REQUIRED'
    }
    if (Object.keys(details).length > 0) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid credit adjustment.', details))
    }

    const student = await loadStudent(userId)
    if (!student) {
      return res.status(404).json(apiError('NOT_FOUND', 'Student not found.'))
    }

    const result = await adjustCredits({
      userId,
      amount,
      creditKind,
      reason: reason.trim(),
      adminId: req.user.id,
    })
    if (result.error === 'INSUFFICIENT_CREDITS') {
      return res.status(422).json(
        apiError('INSUFFICIENT_CREDITS', 'The student does not have enough credits to remove.', {
          available: result.available,
        }),
      )
    }
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
})

export default router
