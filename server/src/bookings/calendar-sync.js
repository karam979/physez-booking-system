import { query } from '../db.js'
import { trigger, WORKFLOWS } from '../integrations/n8n.js'

// Calendar work always happens AFTER the booking transaction has committed:
// the database is the source of truth, and a failed integration must never
// undo a confirmed lesson (DESIGN.md §3 failure handling).

export async function setSyncStatus(bookingId, status) {
  await query(`UPDATE bookings SET calendar_sync_status = $2 WHERE id = $1`, [bookingId, status])
}

// Ask n8n to create (or update, when the event already exists) the calendar
// event. n8n reports the result back to /api/internal/n8n/calendar-result.
export async function requestCalendarCreate(booking) {
  const ok = await trigger(WORKFLOWS.calendarCreate, {
    bookingId: booking.id,
    startAt: booking.start_at.toISOString(),
    endAt: booking.end_at.toISOString(),
    lessonType: booking.lesson_type,
    language: booking.language,
    notes: booking.notes,
    calendarEventId: booking.calendar_event_id,
  })
  // The trigger itself failing is already a sync failure the admin must see.
  if (!ok) await setSyncStatus(booking.id, 'failed')
}

export async function requestCalendarDelete(booking) {
  if (!booking.calendar_event_id) return
  const ok = await trigger(WORKFLOWS.calendarDelete, {
    bookingId: booking.id,
    calendarEventId: booking.calendar_event_id,
  })
  await setSyncStatus(booking.id, ok ? 'pending' : 'failed')
}

export async function notifyBookingCreated(booking, student, topic) {
  await trigger(WORKFLOWS.bookingCreated, {
    bookingId: booking.id,
    startAt: booking.start_at.toISOString(),
    endAt: booking.end_at.toISOString(),
    lessonType: booking.lesson_type,
    language: booking.language,
    notes: booking.notes,
    student: { name: student.name, email: student.email },
    topic: topic ?? null,
  })
}
