import { useQuery } from 'convex/react'
import { Box, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { WelcomeCarousel } from './WelcomeCarousel'

// Sits between <Authenticated> and the router in App.tsx. Onboarding status
// lives on the profile (not localStorage) so it can't be dodged by clearing
// site data or signing in on a different device. Existing accounts that
// predate the onboarding feature are grandfathered in via a one-off
// migration (`migrations:backfillOnboarded`), not a live heuristic here —
// a live username+displayName heuristic would also fire mid-carousel, since
// the carousel's own first step sets those same two fields.
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const profile = useQuery(api.profiles.getMine)

  if (profile === undefined) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100svh', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    )
  }
  if (profile !== null && !profile.onboarded) {
    return <WelcomeCarousel />
  }
  return <>{children}</>
}
