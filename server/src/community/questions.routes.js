import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, LANGUAGES } from '../validate.js'
import { QUESTION_STATUSES, TITLE_MAX_LENGTH, BODY_MAX_LENGTH } from './rewards.js'
import { serializeQuestionSummary, serializeQuestionDetail, serializeAnswer } from './serialize.js'

const router = Router()

const MAX_PAGE_SIZE = 50

const QUESTION_SELECT = `
  SELECT q.*, u.name AS author_name, u.id AS author_id,
         t.name_en, t.name_ar, t.name_he,
         (SELECT count(*) FROM community_answers a WHERE a.question_id = q.id) AS answer_count
  FROM community_questions q
  JOIN users u ON u.id = q.user_id
  JOIN topics t ON t.id = q.topic_id`

// GET /api/community/questions?topicId=&status=&language=&unanswered=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const { topicId, status, language, unanswered, limit, offset } = req.query
    const details = {}
    if (topicId !== undefined && !isUuid(topicId)) details.topicId = 'INVALID'
    if (status !== undefined && !QUESTION_STATUSES.includes(status)) details.status = 'INVALID'
    if (language !== undefined && !LANGUAGES.includes(language)) details.language = 'INVALID'
    if (unanswered !== undefined && unanswered !== 'true' && unanswered !== 'false') {
      details.unanswered = 'INVALID'
    }
    const size = limit === undefined ? 20 : Number(limit)
    const skip = offset === undefined ? 0 : Number(offset)
    if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) details.limit = 'INVALID'
    if (!Number.isInteger(skip) || skip < 0) details.offset = 'INVALID'
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid filters.', details))
    }

    const where = []
    const params = []
    if (topicId !== undefined) {
      params.push(topicId)
      where.push(`q.topic_id = $${params.length}`)
    }
    if (status !== undefined) {
      params.push(status)
      where.push(`q.status = $${params.length}`)
    }
    if (language !== undefined) {
      params.push(language)
      where.push(`q.language = $${params.length}`)
    }
    if (unanswered === 'true') {
      where.push(`NOT EXISTS (SELECT 1 FROM community_answers a WHERE a.question_id = q.id)`)
    }

    params.push(size, skip)
    const { rows } = await query(
      `${QUESTION_SELECT}
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY q.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    const countParams = params.slice(0, params.length - 2)
    const total = await query(
      `SELECT count(*)::int AS n FROM community_questions q
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}`,
      countParams,
    )

    res.json({
      questions: rows.map((row) => serializeQuestionSummary(row, { viewerId: req.user.id })),
      total: total.rows[0].n,
      limit: size,
      offset: skip,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/community/questions
router.post('/', async (req, res, next) => {
  try {
    const { topicId, language, title, body } = req.body ?? {}
    const details = {}
    if (!isUuid(topicId)) details.topicId = 'INVALID'
    if (!LANGUAGES.includes(language)) details.language = 'INVALID'
    if (typeof title !== 'string' || title.trim().length < 5 || title.length > TITLE_MAX_LENGTH) {
      details.title = 'INVALID'
    }
    if (typeof body !== 'string' || body.trim().length < 10 || body.length > BODY_MAX_LENGTH) {
      details.body = 'INVALID'
    }
    if (Object.keys(details).length > 0) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid question.', details))
    }

    const topic = await query(`SELECT id FROM topics WHERE id = $1 AND active = true`, [topicId])
    if (topic.rows.length === 0) {
      return res
        .status(422)
        .json(apiError('TOPIC_NOT_FOUND', 'The selected topic does not exist or is inactive.'))
    }

    const inserted = await query(
      `INSERT INTO community_questions (user_id, topic_id, title, body, language)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, topicId, title.trim(), body.trim(), language],
    )
    const { rows } = await query(`${QUESTION_SELECT} WHERE q.id = $1`, [inserted.rows[0].id])
    res.status(201).json(serializeQuestionDetail(rows[0], [], { viewerId: req.user.id }))
  } catch (err) {
    next(err)
  }
})

// GET /api/community/questions/:id — question with its answers.
router.get('/:id', async (req, res, next) => {
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
              (SELECT count(*) FROM community_votes v WHERE v.answer_id = a.id) AS vote_count,
              EXISTS (
                SELECT 1 FROM community_votes v
                WHERE v.answer_id = a.id AND v.user_id = $2
              ) AS viewer_has_voted
       FROM community_answers a
       JOIN users u ON u.id = a.user_id
       WHERE a.question_id = $1
       ORDER BY (a.id = $3) DESC, vote_count DESC, a.created_at`,
      [id, req.user.id, question.accepted_answer_id],
    )

    res.json(
      serializeQuestionDetail(
        question,
        answers.rows.map((row) =>
          serializeAnswer(row, {
            viewerId: req.user.id,
            acceptedAnswerId: question.accepted_answer_id,
          }),
        ),
        { viewerId: req.user.id },
      ),
    )
  } catch (err) {
    next(err)
  }
})

export default router
