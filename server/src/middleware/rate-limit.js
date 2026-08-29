import { rateLimit } from 'express-rate-limit'
import { apiError } from '../errors.js'

// Rate limits on the endpoints an attacker would hammer (DESIGN.md §7):
// credential guessing, account spam, booking spam and upload abuse.
// Limits are per client IP, which only works if Express trusts the reverse
// proxy — see the trust proxy setting in app.js.

const RATE_LIMITED = apiError('RATE_LIMITED', 'Too many requests. Please wait and try again.')

function limiter({ windowMs, max, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit: max,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Tests would otherwise trip the limiter across cases in one process.
    skip: () => process.env.NODE_ENV === 'test',
    handler: (req, res) => res.status(429).json(RATE_LIMITED),
  })
}

// Failed logins only: a person typing a wrong password a few times is normal,
// a script trying hundreds is not.
export const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
})

export const registerLimiter = limiter({ windowMs: 60 * 60 * 1000, max: 5 })

export const bookingLimiter = limiter({ windowMs: 60 * 60 * 1000, max: 20 })

export const uploadLimiter = limiter({ windowMs: 60 * 60 * 1000, max: 30 })
