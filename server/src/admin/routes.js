import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/middleware.js'
import bookingsRoutes from './bookings.routes.js'
import lessonsRoutes from './lessons.routes.js'
import availabilityRoutes from './availability.routes.js'

const router = Router()

// Every /api/admin/* route requires an authenticated admin.
router.use(requireAuth, requireRole('admin'))
router.use('/bookings', lessonsRoutes)
router.use('/bookings', bookingsRoutes)
router.use('/availability', availabilityRoutes)

export default router
