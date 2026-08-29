import { query } from '../db.js'
import { appTimezone } from '../validate.js'

// UTC instants of local midnight for `date` and the next day in APP_TIMEZONE.
// Postgres owns the timezone math (DST-safe).
export async function dayBoundsUtc(dateString) {
  const { rows } = await query(
    `SELECT timezone($2, $1::date::timestamp) AS day_start,
            timezone($2, ($1::date + 1)::timestamp) AS day_end`,
    [dateString, appTimezone()],
  )
  return { dayStart: rows[0].day_start, dayEnd: rows[0].day_end }
}

// Subtract busy intervals from one window. All values are Date objects.
function subtractFromWindow(windowStart, windowEnd, busy) {
  const free = []
  let cursor = windowStart
  for (const b of busy) {
    if (b.end <= cursor || b.start >= windowEnd) continue
    if (b.start > cursor) free.push({ start: cursor, end: b.start })
    if (b.end > cursor) cursor = b.end
    if (cursor >= windowEnd) break
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd })
  return free
}

// Free windows for a date: active availability_slots clipped to the day,
// minus confirmed bookings. Each slot is treated independently — a booking
// must fit inside a single slot, so windows are never merged across slots.
// If durationMinutes is given, windows shorter than it are dropped.
export async function freeWindowsForDate(dateString, durationMinutes = null) {
  const { dayStart, dayEnd } = await dayBoundsUtc(dateString)

  const slots = await query(
    `SELECT start_at, end_at FROM availability_slots
     WHERE is_active = true AND start_at < $2 AND end_at > $1
     ORDER BY start_at`,
    [dayStart, dayEnd],
  )
  const busyRes = await query(
    `SELECT start_at, end_at FROM bookings
     WHERE status = 'confirmed' AND start_at < $2 AND end_at > $1
     ORDER BY start_at`,
    [dayStart, dayEnd],
  )
  const busy = busyRes.rows.map((r) => ({ start: r.start_at, end: r.end_at }))

  const windows = []
  for (const slot of slots.rows) {
    const clippedStart = slot.start_at < dayStart ? dayStart : slot.start_at
    const clippedEnd = slot.end_at > dayEnd ? dayEnd : slot.end_at
    windows.push(...subtractFromWindow(clippedStart, clippedEnd, busy))
  }

  const minMs = durationMinutes ? durationMinutes * 60 * 1000 : 0
  return windows
    .filter((w) => w.end - w.start >= minMs)
    .map((w) => ({ startAt: w.start.toISOString(), endAt: w.end.toISOString() }))
}
