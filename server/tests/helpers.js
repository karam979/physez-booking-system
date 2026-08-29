import request from 'supertest'
import bcrypt from 'bcryptjs'
import app from '../src/app.js'
import { query } from '../src/db.js'

let counter = 0

export async function truncateAll() {
  await query('TRUNCATE users, topics, availability_slots, bookings, reschedule_requests CASCADE')
}

// Registers a fresh student via the API; returns an agent holding its cookie.
export async function studentAgent() {
  const agent = request.agent(app)
  const email = `student${++counter}@example.com`
  const res = await agent.post('/api/auth/register').send({
    name: 'Test Student',
    email,
    password: 'correct-horse-battery',
  })
  if (res.status !== 201) throw new Error(`student register failed: ${res.status}`)
  return { agent, user: res.body }
}

// Admins are seeded, not registered — insert directly, then log in.
export async function adminAgent() {
  const email = `admin${++counter}@example.com`
  const hash = await bcrypt.hash('admin-password-1', 4)
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Test Admin', $1, $2, 'admin') RETURNING id`,
    [email, hash],
  )
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email, password: 'admin-password-1' })
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`)
  return { agent, adminId: rows[0].id }
}

export async function createTopic({ active = true } = {}) {
  const { rows } = await query(
    `INSERT INTO topics (name_en, name_ar, name_he, education_level, active)
     VALUES ('Mechanics', 'ميكانيكا', 'מכניקה', 'High school', $1) RETURNING id`,
    [active],
  )
  return rows[0].id
}

export async function createSlot(startAt, endAt, { isActive = true } = {}) {
  const { rows } = await query(
    `INSERT INTO availability_slots (start_at, end_at, is_active)
     VALUES ($1, $2, $3) RETURNING id`,
    [startAt, endAt, isActive],
  )
  return rows[0].id
}

// ISO instant on the fixed future test date 2026-09-01 (UTC).
export const t = (h, m = 0) =>
  `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`

export const TEST_DATE = '2026-09-01'
