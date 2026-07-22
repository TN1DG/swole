import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import { ResendOTPPasswordReset, ResendOTPVerification } from './emailAuth'

// Sets up email+password login, gated behind a 6-digit email code for both
// new-account verification and password reset (see convex/emailAuth.ts).
// `signIn`/`signOut` become callable from the frontend; `auth` is used by
// http.ts to expose the auth HTTP endpoints.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: ResendOTPVerification,
      reset: ResendOTPPasswordReset,
    }),
  ],
  signIn: {
    // Tighter than the library's own default of 10/hour — this covers wrong
    // password AND wrong OTP guesses automatically once verify/reset are set.
    maxFailedAttempsPerHour: 5,
  },
})
