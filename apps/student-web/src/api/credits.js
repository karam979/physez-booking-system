import { apiFetch } from './client.js'

export function getWallet() {
  return apiFetch('/credits/me')
}

export function listCreditTransactions({ limit = 20, offset = 0 } = {}) {
  return apiFetch(`/credits/me/transactions?limit=${limit}&offset=${offset}`)
}
