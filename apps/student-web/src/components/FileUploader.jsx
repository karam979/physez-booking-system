import { useCallback, useRef, useState } from 'react'
import { listBookingFiles, uploadBookingFile, deleteFile, fileDownloadUrl } from '../api/files.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { formatBytes } from '../lib/formatBytes.js'
import { ErrorMessage } from './ErrorMessage.jsx'

const ACCEPTED = 'application/pdf,image/jpeg,image/png'

// Upload + list + remove for one booking's preparation material. Read-only
// once the lesson can no longer be changed.
export function FileUploader({ bookingId, canEdit }) {
  const { t } = useLanguage()
  const inputRef = useRef(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchFiles = useCallback(() => {
    void refreshKey
    return listBookingFiles(bookingId)
  }, [bookingId, refreshKey])

  const { data: files, error: listError } = useFetch(fetchFiles)

  function reload() {
    setRefreshKey((key) => key + 1)
  }

  async function handleSelected(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await uploadBookingFile(bookingId, file)
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
      // Allow re-picking the same file after a failed attempt.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(fileId) {
    setBusy(true)
    setError(null)
    try {
      await deleteFile(fileId)
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <strong>{t('files.title')}</strong>
      <p className="muted">{t('files.hint')}</p>

      <ErrorMessage error={listError} />
      <ErrorMessage error={error} />

      {files && files.length === 0 && <p className="muted">{t('files.empty')}</p>}
      {files && files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id}>
              <a href={fileDownloadUrl(file.id)}>{file.originalName}</a>
              <span className="muted">{formatBytes(file.sizeBytes)}</span>
              {canEdit && (
                <button
                  type="button"
                  className="link-button"
                  disabled={busy}
                  onClick={() => remove(file.id)}
                >
                  {t('files.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <label className="file-input">
          {t('files.choose')}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            disabled={busy}
            onChange={handleSelected}
          />
        </label>
      )}
    </div>
  )
}
