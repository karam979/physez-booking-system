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

// The right option for question 3. It is a normal multiple-choice option, so
// it legitimately appears in the payload — what must never appear is any
// field marking it as the right one.
const SECRET_ANSWER = 'p = mv'

let topicId
let quizId
let questionIds

beforeEach(async () => {
  await truncateAll()
  await query('TRUNCATE quiz_attempts, quiz_questions, diagnostic_quizzes, lessons CASCADE')
  topicId = await createTopic()
  await createSlot(t(8), t(18))

  const quiz = await query(
    `INSERT INTO diagnostic_quizzes (topic_id, title) VALUES ($1, 'Mechanics basics') RETURNING id`,
    [topicId],
  )
  quizId = quiz.rows[0].id

  const rows = await query(
    `INSERT INTO quiz_questions (quiz_id, question_text, options, correct_answer, position)
     VALUES
       ($1, 'What is the SI unit of force?', $2, 'newton', 1),
       ($1, 'Acceleration due to gravity is about?', $3, '9.8', 2),
       ($1, 'Momentum equals?', $4, $5, 3)
     RETURNING id, position`,
    [
      quizId,
      JSON.stringify(['newton', 'joule', 'watt']),
      JSON.stringify(['9.8', '3.0', '12.4']),
      JSON.stringify(['mass times velocity', 'force times time', SECRET_ANSWER]),
      SECRET_ANSWER,
    ],
  )
  questionIds = rows.rows.sort((a, b) => a.position - b.position).map((row) => row.id)
})

afterAll(closePool)

async function createBooking(agent, startAt = t(9)) {
  const res = await agent
    .post('/api/bookings')
    .send({ lessonType: 'zoom', durationMinutes: 60, language: 'en', topicId, startAt })
  if (res.status !== 201) throw new Error(`booking create failed: ${res.status}`)
  return res.body
}

describe('GET /api/quizzes/topic/:topicId', () => {
  it('returns questions and options for the active quiz', async () => {
    const { agent } = await studentAgent()
    const res = await agent.get(`/api/quizzes/topic/${topicId}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: quizId, topicId, title: 'Mechanics basics' })
    expect(res.body.questions).toHaveLength(3)
    expect(res.body.questions[0]).toMatchObject({
      questionText: 'What is the SI unit of force?',
      position: 1,
    })
    expect(res.body.questions[0].options).toEqual(['newton', 'joule', 'watt'])
  })

  it('SECURITY: correct_answer never appears anywhere in the response', async () => {
    const { agent } = await studentAgent()
    const res = await agent.get(`/api/quizzes/topic/${topicId}`)

    // Deep scan: no key by either spelling, at any depth.
    const keys = new Set()
    const collectKeys = (node) => {
      if (Array.isArray(node)) return node.forEach(collectKeys)
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          keys.add(key)
          collectKeys(value)
        }
      }
    }
    collectKeys(res.body)
    expect(keys.has('correct_answer')).toBe(false)
    expect(keys.has('correctAnswer')).toBe(false)

    // A question exposes exactly these fields — nothing that ranks, flags or
    // orders the options can sneak in.
    for (const question of res.body.questions) {
      expect(Object.keys(question).sort()).toEqual(['id', 'options', 'position', 'questionText'])
    }

    // The answer key is genuinely stored for this quiz, and the right option
    // is indistinguishable from the wrong ones in the payload.
    const stored = await query(`SELECT correct_answer FROM quiz_questions WHERE quiz_id = $1`, [
      quizId,
    ])
    expect(stored.rows.map((row) => row.correct_answer)).toContain(SECRET_ANSWER)

    const momentum = res.body.questions.find((q) => q.questionText === 'Momentum equals?')
    expect(momentum.options).toContain(SECRET_ANSWER)
    expect(momentum.options.every((option) => typeof option === 'string')).toBe(true)
  })

  it('SECURITY: the answer key never leaks through the attempt response either', async () => {
    const { agent } = await studentAgent()
    const res = await agent
      .post(`/api/quizzes/${quizId}/attempts`)
      .send({ answers: [{ questionId: questionIds[0], answer: 'joule' }] })

    expect(res.status).toBe(201)
    expect(Object.keys(res.body).sort()).toEqual([
      'bookingId',
      'correctCount',
      'id',
      'quizId',
      'score',
      'submittedAt',
      'totalQuestions',
    ])
  })

  it('404s when the topic has no active quiz', async () => {
    const { agent } = await studentAgent()
    await query(`UPDATE diagnostic_quizzes SET active = false WHERE id = $1`, [quizId])
    const res = await agent.get(`/api/quizzes/topic/${topicId}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('QUIZ_NOT_FOUND')
  })

  it('requires a student session', async () => {
    const { agent: admin } = await adminAgent()
    expect((await admin.get(`/api/quizzes/topic/${topicId}`)).status).toBe(403)
  })
})

describe('POST /api/quizzes/:id/attempts', () => {
  const allCorrect = () => [
    { questionId: questionIds[0], answer: 'newton' },
    { questionId: questionIds[1], answer: '9.8' },
    { questionId: questionIds[2], answer: SECRET_ANSWER },
  ]

  it('scores a perfect attempt server-side and stores it', async () => {
    const { agent, user } = await studentAgent()
    const res = await agent.post(`/api/quizzes/${quizId}/attempts`).send({ answers: allCorrect() })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ score: 100, correctCount: 3, totalQuestions: 3 })

    const { rows } = await query(`SELECT student_id, score FROM quiz_attempts WHERE quiz_id = $1`, [
      quizId,
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].student_id).toBe(user.id)
    expect(Number(rows[0].score)).toBe(100)
  })

  it('scores a partial attempt and counts unanswered questions as wrong', async () => {
    const { agent } = await studentAgent()
    const res = await agent
      .post(`/api/quizzes/${quizId}/attempts`)
      .send({ answers: [{ questionId: questionIds[0], answer: 'newton' }] })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ correctCount: 1, totalQuestions: 3, score: 33.33 })
  })

  it('ignores a client-sent score and never echoes the answer key', async () => {
    const { agent } = await studentAgent()
    const res = await agent
      .post(`/api/quizzes/${quizId}/attempts`)
      .send({ answers: [{ questionId: questionIds[0], answer: 'joule' }], score: 100 })

    expect(res.status).toBe(201)
    expect(res.body.score).toBe(0)
    expect(JSON.stringify(res.body)).not.toContain(SECRET_ANSWER)
  })

  it('links an attempt to the student’s own booking, rejecting someone else’s', async () => {
    const { agent } = await studentAgent()
    const booking = await createBooking(agent)
    const linked = await agent
      .post(`/api/quizzes/${quizId}/attempts`)
      .send({ answers: allCorrect(), bookingId: booking.id })
    expect(linked.status).toBe(201)
    expect(linked.body.bookingId).toBe(booking.id)

    const { agent: other } = await studentAgent()
    const stolen = await other
      .post(`/api/quizzes/${quizId}/attempts`)
      .send({ answers: allCorrect(), bookingId: booking.id })
    expect(stolen.status).toBe(403)
  })

  it('validates the payload', async () => {
    const { agent } = await studentAgent()
    const notArray = await agent.post(`/api/quizzes/${quizId}/attempts`).send({ answers: 'newton' })
    expect(notArray.status).toBe(400)

    const badEntry = await agent
      .post(`/api/quizzes/${quizId}/attempts`)
      .send({ answers: [{ questionId: 'nope', answer: 1 }] })
    expect(badEntry.status).toBe(400)
    expect(badEntry.body.error.details.answers).toBe('INVALID_ENTRY')
  })
})

describe('POST /api/admin/bookings/:id/lesson', () => {
  async function confirmedBooking() {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student)
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    return { booking, admin, student }
  }

  const summary = {
    attendance: 'present',
    summary: 'Covered Newton’s second law.',
    homework: 'Exercises 3–7.',
    feedback: 'Strong grasp of free-body diagrams.',
  }

  it('creates the summary and marks the booking completed', async () => {
    const { booking, admin } = await confirmedBooking()
    const res = await admin.post(`/api/admin/bookings/${booking.id}/lesson`).send(summary)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ bookingId: booking.id, attendance: 'present' })

    const { rows } = await query(`SELECT status FROM bookings WHERE id = $1`, [booking.id])
    expect(rows[0].status).toBe('completed')
  })

  it('upserts: a second save edits the same lesson row', async () => {
    const { booking, admin } = await confirmedBooking()
    const first = await admin.post(`/api/admin/bookings/${booking.id}/lesson`).send(summary)
    const second = await admin
      .post(`/api/admin/bookings/${booking.id}/lesson`)
      .send({ ...summary, attendance: 'late', homework: 'Exercises 3–9.' })

    expect(second.status).toBe(201)
    expect(second.body.id).toBe(first.body.id)
    expect(second.body).toMatchObject({ attendance: 'late', homework: 'Exercises 3–9.' })

    const { rows } = await query(`SELECT count(*)::int AS n FROM lessons WHERE booking_id = $1`, [
      booking.id,
    ])
    expect(rows[0].n).toBe(1)
  })

  it('validates attendance and rejects a pending booking', async () => {
    const { booking, admin } = await confirmedBooking()
    const bad = await admin
      .post(`/api/admin/bookings/${booking.id}/lesson`)
      .send({ ...summary, attendance: 'maybe' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.details.attendance).toBe('INVALID')

    const { agent: student } = await studentAgent()
    const pending = await createBooking(student, t(13))
    const res = await admin.post(`/api/admin/bookings/${pending.id}/lesson`).send(summary)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('INVALID_BOOKING_STATUS')
  })

  it('is admin-only', async () => {
    const { booking, student } = await confirmedBooking()
    const res = await student.post(`/api/admin/bookings/${booking.id}/lesson`).send(summary)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/progress/me', () => {
  it('aggregates completed lessons and quiz scores for the caller only', async () => {
    const { agent: student } = await studentAgent()
    const booking = await createBooking(student)
    const { agent: admin } = await adminAgent()
    await admin.patch(`/api/admin/bookings/${booking.id}/confirm`)
    await admin.post(`/api/admin/bookings/${booking.id}/lesson`).send({
      attendance: 'present',
      summary: 'Covered Newton’s second law.',
      homework: 'Exercises 3–7.',
      feedback: 'Good work.',
    })
    await student
      .post(`/api/quizzes/${quizId}/attempts`)
      .send({ answers: [{ questionId: questionIds[0], answer: 'newton' }] })

    const res = await student.get('/api/progress/me')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      completedLessons: 1,
      quizAttempts: 1,
      averageScore: 33.33,
    })
    expect(res.body.lessons[0]).toMatchObject({
      bookingId: booking.id,
      summary: 'Covered Newton’s second law.',
      attendance: 'present',
    })
    expect(res.body.attempts[0]).toMatchObject({ title: 'Mechanics basics', score: 33.33 })

    // A different student sees an empty history, not this one.
    const { agent: other } = await studentAgent()
    const empty = await other.get('/api/progress/me')
    expect(empty.body).toMatchObject({ completedLessons: 0, quizAttempts: 0, averageScore: null })
    expect(empty.body.lessons).toEqual([])
  })

  it('requires a student session', async () => {
    const { agent: admin } = await adminAgent()
    expect((await admin.get('/api/progress/me')).status).toBe(403)
  })
})
