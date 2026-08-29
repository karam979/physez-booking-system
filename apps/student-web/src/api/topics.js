import { apiFetch } from './client.js'

export function listTopics() {
  return apiFetch('/topics')
}
