import { createContext, useCallback, useContext, useState } from 'react'
import { getWallet } from '../api/credits.js'
import { useAuth } from './AuthContext.jsx'
import { useFetch } from '../lib/useFetch.js'

const WalletContext = createContext(null)

// One shared read of the wallet. Reward events call refreshWallet() so the
// balance always comes back from the server rather than being incremented
// locally, which would drift from the ledger.
export function WalletProvider({ children }) {
  const { user } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchWallet = useCallback(() => {
    void refreshKey
    // Only students have a wallet; anonymous visitors must not trigger a 401.
    if (!user || user.role !== 'student') return Promise.resolve(null)
    return getWallet()
  }, [user, refreshKey])

  const { data: wallet } = useFetch(fetchWallet)

  const refreshWallet = useCallback(() => setRefreshKey((key) => key + 1), [])

  return (
    <WalletContext.Provider value={{ wallet, refreshWallet }}>{children}</WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}
