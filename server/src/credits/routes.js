import { Router } from 'express'
import { apiError } from '../errors.js'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { getBalances, listTransactions } from './service.js'

const router = Router()

router.use(requireAuth, requireRole('student'))

const MAX_PAGE_SIZE = 100

function parsePaging(req) {
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit)
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) return { error: 'limit' }
  if (!Number.isInteger(offset) || offset < 0) return { error: 'offset' }
  return { limit, offset }
}

// GET /api/credits/me — wallet summary plus the newest few entries, so the
// dashboard needs one request.
router.get('/me', async (req, res, next) => {
  try {
    const balances = await getBalances(req.user.id)
    const recent = await listTransactions(req.user.id, { limit: 5, offset: 0 })
    res.json({ ...balances, recentTransactions: recent.transactions })
  } catch (err) {
    next(err)
  }
})

// GET /api/credits/me/transactions?limit=&offset= — paginated history.
router.get('/me/transactions', async (req, res, next) => {
  try {
    const paging = parsePaging(req)
    if (paging.error) {
      return res.status(400).json(
        apiError('VALIDATION_ERROR', 'Invalid pagination parameters.', {
          [paging.error]: 'INVALID',
        }),
      )
    }
    res.json(await listTransactions(req.user.id, paging))
  } catch (err) {
    next(err)
  }
})

export default router
