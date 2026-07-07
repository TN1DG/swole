import { NavLink, Outlet } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'

// Each tab: route path, label, and a simple inline SVG icon.
const tabs = [
  { to: '/', label: 'Workout', icon: DumbbellIcon },
  { to: '/history', label: 'History', icon: ClockIcon },
  { to: '/routines', label: 'Routines', icon: ListIcon },
  { to: '/exercises', label: 'Exercises', icon: BookIcon },
]

export function AppLayout() {
  const { signOut } = useAuthActions()

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 pt-4">
        <span className="text-lg font-black tracking-tight">SWOLE</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-muted underline underline-offset-4"
        >
          Sign out
        </button>
      </header>

      {/* Page content. Bottom padding leaves room for the fixed tab bar. */}
      <main className="flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

// --- Icons (inline SVG keeps us dependency-free) ---

function DumbbellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-2.5" />
    </svg>
  )
}
