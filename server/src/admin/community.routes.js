import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, LANGUAGES } from '../validate.js'
import {
  QUESTION_STATUSES,
  REPORT_STATUSES,
  REPORT_DECISIONS,
  REMOVAL_REASON_MIN_LENGTH,
  REMOVAL_REASON_MAX_LENGTH,
} from '../community/rewards.js'
import { serializeQuestionSummary, serializeQuestionDetail } from '../community/serialize.js'

const router = Router()

// Admins see removed questions too, so the select carries the audit columns
// and the name of the admin who removed it.
const QUESTION_SELECT = `
  SELECT q.*, u.name AS author_name, u.id AS author_id,
         t.name_en, t.name_ar, t.name_he,
         d.name AS deleted_by_name,
         (SELECT count(*) FROM community_answers a WHERE a.question_id = q.id) AS answer_count
  FROM community_questions q
  JOIN users u ON u.id = q.user_id
  JOIN topics t ON t.id = q.topic_id
  LEFT JOIN users d ON d.id = q.deleted_by`

// How the questions list treats removed rows. Active-only is the default so
// the moderation list reads like the student feed unless asked otherwise.
const REMOVED_FILTERS = {
  excluded: 'q.deleted_at IS NULL',
  included: null,
  only: 'q.deleted_at IS NOT NULL',
}

// GET /api/admin/community/questions?status=&language=
router.get('/questions', async (req, res, next) => {
  try {
    const { status, language } = req.query
    const removed = req.query.removed ?? 'excluded'
    const details = {}
    if (status !== undefined && !QUESTION_STATUSES.includes(status)) details.status = 'INVALID'
    if (language !== undefined && !LANGUAGES.includes(language)) details.language = 'INVALID'
    if (!Object.keys(REMOVED_FILTERS).includes(removed)) details.removed = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid filters.', details))
    }

    const where = []
    const params = []
    if (REMOVED_FILTERS[removed]) where.push(REMOVED_FILTERS[removed])
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
    res.json(rows.map((row) => serializeQuestionSummary(row, { includeRemoval: true })))
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
        { includeRemoval: true },
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
      `SELECT id, accepted_answer_id, deleted_at FROM community_questions WHERE id = $1`,
      [id],
    )
    if (existing.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'Question not found.'))
    }
    // Open/closed is meaningless once a question is removed; restore it first.
    if (existing.rows[0].deleted_at) {
      return res
        .status(422)
        .json(apiError('QUESTION_REMOVED', 'Restore this question before changing its status.'))
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

// PATCH /api/admin/community/questions/:id/removal — soft delete or restore.
//
// The row is never deleted. Answers, votes, reports and every credit already
// earned from this thread stay exactly as they are; only deleted_at changes,
// and that is what hides the question from students. Sending the same removal
// twice is a no-op, so a double click cannot rewrite the audit trail.
router.patch('/questions/:id/removal', async (req, res, next) => {
  try {
    const { id } = req.params
    const { removed, reason } = req.body ?? {}

    const details = {}
    if (!isUuid(id)) details.id = 'INVALID'
    if (typeof removed !== 'boolean') details.removed = 'INVALID'
    if (removed === true) {
      const text = typeof reason === 'string' ? reason.trim() : ''
      if (text.length < REMOVAL_REASON_MIN_LENGTH || text.length > REMOVAL_REASON_MAX_LENGTH) {
        details.reason = 'REQUIRED'
      }
    }
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid removal.', details))
    }

    const existing = await query(`SELECT id, deleted_at FROM community_questions WHERE id = $1`, [
      id,
    ])
    if (existing.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'Question not found.'))
    }

    // Idempotent: repeating the current state changes nothing and keeps the
    // original deleted_at and reason rather than overwriting the audit trail.
    const alreadyInState = Boolean(existing.rows[0].deleted_at) === removed
    if (!alreadyInState) {
      await query(
        `UPDATE community_questions
         SET deleted_at = $2, deleted_by = $3, deletion_reason = $4, updated_at = now()
         WHERE id = $1`,
        [
          id,
          removed ? new Date() : null,
          removed ? req.user.id : null,
          removed ? reason.trim() : null,
        ],
      )
    }

    const { rows } = await query(`${QUESTION_SELECT} WHERE q.id = $1`, [id])
    res.json(serializeQuestionSummary(rows[0], { includeRemoval: true }))
  } catch (err) {
    next(err)
  }
})

const EXCERPT_LENGTH = 200

// What was reported, so the queue is readable without opening every item. The
// target may already be gone, in which case there is nothing left to show.
// A removed question keeps its report readable: moderation still needs the
// context, and the admin detail page can still open it.
function reportTarget(row) {
  if (row.target_type === 'question' && row.question_id) {
    return {
      questionId: row.question_id,
      excerpt: row.question_title,
      removed: Boolean(row.question_deleted_at),
    }
  }
  if (row.target_type === 'answer' && row.answer_id) {
    return {
      questionId: row.answer_question_id,
      excerpt: row.answer_body.slice(0, EXCERPT_LENGTH),
      removed: Boolean(row.answer_question_deleted_at),
    }
  }
  return null
}

function serializeReport(row) {
  return {
    id: row.id,
    reporter: { id: row.reporter_user_id, name: row.reporter_name },
    targetType: row.target_type,
    targetId: row.target_id,
    target: reportTarget(row),
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  }
}

// GET /api/admin/community/reports?status= — the moderation queue.
router.get('/reports', async (req, res, next) => {
  try {
    const { status } = req.query
    if (status !== undefined && !REPORT_STATUSES.includes(status)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Invalid report filter.', { status: 'INVALID' }))
    }

    const { rows } = await query(
      `SELECT r.*, u.name AS reporter_name,
              q.id AS question_id, q.title AS question_title, q.deleted_at AS question_deleted_at,
              a.id AS answer_id, a.body AS answer_body, a.question_id AS answer_question_id,
              aq.deleted_at AS answer_question_deleted_at
       FROM community_reports r
       JOIN users u ON u.id = r.reporter_user_id
       LEFT JOIN community_questions q ON r.target_type = 'question' AND q.id = r.target_id
       LEFT JOIN community_answers a ON r.target_type = 'answer' AND a.id = r.target_id
       LEFT JOIN community_questions aq ON r.target_type = 'answer' AND aq.id = a.question_id
       WHERE ($1::text IS NULL OR r.status = $1)
       ORDER BY r.created_at DESC LIMIT 100`,
      [status ?? null],
    )
    res.json(rows.map(serializeReport))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/community/reports/:id/status — mark a report handled.
// Moderation records a decision; it never deletes the reported content.
router.patch('/reports/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params
    const { status } = req.body ?? {}
    const details = {}
    if (!isUuid(id)) details.id = 'INVALID'
    if (!REPORT_DECISIONS.includes(status)) details.status = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid report decision.', details))
    }

    const { rows } = await query(
      `UPDATE community_reports SET status = $2 WHERE id = $1 RETURNING id, status`,
      [id, status],
    )
    if (rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', 'Report not found.'))
    }
    res.json({ id: rows[0].id, status: rows[0].status })
  } catch (err) {
    next(err)
  }
})

export default router
