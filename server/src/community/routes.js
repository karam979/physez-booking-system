import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import statsRoutes from './stats.routes.js'
import answersRoutes from './answers.routes.js'
import questionsRoutes from './questions.routes.js'
import reportsRoutes from './reports.routes.js'

const router = Router()

// The community is a student space; admins moderate through /api/admin.
router.use(requireAuth, requireRole('student'))

// Mounted before the questions router so /me/stats is not read as an id.
router.use(statsRoutes)
router.use(answersRoutes)
router.use('/questions', questionsRoutes)
router.use('/reports', reportsRoutes)

export default router
