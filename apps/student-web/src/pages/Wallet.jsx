import { useCallback, useState } from 'react'
import { getWallet, listCreditTransactions } from '../api/credits.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useFetch } from '../lib/useFetch.js'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { TransactionList } from '../components/TransactionList.jsx'

const PAGE_SIZE = 20

export function Wallet() {
  const { t } = useLanguage()
  const [offset, setOffset] = useState(0)

  const fetchWallet = useCallback(() => getWallet(), [])
  const { data: wallet, error: walletError } = useFetch(fetchWallet)

  const fetchPage = useCallback(
    () => listCreditTransactions({ limit: PAGE_SIZE, offset }),
    [offset],
  )
  const { data: page, error: pageError } = useFetch(fetchPage)

  if (walletError) return <ErrorMessage error={walletError} />
  if (!wallet) return <p className="muted">{t('app.loading')}</p>

  return (
    <section className="stack">
      <h1>{t('wallet.title')}</h1>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-number">{wallet.total}</span>
          <span className="muted">{t('wallet.total')}</span>
        </div>
        <div className="card stat">
          <span className="stat-number">{wallet.paid}</span>
          <span className="muted">{t('wallet.paid')}</span>
        </div>
        <div className="card stat">
          <span className="stat-number">{wallet.reward}</span>
          <span className="muted">{t('wallet.reward')}</span>
        </div>
      </div>

      <h2>{t('wallet.history')}</h2>
      <ErrorMessage error={pageError} />
      {page && (
        <div className="card stack">
          <TransactionList transactions={page.transactions} />
          {page.total > PAGE_SIZE && (
            <div className="wizard-nav">
              <button
                type="button"
                className="button-secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('wallet.previous')}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={offset + PAGE_SIZE >= page.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('wallet.next')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
