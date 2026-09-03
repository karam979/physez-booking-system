import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'
import { truncateAll, studentAgent, adminAgent, createTopic } from './helpers.js'

vi.mock('../src/integrations/n8n.js', () => ({
  WORKFLOWS: {
    bookingCreated: 'booking-created',
    calendarCreate: 'calendar-create',
    calendarDelete: 'calendar-delete',
  },
  isConfigured: () => true,
  trigger: vi.fn(async () => true),
}))

let topicId
let otherTopicId

beforeEach(async () => {
  await truncateAll()
  await query('TRUNCATE credit_transactions, community_questions CASCADE')
  topicId = await createTopic()
  otherTopicId = await createTopic()
})

afterAll(closePool)

const REASON = 'Spam / inappropriate content'

// Builds a fully "lived in" thread: an answer, a helpful vote, an accepted
// answer and therefore credits — so removal is always tested against a
// question that already has history hanging off it.
async function thread({ language = 'en' } = {}) {
  const { agent: asker, user: askerUser } = await studentAgent()
  const { agent: helper, user: helperUser } = await studentAgent()

  const created = await asker.post('/api/community/questions').send({
    topicId,
    language,
    title: 'Why does a ball roll down a slope?',
    body: 'I am stuck on this problem and cannot see the forces.',
  })
  const question = created.body

  const posted = await helper
    .post(`/api/community/questions/${question.id}/answers`)
    .send({ body: 'Gravity pulls it along the slope, and the normal force does no work.' })
  const answer = posted.body

  await asker.post(`/api/community/answers/${answer.id}/votes`)
  await asker.post(`/api/community/answers/${answer.id}/accept`)

  const { agent: admin, adminId } = await adminAgent()
  return { asker, askerUser, helper, helperUser, question, answer, admin, adminId }
}

function remove(admin, questionId, body = { removed: true, reason: REASON }) {
  return admin.patch(`/api/admin/community/questions/${questionId}/removal`).send(body)
}

async function ledgerSnapshot() {
  const { rows } = await query(
    `SELECT user_id, amount, credit_kind, transaction_type
     FROM credit_transactions ORDER BY created_at, id`,
  )
  return rows
}

describe('admin question removal', () => {
  it('removes a question and records who, when and why', async () => {
    const { question, admin, adminId } = await thread()

    const res = await remove(admin, question.id)
    expect(res.status).toBe(200)
    expect(res.body.isRemoved).toBe(true)
    expect(res.body.removal.reason).toBe(REASON)
    expect(res.body.removal.removedBy.id).toBe(adminId)
    expect(res.body.removal.removedAt).toBeTruthy()

    // Soft delete: the row is still there.
    const { rows } = await query(
      `SELECT deleted_at, deleted_by, deletion_reason FROM community_questions WHERE id = $1`,
      [question.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].deleted_at).toBeTruthy()
    expect(rows[0].deletion_reason).toBe(REASON)
  })

  it('is admin-only and rejects students and anonymous callers', async () => {
    const { question, asker } = await thread()
    const path = `/api/admin/community/questions/${question.id}/removal`
    const body = { removed: true, reason: REASON }

    expect((await request(app).patch(path).send(body)).status).toBe(401)
    expect((await asker.patch(path).send(body)).status).toBe(403)

    const { rows } = await query(`SELECT deleted_at FROM community_questions WHERE id = $1`, [
      question.id,
    ])
    expect(rows[0].deleted_at).toBeNull()
  })

  it('requires a reason of a sensible length', async () => {
    const { question, admin } = await thread()

    const missing = await remove(admin, question.id, { removed: true })
    expect(missing.status).toBe(400)
    expect(missing.body.error.details.reason).toBe('REQUIRED')

    const tooShort = await remove(admin, question.id, { removed: true, reason: 'no' })
    expect(tooShort.status).toBe(400)

    const tooLong = await remove(admin, question.id, { removed: true, reason: 'x'.repeat(501) })
    expect(tooLong.status).toBe(400)

    const noFlag = await remove(admin, question.id, { reason: REASON })
    expect(noFlag.status).toBe(400)
    expect(noFlag.body.error.details.removed).toBe('INVALID')
  })

  it('404s an unknown question and 400s a malformed id', async () => {
    const { admin } = await thread()

    const missing = await remove(admin, '00000000-0000-4000-8000-000000000000')
    expect(missing.status).toBe(404)

    const malformed = await remove(admin, 'not-a-uuid')
    expect(malformed.status).toBe(400)
  })

  it('is idempotent: a second removal keeps the original audit trail', async () => {
    const { question, admin } = await thread()

    const first = await remove(admin, question.id)
    const originalAt = first.body.removal.removedAt

    const second = await remove(admin, question.id, {
      removed: true,
      reason: 'A completely different reason',
    })
    expect(second.status).toBe(200)
    expect(second.body.removal.removedAt).toBe(originalAt)
    expect(second.body.removal.reason).toBe(REASON)
  })
})

describe('student visibility of a removed question', () => {
  it('disappears from the feed and from every filter', async () => {
    const { asker, question, admin } = await thread()
    await remove(admin, question.id)

    // Every filter combination a student can build must exclude it.
    const paths = [
      '/api/community/questions',
      `/api/community/questions?topicId=${topicId}`,
      '/api/community/questions?status=solved',
      '/api/community/questions?status=open',
      '/api/community/questions?language=en',
      '/api/community/questions?unanswered=false',
      '/api/community/questions?unanswered=true',
      `/api/community/questions?topicId=${topicId}&status=solved&language=en`,
      `/api/community/questions?topicId=${topicId}&language=en&unanswered=false`,
    ]
    for (const path of paths) {
      const res = await asker.get(path)
      expect(res.status, path).toBe(200)
      expect(
        res.body.questions.map((q) => q.id),
        path,
      ).not.toContain(question.id)
      // The paging total must not count it either.
      expect(res.body.total, path).toBe(0)
    }
  })

  it('still lists other questions, so the filter is not simply blanking the feed', async () => {
    const { asker, question, admin } = await thread()
    const survivor = await asker.post('/api/community/questions').send({
      topicId: otherTopicId,
      language: 'he',
      title: 'A question that stays visible',
      body: 'This one is never removed and must keep showing up.',
    })

    await remove(admin, question.id)

    const all = await asker.get('/api/community/questions')
    expect(all.body.total).toBe(1)
    expect(all.body.questions[0].id).toBe(survivor.body.id)

    const byTopic = await asker.get(`/api/community/questions?topicId=${otherTopicId}`)
    expect(byTopic.body.total).toBe(1)
  })

  it('404s the detail endpoint for students, leaking no reason', async () => {
    const { asker, helper, question, admin } = await thread()
    await remove(admin, question.id)

    for (const agent of [asker, helper]) {
      const res = await agent.get(`/api/community/questions/${question.id}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(JSON.stringify(res.body)).not.toContain(REASON)
    }
  })

  it('drops out of my-community stats and reputation', async () => {
    const { helper, question, admin } = await thread()

    const before = await helper.get('/api/community/me/stats')
    expect(before.body).toMatchObject({
      answersPosted: 1,
      acceptedAnswers: 1,
      helpfulVotesReceived: 1,
    })
    expect(before.body.reputation).toBe(13)

    await remove(admin, question.id)

    const after = await helper.get('/api/community/me/stats')
    expect(after.body).toMatchObject({
      questionsAsked: 0,
      answersPosted: 0,
      acceptedAnswers: 0,
      helpfulVotesReceived: 0,
    })
    expect(after.body.reputation).toBe(0)
  })

  it('drops the asker questionsAsked count too', async () => {
    const { asker, question, admin } = await thread()
    expect((await asker.get('/api/community/me/stats')).body.questionsAsked).toBe(1)

    await remove(admin, question.id)
    expect((await asker.get('/api/community/me/stats')).body.questionsAsked).toBe(0)
  })
})

describe('student interaction with a removed question', () => {
  it('refuses a new answer', async () => {
    const { helper, question, admin } = await thread()
    await remove(admin, question.id)

    const res = await helper
      .post(`/api/community/questions/${question.id}/answers`)
      .send({ body: 'Trying to answer something that was removed.' })
    expect(res.status).toBe(404)
  })

  it('refuses a vote through the answer id, which never names the question', async () => {
    const { answer, question, admin } = await thread()
    const { agent: outsider } = await studentAgent()
    await remove(admin, question.id)

    const res = await outsider.post(`/api/community/answers/${answer.id}/votes`)
    expect(res.status).toBe(404)

    const votes = await query(`SELECT count(*)::int AS n FROM community_votes`)
    expect(votes.rows[0].n).toBe(1) // only the original vote from before removal
  })

  it('refuses withdrawing a vote through the answer id', async () => {
    const { asker, answer, question, admin } = await thread()
    await remove(admin, question.id)

    const res = await asker.delete(`/api/community/answers/${answer.id}/votes`)
    expect(res.status).toBe(404)

    // The historical vote is still on record.
    const votes = await query(`SELECT count(*)::int AS n FROM community_votes`)
    expect(votes.rows[0].n).toBe(1)
  })

  it('refuses accepting an answer, so the accepted state cannot be changed', async () => {
    const { asker, question, admin, helper } = await thread()
    const second = await helper
      .post(`/api/community/questions/${question.id}/answers`)
      .send({ body: 'A second answer posted before the question was removed.' })

    await remove(admin, question.id)

    const res = await asker.post(`/api/community/answers/${second.body.id}/accept`)
    expect(res.status).toBe(404)
  })

  it('refuses reporting the question or any of its answers', async () => {
    const { question, answer, admin } = await thread()
    const { agent: outsider } = await studentAgent()
    await remove(admin, question.id)

    const onQuestion = await outsider
      .post('/api/community/reports')
      .send({ targetType: 'question', targetId: question.id, reason: 'Trying to report this.' })
    expect(onQuestion.status).toBe(404)

    const onAnswer = await outsider
      .post('/api/community/reports')
      .send({ targetType: 'answer', targetId: answer.id, reason: 'Trying to report this.' })
    expect(onAnswer.status).toBe(404)
  })
})

describe('history survives removal', () => {
  it('keeps answers, votes, reports and the accepted answer on record', async () => {
    const { asker, question, answer, admin } = await thread()
    await asker
      .post('/api/community/reports')
      .send({ targetType: 'answer', targetId: answer.id, reason: 'A report filed before removal.' })

    await remove(admin, question.id)

    const answers = await query(`SELECT count(*)::int AS n FROM community_answers`)
    const votes = await query(`SELECT count(*)::int AS n FROM community_votes`)
    const reports = await query(`SELECT count(*)::int AS n FROM community_reports`)
    const accepted = await query(
      `SELECT accepted_answer_id, status FROM community_questions WHERE id = $1`,
      [question.id],
    )

    expect(answers.rows[0].n).toBe(1)
    expect(votes.rows[0].n).toBe(1)
    expect(reports.rows[0].n).toBe(1)
    expect(accepted.rows[0].accepted_answer_id).toBe(answer.id)
    expect(accepted.rows[0].status).toBe('solved')
  })

  it('leaves the credit ledger and every balance byte-for-byte unchanged', async () => {
    const { helperUser, question, admin } = await thread()

    const ledgerBefore = await ledgerSnapshot()
    const balanceBefore = await query(
      `SELECT COALESCE(SUM(amount), 0)::int AS total FROM credit_transactions WHERE user_id = $1`,
      [helperUser.id],
    )
    expect(balanceBefore.rows[0].total).toBe(6) // +1 helpful vote, +5 accepted answer

    await remove(admin, question.id)

    const ledgerAfter = await ledgerSnapshot()
    const balanceAfter = await query(
      `SELECT COALESCE(SUM(amount), 0)::int AS total FROM credit_transactions WHERE user_id = $1`,
      [helperUser.id],
    )

    expect(ledgerAfter).toEqual(ledgerBefore)
    expect(balanceAfter.rows[0].total).toBe(6)
  })

  it('still shows the earned credits on the student wallet', async () => {
    const { helper, question, admin } = await thread()
    await remove(admin, question.id)

    const wallet = await helper.get('/api/credits/me')
    expect(wallet.body).toMatchObject({ total: 6, paid: 0, reward: 6 })
    expect(wallet.body.recentTransactions).toHaveLength(2)
  })
})

describe('admin visibility of removed questions', () => {
  it('hides removed questions from the list by default and shows them on request', async () => {
    const { question, admin } = await thread()
    await remove(admin, question.id)

    const byDefault = await admin.get('/api/admin/community/questions')
    expect(byDefault.body.map((q) => q.id)).not.toContain(question.id)

    const included = await admin.get('/api/admin/community/questions?removed=included')
    expect(included.body.map((q) => q.id)).toContain(question.id)

    const only = await admin.get('/api/admin/community/questions?removed=only')
    expect(only.body).toHaveLength(1)
    expect(only.body[0].id).toBe(question.id)
    expect(only.body[0].isRemoved).toBe(true)
    expect(only.body[0].removal.reason).toBe(REASON)

    const bad = await admin.get('/api/admin/community/questions?removed=nonsense')
    expect(bad.status).toBe(400)
  })

  it('still opens the removed question with its answers and audit trail', async () => {
    const { question, answer, admin, adminId } = await thread()
    await remove(admin, question.id)

    const res = await admin.get(`/api/admin/community/questions/${question.id}`)
    expect(res.status).toBe(200)
    expect(res.body.isRemoved).toBe(true)
    expect(res.body.removal.reason).toBe(REASON)
    expect(res.body.removal.removedBy.id).toBe(adminId)
    expect(res.body.removal.removedBy.name).toBeTruthy()
    // Original content and its history are all still inspectable.
    expect(res.body.answers).toHaveLength(1)
    expect(res.body.answers[0].id).toBe(answer.id)
    expect(res.body.answers[0].voteCount).toBe(1)
    expect(res.body.answers[0].isAccepted).toBe(true)
    expect(res.body.acceptedAnswerId).toBe(answer.id)
  })

  it('refuses a status change until the question is restored', async () => {
    const { question, admin } = await thread()
    await remove(admin, question.id)

    const res = await admin
      .patch(`/api/admin/community/questions/${question.id}/status`)
      .send({ status: 'closed' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('QUESTION_REMOVED')
  })

  it('keeps reports on removed content readable, flagged as removed', async () => {
    const { asker, question, answer, admin } = await thread()
    await asker
      .post('/api/community/reports')
      .send({ targetType: 'answer', targetId: answer.id, reason: 'A report filed before removal.' })
    const { agent: other } = await studentAgent()
    await other
      .post('/api/community/reports')
      .send({ targetType: 'question', targetId: question.id, reason: 'Another report before it.' })

    await remove(admin, question.id)

    const res = await admin.get('/api/admin/community/reports')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    for (const report of res.body) {
      expect(report.target).not.toBeNull()
      expect(report.target.removed).toBe(true)
      expect(report.target.questionId).toBe(question.id)
      expect(report.reason).toBeTruthy()
    }
  })
})

describe('restore', () => {
  it('brings the question back for students without touching credits', async () => {
    const { asker, helperUser, question, admin } = await thread()
    await remove(admin, question.id)
    expect((await asker.get(`/api/community/questions/${question.id}`)).status).toBe(404)

    const ledgerBefore = await ledgerSnapshot()

    const restored = await admin
      .patch(`/api/admin/community/questions/${question.id}/removal`)
      .send({ removed: false })
    expect(restored.status).toBe(200)
    expect(restored.body.isRemoved).toBe(false)
    expect(restored.body.removal).toBeNull()

    // Audit columns are cleared on the row itself.
    const { rows } = await query(
      `SELECT deleted_at, deleted_by, deletion_reason FROM community_questions WHERE id = $1`,
      [question.id],
    )
    expect(rows[0]).toMatchObject({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
    })

    // Visible again, with its history intact.
    const detail = await asker.get(`/api/community/questions/${question.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.answers).toHaveLength(1)
    expect(detail.body.isSolved).toBe(true)

    const feed = await asker.get('/api/community/questions')
    expect(feed.body.questions.map((q) => q.id)).toContain(question.id)
    expect(feed.body.total).toBe(1)

    expect(await ledgerSnapshot()).toEqual(ledgerBefore)
    const balance = await query(
      `SELECT COALESCE(SUM(amount), 0)::int AS total FROM credit_transactions WHERE user_id = $1`,
      [helperUser.id],
    )
    expect(balance.rows[0].total).toBe(6)
  })

  it('restores stats and re-enables interaction', async () => {
    const { helper, question, answer, admin } = await thread()
    await remove(admin, question.id)
    expect((await helper.get('/api/community/me/stats')).body.reputation).toBe(0)

    await admin
      .patch(`/api/admin/community/questions/${question.id}/removal`)
      .send({ removed: false })

    expect((await helper.get('/api/community/me/stats')).body.reputation).toBe(13)

    const { agent: outsider } = await studentAgent()
    const vote = await outsider.post(`/api/community/answers/${answer.id}/votes`)
    expect(vote.status).toBe(201)
  })

  it('is idempotent for an active question', async () => {
    const { question, admin } = await thread()

    const res = await admin
      .patch(`/api/admin/community/questions/${question.id}/removal`)
      .send({ removed: false })
    expect(res.status).toBe(200)
    expect(res.body.isRemoved).toBe(false)
  })
})
