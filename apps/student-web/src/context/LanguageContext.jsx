import { createContext, useContext, useEffect, useState } from 'react'
import { translations } from '../i18n/index.js'

const RTL_LANGUAGES = ['ar', 'he']
const STORAGE_KEY = 'physez.language'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return translations[saved] ? saved : 'en'
  })

  // The document direction must follow the language so the whole layout
  // flips for Arabic/Hebrew (DESIGN.md §6).
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr'
    localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  function t(key, params = {}) {
    const text = translations[language][key] ?? translations.en[key] ?? key
    return Object.entries(params).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      text,
    )
  }

  // API errors carry a stable `code`; the message shown is always ours.
  function translateError(error) {
    const key = `errors.${error?.code}`
    return translations[language][key] || translations.en[key] || t('errors.INTERNAL_ERROR')
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translateError }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
