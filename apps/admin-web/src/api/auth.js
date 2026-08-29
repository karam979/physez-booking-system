import { apiFetch } from './client.js'

export function register({ name, email, password, preferredLanguage }) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: { name, email, password, preferredLanguage },
  })
}

export function login({ email, password }) {
  return apiFetch('/auth/login', { method: 'POST', body: { email, password } })
}

export function logout() {
  return apiFetch('/auth/logout', { method: 'POST' })
}

export function me() {
  return apiFetch('/auth/me')
}
