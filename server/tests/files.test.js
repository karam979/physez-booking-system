import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { query, closePool } from '../src/db.js'
import { truncateAll, studentAgent, adminAgent, createTopic, createSlot, t } from './helpers.js'

vi.mock('../src/integrations/n8n.js', () => ({
  WORKFLOWS: {
    bookingCreated: 'booking-created',
    calendarCreate: 'calendar-create',
    calendarDelete: 'calendar-delete',
  },
  isConfigured: () => true,
  trigger: vi.fn(async () => true),
}))

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR)

// A minimal but genuine PDF header, so the payload matches its declared type.
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)])
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

let topicId

beforeEach(async () => {
  await truncateAll()
  await query('TRUNCATE files CASCADE')
  topicId = await createTopic()
  await createSlot(t(8), t(18))
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true })
})

afterAll(async () => {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true })
  await closePool()
})

async function createBooking(agent, startAt = t(9)) {
  const res = await agent
    .post('/api/bookings')
    .send({ lessonType: 'zoom', durationMinutes: 60, language: 'en', topicId, startAt })
  if (res.status !== 201) throw new Error(`booking create failed: ${res.status}`)
  return res.body
}

function upload(
  agent,
  bookingId,
  { bytes = PDF_BYTES, name = 'notes.pdf', type = 'application/pdf' } = {},
) {
  return agent
    .post(`/api/bookings/${bookingId}/files`)
    .attach('file', bytes, { filename: name, contentType: type })
}

function storedFileNames() {
  return fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
}

describe('POST /api/bookings/:id/files', () => {
  it('accepts a PDF from the owning student and stores it under a generated name', async () => {
    const { agent, user } = await studentAgent()
    const booking = await createBooking(agent)

    const res = await upload(agent, booking.id)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      bookingId: booking.id,
      studentId: user.id,
      originalName: 'notes.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_BYTES.length,
    })
    // Internal storage details never reach the client.
    expect(res.body).not.toHaveProperty('filePath')
    expect(res.body).not.toHaveProperty('storedName')

    const names = storedFileNames()
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^[0-9a-f]{32}\.pdf$/)
    expect(names[0]).not.toContain('notes')
  })

  it('accepts PNG and rejects an unsupported type with 422', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent)

    const png = await upload(agent, booking.id, {
      bytes: PNG_BYTES,
      name: 'diagram.png',
      type: 'image/png',
    })
    expect(png.status).toBe(201)

    const exe = await upload(agent, booking.id, {
      bytes: Buffer.from('MZ binary'),
      name: 'virus.exe',
      type: 'application/x-msdownload',
    })
    expect(exe.status).toBe(422)
    expect(exe.body.error.code).toBe('UNSUPPORTED_FILE_TYPE')

    // Only the PNG made it to disk.
    expect(storedFileNames()).toHaveLength(1)
  })

  it('rejects a file over MAX_UPLOAD_MB with 413 and stores nothing', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent)

    const tooBig = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1.5 * 1024 * 1024, 0x20)])
    const res = await upload(agent, booking.id, { bytes: tooBig })
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')

    const { rows } = await query('SELECT count(*)::int AS n FROM files')
    expect(rows[0].n).toBe(0)
  })

  it('rejects an upload to another student’s booking and writes nothing', async () => {
    const { agent: owner } = await studentAgent()
    const booking = await createBooking(owner)

    const { agent: attacker } = await studentAgent()
    const res = await upload(attacker, booking.id)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')

    expect(storedFileNames()).toHaveLength(0)
    const { rows } = await query('SELECT count(*)::int AS n FROM files')
    expect(rows[0].n).toBe(0)
  })

  it('rejects an upload to a cancelled, rejected or completed booking', async () => {
    for (const status of ['cancelled', 'rejected', 'completed']) {
      const { agent } = await studentAgent()
      const booking = await createBooking(agent)
      await query(`UPDATE bookings SET status = $2 WHERE id = $1`, [booking.id, status])

      const res = await upload(agent, booking.id)
      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('BOOKING_NOT_ACTIVE')
      expect(res.body.error.details.status).toBe(status)

      // Nothing was written for the rejected attempt.
      expect(storedFileNames()).toHaveLength(0)
      const { rows } = await query('SELECT count(*)::int AS n FROM files')
      expect(rows[0].n).toBe(0)
    }
  })

  it('still accepts uploads while the booking is pending or confirmed', async () => {
    const { agent } = await studentAgent()
    const pending = await createBooking(agent, t(9))
    expect((await upload(agent, pending.id)).status).toBe(201)

    const confirmed = await createBooking(agent, t(11))
    await query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1`, [confirmed.id])
    expect((await upload(agent, confirmed.id)).status).toBe(201)
  })

  it('requires a file part', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent)
    const res = await agent.post(`/api/bookings/${booking.id}/files`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/bookings/:id/files', () => {
  it('lists metadata for the owner and for an admin, but not another student', async () => {
    const { agent: owner } = await studentAgent()
    const booking = await createBooking(owner)
    await upload(owner, booking.id)

    const ownerList = await owner.get(`/api/bookings/${booking.id}/files`)
    expect(ownerList.status).toBe(200)
    expect(ownerList.body).toHaveLength(1)

    const { agent: admin } = await adminAgent()
    const adminList = await admin.get(`/api/bookings/${booking.id}/files`)
    expect(adminList.status).toBe(200)
    expect(adminList.body).toHaveLength(1)

    const { agent: attacker } = await studentAgent()
    const denied = await attacker.get(`/api/bookings/${booking.id}/files`)
    expect(denied.status).toBe(403)
  })
})

describe('GET /api/files/:fileId', () => {
  it('streams the bytes back to the owner', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent)
    const uploaded = await upload(agent, booking.id)

    const res = await agent.get(`/api/files/${uploaded.body.id}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('notes.pdf')
    expect(Buffer.from(res.body)).toEqual(PDF_BYTES)
  })

  it('SECURITY: student A cannot download student B’s file', async () => {
    const { agent: victim } = await studentAgent()
    const booking = await createBooking(victim)
    const uploaded = await upload(victim, booking.id)

    const { agent: attacker } = await studentAgent()
    const res = await attacker.get(`/api/files/${uploaded.body.id}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('requires authentication and rejects unknown ids', async () => {
    const { agent: owner } = await studentAgent()
    const booking = await createBooking(owner)
    const uploaded = await upload(owner, booking.id)

    const { default: request } = await import('supertest')
    const { default: app } = await import('../src/app.js')
    const anonymous = await request(app).get(`/api/files/${uploaded.body.id}`)
    expect(anonymous.status).toBe(401)

    const unknown = await owner.get('/api/files/00000000-0000-4000-8000-000000000000')
    expect(unknown.status).toBe(404)
  })

  it('lets an admin download any file', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student)
    const uploaded = await upload(student, booking.id)

    const { agent: admin } = await adminAgent()
    const res = await admin.get(`/api/files/${uploaded.body.id}`)
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/files/:fileId', () => {
  it('removes the row and the bytes for the owner', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent)
    const uploaded = await upload(agent, booking.id)
    expect(storedFileNames()).toHaveLength(1)

    const res = await agent.delete(`/api/files/${uploaded.body.id}`)
    expect(res.status).toBe(200)
    expect(storedFileNames()).toHaveLength(0)

    const { rows } = await query('SELECT count(*)::int AS n FROM files')
    expect(rows[0].n).toBe(0)
  })

  it('SECURITY: student A cannot delete student B’s file', async () => {
    const { agent: victim } = await studentAgent()
    const booking = await createBooking(victim)
    const uploaded = await upload(victim, booking.id)

    const { agent: attacker } = await studentAgent()
    const res = await attacker.delete(`/api/files/${uploaded.body.id}`)
    expect(res.status).toBe(403)

    // The victim's file survives untouched.
    expect(storedFileNames()).toHaveLength(1)
    const { rows } = await query('SELECT count(*)::int AS n FROM files')
    expect(rows[0].n).toBe(1)
  })

  it('blocks the student once the lesson has started, but not an admin', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent)
    const uploaded = await upload(agent, booking.id)
    await query(`UPDATE bookings SET start_at = now() - interval '1 hour' WHERE id = $1`, [
      booking.id,
    ])

    const student = await agent.delete(`/api/files/${uploaded.body.id}`)
    expect(student.status).toBe(422)
    expect(student.body.error.code).toBe('LESSON_ALREADY_STARTED')

    const { agent: admin } = await adminAgent()
    expect((await admin.delete(`/api/files/${uploaded.body.id}`)).status).toBe(200)
  })
})
