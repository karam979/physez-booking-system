import { useEffect, useState } from 'react'
import { listMyBookings } from '../api/bookings.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { BookingCard } from '../components/BookingCard.jsx'
import { ErrorMessage } from '../components/ErrorMessage.jsx'
import { WalletSummary } from '../components/WalletSummary.jsx'
import { useWallet } from '../context/WalletContext.jsx'

export function Dashboard() {
  const { t } = useLanguage()
  const { wallet } = useWallet()
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    listMyBookings().then(setBookings).catch(setError)
  }, [])

  if (error) return <ErrorMessage error={error} />
  if (!bookings) return <p className="muted">{t('app.loading')}</p>

  const now = new Date().toISOString()
  const upcoming = bookings.filter((b) => b.endAt >= now).reverse()
  const past = bookings.filter((b) => b.endAt < now)

  return (
    <section className="stack">
      <h1>{t('dashboard.title')}</h1>

      <WalletSummary wallet={wallet} />

      {bookings.length === 0 && <p className="muted">{t('dashboard.empty')}</p>}

      {upcoming.length > 0 && (
        <>
          <h2>{t('dashboard.upcoming')}</h2>
          <div className="stack">
            {upcoming.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2>{t('dashboard.past')}</h2>
          <div className="stack">
            {past.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
