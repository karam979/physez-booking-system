const LOCALES = { en: 'en-GB', ar: 'ar', he: 'he' }

export function formatDateTime(iso, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function formatTime(iso, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', { timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function topicName(topic, language) {
  if (!topic) return ''
  return { en: topic.nameEn, ar: topic.nameAr, he: topic.nameHe }[language] ?? topic.nameEn
}
