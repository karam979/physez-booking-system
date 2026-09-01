import { apiFetch } from './client.js'

export function listQuestions({ topicId, status, language, unanswered, limit, offset } = {}) {
  const params = new URLSearchParams()
  if (topicId) params.set('topicId', topicId)
  if (status) params.set('status', status)
  if (language) params.set('language', language)
  if (unanswered) params.set('unanswered', 'true')
  if (limit) params.set('limit', String(limit))
  if (offset) params.set('offset', String(offset))
  const queryString = params.toString()
  return apiFetch(`/community/questions${queryString ? `?${queryString}` : ''}`)
}

export function getQuestion(id) {
  return apiFetch(`/community/questions/${id}`)
}

export function askQuestion({ topicId, language, title, body }) {
  return apiFetch('/community/questions', {
    method: 'POST',
    body: { topicId, language, title, body },
  })
}

export function postAnswer(questionId, body) {
  return apiFetch(`/community/questions/${questionId}/answers`, { method: 'POST', body: { body } })
}

export function voteAnswer(answerId) {
  return apiFetch(`/community/answers/${answerId}/votes`, { method: 'POST' })
}

export function unvoteAnswer(answerId) {
  return apiFetch(`/community/answers/${answerId}/votes`, { method: 'DELETE' })
}

export function acceptAnswer(answerId) {
  return apiFetch(`/community/answers/${answerId}/accept`, { method: 'POST' })
}

export function reportContent({ targetType, targetId, reason }) {
  return apiFetch('/community/reports', {
    method: 'POST',
    body: { targetType, targetId, reason },
  })
}

export function getMyCommunityStats() {
  return apiFetch('/community/me/stats')
}
