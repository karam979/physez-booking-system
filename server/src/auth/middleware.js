import jwt from 'jsonwebtoken'
import { apiError } from '../errors.js'

export const AUTH_COOKIE = 'physez_token'

export function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE]
  if (!token) {
    return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication is required.'))
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    return res
      .status(401)
      .json(apiError('UNAUTHENTICATED', 'Authentication is invalid or expired.'))
  }
}

// Usage: router.get('/x', requireAuth, requireRole('admin'), handler)
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(apiError('UNAUTHENTICATED', 'Authentication is required.'))
    }
    if (req.user.role !== role) {
      return res.status(403).json(apiError('FORBIDDEN', 'You do not have access to this resource.'))
    }
    next()
  }
}
