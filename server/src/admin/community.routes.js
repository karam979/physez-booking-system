import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, LANGUAGES } from '../validate.js'
import { QUESTION_STATUSES } from '../community/rewards.js'
import { serializeQuestionSummary, serializeQuestionDetail } from '../community/serialize.js'

const router = Router()

const QUESTION_SELECT = `
  SELECT q.*, u.name AS author_name, u.id AS author_id,
         t.name_en, t.name_ar, t.name_he,
         (SELECT count(*) FROM community_answers a WHERE a.question_id = q.id) AS answer_count
  FROM community_questions q
  JOIN users u ON u.id = q.user_id
  JOIN topics t ON t.id = q.topic_id`

// GET /api/admin/community/questions?status=&language=
router.get('/questions', async (req, res, next) => {
  try {
    const { status, language } = req.query
    const details = {}
    if (status !== undefined && !QUESTION_STATUSES.includes(status)) details.status = 'INVALID'
    if (language !== undefined && !LANGUAGES.includes(language)) details.language = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid filters.', details))
    }

    const where = []
    const params = []
    if (status !== undefined) {
      params.push(status)
      where.push(`q.status = $${params.length}`)
    }
    if (language !== undefined) {
      params.push(language)
      where.push(`q.language = $${params.length}`)
    }

    const { rows } = await query(
      `${QUESTION_SELECT}
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY q.created_at DESC LIMIT 100`,
      params,
    )
    res.json(rows.map(serializeQuestionSummary))
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/community/questions/:id — question with answers for review.
router.get('/questions/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Question id must be a UUID.', { id: 'INVALID' }))
    }
    const { rows } = await query(`${QUESTION_SELECT} WHERE q.id = $1`, [id])
    const question = rows[0]
    if (!question) {
      return res.status(404).json(apiError('NOT_FOUND', 'Question not found.'))
    }
    const answers = await query(
      `SELECT a.*, u.name AS author_name, u.id AS author_id,
              (SELECT count(*) FROM community_votes v WHERE v.answer_id = a.id) AS vote_count
       FROM community_answers a JOIN users u ON u.id = a.user_id
       WHERE a.question_id = $1 ORDER BY a.created_at`,
      [id],
    )
    res.json(
      serializeQuestionDetail(
        question,
        answers.rows.map((row) => ({
          id: row.id,
          body: row.body,
          author: { id: row.author_id, name: row.author_name },
          voteCount: Number(row.vote_count),
          isAccepted: question.accepted_answer_id === row.id,
          createdAt: row.created_at.toISOString(),
        })),
      ),
    )
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/community/questions/:id/status — close or reopen.
// Moderation never deletes content or reverses credits already earned.
router.patch('/questions/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params
    const { status } = req.body ?? {}
    const details = {}
    if (!isUuid(id)) details.id = 'INVALID'
    if (status !== 'closed' && status !== 'open') details.status = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid status change.', details))
    }

    const existing = await query(
      `SELECT id, accepted_answer_id FROM community_questions WHERE id = $1`,
      [id],
    )
    if (existing.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'Question not found.'))
    }

    // Reopening a question that already has an accepted answer returns it to
    // 'solved' rather than pretending it is unanswered.
    const nextStatus = status === 'open' && existing.rows[0].accepted_answer_id ? 'solved' : status

    const { rows } = await query(
      `UPDATE community_questions SET status = $2, updated_at = now() WHERE id = $1
       RETURNING id, status`,
      [id, nextStatus],
    )
    res.json({ id: rows[0].id, status: rows[0].status })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/community/reports — basic moderation queue.
router.get('/reports', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.*, u.name AS reporter_name
       FROM community_reports r JOIN users u ON u.id = r.reporter_user_id
       ORDER BY r.created_at DESC LIMIT 100`,
    )
    res.json(
      rows.map((row) => ({
        id: row.id,
        reporter: { id: row.reporter_user_id, name: row.reporter_name },
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at.toISOString(),
      })),
    )
  } catch (err) {
    next(err)
  }
})

export default router
