import { useLanguage } from '../context/LanguageContext.jsx'
import { LANGUAGE_NAMES } from '../i18n/index.js'

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <select
      className="language-switcher"
      value={language}
      onChange={(event) => setLanguage(event.target.value)}
      aria-label="Language"
    >
      {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  )
}
