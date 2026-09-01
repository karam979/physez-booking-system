import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'
import { truncateAll, studentAgent, adminAgent } from './helpers.js'

vi.mock('../src/integrations/n8n.js', () => ({
  WORKFLOWS: {
    bookingCreated: 'booking-created',
    calendarCreate: 'calendar-create',
    calendarDelete: 'calendar-delete',
  },
  isConfigured: () => true,
  trigger: vi.fn(async () => true),
}))

beforeEach(async () => {
  await truncateAll()
  await query('TRUNCATE credit_transactions CASCADE')
})

afterAll(closePool)

function adjust(admin, userId, body) {
  return admin.post(`/api/admin/credits/students/${userId}/adjustments`).send(body)
}

describe('GET /api/credits/me', () => {
  it('starts at zero for a new student', async () => {
    const { agent } = await studentAgent()
    const res = await agent.get('/api/credits/me')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 0, paid: 0, reward: 0 })
    expect(res.body.recentTransactions).toEqual([])
  })

  it('reports total as the sum of paid and reward', async () => {
    const { agent, user } = await studentAgent()
    const { agent: admin } = await adminAgent()
    await adjust(admin, user.id, { amount: 50, creditKind: 'paid', reason: 'Test top-up' })
    await adjust(admin, user.id, { amount: 25, creditKind: 'reward', reason: 'Test reward' })

    const res = await agent.get('/api/credits/me')
    expect(res.body).toMatchObject({ total: 75, paid: 50, reward: 25 })
  })

  it('requires a student session', async () => {
    expect((await request(app).get('/api/credits/me')).status).toBe(401)
    const { agent: admin } = await adminAgent()
    expect((await admin.get('/api/credits/me')).status).toBe(403)
  })
})

describe('GET /api/credits/me/transactions', () => {
  it('paginates newest first', async () => {
    const { agent, user } = await studentAgent()
    const { agent: admin } = await adminAgent()
    for (let i = 1; i <= 3; i += 1) {
      await adjust(admin, user.id, { amount: i, creditKind: 'paid', reason: `Adjustment ${i}` })
    }

    const page = await agent.get('/api/credits/me/transactions?limit=2&offset=0')
    expect(page.status).toBe(200)
    expect(page.body.total).toBe(3)
    expect(page.body.transactions).toHaveLength(2)

    const second = await agent.get('/api/credits/me/transactions?limit=2&offset=2')
    expect(second.body.transactions).toHaveLength(1)
  })

  it('rejects invalid pagination', async () => {
    const { agent } = await studentAgent()
    expect((await agent.get('/api/credits/me/transactions?limit=0')).status).toBe(400)
    expect((await agent.get('/api/credits/me/transactions?limit=500')).status).toBe(400)
    expect((await agent.get('/api/credits/me/transactions?offset=-1')).status).toBe(400)
  })
})

describe('admin credit adjustments', () => {
  it('adds credits and records the admin and the reason', async () => {
    const { user } = await studentAgent()
    const { agent: admin, adminId } = await adminAgent()

    const res = await adjust(admin, user.id, {
      amount: 40,
      creditKind: 'paid',
      reason: 'Manual top-up for testing',
    })
    expect(res.status).toBe(201)
    expect(res.body.balances).toMatchObject({ total: 40, paid: 40, reward: 0 })

    const { rows } = await query(
      `SELECT created_by, description, transaction_type FROM credit_transactions WHERE user_id = $1`,
      [user.id],
    )
    expect(rows[0]).toMatchObject({
      created_by: adminId,
      description: 'Manual top-up for testing',
      transaction_type: 'admin_adjustment',
    })
  })

  it('removes credits with a negative amount', async () => {
    const { user } = await studentAgent()
    const { agent: admin } = await adminAgent()
    await adjust(admin, user.id, { amount: 30, creditKind: 'paid', reason: 'Top-up' })

    const res = await adjust(admin, user.id, {
      amount: -10,
      creditKind: 'paid',
      reason: 'Correction',
    })
    expect(res.status).toBe(201)
    expect(res.body.balances).toMatchObject({ total: 20, paid: 20 })
  })

  it('refuses a removal that would push the balance negative', async () => {
    const { user } = await studentAgent()
    const { agent: admin } = await adminAgent()
    await adjust(admin, user.id, { amount: 5, creditKind: 'paid', reason: 'Small top-up' })

    const res = await adjust(admin, user.id, {
      amount: -10,
      creditKind: 'paid',
      reason: 'Too much',
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INSUFFICIENT_CREDITS')

    const { rows } = await query(
      `SELECT COALESCE(SUM(amount), 0)::int AS total FROM credit_transactions WHERE user_id = $1`,
      [user.id],
    )
    expect(rows[0].total).toBe(5)
  })

  it('keeps paid and reward balances separate when removing', async () => {
    const { user } = await studentAgent()
    const { agent: admin } = await adminAgent()
    await adjust(admin, user.id, { amount: 20, creditKind: 'reward', reason: 'Reward grant' })

    // Plenty of total credits, but none of them are paid.
    const res = await adjust(admin, user.id, {
      amount: -5,
      creditKind: 'paid',
      reason: 'Wrong bucket',
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INSUFFICIENT_CREDITS')
  })

  it('requires a reason and a valid amount and kind', async () => {
    const { user } = await studentAgent()
    const { agent: admin } = await adminAgent()

    const noReason = await adjust(admin, user.id, { amount: 10, creditKind: 'paid', reason: '' })
    expect(noReason.status).toBe(400)
    expect(noReason.body.error.details.reason).toBe('REQUIRED')

    const zero = await adjust(admin, user.id, { amount: 0, creditKind: 'paid', reason: 'Nothing' })
    expect(zero.body.error.details.amount).toBe('INVALID')

    const fractional = await adjust(admin, user.id, {
      amount: 1.5,
      creditKind: 'paid',
      reason: 'Fraction',
    })
    expect(fractional.body.error.details.amount).toBe('INVALID')

    const badKind = await adjust(admin, user.id, {
      amount: 10,
      creditKind: 'bonus',
      reason: 'Bad kind',
    })
    expect(badKind.body.error.details.creditKind).toBe('INVALID')
  })

  it('never edits history: a correction is a second row', async () => {
    const { user } = await studentAgent()
    const { agent: admin } = await adminAgent()
    await adjust(admin, user.id, { amount: 10, creditKind: 'paid', reason: 'First' })
    await adjust(admin, user.id, { amount: -4, creditKind: 'paid', reason: 'Correction' })

    const { rows } = await query(
      `SELECT amount FROM credit_transactions WHERE user_id = $1 ORDER BY created_at`,
      [user.id],
    )
    expect(rows.map((r) => r.amount)).toEqual([10, -4])
  })

  it('is admin-only and 404s for an unknown student', async () => {
    const { agent: student, user } = await studentAgent()
    const forbidden = await student
      .post(`/api/admin/credits/students/${user.id}/adjustments`)
      .send({ amount: 100, creditKind: 'paid', reason: 'Self service' })
    expect(forbidden.status).toBe(403)

    const { agent: admin } = await adminAgent()
    const missing = await adjust(admin, '00000000-0000-4000-8000-000000000000', {
      amount: 10,
      creditKind: 'paid',
      reason: 'Ghost',
    })
    expect(missing.status).toBe(404)
  })

  it('lets an admin read a student wallet and history', async () => {
    const { user } = await studentAgent()
    const { agent: admin } = await adminAgent()
    await adjust(admin, user.id, { amount: 15, creditKind: 'paid', reason: 'Top-up' })

    const res = await admin.get(`/api/admin/credits/students/${user.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 15, paid: 15, reward: 0 })
    expect(res.body.student.email).toBe(user.email)
    expect(res.body.transactions).toHaveLength(1)
  })
})
