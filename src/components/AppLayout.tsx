import { NavLink, Outlet } from 'react-router-dom'

// Each tab: route path, label, and a simple inline SVG icon.
const tabs = [
  { to: '/', label: 'Workout', icon: DumbbellIcon },
  { to: '/history', label: 'History', icon: ClockIcon },
  { to: '/favorites', label: 'Favorites', icon: HeartIcon },
  { to: '/friends', label: 'Friends', icon: PeopleIcon },
  { to: '/routines', label: 'Routines', icon: ListIcon },
  { to: '/exercises', label: 'Exercises', icon: BookIcon },
]

export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 pt-4">
        <span className="text-lg font-black uppercase tracking-[0.15em] text-accent">SWOLE</span>
        <NavLink
          to="/profile"
          aria-label="Profile"
          className={({ isActive }) =>
            `rounded-full border border-border p-2 ${isActive ? 'text-accent' : 'text-muted'}`
          }
        >
          <ProfileIcon />
        </NavLink>
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
                `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[10px] leading-tight [&>svg]:h-5 [&>svg]:w-5 ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <Icon />
              <span className="w-full truncate text-center">{label}</span>
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

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7-4.35-9.5-8.5C1 8.5 2.5 5 6 5c2 0 3.5 1.2 4 2.5C10.5 6.2 12 5 14 5c3.5 0 5 3.5 3.5 6.5C19.5 15.65 12 20 12 20z" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M15.5 14.7c2.6.3 4.5 2.3 4.5 5.3" />
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
