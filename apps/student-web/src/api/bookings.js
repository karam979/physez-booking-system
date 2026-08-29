import { apiFetch } from './client.js'

export function createBooking({ lessonType, durationMinutes, language, topicId, startAt, notes }) {
  return apiFetch('/bookings', {
    method: 'POST',
    body: { lessonType, durationMinutes, language, topicId, startAt, notes },
  })
}

export function listMyBookings() {
  return apiFetch('/bookings/me')
}

export function getBooking(id) {
  return apiFetch(`/bookings/${id}`)
}

export function cancelBooking(id) {
  return apiFetch(`/bookings/${id}/cancel`, { method: 'PATCH' })
}

export function requestReschedule(id, { startAt }) {
  return apiFetch(`/bookings/${id}/reschedule`, { method: 'POST', body: { startAt } })
}
