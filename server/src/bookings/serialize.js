export function serializeBooking(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    topicId: row.topic_id,
    lessonType: row.lesson_type,
    language: row.language,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    durationMinutes: Math.round((row.end_at - row.start_at) / 60000),
    status: row.status,
    notes: row.notes,
    calendarSyncStatus: row.calendar_sync_status ?? null,
    createdAt: row.created_at.toISOString(),
  }
}
