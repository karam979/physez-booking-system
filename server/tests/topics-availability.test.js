import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'
import { truncateAll, createTopic, createSlot, t, TEST_DATE } from './helpers.js'

beforeEach(truncateAll)
afterAll(closePool)

describe('GET /api/topics', () => {
  it('lists only active topics, public', async () => {
    const activeId = await createTopic()
    await createTopic({ active: false })
    const res = await request(app).get('/api/topics')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
      id: activeId,
      nameEn: 'Mechanics',
      nameAr: 'ميكانيكا',
      nameHe: 'מכניקה',
      educationLevel: 'High school',
    })
  })
})

describe('GET /api/availability', () => {
  it('requires a valid date param', async () => {
    for (const bad of ['', '2026-13-01', '2026-02-30', 'not-a-date']) {
      const res = await request(app).get('/api/availability').query({ date: bad })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('returns active slots for the date, ignoring inactive and other days', async () => {
    await createSlot(t(10), t(14))
    await createSlot(t(16), t(18), { isActive: false })
    await createSlot('2026-09-02T10:00:00Z', '2026-09-02T12:00:00Z')
    const res = await request(app).get('/api/availability').query({ date: TEST_DATE })
    expect(res.status).toBe(200)
    expect(res.body.windows).toEqual([{ startAt: t(10), endAt: t(14) }])
  })

  it('subtracts confirmed bookings but not pending ones', async () => {
    await createSlot(t(10), t(14))
    const topicId = await createTopic()
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('S', 'avail-s@example.com', 'x', 'student') RETURNING id`,
    )
    const insert = (start, end, status) =>
      query(
        `INSERT INTO bookings (student_id, topic_id, lesson_type, language, start_at, end_at, status)
         VALUES ($1, $2, 'zoom', 'en', $3, $4, $5)`,
        [rows[0].id, topicId, start, end, status],
      )
    await insert(t(11), t(12), 'confirmed')
    await insert(t(12), t(13), 'pending')

    const res = await request(app).get('/api/availability').query({ date: TEST_DATE })
    expect(res.body.windows).toEqual([
      { startAt: t(10), endAt: t(11) },
      { startAt: t(12), endAt: t(14) },
    ])
  })

  it('filters windows by durationMinutes', async () => {
    await createSlot(t(10), t(14))
    const topicId = await createTopic()
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('S', 'avail-d@example.com', 'x', 'student') RETURNING id`,
    )
    await query(
      `INSERT INTO bookings (student_id, topic_id, lesson_type, language, start_at, end_at, status)
       VALUES ($1, $2, 'zoom', 'en', $3, $4, 'confirmed')`,
      [rows[0].id, topicId, t(11), t(12, 30)],
    )
    // Free: [10:00-11:00] (60m) and [12:30-14:00] (90m).
    const res = await request(app)
      .get('/api/availability')
      .query({ date: TEST_DATE, durationMinutes: 90 })
    expect(res.body.windows).toEqual([{ startAt: t(12, 30), endAt: t(14) }])

    const res60 = await request(app)
      .get('/api/availability')
      .query({ date: TEST_DATE, durationMinutes: 60 })
    expect(res60.body.windows).toHaveLength(2)
  })

  it('rejects a non-integer durationMinutes', async () => {
    const res = await request(app)
      .get('/api/availability')
      .query({ date: TEST_DATE, durationMinutes: 'abc' })
    expect(res.status).toBe(400)
    expect(res.body.error.details.durationMinutes).toBe('INVALID')
  })
})
