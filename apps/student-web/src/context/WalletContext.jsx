import { createContext, useCallback, useContext } from 'react'
import { getWallet } from '../api/credits.js'
import { useAuth } from './AuthContext.jsx'
import { useFetch } from '../lib/useFetch.js'

const WalletContext = createContext(null)

// One shared read of the wallet. The balance always comes back from the
// server rather than being incremented locally, which would drift from the
// ledger. Community rewards go to the answer's author, never to the student
// acting, so no screen needs to re-read this after a vote or an accept.
export function WalletProvider({ children }) {
  const { user } = useAuth()

  const fetchWallet = useCallback(() => {
    // Only students have a wallet; anonymous visitors must not trigger a 401.
    if (!user || user.role !== 'student') return Promise.resolve(null)
    return getWallet()
  }, [user])

  const { data: wallet } = useFetch(fetchWallet)

  return <WalletContext.Provider value={{ wallet }}>{children}</WalletContext.Provider>
}

export function useWallet() {
  return useContext(WalletContext)
}
