import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// Reputation is a separate, non-spendable score: it counts contribution and
// never drops when credits are spent (Phase 11).
const POINTS_PER_ACCEPTED_ANSWER = 10
const POINTS_PER_HELPFUL_VOTE = 2
const POINTS_PER_ANSWER = 1

// GET /api/community/me/stats
//
// Every count ignores questions an admin removed, including answers and votes
// that hang off them: a student must not see a score built on content that no
// longer exists for them. Credits already earned are untouched by removal —
// reputation reflects visible contribution, the ledger records history.
router.get('/me/stats', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         (SELECT count(*)::int FROM community_questions
            WHERE user_id = $1 AND deleted_at IS NULL) AS questions_asked,
         (SELECT count(*)::int FROM community_answers a
            JOIN community_questions q ON q.id = a.question_id
            WHERE a.user_id = $1 AND q.deleted_at IS NULL) AS answers_posted,
         (SELECT count(*)::int FROM community_questions q
            JOIN community_answers a ON a.id = q.accepted_answer_id
            WHERE a.user_id = $1 AND q.deleted_at IS NULL) AS accepted_answers,
         (SELECT count(*)::int FROM community_votes v
            JOIN community_answers a ON a.id = v.answer_id
            JOIN community_questions q ON q.id = a.question_id
            WHERE a.user_id = $1 AND q.deleted_at IS NULL) AS helpful_votes_received`,
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
