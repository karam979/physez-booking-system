import { useEffect, useState } from 'react'

// Small data-fetching hook. Wrap `fetcher` in useCallback at the call site —
// a new fetcher identity triggers a refetch. While a fetch is in flight the
// previous result is hidden, so pages show loading instead of stale data.
export function useFetch(fetcher) {
  const [result, setResult] = useState({ fetcher: null, data: null, error: null })

  useEffect(() => {
    let cancelled = false
    fetcher().then(
      (data) => {
        if (!cancelled) setResult({ fetcher, data, error: null })
      },
      (error) => {
        if (!cancelled) setResult({ fetcher, data: null, error })
      },
    )
    return () => {
      cancelled = true
    }
  }, [fetcher])

  const isCurrent = result.fetcher === fetcher
  return {
    data: isCurrent ? result.data : null,
    error: isCurrent ? result.error : null,
    loading: !isCurrent,
  }
}
