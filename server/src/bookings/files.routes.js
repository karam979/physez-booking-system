import fs from 'node:fs'
import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { isUuid, UPLOADABLE_STATUSES } from '../validate.js'
import { receiveUpload } from '../files/storage.js'
import { serializeFile } from '../files/serialize.js'
import { loadBooking } from '../files/access.js'
import { uploadLimiter } from '../middleware/rate-limit.js'

const router = Router()

const NOT_FOUND = apiError('NOT_FOUND', 'Booking not found.')
const FORBIDDEN = apiError('FORBIDDEN', 'You do not have access to this booking.')

// POST /api/bookings/:id/files — the owning student uploads preparation
// material. Multer has already written the file by the time we get here, so a
// rejected request must remove it again.
router.post('/:id/files', uploadLimiter, receiveUpload, async (req, res, next) => {
  const discardUpload = () => fs.promises.unlink(req.file.path).catch(() => {})
  try {
    const { id } = req.params
    if (!isUuid(id)) {
      await discardUpload()
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
    }

    const { booking, error } = await loadBooking(id, req.user)
    if (error) {
      await discardUpload()
      return res
        .status(error === 'NOT_FOUND' ? 404 : 403)
        .json(error === 'NOT_FOUND' ? NOT_FOUND : FORBIDDEN)
    }
    // Uploading is the student's own preparation step; admins read, not write.
    if (req.user.role !== 'student') {
      await discardUpload()
      return res.status(403).json(apiError('FORBIDDEN', 'Only the booking owner can upload files.'))
    }
    if (!UPLOADABLE_STATUSES.includes(booking.status)) {
      await discardUpload()
      return res.status(422).json(
        apiError(
          'BOOKING_NOT_ACTIVE',
          'Files can only be added to a pending or confirmed lesson.',
          {
            status: booking.status,
          },
        ),
      )
    }

    const { rows } = await query(
      `INSERT INTO files (booking_id, student_id, original_name, stored_name, file_path, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        booking.id,
        booking.student_id,
        req.file.originalname.slice(0, 255),
        req.file.filename,
        req.file.path,
        req.file.mimetype,
        req.file.size,
      ],
    )
    res.status(201).json(serializeFile(rows[0]))
  } catch (err) {
    await discardUpload()
    next(err)
  }
})

// GET /api/bookings/:id/files — metadata only, for the owner or an admin.
router.get('/:id/files', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!isUuid(id)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'Booking id must be a UUID.', { id: 'INVALID' }))
    }
    const { error } = await loadBooking(id, req.user)
    if (error) {
      return res
        .status(error === 'NOT_FOUND' ? 404 : 403)
        .json(error === 'NOT_FOUND' ? NOT_FOUND : FORBIDDEN)
    }

    const { rows } = await query(`SELECT * FROM files WHERE booking_id = $1 ORDER BY created_at`, [
      id,
    ])
    res.json(rows.map(serializeFile))
  } catch (err) {
    next(err)
  }
})

export default router
