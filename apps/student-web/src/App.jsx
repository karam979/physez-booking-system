import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
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
import { NotFound } from './pages/NotFound.jsx'

const protectedPages = [
  ['/book', <Book />],
  ['/dashboard', <Dashboard />],
  ['/bookings/:id', <BookingDetail />],
  ['/bookings/:id/diagnostic', <DiagnosticQuiz />],
  ['/progress', <Progress />],
]

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
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
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
