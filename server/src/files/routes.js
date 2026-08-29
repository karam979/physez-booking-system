import fs from 'node:fs'
import { Router } from 'express'
import { query } from '../db.js'
import { apiError } from '../errors.js'
import { requireAuth } from '../auth/middleware.js'
import { isUuid } from '../validate.js'
import { isInsideUploadDir } from './storage.js'
import { loadFile } from './access.js'

const router = Router()

router.use(requireAuth)

const NOT_FOUND = apiError('NOT_FOUND', 'File not found.')
const FORBIDDEN = apiError('FORBIDDEN', 'You do not have access to this file.')

function denied(res, error) {
  return res
    .status(error === 'NOT_FOUND' ? 404 : 403)
    .json(error === 'NOT_FOUND' ? NOT_FOUND : FORBIDDEN)
}

// RFC 5987 filename so non-Latin names (ar/he) survive the download header.
function contentDisposition(originalName) {
  const asciiFallback = originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
}

// GET /api/files/:fileId — streamed through Express after the ownership
// check. The upload directory is never mounted as a static route, so this
// handler is the only way to read a file (DESIGN.md §7).
router.get('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params
    if (!isUuid(fileId)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'File id must be a UUID.', { fileId: 'INVALID' }))
    }
    const { file, error } = await loadFile(fileId, req.user)
    if (error) return denied(res, error)

    if (!isInsideUploadDir(file.file_path) || !fs.existsSync(file.file_path)) {
      console.error(`file ${file.id} missing or outside the upload directory`)
      return res.status(404).json(NOT_FOUND)
    }

    res.setHeader('Content-Type', file.mime_type)
    res.setHeader('Content-Length', file.size_bytes)
    res.setHeader('Content-Disposition', contentDisposition(file.original_name))

    const stream = fs.createReadStream(file.file_path)
    stream.on('error', next)
    stream.pipe(res)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/files/:fileId — the student may remove material before the
// lesson starts; an admin may remove it at any time ("pre-lesson" in
// DESIGN.md §5). The row goes first: an orphaned byte blob is harmless, a
// row pointing at nothing is not.
router.delete('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params
    if (!isUuid(fileId)) {
      return res
        .status(400)
        .json(apiError('VALIDATION_ERROR', 'File id must be a UUID.', { fileId: 'INVALID' }))
    }
    const { file, error } = await loadFile(fileId, req.user)
    if (error) return denied(res, error)

    if (req.user.role !== 'admin') {
      const booking = await query(`SELECT start_at FROM bookings WHERE id = $1`, [file.booking_id])
      if (booking.rows[0] && booking.rows[0].start_at <= new Date()) {
        return res
          .status(422)
          .json(
            apiError(
              'LESSON_ALREADY_STARTED',
              'Files can only be removed before the lesson starts.',
            ),
          )
      }
    }

    await query(`DELETE FROM files WHERE id = $1`, [fileId])
    if (isInsideUploadDir(file.file_path)) {
      await fs.promises.unlink(file.file_path).catch(() => {})
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
