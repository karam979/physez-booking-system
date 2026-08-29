import { apiFetch } from './client.js'

export function getTopicQuiz(topicId) {
  return apiFetch(`/quizzes/topic/${topicId}`)
}

// The server scores the attempt; the client only reports what was chosen.
export function submitAttempt(quizId, { answers, bookingId }) {
  return apiFetch(`/quizzes/${quizId}/attempts`, { method: 'POST', body: { answers, bookingId } })
}
