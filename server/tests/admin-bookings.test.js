import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'
import {
  truncateAll,
  studentAgent,
  adminAgent,
  createTopic,
  createSlot,
  t,
  TEST_DATE,
} from './helpers.js'

let topicId

beforeEach(async () => {
  await truncateAll()
  topicId = await createTopic()
  await createSlot(t(8), t(18))
})

afterAll(closePool)

async function createPendingBooking(agent, startAt, durationMinutes = 60) {
  const res = await agent.post('/api/bookings').send({
    lessonType: 'zoom',
    durationMinutes,
    language: 'en',
    topicId,
    startAt,
  })
  if (res.status !== 201) throw new Error(`booking create failed: ${res.status}`)
  return res.body
}

describe('admin authorization', () => {
  it('blocks anonymous and student callers from /api/admin/*', async () => {
    expect((await request(app).get('/api/admin/bookings')).status).toBe(401)
    const { agent } = await studentAgent()
    const res = await agent.get('/api/admin/bookings')
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})

describe('GET /api/admin/bookings filters', () => {
  it('filters by status, date, and studentId', async () => {
    const { agent: s1, user: u1 } = await studentAgent()
    const { agent: s2 } = await studentAgent()
    const b1 = await createPendingBooking(s1, t(9))
    await createPendingBooking(s2, t(11))
    await query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1`, [b1.id])

    const { agent: admin } = await adminAgent()

    const all = await admin.get('/api/admin/bookings')
    expect(all.body).toHaveLength(2)
    expect(all.body[0].student.email).toBeDefined()

    const confirmed = await admin.get('/api/admin/bookings').query({ status: 'confirmed' })
    expect(confirmed.body).toHaveLength(1)
    expect(confirmed.body[0].id).toBe(b1.id)

    const byStudent = await admin.get('/api/admin/bookings').query({ studentId: u1.id })
    expect(byStudent.body).toHaveLength(1)
    expect(byStudent.body[0].id).toBe(b1.id)

    const byDate = await admin.get('/api/admin/bookings').query({ date: TEST_DATE })
    expect(byDate.body).toHaveLength(2)
    const emptyDay = await admin.get('/api/admin/bookings').query({ date: '2026-09-02' })
    expect(emptyDay.body).toHaveLength(0)
  })

  it('rejects invalid filter values', async () => {
    const { agent: admin } = await adminAgent()
    const res = await admin
      .get('/api/admin/bookings')
      .query({ status: 'maybe', date: '2026-02-30', studentId: 'abc' })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.error.details).sort()).toEqual(['date', 'status', 'studentId'])
  })
})

describe('PATCH /api/admin/bookings/:id/confirm and /reject', () => {
  it('confirms a pending booking', async () => {
    const { agent: s } = await studentAgent()
    const booking = await createPendingBooking(s, t(9))
    const { agent: admin } = await adminAgent()

    const res = await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('confirmed')
  })

  it('409 BOOKING_CONFLICT when an overlapping confirmed booking exists; stays pending', async () => {
    const { agent: s } = await studentAgent()
    const winner = await createPendingBooking(s, t(9), 90)
    const loser = await createPendingBooking(s, t(10), 90) // overlaps 10:00-10:30

    const { agent: admin } = await adminAgent()
    expect((await admin.patch(`/api/admin/bookings/${winner.id}/confirm`)).status).toBe(200)

    const res = await admin.patch(`/api/admin/bookings/${loser.id}/confirm`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BOOKING_CONFLICT')

    const { rows } = await query(`SELECT status FROM bookings WHERE id = $1`, [loser.id])
    expect(rows[0].status).toBe('pending')
  })

  it('422 INVALID_BOOKING_STATUS when confirming or rejecting a non-pending booking', async () => {
    const { agent: s } = await studentAgent()
    const booking = await createPendingBooking(s, t(9))
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)

    const confirmAgain = await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    expect(confirmAgain.status).toBe(422)
    expect(confirmAgain.body.error.code).toBe('INVALID_BOOKING_STATUS')

    const reject = await admin.patch(`/api/admin/bookings/${booking.id}/reject`)
    expect(reject.status).toBe(422)
  })

  it('rejects a pending booking', async () => {
    const { agent: s } = await studentAgent()
    const booking = await createPendingBooking(s, t(9))
    const { agent: admin } = await adminAgent()
    const res = await admin.patch(`/api/admin/bookings/${booking.id}/reject`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
  })

  it('404 on unknown booking id', async () => {
    const { agent: admin } = await adminAgent()
    const res = await admin.patch(
      '/api/admin/bookings/00000000-0000-4000-8000-000000000000/confirm',
    )
    expect(res.status).toBe(404)
  })

  it('RACE: two concurrent confirms of overlapping bookings — exactly one succeeds', async () => {
    const { agent: s } = await studentAgent()
    const a = await createPendingBooking(s, t(9), 90) // 09:00-10:30
    const b = await createPendingBooking(s, t(10), 90) // 10:00-11:30, overlaps a

    const { agent: admin } = await adminAgent()
    const [resA, resB] = await Promise.all([
      admin.patch(`/api/admin/bookings/${a.id}/confirm`),
      admin.patch(`/api/admin/bookings/${b.id}/confirm`),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([200, 409])
    const rejected = resA.status === 409 ? resA : resB
    expect(rejected.body.error.code).toBe('BOOKING_CONFLICT')

    const { rows } = await query(
      `SELECT count(*)::int AS n FROM bookings WHERE status = 'confirmed'`,
    )
    expect(rows[0].n).toBe(1)
  })
})

describe('admin availability slots', () => {
  it('creates a slot and validates input', async () => {
    const { agent: admin } = await adminAgent()
    const res = await admin
      .post('/api/admin/availability')
      .send({ startAt: '2026-09-03T08:00:00Z', endAt: '2026-09-03T12:00:00Z' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      startAt: '2026-09-03T08:00:00.000Z',
      endAt: '2026-09-03T12:00:00.000Z',
      isActive: true,
    })

    const bad = await admin
      .post('/api/admin/availability')
      .send({ startAt: '2026-09-03T12:00:00Z', endAt: '2026-09-03T08:00:00Z' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.details.endAt).toBe('BEFORE_START')
  })

  it('deletes an unused slot, refuses one with bookings inside', async () => {
    const { agent: admin } = await adminAgent()
    const unused = await createSlot('2026-09-04T08:00:00Z', '2026-09-04T12:00:00Z')
    const del = await admin.delete(`/api/admin/availability/${unused}`)
    expect(del.status).toBe(200)

    // The beforeEach slot (08-18) gets a pending booking inside it.
    const { agent: s } = await studentAgent()
    await createPendingBooking(s, t(9))
    const { rows } = await query(`SELECT id FROM availability_slots WHERE start_at = $1`, [t(8)])
    const res = await admin.delete(`/api/admin/availability/${rows[0].id}`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLOT_IN_USE')
  })
})
