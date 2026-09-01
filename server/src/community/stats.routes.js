import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// Reputation is a separate, non-spendable score: it counts contribution and
// never drops when credits are spent (Phase 11).
const POINTS_PER_ACCEPTED_ANSWER = 10
const POINTS_PER_HELPFUL_VOTE = 2
const POINTS_PER_ANSWER = 1

// GET /api/community/me/stats
router.get('/me/stats', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         (SELECT count(*)::int FROM community_questions WHERE user_id = $1) AS questions_asked,
         (SELECT count(*)::int FROM community_answers WHERE user_id = $1) AS answers_posted,
         (SELECT count(*)::int FROM community_questions q
            JOIN community_answers a ON a.id = q.accepted_answer_id
            WHERE a.user_id = $1) AS accepted_answers,
         (SELECT count(*)::int FROM community_votes v
            JOIN community_answers a ON a.id = v.answer_id
            WHERE a.user_id = $1) AS helpful_votes_received`,
      [req.user.id],
    )
    const stats = rows[0]
    const reputation =
      stats.accepted_answers * POINTS_PER_ACCEPTED_ANSWER +
      stats.helpful_votes_received * POINTS_PER_HELPFUL_VOTE +
      stats.answers_posted * POINTS_PER_ANSWER

    res.json({
      questionsAsked: stats.questions_asked,
      answersPosted: stats.answers_posted,
      acceptedAnswers: stats.accepted_answers,
      helpfulVotesReceived: stats.helpful_votes_received,
      reputation,
    })
  } catch (err) {
    next(err)
  }
})

export default router
