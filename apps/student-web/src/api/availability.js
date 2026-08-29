import { apiFetch } from './client.js'

export function getAvailability(date, durationMinutes) {
  const params = new URLSearchParams({ date })
  if (durationMinutes) params.set('durationMinutes', String(durationMinutes))
  return apiFetch(`/availability?${params}`)
}
