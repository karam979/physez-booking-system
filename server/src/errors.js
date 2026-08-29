// Canonical error shape (DESIGN.md §5): { error: { code, message, details } }.
// Frontends translate the stable `code`, never the message.
export function apiError(code, message, details = {}) {
  return { error: { code, message, details } }
}
