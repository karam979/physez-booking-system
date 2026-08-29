import { Router } from 'express'
import { apiError } from '../errors.js'
import { isDateString } from '../validate.js'
import { freeWindowsForDate } from './service.js'

const router = Router()

// GET /api/availability?date=YYYY-MM-DD[&durationMinutes=N] — public.
// Returns free windows (active slots minus confirmed bookings). With
// durationMinutes, only windows the lesson actually fits in are returned.
router.get('/', async (req, res, next) => {
  try {
    const { date, durationMinutes } = req.query
    if (!isDateString(date)) {
      return res.status(400).json(
        apiError('VALIDATION_ERROR', 'Query param "date" must be a valid YYYY-MM-DD date.', {
          date: 'INVALID',
        }),
      )
    }
    let duration = null
    if (durationMinutes !== undefined) {
      duration = Number(durationMinutes)
      if (!Number.isInteger(duration) || duration < 1) {
        return res.status(400).json(
          apiError(
            'VALIDATION_ERROR',
            'Query param "durationMinutes" must be a positive integer.',
            {
              durationMinutes: 'INVALID',
            },
          ),
        )
      }
    }
    const windows = await freeWindowsForDate(date, duration)
    res.json({ date, durationMinutes: duration, windows })
  } catch (err) {
    next(err)
  }
})

export default router
