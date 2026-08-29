import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { apiError } from '../errors.js'

// Allow-list by MIME type; the extension we store is ours, never the
// client's, so a disguised filename cannot introduce a new type.
const ALLOWED_TYPES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

const UNSUPPORTED_TYPE = 'UNSUPPORTED_FILE_TYPE'

export function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || './uploads')
}

export function maxUploadBytes() {
  return (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = uploadDir()
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir))
  },
  // Server-generated name: random hex plus an extension from the allow-list.
  // The client's filename never touches the filesystem, which rules out path
  // traversal and collisions (DESIGN.md §7).
  filename(req, file, cb) {
    cb(null, `${randomBytes(16).toString('hex')}${ALLOWED_TYPES[file.mimetype]}`)
  },
})

function fileFilter(req, file, cb) {
  if (!ALLOWED_TYPES[file.mimetype]) {
    const err = new Error('Unsupported file type.')
    err.code = UNSUPPORTED_TYPE
    return cb(err)
  }
  cb(null, true)
}

const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxUploadBytes(), files: 1 },
}).single('file')

// Translates multer's failures into the canonical error shape before they
// reach a handler, so upload routes only deal with a valid req.file.
export function receiveUpload(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (!err) {
      if (!req.file) {
        return res
          .status(400)
          .json(apiError('VALIDATION_ERROR', 'A file is required.', { file: 'REQUIRED' }))
      }
      return next()
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json(
        apiError('FILE_TOO_LARGE', 'The file exceeds the maximum upload size.', {
          maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 10,
        }),
      )
    }
    if (err.code === UNSUPPORTED_TYPE) {
      return res.status(422).json(
        apiError(UNSUPPORTED_TYPE, 'Only PDF, JPG and PNG files are allowed.', {
          allowed: Object.keys(ALLOWED_TYPES),
        }),
      )
    }
    next(err)
  })
}

// Guards against a stored path escaping the upload directory before we read
// a file off disk.
export function isInsideUploadDir(filePath) {
  const resolved = path.resolve(filePath)
  const dir = uploadDir()
  return resolved === dir || resolved.startsWith(dir + path.sep)
}
