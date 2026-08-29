import { useLanguage } from '../context/LanguageContext.jsx'

// Shows an API error translated from its stable code — never the raw message.
export function ErrorMessage({ error }) {
  const { translateError } = useLanguage()
  if (!error) return null
  return (
    <p className="error" role="alert">
      {translateError(error)}
    </p>
  )
}
