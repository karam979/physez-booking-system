import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { AUTH_COOKIE, requireAuth } from './middleware.js'
import { loginLimiter, registerLimiter } from '../middleware/rate-limit.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LANGUAGES = ['en', 'ar', 'he']
const BCRYPT_ROUNDS = 12

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  })
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    // Secure in production (HTTPS); localhost dev is plain http.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  })
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    preferredLanguage: row.preferred_language,
  }
}

// POST /api/auth/register — always creates a student (admins are seeded).
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { name, email, password, preferredLanguage } = req.body ?? {}
    const details = {}
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
      details.name = 'INVALID'
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 255) {
      details.email = 'INVALID'
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      details.password = 'TOO_SHORT'
    }
    if (preferredLanguage != null && !LANGUAGES.includes(preferredLanguage)) {
      details.preferredLanguage = 'INVALID'
    }
    if (Object.keys(details).length > 0) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid registration data.', details))
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const normalizedEmail = email.trim().toLowerCase()

    let row
    try {
      const result = await query(
        `INSERT INTO users (name, email, password_hash, role, preferred_language)
         VALUES ($1, $2, $3, 'student', $4)
         RETURNING id, name, email, role, preferred_language`,
        [name.trim(), normalizedEmail, passwordHash, preferredLanguage ?? null],
      )
      row = result.rows[0]
    } catch (err) {
      if (err.code === '23505') {
        return res
          .status(409)
          .json(apiError('EMAIL_TAKEN', 'An account with this email already exists.'))
      }
      throw err
    }

    setAuthCookie(res, signToken(row))
    res.status(201).json(publicUser(row))
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Email and password are required.'))
    }

    const result = await query(
      `SELECT id, name, email, password_hash, role, preferred_language
       FROM users WHERE email = $1`,
      [email.trim().toLowerCase()],
    )
    const row = result.rows[0]
    // Same code for unknown email and wrong password — no account enumeration.
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res
        .status(401)
        .json(apiError('INVALID_CREDENTIALS', 'Email or password is incorrect.'))
    }

    setAuthCookie(res, signToken(row))
    res.json(publicUser(row))
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' })
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, preferred_language FROM users WHERE id = $1`,
      [req.user.id],
    )
    const row = result.rows[0]
    if (!row) {
      // Token valid but the account no longer exists.
      res.clearCookie(AUTH_COOKIE, { path: '/' })
      return res.status(401).json(apiError('UNAUTHENTICATED', 'Account not found.'))
    }
    res.json(publicUser(row))
  } catch (err) {
    next(err)
  }
})

export default router
