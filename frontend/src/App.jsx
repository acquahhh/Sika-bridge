import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { HOME_BY_ROLE, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import { ButtonLink, Spinner } from './components/ui'
import AdminPage from './pages/admin/AdminPage'
import AgentPayoutsPage from './pages/agent/AgentPayoutsPage'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import HomePage from './pages/student/HomePage'
import SendPage from './pages/student/SendPage'
import TopUpPage from './pages/student/TopUpPage'
import { TransferDetailPage, TransfersPage } from './pages/student/TransfersPage'

function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-emerald-700">
      <Spinner className="size-8" />
    </div>
  )
}

/** Gate a route tree by role (as reported by GET /auth/me). */
function RequireRole({ roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role] ?? '/login'} replace />
  return <Layout />
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (user) return <Navigate to={HOME_BY_ROLE[user.role] ?? '/'} replace />
  return children
}

function RoleHome() {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  return <Navigate to={user ? (HOME_BY_ROLE[user.role] ?? '/login') : '/login'} replace />
}

function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="text-xl font-bold">Page not found</h1>
      <ButtonLink to="/">Go home</ButtonLink>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleHome />} />
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />

      <Route element={<RequireRole roles={['student']} />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/topup" element={<TopUpPage />} />
        <Route path="/send" element={<SendPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/transfers/:id" element={<TransferDetailPage />} />
      </Route>

      <Route element={<RequireRole roles={['agent']} />}>
        <Route path="/agent" element={<AgentPayoutsPage />} />
      </Route>

      <Route element={<RequireRole roles={['admin']} />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
