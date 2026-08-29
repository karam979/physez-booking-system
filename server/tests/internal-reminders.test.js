import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'
import { truncateAll, adminAgent, createTopic } from './helpers.js'

// The suite runs with APP_TIMEZONE=UTC (tests/setup-env.js), so "tomorrow"
// here is tomorrow in UTC.
const SECRET = () => process.env.N8N_SHARED_SECRET

function dayOffsetAt(days, hour) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hour, 0, 0, 0)
  return date
}

let studentId
let topicId

beforeEach(async () => {
  await truncateAll()
  topicId = await createTopic()
  const user = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Reminder Student', 'reminder@example.com', 'x', 'student') RETURNING id`,
  )
  studentId = user.rows[0].id
})

afterAll(closePool)

async function insertBooking(start, hours, status) {
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000)
  await query(
    `INSERT INTO bookings (student_id, topic_id, lesson_type, language, start_at, end_at, status)
     VALUES ($1, $2, 'zoom', 'en', $3, $4, $5)`,
    [studentId, topicId, start, end, status],
  )
}

function get(secret) {
  const req = request(app).get('/api/internal/reminders/tomorrow')
  return secret ? req.set('X-PhysEZ-Secret', secret) : req
}

describe('GET /api/internal/reminders/tomorrow', () => {
  it('requires the shared secret', async () => {
    expect((await get()).status).toBe(401)
    expect((await get('wrong-secret')).status).toBe(401)
  })

  it('is not reachable with an admin session instead of the secret', async () => {
    const { agent } = await adminAgent()
    const res = await agent.get('/api/internal/reminders/tomorrow')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it("returns tomorrow's confirmed lessons in start order", async () => {
    await insertBooking(dayOffsetAt(1, 14), 1, 'confirmed')
    await insertBooking(dayOffsetAt(1, 9), 1, 'confirmed')

    const res = await get(SECRET())
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
    expect(res.body.timezone).toBe('UTC')
    expect(res.body.date).toBe(dayOffsetAt(1, 0).toISOString().slice(0, 10))

    const hours = res.body.lessons.map((lesson) => new Date(lesson.startAt).getUTCHours())
    expect(hours).toEqual([9, 14])
    expect(res.body.lessons[0].student).toMatchObject({ name: 'Reminder Student' })
    expect(res.body.lessons[0].topic.nameEn).toBe('Mechanics')
  })

  it('excludes other days and non-confirmed lessons', async () => {
    await insertBooking(dayOffsetAt(0, 10), 1, 'confirmed') // today
    await insertBooking(dayOffsetAt(2, 10), 1, 'confirmed') // day after tomorrow
    await insertBooking(dayOffsetAt(1, 11), 1, 'pending')
    await insertBooking(dayOffsetAt(1, 12), 1, 'cancelled')
    await insertBooking(dayOffsetAt(1, 13), 1, 'rejected')

    const res = await get(SECRET())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ count: 0, lessons: [] })
  })

  it('reports an empty day rather than failing', async () => {
    const res = await get(SECRET())
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(0)
  })
})
