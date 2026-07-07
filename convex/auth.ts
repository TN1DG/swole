import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'

// Sets up email+password login. `signIn`/`signOut` become callable from the
// frontend; `auth` is used by http.ts to expose the auth HTTP endpoints.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
})
