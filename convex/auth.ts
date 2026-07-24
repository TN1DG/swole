import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import { ResendOTPPasswordReset } from './emailAuth'

// Email+password login with no signup verification — users are signed in
// immediately after creating an account. Password reset still uses an OTP
// (see convex/emailAuth.ts). `signIn`/`signOut` become callable from the
// frontend; `auth` is used by http.ts to expose the auth HTTP endpoints.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: ResendOTPPasswordReset,
    }),
  ],
  signIn: {
    // Tighter than the library's own default of 10/hour — this covers wrong
    // password AND wrong OTP guesses automatically once verify/reset are set.
    maxFailedAttempsPerHour: 5,
  },
})
