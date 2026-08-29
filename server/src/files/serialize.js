// file_path and stored_name stay server-side: the client only ever addresses
// a file by its id (DESIGN.md §7).
export function serializeFile(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    studentId: row.student_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at.toISOString(),
  }
}
