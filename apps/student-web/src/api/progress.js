import { apiFetch } from './client.js'

export function getMyProgress() {
  return apiFetch('/progress/me')
}
