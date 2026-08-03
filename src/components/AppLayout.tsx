import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, useTheme } from '@mui/material'
import { api } from '../../convex/_generated/api'
import { PingAckBanner } from './PingAckBanner'
import { NotificationsBanner } from './NotificationsBanner'
import { Avatar } from './Avatar'
import { WhatsNewGate } from '../features/releases/WhatsNewDialog'
import { PeopleIcon } from './icons'
import { tokens } from '../theme/tokens'
import { GlassCard } from './GlassCard'

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
  // Already subscribed to on most screens, so this is a cache hit rather
  // than an extra round trip.
  const profile = useQuery(api.profiles.getMine)

  return (
    // Fixed-height app shell (not minHeight) — the header and nav are plain
    // flex children that can never reposition, and `main` below is the only
    // scrolling region. This replaces an earlier fixed/sticky-based layout
    // where the nav visibly moved vertically between pages: mobile browsers
    // resize the *visible* viewport live as the address bar shows/hides on
    // scroll, and a `position: fixed` element tracks that live viewport, so
    // a short (non-scrolling) page and a long (scrolling) page ended up
    // pinning the nav at genuinely different pixel heights. svh (not dvh) —
    // the smallest possible viewport, so the shell never exceeds what's
    // visible even with the address bar fully expanded.
    <Box
      sx={{
        mx: 'auto',
        display: 'flex',
        height: '100svh',
        maxWidth: '32rem',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top bar. iOS status bar is translucent (viewport-fit=cover), so this
          needs its own safe-area padding or it renders under the notch/clock.
          Sticky (not fixed) — the page itself is the scroll container, so this
          avoids having to hand-sync main's padding to the header's real,
          safe-area-variable height. */}
      <Box
        component="header"
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${tokens.borderGlass}`,
          bgcolor: tokens.surfaceGlass,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
          pt: 'max(1rem, env(safe-area-inset-top))',
          // Was top-padding only, which left the logo and avatar sitting
          // flush against the bottom border.
          pb: 1,
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
        {/* Your own photo once you've set one; the generic silhouette until
            then. Sized to match the icon's outer circle so the header height
            doesn't shift when an avatar loads. */}
        {profile?.avatarUrl ? (
          <NavLink to="/profile" aria-label="Profile" style={{ display: 'flex' }}>
            <Avatar
              src={profile.avatarUrl}
              name={profile.displayName ?? profile.email}
              size={34}
            />
          </NavLink>
        ) : (
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
        )}
      </Box>

      {/* Page content. Bottom padding clears the fixed tab bar — derived from
          the tab bar's measured height rather than a fixed 6rem, which was
          both a guess and noticeably more dead space than needed. */}
      <Box
        component="main"
        sx={{
          flex: 1,
          overflowY: 'auto',
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
          pt: 2,
          pb: 2,
        }}
      >
        <PingAckBanner />
        <NotificationsBanner />
        <WhatsNewGate />
        <Outlet />
      </Box>

      {/* Bottom tab bar — floating pill, inset from the screen edges. A
          plain (non-positioned) flex child of the shell now, not fixed —
          see the shell comment above for why. This outer element is a pure
          padding wrapper for the horizontal gutter + bottom safe-area inset;
          the pill look lives on the GlassCard nested inside. */}
      <Box
        component="nav"
        sx={{
          flexShrink: 0,
          pl: 'var(--app-gutter-left)',
          pr: 'var(--app-gutter-right)',
          pb: 'max(1rem, env(safe-area-inset-bottom))',
          pt: 1,
        }}
      >
        <GlassCard
          sx={{
            mx: 'auto',
            display: 'flex',
            alignItems: 'center',
            maxWidth: '32rem',
            borderRadius: '9999px',
            p: 1,
          }}
        >
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={{ display: 'flex', flex: 1, minWidth: 0, textDecoration: 'none' }}
            >
              {({ isActive }) => (
                <Box
                  sx={{
                    display: 'flex',
                    width: '100%',
                    minWidth: 0,
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0.5,
                    py: 0.5,
                    fontSize: 10,
                    lineHeight: 1.2,
                    color: isActive ? activeColor : mutedColor,
                    transition: 'color 0.15s ease',
                  }}
                >
                  {/* Oval "pill" hugging just the icon — sized by its own
                      padding rather than the column's full width, so it
                      doesn't stretch into a rectangle sized by the widest
                      label (e.g. "Exercises"). Mirrors GlassTile's Tier B
                      look (a nested, unblurred tile) for just the active
                      tab, rather than importing the component here —
                      GlassTile can't take the isActive ternary and still
                      compose inside NavLink's function-as-children render
                      prop as cleanly as an inline sx. */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      px: 1.5,
                      py: 0.5,
                      borderRadius: '999px',
                      border: '1px solid transparent',
                      transition: 'background-color 0.15s ease, border-color 0.15s ease',
                      '& svg': { width: 20, height: 20 },
                      ...(isActive && {
                        bgcolor: tokens.surface2Glass,
                        borderColor: 'rgb(69 61 53 / 0.3)',
                      }),
                    }}
                  >
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
                </Box>
              )}
            </NavLink>
          ))}
        </GlassCard>
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
