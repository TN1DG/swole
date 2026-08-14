import { useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useAction } from 'convex/react'
import { Box, Button, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { TurnstileWidget } from '../../components/TurnstileWidget'
import {
  isStaleShellChallengeError,
  STALE_SHELL_MESSAGE,
  turnstileEnabled,
} from '../../lib/turnstile'
import { updateServiceWorker } from '../../lib/serviceWorker'
import { errorMessage } from '../../lib/errors'

type Step = 'signIn' | 'signUp' | 'forgotPassword' | 'resetCode'

export function SignInPage() {
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<Step>('signIn')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Null until Turnstile hands over a token, and back to null when it expires.
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const verifyChallenge = useAction(api.turnstile.verifySignupChallenge)

  function resetMessages() {
    setError(null)
    setInfo(null)
  }

  async function handleAuthSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    resetMessages()
    setSubmitting(true)
    const flow = step === 'signUp' ? 'signUp' : 'signIn'
    const formData = new FormData(e.currentTarget)
    formData.set('flow', flow)
    try {
      // Sign-up only. The challenge exists because the app-wide sign-up limit
      // can't tell one abuser from everybody else (a Convex action has no
      // caller IP), so a flood can lock real people out of registering.
      //
      // Verified before `signIn` rather than inside it: checking the token
      // means calling Cloudflare, and only a Convex action can do that, while
      // the sign-up hook that rejects unverified accounts runs in a mutation.
      // The action leaves a short-lived pass the mutation spends.
      if (flow === 'signUp' && turnstileEnabled) {
        if (challengeToken === null) {
          setError('Please complete the challenge below, then try again.')
          setSubmitting(false)
          return
        }
        await verifyChallenge({ token: challengeToken, email: String(formData.get('email') ?? '') })
      }
      await signIn('password', formData)
    } catch (err) {
      const message = errorMessage(
        err,
        'Could not create the account. Please try again, or sign in if you already have one.',
      )

      // A bundle built before Turnstile was switched on has no widget to show,
      // so the server's "complete the challenge" is advice this page cannot be
      // acted on — a dead end that only a refresh escapes. Say that instead,
      // and pull the new service worker in so the refresh actually lands on a
      // current shell rather than the same cached one.
      if (isStaleShellChallengeError({ flow, widgetAvailable: turnstileEnabled, message })) {
        void updateServiceWorker()
        setError(STALE_SHELL_MESSAGE)
      } else {
        setError(
          flow === 'signIn'
            ? 'Wrong email or password. New here? Tap "Sign up" below.'
            : // Don't name a cause this branch hasn't verified. `errorMessage`
              // returns this fallback for anything that isn't a ConvexError —
              // including a misconfigured deployment — and the password length
              // is already enforced by `minLength: 8` on the input below, so it
              // can't realistically be what failed here.
              message,
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    resetMessages()
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const submittedEmail = String(formData.get('email'))
    try {
      await signIn('password', { flow: 'reset', email: submittedEmail })
      setEmail(submittedEmail)
      setCode('')
      setNewPassword('')
      setStep('resetCode')
      setInfo('Check your email — enter the 6-digit code below.')
    } catch (err) {
      setError(errorMessage(err, 'Could not send reset code.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    resetMessages()
    setSubmitting(true)
    try {
      await signIn('password', { flow: 'reset-verification', email, code, newPassword })
      // Success signs in with the new password and invalidates other sessions.
    } catch {
      setError('Wrong or expired code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResendReset() {
    resetMessages()
    try {
      await signIn('password', { flow: 'reset', email })
      setInfo('New code sent.')
    } catch (err) {
      setError(errorMessage(err, 'Could not resend code.'))
    }
  }

  return (
    <Box sx={{ mx: 'auto', display: 'flex', minHeight: '100svh', maxWidth: '32rem', flexDirection: 'column', justifyContent: 'center', px: 3 }}>
      <Typography variant="h3" sx={{ textAlign: 'center', fontWeight: 900, letterSpacing: '-0.02em' }}>
        SWOLE
      </Typography>

      {(step === 'signIn' || step === 'signUp') && (
        <>
          <Typography color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            {step === 'signIn' ? 'Welcome back.' : 'Create your account.'}
          </Typography>
          <Box component="form" onSubmit={handleAuthSubmit} sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              fullWidth
            />
            <TextField
              name="password"
              type="password"
              required
              autoComplete={step === 'signIn' ? 'current-password' : 'new-password'}
              placeholder="Password (min. 8 characters)"
              fullWidth
              slotProps={{ htmlInput: { minLength: 8 } }}
            />

            {/* Sign-up only: signing in to an existing account isn't the
                thing being flooded, and a challenge on every login would be a
                tax on real users for no gain. Renders nothing when
                VITE_TURNSTILE_SITE_KEY is unset, which is the case on preview
                builds. */}
            {step === 'signUp' && <TurnstileWidget onToken={setChallengeToken} />}

            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}

            <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 1 }}>
              {submitting ? 'One sec…' : step === 'signIn' ? 'Sign In' : 'Sign Up'}
            </Button>
          </Box>

          {step === 'signIn' && (
            <Button
              variant="text"
              color="inherit"
              sx={{ mt: 2, textDecoration: 'underline', color: 'text.secondary' }}
              onClick={() => {
                resetMessages()
                setStep('forgotPassword')
              }}
            >
              Forgot password?
            </Button>
          )}

          <Button
            variant="text"
            color="inherit"
            sx={{ mt: step === 'signIn' ? 0 : 3, textDecoration: 'underline', color: 'text.secondary' }}
            onClick={() => {
              setStep(step === 'signIn' ? 'signUp' : 'signIn')
              resetMessages()
            }}
          >
            {step === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </Button>
        </>
      )}

      {step === 'forgotPassword' && (
        <>
          <Typography color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            Reset your password.
          </Typography>
          <Box component="form" onSubmit={handleForgotPassword} sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField name="email" type="email" required autoComplete="email" placeholder="Email" fullWidth />

            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}

            <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 1 }}>
              {submitting ? 'One sec…' : 'Send reset code'}
            </Button>
          </Box>
          <Button
            variant="text"
            color="inherit"
            sx={{ mt: 3, textDecoration: 'underline', color: 'text.secondary' }}
            onClick={() => {
              resetMessages()
              setStep('signIn')
            }}
          >
            Back to sign in
          </Button>
        </>
      )}

      {step === 'resetCode' && (
        <>
          <Typography color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            Reset code sent to {email}
          </Typography>
          <Box component="form" onSubmit={handleResetCode} sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              required
              placeholder="6-digit code"
              fullWidth
              slotProps={{ htmlInput: { inputMode: 'numeric', style: { textAlign: 'center', letterSpacing: '0.3em', fontSize: '1.125rem' } } }}
            />
            <TextField
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              required
              autoComplete="new-password"
              placeholder="New password (min. 8 characters)"
              fullWidth
              slotProps={{ htmlInput: { minLength: 8 } }}
            />

            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
            {info && (
              <Typography variant="body2" color="success.main">
                {info}
              </Typography>
            )}

            <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 1 }}>
              {submitting ? 'One sec…' : 'Reset password'}
            </Button>
          </Box>
          <Button
            variant="text"
            color="inherit"
            sx={{ mt: 2, textDecoration: 'underline', color: 'text.secondary' }}
            onClick={() => void handleResendReset()}
          >
            Resend code
          </Button>
          <Button
            variant="text"
            color="inherit"
            sx={{ mt: 0.5, color: 'text.secondary' }}
            onClick={() => {
              resetMessages()
              setStep('signIn')
            }}
          >
            Back to sign in
          </Button>
        </>
      )}
    </Box>
  )
}
