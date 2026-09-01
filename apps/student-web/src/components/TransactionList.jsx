import { useLanguage } from '../context/LanguageContext.jsx'
import { formatDateTime } from '../lib/format.js'

// A ledger row reads as "+5 Accepted community answer". The sign carries the
// meaning, so it is never colour alone (NFR5). The amount sits in a <bdi> so a
// leading "+" is not reordered to a trailing one inside the ar/he RTL layout.
export function TransactionList({ transactions }) {
  const { t, language } = useLanguage()

  if (transactions.length === 0) {
    return <p className="muted">{t('wallet.empty')}</p>
  }

  return (
    <ul className="window-list">
      {transactions.map((entry) => (
        <li key={entry.id}>
          <bdi className={entry.amount > 0 ? 'credit-plus' : 'credit-minus'}>
            {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
          </bdi>
          <span>{t(`creditType.${entry.transactionType}`)}</span>
          <span className="muted">{formatDateTime(entry.createdAt, language)}</span>
        </li>
      ))}
    </ul>
  )
}
