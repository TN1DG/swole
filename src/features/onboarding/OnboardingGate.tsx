import { useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { WelcomeCarousel } from './WelcomeCarousel'

// Sits between <Authenticated> and the router in App.tsx. Onboarding status
// lives on the profile (not localStorage) so it can't be dodged by clearing
// site data or signing in on a different device.
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const profile = useQuery(api.profiles.getMine)
  const finishOnboarding = useMutation(api.profiles.finishOnboarding)

  // If the user is considered onboarded via the username+displayName heuristic
  // but onboardedAt was never written, persist it now so future logins don't
  // re-evaluate the heuristic.
  useEffect(() => {
    if (profile && profile.onboarded && !profile.onboardedAtSet) {
      void finishOnboarding()
    }
  }, [profile?.onboarded, profile?.onboardedAtSet, finishOnboarding])

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
