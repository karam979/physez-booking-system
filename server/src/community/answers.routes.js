import { Router } from 'express'
import { query, getPool } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid } from '../validate.js'
import { grantCommunityReward } from '../credits/service.js'
import { REWARD_ACCEPTED_ANSWER, REWARD_HELPFUL_VOTE, BODY_MAX_LENGTH } from './rewards.js'
import { serializeAnswer } from './serialize.js'

const router = Router()

const UNIQUE_VIOLATION = '23505'

function loadAnswerRow(client, answerId) {
  return client.query(
    `SELECT a.*, q.user_id AS question_author_id, q.status AS question_status,
            q.accepted_answer_id
     FROM community_answers a
     JOIN community_questions q ON q.id = a.question_id
     WHERE a.id = $1
     FOR UPDATE OF a`,
    [answerId],
  )
}

// POST /api/community/questions/:id/answers
router.post('/questions/:id/answers', async (req, res, next) => {
  try {
    const { id } = req.params
    const { body } = req.body ?? {}
    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Question id must be a UUID.', { id: 'INVALID' }))
    }
    if (typeof body !== 'string' || body.trim().length < 10 || body.length > BODY_MAX_LENGTH) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid answer.', { body: 'INVALID' }))
    }

    const question = await query(`SELECT id, status FROM community_questions WHERE id = $1`, [id])
    if (question.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'Question not found.'))
    }
    if (question.rows[0].status === 'closed') {
      return res
        .status(422)
        .json(apiError('QUESTION_CLOSED', 'This question is closed and cannot receive answers.'))
    }

    const inserted = await query(
      `INSERT INTO community_answers (question_id, user_id, body)
       VALUES ($1, $2, $3) RETURNING id`,
      [id, req.user.id, body.trim()],
    )
    const { rows } = await query(
      `SELECT a.*, u.name AS author_name, u.id AS author_id, 0 AS vote_count,
              false AS viewer_has_voted
       FROM community_answers a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
      [inserted.rows[0].id],
    )
    res.status(201).json(serializeAnswer(rows[0], { viewerId: req.user.id }))
  } catch (err) {
    next(err)
  }
})

// POST /api/community/answers/:answerId/votes — "this helped me".
// The vote row is the guard: UNIQUE(answer_id, user_id) makes a double submit
// impossible, and the reward key is per (answer, voter) so unvoting and voting
// again cannot mint a second reward.
router.post('/answers/:answerId/votes', async (req, res, next) => {
  const { answerId } = req.params
  if (!isUuid(answerId)) {
    return res
      .status(400)
      .json(apiError('VALIDATION_ERROR', 'Answer id must be a UUID.', { answerId: 'INVALID' }))
  }
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    const answerResult = await loadAnswerRow(client, answerId)
    const answer = answerResult.rows[0]
    if (!answer) {
      await client.query('ROLLBACK')
      return res.status(404).json(apiError('NOT_FOUND', 'Answer not found.'))
    }
    if (answer.user_id === req.user.id) {
      await client.query('ROLLBACK')
      return res.status(422).json(apiError('SELF_VOTE', 'You cannot vote for your own answer.'))
    }

    let vote
    try {
      const inserted = await client.query(
        `INSERT INTO community_votes (answer_id, user_id) VALUES ($1, $2) RETURNING id`,
        [answerId, req.user.id],
      )
      vote = inserted.rows[0]
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        await client.query('ROLLBACK')
        return res.status(409).json(apiError('ALREADY_VOTED', 'You already voted for this answer.'))
      }
      throw err
    }

    const reward = await grantCommunityReward(client, {
      userId: answer.user_id,
      amount: REWARD_HELPFUL_VOTE,
      transactionType: 'community_vote_reward',
      description: 'Helpful answer vote',
      idempotencyKey: `community_vote_reward:${answerId}:${req.user.id}`,
      answerId,
      metadata: { voteId: vote.id },
    })

    await client.query('COMMIT')

    const counts = await query(
      `SELECT count(*)::int AS n FROM community_votes WHERE answer_id = $1`,
      [answerId],
    )
    res.status(201).json({
      answerId,
      voteCount: counts.rows[0].n,
      viewerHasVoted: true,
      reward: { granted: reward.granted, amount: reward.amount, reason: reward.reason },
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
})

// DELETE /api/community/answers/:answerId/votes — withdraw a vote.
// Credits already earned are not clawed back; the reward key above means a
// later re-vote cannot earn again.
router.delete('/answers/:answerId/votes', async (req, res, next) => {
  try {
    const { answerId } = req.params
    if (!isUuid(answerId)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Answer id must be a UUID.', { answerId: 'INVALID' }))
    }
    const removed = await query(
      `DELETE FROM community_votes WHERE answer_id = $1 AND user_id = $2 RETURNING id`,
      [answerId, req.user.id],
    )
    if (removed.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'You have not voted for this answer.'))
    }
    const counts = await query(
      `SELECT count(*)::int AS n FROM community_votes WHERE answer_id = $1`,
      [answerId],
    )
    res.json({ answerId, voteCount: counts.rows[0].n, viewerHasVoted: false })
  } catch (err) {
    next(err)
  }
})

// POST /api/community/answers/:answerId/accept — only the question author,
// only once per question, and never a reward for accepting your own answer.
router.post('/answers/:answerId/accept', async (req, res, next) => {
  const { answerId } = req.params
  if (!isUuid(answerId)) {
    return res
      .status(400)
      .json(apiError('VALIDATION_ERROR', 'Answer id must be a UUID.', { answerId: 'INVALID' }))
  }
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    const answerResult = await loadAnswerRow(client, answerId)
    const answer = answerResult.rows[0]
    if (!answer) {
      await client.query('ROLLBACK')
      return res.status(404).json(apiError('NOT_FOUND', 'Answer not found.'))
    }

    // Lock the question so two concurrent accepts cannot both pass the check.
    const questionResult = await client.query(
      `SELECT * FROM community_questions WHERE id = $1 FOR UPDATE`,
      [answer.question_id],
    )
    const question = questionResult.rows[0]

    if (question.user_id !== req.user.id) {
      await client.query('ROLLBACK')
      return res
        .status(403)
        .json(apiError('FORBIDDEN', 'Only the student who asked can accept an answer.'))
    }
    if (question.accepted_answer_id) {
      await client.query('ROLLBACK')
      return res
        .status(409)
        .json(apiError('ANSWER_ALREADY_ACCEPTED', 'This question already has an accepted answer.'))
    }
    if (question.status === 'closed') {
      await client.query('ROLLBACK')
      return res.status(422).json(apiError('QUESTION_CLOSED', 'This question is closed.'))
    }

    await client.query(
      `UPDATE community_questions
       SET accepted_answer_id = $2, status = 'solved', updated_at = now()
       WHERE id = $1`,
      [question.id, answerId],
    )

    // Accepting your own answer marks the question solved but earns nothing.
    let reward = { granted: false, amount: 0, reason: 'SELF_ANSWER' }
    if (answer.user_id !== req.user.id) {
      reward = await grantCommunityReward(client, {
        userId: answer.user_id,
        amount: REWARD_ACCEPTED_ANSWER,
        transactionType: 'community_answer_reward',
        description: 'Accepted community answer',
        idempotencyKey: `community_answer_reward:${answerId}`,
        answerId,
        metadata: { questionId: question.id },
      })
    }

    await client.query('COMMIT')
    res.json({
      questionId: question.id,
      acceptedAnswerId: answerId,
      status: 'solved',
      reward: { granted: reward.granted, amount: reward.amount, reason: reward.reason },
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
})

export default router
