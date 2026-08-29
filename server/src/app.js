import express from 'express'
import cookieParser from 'cookie-parser'
import { apiError } from './errors.js'
import { query } from './db.js'
import authRoutes from './auth/routes.js'
import topicsRoutes from './topics/routes.js'
import availabilityRoutes from './availability/routes.js'
import bookingsRoutes from './bookings/routes.js'
import filesRoutes from './files/routes.js'
import quizzesRoutes from './quizzes/routes.js'
import progressRoutes from './progress/routes.js'
import adminRoutes from './admin/routes.js'
import internalRoutes from './internal/routes.js'

const app = express()

// One reverse proxy (Nginx or Caddy) sits in front in production. Without
// this, every request looks like it comes from the proxy and the per-IP rate
// limits would throttle all users together.
app.set('trust proxy', 1)

app.use(express.json())
app.use(cookieParser())

// Smoke-test endpoint (DESIGN.md §8): liveness plus database reachability.
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1')
    res.json({ status: 'ok', database: 'up' })
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/topics', topicsRoutes)
app.use('/api/availability', availabilityRoutes)
app.use('/api/bookings', bookingsRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/quizzes', quizzesRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/internal', internalRoutes)

// Unknown /api routes → 404 in the canonical shape.
app.use('/api', (req, res) => {
  res.status(404).json(apiError('NOT_FOUND', 'The requested resource does not exist.'))
})

// Malformed JSON bodies surface here as a SyntaxError from express.json().
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json(apiError('VALIDATION_ERROR', 'Request body is not valid JSON.'))
  }
  next(err)
})

// Last-resort error handler — same shape, no internals leaked. Express only
// treats 4-arg middleware as an error handler, so _next must stay.
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json(apiError('INTERNAL_ERROR', 'An unexpected error occurred.'))
})

export default app
