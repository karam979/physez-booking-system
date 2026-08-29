import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'
import { truncateAll, studentAgent, adminAgent, createTopic, createSlot, t } from './helpers.js'

let topicId

beforeEach(async () => {
  await truncateAll()
  topicId = await createTopic()
  await createSlot(t(10), t(14))
})

afterAll(closePool)

const validBody = () => ({
  lessonType: 'zoom',
  durationMinutes: 90,
  language: 'ar',
  topicId,
  startAt: t(10),
  notes: 'Exam preparation - Kirchhoff laws',
})

describe('POST /api/bookings', () => {
  it('creates a pending booking and derives endAt from duration', async () => {
    const { agent, user } = await studentAgent()
    const res = await agent.post('/api/bookings').send(validBody())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      status: 'pending',
      lessonType: 'zoom',
      durationMinutes: 90,
      startAt: t(10),
      endAt: t(11, 30),
      studentId: user.id,
    })
  })

  it('requires authentication and the student role', async () => {
    const anon = await request(app).post('/api/bookings').send(validBody())
    expect(anon.status).toBe(401)

    const { agent } = await adminAgent()
    const asAdmin = await agent.post('/api/bookings').send(validBody())
    expect(asAdmin.status).toBe(403)
    expect(asAdmin.body.error.code).toBe('FORBIDDEN')
  })

  it('validates every field', async () => {
    const { agent } = await studentAgent()
    const res = await agent.post('/api/bookings').send({
      lessonType: 'hologram',
      durationMinutes: 37,
      language: 'fr',
      topicId: 'not-a-uuid',
      startAt: 'yesterday',
      notes: 'x'.repeat(2001),
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(res.body.error.details).sort()).toEqual([
      'durationMinutes',
      'language',
      'lessonType',
      'notes',
      'startAt',
      'topicId',
    ])
  })

  it('rejects a start time in the past', async () => {
    const { agent } = await studentAgent()
    const res = await agent
      .post('/api/bookings')
      .send({ ...validBody(), startAt: '2020-01-01T10:00:00Z' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('START_IN_PAST')
  })

  it('rejects an inactive or unknown topic', async () => {
    const { agent } = await studentAgent()
    const inactive = await createTopic({ active: false })
    const res = await agent.post('/api/bookings').send({ ...validBody(), topicId: inactive })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('TOPIC_NOT_FOUND')
  })

  it('rejects a time outside any active slot with SLOT_UNAVAILABLE', async () => {
    const { agent } = await studentAgent()
    const res = await agent.post('/api/bookings').send({ ...validBody(), startAt: t(13) })
    // 13:00 + 90min = 14:30 > slot end 14:00
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE')
  })

  it('fast-fails against an already-confirmed overlapping booking', async () => {
    const { agent: first } = await studentAgent()
    const created = await first.post('/api/bookings').send(validBody())
    await query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1`, [created.body.id])

    const { agent: second } = await studentAgent()
    const res = await second.post('/api/bookings').send({ ...validBody(), startAt: t(11) })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BOOKING_CONFLICT')
  })
})

describe('GET /api/bookings/me', () => {
  it('returns only the caller’s bookings with topic names', async () => {
    const { agent: a } = await studentAgent()
    const { agent: b } = await studentAgent()
    await a.post('/api/bookings').send(validBody())
    await b.post('/api/bookings').send({ ...validBody(), startAt: t(12) })

    const res = await a.get('/api/bookings/me')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].startAt).toBe(t(10))
    expect(res.body[0].topic.nameHe).toBe('מכניקה')
  })
})

describe('GET /api/bookings/:id', () => {
  it('is readable by owner and admin, forbidden for another student', async () => {
    const { agent: owner } = await studentAgent()
    const created = await owner.post('/api/bookings').send(validBody())
    const id = created.body.id

    expect((await owner.get(`/api/bookings/${id}`)).status).toBe(200)

    const { agent: admin } = await adminAgent()
    expect((await admin.get(`/api/bookings/${id}`)).status).toBe(200)

    const { agent: other } = await studentAgent()
    const res = await other.get(`/api/bookings/${id}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('400 on a malformed id, 404 on an unknown one', async () => {
    const { agent } = await studentAgent()
    expect((await agent.get('/api/bookings/nope')).status).toBe(400)
    const res = await agent.get('/api/bookings/00000000-0000-4000-8000-000000000000')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
