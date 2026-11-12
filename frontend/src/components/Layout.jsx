import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const STUDENT_NAV = [
  { to: '/home', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z' },
  { to: '/send', label: 'Send', icon: 'M4 12h14m0 0-5-5m5 5-5 5' },
  { to: '/topup', label: 'Top up', icon: 'M12 5v14m-7-7h14' },
  { to: '/transfers', label: 'History', icon: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isStudent = user?.role === 'student'

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-50 md:max-w-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-emerald-800 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center gap-2">
          <img src="/icons/favicon.svg" alt="" className="size-8 rounded-lg" />
          <div className="leading-tight">
            <p className="font-bold">SikaBridge</p>
            {user && (
              <p className="text-xs text-emerald-100">
                {user.full_name}
                {user.role !== 'student' && <span className="ml-1 uppercase">· {user.role} {user.role === 'agent' ? user.country : ''}</span>}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/login')
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-emerald-50 hover:bg-emerald-700"
        >
          Log out
        </button>
      </header>

      <main className={`flex-1 px-4 py-5 ${isStudent ? 'pb-24' : ''}`}>
        <Outlet />
      </main>

      {isStudent && (
        <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <ul className="mx-auto grid max-w-md grid-cols-4 md:max-w-2xl">
            {STUDENT_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${isActive ? 'text-emerald-700' : 'text-slate-500'}`
                  }
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
