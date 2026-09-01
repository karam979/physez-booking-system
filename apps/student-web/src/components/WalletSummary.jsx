import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'

// Compact wallet card for the dashboard. The balances always come from the
// server; nothing here is derived from local state.
export function WalletSummary({ wallet }) {
  const { t } = useLanguage()
  if (!wallet) return null

  return (
    <div className="card stack">
      <div className="booking-card-row">
        <strong>{t('wallet.title')}</strong>
        <Link to="/wallet" className="muted">
          {t('wallet.viewHistory')}
        </Link>
      </div>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-number">{wallet.total}</span>
          <span className="muted">{t('wallet.total')}</span>
        </div>
        <div className="stat">
          <span className="stat-number">{wallet.paid}</span>
          <span className="muted">{t('wallet.paid')}</span>
        </div>
        <div className="stat">
          <span className="stat-number">{wallet.reward}</span>
          <span className="muted">{t('wallet.reward')}</span>
        </div>
      </div>
    </div>
  )
}
