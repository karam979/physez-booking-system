import { useCallback } from 'react'
import { listBookingFiles, fileDownloadUrl } from '../api/admin.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { formatBytes } from '../lib/formatBytes.js'
import { ErrorMessage } from './ErrorMessage.jsx'

// The teacher reads the student's preparation material; removing it is the
// student's own action before the lesson.
export function FileList({ bookingId }) {
  const { t } = useLanguage()
  const fetchFiles = useCallback(() => listBookingFiles(bookingId), [bookingId])
  const { data: files, error } = useFetch(fetchFiles)

  return (
    <div className="card stack">
      <strong>{t('files.title')}</strong>
      <ErrorMessage error={error} />
      {files && files.length === 0 && <p className="muted">{t('files.empty')}</p>}
      {files && files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id}>
              <a href={fileDownloadUrl(file.id)}>{file.originalName}</a>
              <span className="muted">{formatBytes(file.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
