import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { WalletProvider } from './context/WalletContext.jsx'
import { Layout } from './components/Layout.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { Landing } from './pages/Landing.jsx'
import { Login } from './pages/Login.jsx'
import { Register } from './pages/Register.jsx'
import { Book } from './pages/Book.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { BookingDetail } from './pages/BookingDetail.jsx'
import { DiagnosticQuiz } from './pages/DiagnosticQuiz.jsx'
import { Progress } from './pages/Progress.jsx'
import { Community } from './pages/Community.jsx'
import { AskQuestion } from './pages/AskQuestion.jsx'
import { QuestionDetail } from './pages/QuestionDetail.jsx'
import { Wallet } from './pages/Wallet.jsx'
import { NotFound } from './pages/NotFound.jsx'

const protectedPages = [
  ['/book', <Book />],
  ['/dashboard', <Dashboard />],
  ['/bookings/:id', <BookingDetail />],
  ['/bookings/:id/diagnostic', <DiagnosticQuiz />],
  ['/progress', <Progress />],
  ['/community', <Community />],
  ['/community/ask', <AskQuestion />],
  ['/community/questions/:id', <QuestionDetail />],
  ['/wallet', <Wallet />],
]

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <WalletProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                {protectedPages.map(([path, element]) => (
                  <Route
                    key={path}
                    path={path}
                    element={<ProtectedRoute>{element}</ProtectedRoute>}
                  />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </WalletProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
