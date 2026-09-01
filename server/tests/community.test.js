import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'
import { truncateAll, studentAgent, adminAgent, createTopic } from './helpers.js'
import {
  REWARD_ACCEPTED_ANSWER,
  REWARD_HELPFUL_VOTE,
  MAX_VOTE_CREDITS_PER_ANSWER,
  MAX_REWARD_CREDITS_PER_DAY,
  MAX_REWARD_CREDITS_PER_WEEK,
} from '../src/community/rewards.js'

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

beforeEach(async () => {
  await truncateAll()
  await query('TRUNCATE credit_transactions, community_questions CASCADE')
  topicId = await createTopic()
})

afterAll(closePool)

const QUESTION = {
  title: 'Why does a ball roll down a slope?',
  body: 'I am stuck on this problem.',
}

async function ask(agent, overrides = {}) {
  const res = await agent
    .post('/api/community/questions')
    .send({ topicId, language: 'en', ...QUESTION, ...overrides })
  if (res.status !== 201) throw new Error(`ask failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

async function answer(agent, questionId, body = 'Gravity pulls it along the slope.') {
  const res = await agent.post(`/api/community/questions/${questionId}/answers`).send({ body })
  if (res.status !== 201) throw new Error(`answer failed: ${res.status}`)
  return res.body
}

async function rewardTotal(userId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total
     FROM credit_transactions WHERE user_id = $1 AND credit_kind = 'reward'`,
    [userId],
  )
  return rows[0].total
}

describe('questions', () => {
  it('creates a question and lists it', async () => {
    const { agent } = await studentAgent()
    const created = await ask(agent)
    expect(created).toMatchObject({ status: 'open', language: 'en', answerCount: 0 })
    expect(created.topic.id).toBe(topicId)
    // Author display name only — no email leaks into the community feed.
    expect(created.author).not.toHaveProperty('email')

    const list = await agent.get('/api/community/questions')
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
    expect(list.body.questions[0].id).toBe(created.id)
  })

  it('validates topic, language, title and body', async () => {
    const { agent } = await studentAgent()

    const bad = await agent
      .post('/api/community/questions')
      .send({ topicId: 'nope', language: 'fr', title: 'no', body: 'short' })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.error.details).sort()).toEqual([
      'body',
      'language',
      'title',
      'topicId',
    ])

    const inactive = await createTopic({ active: false })
    const rejected = await agent
      .post('/api/community/questions')
      .send({ topicId: inactive, language: 'en', ...QUESTION })
    expect(rejected.status).toBe(422)
    expect(rejected.body.error.code).toBe('TOPIC_NOT_FOUND')
  })

  it('filters by topic, status, language and unanswered', async () => {
    const { agent } = await studentAgent()
    const { agent: helper } = await studentAgent()
    const otherTopic = await createTopic()

    const answered = await ask(agent)
    await ask(agent, { language: 'ar', title: 'سؤال في الفيزياء' })
    await ask(agent, { topicId: otherTopic })
    await answer(helper, answered.id)

    const unanswered = await agent.get('/api/community/questions?unanswered=true')
    expect(unanswered.body.total).toBe(2)

    const arabic = await agent.get('/api/community/questions?language=ar')
    expect(arabic.body.total).toBe(1)

    const byTopic = await agent.get(`/api/community/questions?topicId=${otherTopic}`)
    expect(byTopic.body.total).toBe(1)

    const open = await agent.get('/api/community/questions?status=open')
    expect(open.body.total).toBe(3)

    expect((await agent.get('/api/community/questions?status=weird')).status).toBe(400)
  })

  it('404s an unknown question and 400s a malformed id', async () => {
    const { agent } = await studentAgent()
    expect((await agent.get('/api/community/questions/nope')).status).toBe(400)
    expect(
      (await agent.get('/api/community/questions/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404)
  })

  it('requires a student session for every community route', async () => {
    expect((await request(app).get('/api/community/questions')).status).toBe(401)
    const { agent: admin } = await adminAgent()
    expect((await admin.get('/api/community/questions')).status).toBe(403)
  })
})

describe('answers', () => {
  it('posts an answer and counts it on the question', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    expect(posted.voteCount).toBe(0)
    const detail = await asker.get(`/api/community/questions/${question.id}`)
    expect(detail.body.answers).toHaveLength(1)
    expect(detail.body.answerCount).toBe(1)
  })

  it('validates the body and the question', async () => {
    const { agent } = await studentAgent()
    const question = await ask(agent)

    const short = await agent
      .post(`/api/community/questions/${question.id}/answers`)
      .send({ body: 'no' })
    expect(short.status).toBe(400)

    const missing = await agent
      .post('/api/community/questions/00000000-0000-4000-8000-000000000000/answers')
      .send({ body: 'A perfectly good answer.' })
    expect(missing.status).toBe(404)
  })
})

describe('accepting an answer', () => {
  it('awards the answer author and marks the question solved', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    const res = await asker.post(`/api/community/answers/${posted.id}/accept`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'solved', acceptedAnswerId: posted.id })
    expect(res.body.reward).toMatchObject({ granted: true, amount: REWARD_ACCEPTED_ANSWER })

    expect(await rewardTotal(helperUser.id)).toBe(REWARD_ACCEPTED_ANSWER)
    const wallet = await helper.get('/api/credits/me')
    expect(wallet.body).toMatchObject({ total: 5, paid: 0, reward: 5 })
  })

  it('only the question author may accept', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper } = await studentAgent()
    const { agent: stranger } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    const res = await stranger.post(`/api/community/answers/${posted.id}/accept`)
    expect(res.status).toBe(403)
    // The helper cannot self-accept either.
    expect((await helper.post(`/api/community/answers/${posted.id}/accept`)).status).toBe(403)
  })

  it('accepts at most one answer per question and never rewards twice', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const first = await answer(helper, question.id)
    const second = await answer(helper, question.id, 'A second attempt at the answer.')

    expect((await asker.post(`/api/community/answers/${first.id}/accept`)).status).toBe(200)

    const repeat = await asker.post(`/api/community/answers/${first.id}/accept`)
    expect(repeat.status).toBe(409)
    expect(repeat.body.error.code).toBe('ANSWER_ALREADY_ACCEPTED')

    const other = await asker.post(`/api/community/answers/${second.id}/accept`)
    expect(other.status).toBe(409)

    expect(await rewardTotal(helperUser.id)).toBe(REWARD_ACCEPTED_ANSWER)
  })

  it('gives no reward for accepting your own answer', async () => {
    const { agent: asker, user } = await studentAgent()
    const question = await ask(asker)
    const own = await answer(asker, question.id, 'I worked it out myself in the end.')

    const res = await asker.post(`/api/community/answers/${own.id}/accept`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('solved')
    expect(res.body.reward).toMatchObject({ granted: false, reason: 'SELF_ANSWER' })
    expect(await rewardTotal(user.id)).toBe(0)
  })
})

describe('votes', () => {
  it('awards one credit to the answer author', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    const res = await asker.post(`/api/community/answers/${posted.id}/votes`)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ voteCount: 1, viewerHasVoted: true })
    expect(res.body.reward).toMatchObject({ granted: true, amount: REWARD_HELPFUL_VOTE })
    expect(await rewardTotal(helperUser.id)).toBe(REWARD_HELPFUL_VOTE)
  })

  it('refuses a self-vote', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    const res = await helper.post(`/api/community/answers/${posted.id}/votes`)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('SELF_VOTE')
    expect(await rewardTotal(helperUser.id)).toBe(0)
  })

  it('refuses a duplicate vote and does not pay twice', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    await asker.post(`/api/community/answers/${posted.id}/votes`)
    const again = await asker.post(`/api/community/answers/${posted.id}/votes`)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_VOTED')
    expect(await rewardTotal(helperUser.id)).toBe(REWARD_HELPFUL_VOTE)
  })

  it('re-voting after withdrawing does not earn a second credit', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    await asker.post(`/api/community/answers/${posted.id}/votes`)
    expect((await asker.delete(`/api/community/answers/${posted.id}/votes`)).status).toBe(200)

    const revote = await asker.post(`/api/community/answers/${posted.id}/votes`)
    expect(revote.status).toBe(201)
    expect(revote.body.reward).toMatchObject({ granted: false, reason: 'ALREADY_GRANTED' })
    expect(await rewardTotal(helperUser.id)).toBe(REWARD_HELPFUL_VOTE)
  })

  it('caps vote credits per answer', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    const voters = [asker]
    for (let i = 0; i < MAX_VOTE_CREDITS_PER_ANSWER; i += 1) {
      const { agent } = await studentAgent()
      voters.push(agent)
    }

    const rewarded = []
    for (const voter of voters) {
      const res = await voter.post(`/api/community/answers/${posted.id}/votes`)
      expect(res.status).toBe(201)
      rewarded.push(res.body.reward.granted)
    }

    // Every vote is recorded, but only the first five pay.
    expect(rewarded.filter(Boolean)).toHaveLength(MAX_VOTE_CREDITS_PER_ANSWER)
    expect(rewarded[rewarded.length - 1]).toBe(false)
    expect(await rewardTotal(helperUser.id)).toBe(MAX_VOTE_CREDITS_PER_ANSWER)

    const { rows } = await query(
      `SELECT count(*)::int AS n FROM community_votes WHERE answer_id = $1`,
      [posted.id],
    )
    expect(rows[0].n).toBe(voters.length)
  })
})

describe('reward caps', () => {
  it('stops community rewards at the daily ceiling', async () => {
    const { agent: helper, user: helperUser } = await studentAgent()
    const accepts = MAX_REWARD_CREDITS_PER_DAY / REWARD_ACCEPTED_ANSWER

    for (let i = 0; i < accepts; i += 1) {
      const { agent: asker } = await studentAgent()
      const question = await ask(asker)
      const posted = await answer(helper, question.id)
      const res = await asker.post(`/api/community/answers/${posted.id}/accept`)
      expect(res.body.reward.granted).toBe(true)
    }
    expect(await rewardTotal(helperUser.id)).toBe(MAX_REWARD_CREDITS_PER_DAY)

    const { agent: lateAsker } = await studentAgent()
    const question = await ask(lateAsker)
    const posted = await answer(helper, question.id)
    const blocked = await lateAsker.post(`/api/community/answers/${posted.id}/accept`)

    // The answer is still accepted; only the credit is withheld.
    expect(blocked.status).toBe(200)
    expect(blocked.body.status).toBe('solved')
    expect(blocked.body.reward).toMatchObject({ granted: false, reason: 'DAILY_CAP_REACHED' })
    expect(await rewardTotal(helperUser.id)).toBe(MAX_REWARD_CREDITS_PER_DAY)
  })

  it('stops community rewards at the weekly ceiling', async () => {
    const { agent: helper, user: helperUser } = await studentAgent()

    // Earned earlier in the week, so the daily window is clear but the weekly
    // one is nearly full.
    await query(
      `INSERT INTO credit_transactions
         (user_id, amount, credit_kind, transaction_type, description, created_at)
       VALUES ($1, $2, 'reward', 'community_bonus', 'Earlier this week', now() - interval '3 days')`,
      [helperUser.id, MAX_REWARD_CREDITS_PER_WEEK - 2],
    )

    const { agent: asker } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)
    const res = await asker.post(`/api/community/answers/${posted.id}/accept`)

    // 58 + 5 would exceed 60, so the reward is refused.
    expect(res.body.reward).toMatchObject({ granted: false, reason: 'WEEKLY_CAP_REACHED' })
    expect(await rewardTotal(helperUser.id)).toBe(MAX_REWARD_CREDITS_PER_WEEK - 2)
  })

  it('ignores rewards older than the window', async () => {
    const { agent: helper, user: helperUser } = await studentAgent()
    await query(
      `INSERT INTO credit_transactions
         (user_id, amount, credit_kind, transaction_type, description, created_at)
       VALUES ($1, $2, 'reward', 'community_bonus', 'Last month', now() - interval '40 days')`,
      [helperUser.id, MAX_REWARD_CREDITS_PER_WEEK],
    )

    const { agent: asker } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)
    const res = await asker.post(`/api/community/answers/${posted.id}/accept`)
    expect(res.body.reward.granted).toBe(true)
  })
})

describe('GET /api/community/me/stats', () => {
  it('counts contribution and derives reputation separately from credits', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper, user: helperUser } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)
    await asker.post(`/api/community/answers/${posted.id}/votes`)
    await asker.post(`/api/community/answers/${posted.id}/accept`)

    const res = await helper.get('/api/community/me/stats')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      questionsAsked: 0,
      answersPosted: 1,
      acceptedAnswers: 1,
      helpfulVotesReceived: 1,
    })
    // 1 accepted (10) + 1 vote (2) + 1 answer (1)
    expect(res.body.reputation).toBe(13)

    // Spending credits must not touch reputation.
    const { agent: admin } = await adminAgent()
    await admin
      .post(`/api/admin/credits/students/${helperUser.id}/adjustments`)
      .send({ amount: -6, creditKind: 'reward', reason: 'Spent on a lesson' })
    const after = await helper.get('/api/community/me/stats')
    expect(after.body.reputation).toBe(13)
  })
})

describe('reports', () => {
  const REASON = 'This looks copied from another site.'

  it('reports a question and shows it in the admin queue', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: reporter, user: reporterUser } = await studentAgent()
    const question = await ask(asker)

    const res = await reporter
      .post('/api/community/reports')
      .send({ targetType: 'question', targetId: question.id, reason: REASON })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      targetType: 'question',
      targetId: question.id,
      status: 'open',
    })

    const { agent: admin } = await adminAgent()
    const queue = await admin.get('/api/admin/community/reports')
    expect(queue.status).toBe(200)
    expect(queue.body).toHaveLength(1)
    expect(queue.body[0]).toMatchObject({
      targetType: 'question',
      targetId: question.id,
      reason: REASON,
      status: 'open',
    })
    expect(queue.body[0].reporter.id).toBe(reporterUser.id)
  })

  it('reports an answer without changing the content', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper } = await studentAgent()
    const question = await ask(asker)
    const posted = await answer(helper, question.id)

    const res = await asker
      .post('/api/community/reports')
      .send({ targetType: 'answer', targetId: posted.id, reason: REASON })
    expect(res.status).toBe(201)
    expect(res.body.targetType).toBe('answer')

    // Reporting queues a review; it is not moderation and hides nothing.
    const detail = await asker.get(`/api/community/questions/${question.id}`)
    expect(detail.body.status).toBe('open')
    expect(detail.body.answers).toHaveLength(1)
  })

  it('accepts the snake_case field names too', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: reporter } = await studentAgent()
    const question = await ask(asker)

    const res = await reporter
      .post('/api/community/reports')
      .send({ target_type: 'question', target_id: question.id, reason: REASON })
    expect(res.status).toBe(201)
    expect(res.body.targetType).toBe('question')
  })

  it('rejects an invalid target type', async () => {
    const { agent } = await studentAgent()
    const question = await ask(agent)

    const res = await agent
      .post('/api/community/reports')
      .send({ targetType: 'lesson', targetId: question.id, reason: REASON })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.targetType).toBe('INVALID')
  })

  it('404s a target that does not exist', async () => {
    const { agent } = await studentAgent()

    const res = await agent.post('/api/community/reports').send({
      targetType: 'answer',
      targetId: '00000000-0000-4000-8000-000000000000',
      reason: REASON,
    })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('requires a reason with something in it', async () => {
    const { agent } = await studentAgent()
    const question = await ask(agent)

    const missing = await agent
      .post('/api/community/reports')
      .send({ targetType: 'question', targetId: question.id })
    expect(missing.status).toBe(400)
    expect(missing.body.error.details.reason).toBe('REQUIRED')

    const tooShort = await agent
      .post('/api/community/reports')
      .send({ targetType: 'question', targetId: question.id, reason: 'bad' })
    expect(tooShort.status).toBe(400)
    expect(tooShort.body.error.details.reason).toBe('REQUIRED')
  })

  it('requires a student session', async () => {
    const { agent: asker } = await studentAgent()
    const question = await ask(asker)
    const body = { targetType: 'question', targetId: question.id, reason: REASON }

    expect((await request(app).post('/api/community/reports').send(body)).status).toBe(401)
    const { agent: admin } = await adminAgent()
    expect((await admin.post('/api/community/reports').send(body)).status).toBe(403)
  })

  it('refuses a duplicate open report from the same student', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: reporter } = await studentAgent()
    const question = await ask(asker)
    const body = { targetType: 'question', targetId: question.id, reason: REASON }

    expect((await reporter.post('/api/community/reports').send(body)).status).toBe(201)

    const again = await reporter.post('/api/community/reports').send(body)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_REPORTED')

    // A different student reporting the same question is a separate signal.
    const { agent: other } = await studentAgent()
    expect((await other.post('/api/community/reports').send(body)).status).toBe(201)

    const { agent: admin } = await adminAgent()
    expect((await admin.get('/api/admin/community/reports')).body).toHaveLength(2)
  })

  it('lets a student report again once the first report is handled', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: reporter } = await studentAgent()
    const question = await ask(asker)
    const body = { targetType: 'question', targetId: question.id, reason: REASON }

    const first = await reporter.post('/api/community/reports').send(body)
    // The unique index is partial on 'open', so a handled report frees the slot.
    await query(`UPDATE community_reports SET status = 'reviewed' WHERE id = $1`, [first.body.id])

    expect((await reporter.post('/api/community/reports').send(body)).status).toBe(201)
  })
})

describe('admin community moderation', () => {
  it('lists, inspects, closes and reopens questions', async () => {
    const { agent: asker } = await studentAgent()
    const { agent: helper } = await studentAgent()
    const question = await ask(asker)
    await answer(helper, question.id)

    const { agent: admin } = await adminAgent()
    const list = await admin.get('/api/admin/community/questions')
    expect(list.status).toBe(200)
    expect(list.body).toHaveLength(1)

    const detail = await admin.get(`/api/admin/community/questions/${question.id}`)
    expect(detail.body.answers).toHaveLength(1)

    const closed = await admin
      .patch(`/api/admin/community/questions/${question.id}/status`)
      .send({ status: 'closed' })
    expect(closed.body.status).toBe('closed')

    // A closed question rejects new answers.
    const rejected = await helper
      .post(`/api/community/questions/${question.id}/answers`)
      .send({ body: 'Trying to answer a closed question.' })
    expect(rejected.status).toBe(422)
    expect(rejected.body.error.code).toBe('QUESTION_CLOSED')

    const reopened = await admin
      .patch(`/api/admin/community/questions/${question.id}/status`)
      .send({ status: 'open' })
    expect(reopened.body.status).toBe('open')
  })

  it('is admin-only', async () => {
    const { agent: student } = await studentAgent()
    expect((await student.get('/api/admin/community/questions')).status).toBe(403)
  })
})
