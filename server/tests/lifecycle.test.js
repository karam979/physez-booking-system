import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import { query, closePool } from '../src/db.js'
import { truncateAll, studentAgent, adminAgent, createTopic, createSlot, t } from './helpers.js'

// n8n is never called for real in tests: the module is mocked so triggers are
// observable but no HTTP request leaves the process.
vi.mock('../src/integrations/n8n.js', () => ({
  WORKFLOWS: {
    bookingCreated: 'booking-created',
    calendarCreate: 'calendar-create',
    calendarDelete: 'calendar-delete',
  },
  isConfigured: () => true,
  trigger: vi.fn(async () => true),
}))

const { trigger } = await import('../src/integrations/n8n.js')
const app = (await import('../src/app.js')).default

let topicId

beforeEach(async () => {
  vi.mocked(trigger).mockClear()
  vi.mocked(trigger).mockImplementation(async () => true)
  await truncateAll()
  topicId = await createTopic()
  await createSlot(t(8), t(18))
})

afterAll(closePool)

async function createBooking(agent, startAt, durationMinutes = 60) {
  const res = await agent
    .post('/api/bookings')
    .send({ lessonType: 'zoom', durationMinutes, language: 'en', topicId, startAt })
  if (res.status !== 201) throw new Error(`booking create failed: ${res.status}`)
  return res.body
}

function triggeredWorkflows() {
  return vi.mocked(trigger).mock.calls.map(([workflow]) => workflow)
}

describe('n8n triggers', () => {
  it('notifies n8n when a booking is created', async () => {
    const { agent } = await studentAgent()
    await createBooking(agent, t(9))
    expect(triggeredWorkflows()).toContain('booking-created')
    const payload = vi.mocked(trigger).mock.calls[0][1]
    expect(payload.student.email).toMatch(/@example\.com$/)
    expect(payload.topic.nameEn).toBe('Mechanics')
  })

  it('requests calendar creation on confirm and marks sync pending', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()

    const res = await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    expect(res.status).toBe(200)
    expect(triggeredWorkflows()).toContain('calendar-create')
    expect(res.body.calendarSyncStatus).toBe('pending')
  })

  it('marks sync failed when the calendar trigger does not reach n8n', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()
    vi.mocked(trigger).mockImplementation(async (workflow) => workflow !== 'calendar-create')

    const res = await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    // The lesson stays confirmed and keeps its slot; only sync state degrades.
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('confirmed')
    expect(res.body.calendarSyncStatus).toBe('failed')
  })
})

describe('PATCH /api/bookings/:id/cancel', () => {
  it('lets the owner cancel a pending booking', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent, t(9))
    const res = await agent.patch(`/api/bookings/${booking.id}/cancel`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
  })

  it('frees the slot and asks n8n to delete the calendar event', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    // Pretend n8n reported the created event back to us.
    await query(`UPDATE bookings SET calendar_event_id = 'evt_123' WHERE id = $1`, [booking.id])

    const res = await student.patch(`/api/bookings/${booking.id}/cancel`)
    expect(res.status).toBe(200)
    expect(triggeredWorkflows()).toContain('calendar-delete')

    // The freed time is selectable again.
    const conflict = await query(
      `SELECT count(*)::int AS n FROM bookings WHERE status = 'confirmed'`,
    )
    expect(conflict.rows[0].n).toBe(0)
  })

  it('lets an admin cancel, blocks a different student', async () => {
    const { agent: owner } = await studentAgent()
    const booking = await createBooking(owner, t(9))

    const { agent: other } = await studentAgent()
    const forbidden = await other.patch(`/api/bookings/${booking.id}/cancel`)
    expect(forbidden.status).toBe(403)

    const { agent: admin } = await adminAgent()
    expect((await admin.patch(`/api/bookings/${booking.id}/cancel`)).status).toBe(200)
  })

  it('422 when the booking is already cancelled', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent, t(9))
    await agent.patch(`/api/bookings/${booking.id}/cancel`)
    const res = await agent.patch(`/api/bookings/${booking.id}/cancel`)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_BOOKING_STATUS')
  })
})

describe('POST /api/bookings/:id/reschedule', () => {
  it('records a request and leaves the confirmed booking on its slot', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)

    const res = await student
      .post(`/api/bookings/${booking.id}/reschedule`)
      .send({ startAt: t(14) })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'pending', requestedStartAt: t(14) })

    const { rows } = await query(`SELECT status, start_at FROM bookings WHERE id = $1`, [
      booking.id,
    ])
    expect(rows[0].status).toBe('confirmed')
    expect(rows[0].start_at.toISOString()).toBe(t(9))
  })

  it('rejects a second pending request', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent, t(9))
    await agent.post(`/api/bookings/${booking.id}/reschedule`).send({ startAt: t(14) })
    const res = await agent.post(`/api/bookings/${booking.id}/reschedule`).send({ startAt: t(15) })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('RESCHEDULE_PENDING')
  })

  it('rejects a time outside availability and a non-owner', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent, t(9))

    const outside = await agent
      .post(`/api/bookings/${booking.id}/reschedule`)
      .send({ startAt: '2026-09-01T20:00:00.000Z' })
    expect(outside.status).toBe(409)
    expect(outside.body.error.code).toBe('SLOT_UNAVAILABLE')

    const { agent: other } = await studentAgent()
    const forbidden = await other
      .post(`/api/bookings/${booking.id}/reschedule`)
      .send({ startAt: t(14) })
    expect(forbidden.status).toBe(403)
  })
})

describe('PATCH /api/admin/bookings/:id/reschedule', () => {
  it('approves and moves the booking to the requested time', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    await student.post(`/api/bookings/${booking.id}/reschedule`).send({ startAt: t(14) })

    const res = await admin
      .patch(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ action: 'approve' })
    expect(res.status).toBe(200)
    expect(res.body.booking.startAt).toBe(t(14))
    expect(res.body.booking.endAt).toBe(t(15))
    expect(res.body.rescheduleRequest.status).toBe('approved')
    // The moved lesson needs its calendar event updated.
    expect(triggeredWorkflows()).toContain('calendar-create')
  })

  it('rejects the request and leaves the booking untouched', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()
    await student.post(`/api/bookings/${booking.id}/reschedule`).send({ startAt: t(14) })

    const res = await admin
      .patch(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ action: 'reject' })
    expect(res.status).toBe(200)
    expect(res.body.rescheduleRequest.status).toBe('rejected')

    const { rows } = await query(`SELECT start_at FROM bookings WHERE id = $1`, [booking.id])
    expect(rows[0].start_at.toISOString()).toBe(t(9))
  })

  it('409 when the requested time was taken while the request waited', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    await student.post(`/api/bookings/${booking.id}/reschedule`).send({ startAt: t(14) })

    // Another student takes 14:00 first.
    const { agent: rival } = await studentAgent()
    const rivalBooking = await createBooking(rival, t(14))
    await admin.patch(`/api/admin/bookings/${rivalBooking.id}/confirm`)

    const res = await admin
      .patch(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ action: 'approve' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BOOKING_CONFLICT')

    const { rows } = await query(`SELECT start_at FROM bookings WHERE id = $1`, [booking.id])
    expect(rows[0].start_at.toISOString()).toBe(t(9))
  })

  it('validates the action and 404s without a pending request', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()

    const bad = await admin
      .patch(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ action: 'maybe' })
    expect(bad.status).toBe(400)

    const none = await admin
      .patch(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ action: 'approve' })
    expect(none.status).toBe(404)
    expect(none.body.error.code).toBe('RESCHEDULE_NOT_FOUND')
  })
})

describe('POST /api/internal/n8n/calendar-result', () => {
  const secret = () => process.env.N8N_SHARED_SECRET

  async function confirmedBooking() {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student, t(9))
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    return booking
  }

  it('rejects callers without the shared secret', async () => {
    const booking = await confirmedBooking()
    const noSecret = await request(app)
      .post('/api/internal/n8n/calendar-result')
      .send({ bookingId: booking.id, status: 'synced', calendarEventId: 'evt_1' })
    expect(noSecret.status).toBe(401)

    const wrongSecret = await request(app)
      .post('/api/internal/n8n/calendar-result')
      .set('X-PhysEZ-Secret', 'not-the-secret')
      .send({ bookingId: booking.id, status: 'synced', calendarEventId: 'evt_1' })
    expect(wrongSecret.status).toBe(401)
  })

  it('is not reachable with an admin session instead of the secret', async () => {
    const booking = await confirmedBooking()
    const { agent: admin } = await adminAgent()
    const res = await admin
      .post('/api/internal/n8n/calendar-result')
      .send({ bookingId: booking.id, status: 'synced', calendarEventId: 'evt_1' })
    expect(res.status).toBe(401)
  })

  it('stores the event id on success', async () => {
    const booking = await confirmedBooking()
    const res = await request(app)
      .post('/api/internal/n8n/calendar-result')
      .set('X-PhysEZ-Secret', secret())
      .send({ bookingId: booking.id, status: 'synced', calendarEventId: 'evt_abc' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ calendarEventId: 'evt_abc', calendarSyncStatus: 'synced' })
  })

  it('keeps the booking confirmed and blocked when the calendar failed', async () => {
    const booking = await confirmedBooking()
    const res = await request(app)
      .post('/api/internal/n8n/calendar-result')
      .set('X-PhysEZ-Secret', secret())
      .send({ bookingId: booking.id, status: 'failed' })
    expect(res.status).toBe(200)
    expect(res.body.calendarSyncStatus).toBe('failed')

    const { rows } = await query(`SELECT status FROM bookings WHERE id = $1`, [booking.id])
    expect(rows[0].status).toBe('confirmed')
  })

  it('validates the payload', async () => {
    const res = await request(app)
      .post('/api/internal/n8n/calendar-result')
      .set('X-PhysEZ-Secret', secret())
      .send({ bookingId: 'nope', status: 'weird' })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.error.details).sort()).toEqual(['bookingId', 'status'])
  })
})
