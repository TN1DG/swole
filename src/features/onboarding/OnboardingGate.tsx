import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { WelcomeCarousel } from './WelcomeCarousel'

// Sits between <Authenticated> and the router in App.tsx. Onboarding status
// lives on the profile (not localStorage) so it can't be dodged by clearing
// site data or signing in on a different device.
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const profile = useQuery(api.profiles.getMine)

  if (profile === undefined) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted">Loading…</div>
    )
  }
  if (profile !== null && !profile.onboarded) {
    return <WelcomeCarousel />
  }
  return <>{children}</>
}
