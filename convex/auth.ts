import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import { ResendOTPPasswordReset } from './emailAuth'
import { rateLimiter } from './rateLimiter'

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
  callbacks: {
    // For a "credentials" provider (Password), this only fires on account
    // creation — not on every ordinary sign-in, which is already covered by
    // maxFailedAttempsPerHour above. There's no per-signup identifier to
    // throttle on yet (and no client IP available to a Convex action), so
    // this is a single app-wide bucket: it deters a scripted flood of
    // throwaway accounts without touching normal sign-up traffic. Throwing
    // here rolls back the whole sign-up transaction (the callback runs
    // inside the same mutation as the user-document insert), so no
    // half-created account is left behind.
    async afterUserCreatedOrUpdated(ctx, { type, existingUserId }) {
      if (type === 'credentials' && existingUserId === null) {
        await rateLimiter.limit(ctx, 'signUp', { throws: true })
      }
    },
  },
})
