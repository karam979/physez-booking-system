import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import bookingRoutes from './bookings.routes.js'
import lifecycleRoutes from './lifecycle.routes.js'
import filesRoutes from './files.routes.js'

const router = Router()

router.use(requireAuth)
router.use(lifecycleRoutes)
router.use(filesRoutes)
router.use(bookingRoutes)

export default router
