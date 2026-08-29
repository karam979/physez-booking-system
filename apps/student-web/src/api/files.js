import { apiFetch } from './client.js'

export function listBookingFiles(bookingId) {
  return apiFetch(`/bookings/${bookingId}/files`)
}

export function uploadBookingFile(bookingId, file) {
  const body = new FormData()
  body.append('file', file)
  return apiFetch(`/bookings/${bookingId}/files`, { method: 'POST', body })
}

export function deleteFile(fileId) {
  return apiFetch(`/files/${fileId}`, { method: 'DELETE' })
}

// Same-origin link: the browser sends the auth cookie and the API streams the
// file back with a Content-Disposition header.
export function fileDownloadUrl(fileId) {
  return `/api/files/${fileId}`
}
