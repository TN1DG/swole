import { NavLink, Outlet } from 'react-router-dom'
import { Box, useTheme } from '@mui/material'
import { PingAckBanner } from './PingAckBanner'
import { PeopleIcon } from './icons'
import { tokens } from '../theme/tokens'

// Each tab: route path, label, and a simple inline SVG icon.
const tabs = [
  { to: '/', label: 'Workout', icon: DumbbellIcon },
  { to: '/history', label: 'History', icon: ClockIcon },
  { to: '/friends', label: 'Friends', icon: PeopleIcon },
  { to: '/routines', label: 'Routines', icon: ListIcon },
  { to: '/exercises', label: 'Exercises', icon: BookIcon },
]

export function AppLayout() {
  const theme = useTheme()
  const activeColor = theme.palette.primary.main
  const mutedColor = theme.palette.text.secondary

  return (
    <Box sx={{ mx: 'auto', display: 'flex', minHeight: '100svh', maxWidth: '32rem', flexDirection: 'column' }}>
      {/* Top bar. iOS status bar is translucent (viewport-fit=cover), so this
          needs its own safe-area padding or it renders under the notch/clock.
          Sticky (not fixed) — the page itself is the scroll container, so this
          avoids having to hand-sync main's padding to the header's real,
          safe-area-variable height. */}
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: (t) => t.zIndex.appBar,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${tokens.borderGlass}`,
          bgcolor: tokens.surfaceGlass,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          px: 2,
          pt: 'max(1rem, env(safe-area-inset-top))',
        }}
      >
        <Box
          component="span"
          sx={{
            fontSize: '1.125rem',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'primary.main',
          }}
        >
          SWOLE
        </Box>
        <NavLink
          to="/profile"
          aria-label="Profile"
          style={({ isActive }) => ({
            display: 'flex',
            borderRadius: '9999px',
            border: `1px solid ${tokens.border}`,
            padding: 8,
            color: isActive ? activeColor : mutedColor,
          })}
        >
          <ProfileIcon />
        </NavLink>
      </Box>

      {/* Page content. Bottom padding leaves room for the fixed tab bar. */}
      <Box component="main" sx={{ flex: 1, px: 2, pt: 2, pb: 12 }}>
        <PingAckBanner />
        <Outlet />
      </Box>

      {/* Bottom tab bar — same z-index tier as the header, both below any
          Dialog/Drawer (MUI's modal z-index is always higher) so sheets and
          confirm dialogs still cover it. */}
      <Box
        component="nav"
        sx={{
          position: 'fixed',
          insetInline: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          borderTop: `1px solid ${tokens.borderGlass}`,
          bgcolor: tokens.surfaceGlass,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <Box sx={{ mx: 'auto', display: 'flex', maxWidth: '32rem' }}>
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                minWidth: 0,
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '8px 2px',
                paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                fontSize: 10,
                lineHeight: 1.2,
                color: isActive ? activeColor : mutedColor,
                textDecoration: 'none',
              })}
            >
              <Box sx={{ '& svg': { width: 20, height: 20 } }}>
                <Icon />
              </Box>
              <Box
                component="span"
                sx={{
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                {label}
              </Box>
            </NavLink>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

// --- Icons (inline SVG keeps us dependency-free) ---
// PeopleIcon lives in ./icons.tsx (this file used to have an identical local
// duplicate) — every other tab icon here is only used by this nav, so they
// stay local.

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
