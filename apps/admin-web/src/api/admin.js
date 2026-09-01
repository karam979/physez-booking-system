import { apiFetch } from './client.js'

export function listBookings({ status, date, studentId } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (date) params.set('date', date)
  if (studentId) params.set('studentId', studentId)
  const query = params.toString()
  return apiFetch(`/admin/bookings${query ? `?${query}` : ''}`)
}

export function getBooking(id) {
  return apiFetch(`/bookings/${id}`)
}

export function confirmBooking(id) {
  return apiFetch(`/admin/bookings/${id}/confirm`, { method: 'PATCH' })
}

export function rejectBooking(id) {
  return apiFetch(`/admin/bookings/${id}/reject`, { method: 'PATCH' })
}

export function cancelBooking(id) {
  return apiFetch(`/bookings/${id}/cancel`, { method: 'PATCH' })
}

export function decideReschedule(id, action) {
  return apiFetch(`/admin/bookings/${id}/reschedule`, { method: 'PATCH', body: { action } })
}

export function createSlot({ startAt, endAt }) {
  return apiFetch('/admin/availability', { method: 'POST', body: { startAt, endAt } })
}

export function deleteSlot(id) {
  return apiFetch(`/admin/availability/${id}`, { method: 'DELETE' })
}

export function getAvailability(date) {
  return apiFetch(`/availability?date=${date}`)
}

export function listBookingFiles(bookingId) {
  return apiFetch(`/bookings/${bookingId}/files`)
}

export function getLesson(bookingId) {
  return apiFetch(`/admin/bookings/${bookingId}/lesson`)
}

export function saveLesson(bookingId, { attendance, summary, homework, feedback }) {
  return apiFetch(`/admin/bookings/${bookingId}/lesson`, {
    method: 'POST',
    body: { attendance, summary, homework, feedback },
  })
}

// Same-origin link: the browser sends the auth cookie and the API streams the
// file back with a Content-Disposition header.
export function fileDownloadUrl(fileId) {
  return `/api/files/${fileId}`
}

export function listCommunityQuestions({ status, language } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (language) params.set('language', language)
  const queryString = params.toString()
  return apiFetch(`/admin/community/questions${queryString ? `?${queryString}` : ''}`)
}

export function getCommunityQuestion(id) {
  return apiFetch(`/admin/community/questions/${id}`)
}

export function setQuestionStatus(id, status) {
  return apiFetch(`/admin/community/questions/${id}/status`, { method: 'PATCH', body: { status } })
}

export function listCommunityReports({ status } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const queryString = params.toString()
  return apiFetch(`/admin/community/reports${queryString ? `?${queryString}` : ''}`)
}

export function setReportStatus(id, status) {
  return apiFetch(`/admin/community/reports/${id}/status`, { method: 'PATCH', body: { status } })
}

export function listCreditStudents(search) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const queryString = params.toString()
  return apiFetch(`/admin/credits/students${queryString ? `?${queryString}` : ''}`)
}

export function getStudentCredits(userId) {
  return apiFetch(`/admin/credits/students/${userId}`)
}

export function adjustStudentCredits(userId, { amount, creditKind, reason }) {
  return apiFetch(`/admin/credits/students/${userId}/adjustments`, {
    method: 'POST',
    body: { amount, creditKind, reason },
  })
}
