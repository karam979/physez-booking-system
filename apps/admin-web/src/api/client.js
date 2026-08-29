// Small fetch wrapper: same-origin /api via the Vite proxy (dev) or the
// Netlify proxy (prod), cookies always included, one error shape everywhere.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details ?? {}
  }
}

export async function apiFetch(path, { method = 'GET', body } = {}) {
  // FormData carries its own multipart boundary — setting Content-Type by
  // hand would break the upload.
  const isFormData = body instanceof FormData

  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed.')
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const err = data?.error ?? {}
    throw new ApiError(response.status, err.code ?? 'INTERNAL_ERROR', err.message, err.details)
  }
  return data
}
