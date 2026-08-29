import { query } from '../db.js'

// Ownership checks for booking-scoped and file-scoped requests. Each returns
// either { error: <code> } or the loaded row, so routes stay flat and every
// path is authorized before any data is read (DESIGN.md §7).

export async function loadBooking(bookingId, user) {
  const { rows } = await query(`SELECT * FROM bookings WHERE id = $1`, [bookingId])
  const booking = rows[0]
  if (!booking) return { error: 'NOT_FOUND' }
  if (user.role !== 'admin' && booking.student_id !== user.id) return { error: 'FORBIDDEN' }
  return { booking }
}

export async function loadFile(fileId, user) {
  const { rows } = await query(`SELECT * FROM files WHERE id = $1`, [fileId])
  const file = rows[0]
  if (!file) return { error: 'NOT_FOUND' }
  if (user.role !== 'admin' && file.student_id !== user.id) return { error: 'FORBIDDEN' }
  return { file }
}
