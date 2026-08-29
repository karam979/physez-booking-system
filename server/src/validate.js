// Shared server-side validation helpers. Frontend validation is UX only —
// every body/query/path param is re-validated here (DESIGN.md §7).

export const LANGUAGES = ['en', 'ar', 'he']
export const LESSON_TYPES = ['zoom', 'in_person']
export const BOOKING_STATUSES = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed']

// Which statuses each action accepts, kept together so the booking lifecycle
// rules can be read in one place. The three "still happening" sets share a
// definition today but stay separately named, so one can change without
// silently moving the others.
const ACTIVE_STATUSES = ['pending', 'confirmed']

export const CANCELLABLE_STATUSES = ACTIVE_STATUSES
export const RESCHEDULABLE_STATUSES = ACTIVE_STATUSES
export const UPLOADABLE_STATUSES = ACTIVE_STATUSES

// A summary is written after the lesson happened, so the booking must be one
// the teacher actually taught. Re-saving a completed lesson is an edit.
export const SUMMARISABLE_STATUSES = ['confirmed', 'completed']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

// Strict YYYY-MM-DD that is a real calendar date (rejects 2026-02-30).
export function isDateString(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

// ISO-8601 datetime parseable by Date (e.g. 2026-09-01T10:00:00Z).
export function parseIsoDateTime(v) {
  if (typeof v !== 'string' || !v.includes('T')) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

// Lesson duration: 30–240 minutes in 15-minute steps.
export function isValidDuration(v) {
  return Number.isInteger(v) && v >= 30 && v <= 240 && v % 15 === 0
}

export function appTimezone() {
  return process.env.APP_TIMEZONE || 'UTC'
}
