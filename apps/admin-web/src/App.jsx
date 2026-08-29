import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { Layout } from './components/Layout.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { Login } from './pages/Login.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Bookings } from './pages/Bookings.jsx'
import { BookingDetail } from './pages/BookingDetail.jsx'
import { LessonEditor } from './pages/LessonEditor.jsx'
import { Availability } from './pages/Availability.jsx'
import { NotFound } from './pages/NotFound.jsx'

const protectedPages = [
  ['/', <Dashboard />],
  ['/bookings', <Bookings />],
  ['/bookings/:id', <BookingDetail />],
  ['/lessons/:bookingId', <LessonEditor />],
  ['/availability', <Availability />],
]

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />
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
