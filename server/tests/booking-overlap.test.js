import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { query, closePool } from '../src/db.js'

// The critical invariant (DESIGN.md §4): the no_overlapping_confirmed_bookings
// exclusion constraint must reject overlapping confirmed bookings at the
// database level, regardless of what the API checks.

let studentId
let topicId

async function insertBooking({ startAt, endAt, status }) {
  return query(
    `INSERT INTO bookings (student_id, topic_id, lesson_type, language, start_at, end_at, status)
     VALUES ($1, $2, 'zoom', 'en', $3, $4, $5)
     RETURNING id`,
    [studentId, topicId, startAt, endAt, status],
  )
}

beforeEach(async () => {
  await query('TRUNCATE users, topics, bookings CASCADE')
  const user = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Overlap Tester', 'overlap@example.com', 'x', 'student')
     RETURNING id`,
  )
  studentId = user.rows[0].id
  const topic = await query(
    `INSERT INTO topics (name_en, name_ar, name_he) VALUES ('Mechanics', 'ميكانيكا', 'מכניקה')
     RETURNING id`,
  )
  topicId = topic.rows[0].id
})

afterAll(async () => {
  await closePool()
})

describe('no_overlapping_confirmed_bookings exclusion constraint', () => {
  const t = (h, m = 0) =>
    `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`

  it('rejects a confirmed booking overlapping an existing confirmed booking', async () => {
    await insertBooking({ startAt: t(10), endAt: t(11), status: 'confirmed' })
    await expect(
      insertBooking({ startAt: t(10, 30), endAt: t(11, 30), status: 'confirmed' }),
    ).rejects.toMatchObject({
      code: '23P01', // exclusion_violation
      constraint: 'no_overlapping_confirmed_bookings',
    })
  })

  it('rejects an identical confirmed time slot', async () => {
    await insertBooking({ startAt: t(10), endAt: t(11), status: 'confirmed' })
    await expect(
      insertBooking({ startAt: t(10), endAt: t(11), status: 'confirmed' }),
    ).rejects.toMatchObject({ code: '23P01' })
  })

  it('allows back-to-back confirmed bookings ([) range: end == next start)', async () => {
    await insertBooking({ startAt: t(10), endAt: t(11), status: 'confirmed' })
    const res = await insertBooking({ startAt: t(11), endAt: t(12), status: 'confirmed' })
    expect(res.rows[0].id).toBeDefined()
  })

  it('allows a pending booking to overlap a confirmed one (constraint is WHERE confirmed)', async () => {
    await insertBooking({ startAt: t(10), endAt: t(11), status: 'confirmed' })
    const res = await insertBooking({ startAt: t(10, 30), endAt: t(11, 30), status: 'pending' })
    expect(res.rows[0].id).toBeDefined()
  })

  it('blocks confirming a pending booking that would overlap (UPDATE path)', async () => {
    await insertBooking({ startAt: t(10), endAt: t(11), status: 'confirmed' })
    const pending = await insertBooking({ startAt: t(10, 30), endAt: t(11, 30), status: 'pending' })
    await expect(
      query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1`, [pending.rows[0].id]),
    ).rejects.toMatchObject({ code: '23P01' })
  })
})
