import { useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'

// Every screen this page can show. `signIn`/`signUp` are the normal password
// form; `verifyCode` follows either one (Convex Auth always requires a fresh
// 6-digit email code before an unverified account gets tokens); `forgotPassword`
// and `resetCode` are the recovery path.
type Step = 'signIn' | 'signUp' | 'verifyCode' | 'forgotPassword' | 'resetCode'

export function SignInPage() {
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<Step>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function resetMessages() {
    setError(null)
    setInfo(null)
  }

  // Sign in or sign up with a password. If the account isn't email-verified
  // yet, Convex Auth sends a code instead of tokens — `signIn` resolves with
  // `signingIn: false` (no throw) in that case, same as it would for an OAuth
  // redirect, so that's the signal to show the code-entry screen.
  async function handleAuthSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    resetMessages()
    setSubmitting(true)
    const flow = step === 'signUp' ? 'signUp' : 'signIn'
    const formData = new FormData(e.currentTarget)
    formData.set('flow', flow)
    const submittedEmail = String(formData.get('email'))
    const submittedPassword = String(formData.get('password'))
    try {
      const result = await signIn('password', formData)
      if (!result.signingIn) {
        setEmail(submittedEmail)
        setPassword(submittedPassword)
        setCode('')
        setStep('verifyCode')
        setInfo('Check your email — enter the 6-digit code below.')
      }
    } catch {
      setError(
        flow === 'signIn'
          ? 'Wrong email or password. New here? Tap "Sign up" below.'
          : 'Could not create the account. Password must be at least 8 characters.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    resetMessages()
    setSubmitting(true)
    try {
      await signIn('password', { flow: 'email-verification', email, code })
      // Success issues tokens — App.tsx's <Authenticated> takes over from here.
    } catch {
      setError('Wrong or expired code. Try again or resend.')
    } finally {
      setSubmitting(false)
    }
  }

  // Once an account exists, re-requesting a code is just a normal sign-in
  // attempt with the same (already-known) password — it fails verification
  // the same way and sends a fresh code, whether the account was created
  // moments ago via sign-up or already existed.
  async function handleResendVerification() {
    resetMessages()
    try {
      await signIn('password', { flow: 'signIn', email, password })
      setInfo('New code sent.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.')
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
      setError(err instanceof Error ? err.message : 'Could not send reset code.')
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
      setError(err instanceof Error ? err.message : 'Could not resend code.')
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6">
      <h1 className="text-center text-4xl font-black tracking-tight">SWOLE</h1>

      {(step === 'signIn' || step === 'signUp') && (
        <>
          <p className="mt-2 text-center text-muted">
            {step === 'signIn' ? 'Welcome back.' : 'Create your account.'}
          </p>
          <form onSubmit={handleAuthSubmit} className="mt-8 flex flex-col gap-3">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
            />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={step === 'signIn' ? 'current-password' : 'new-password'}
              placeholder="Password (min. 8 characters)"
              className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="btn-glow mt-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
            >
              {submitting ? 'One sec…' : step === 'signIn' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          {step === 'signIn' && (
            <button
              type="button"
              onClick={() => {
                resetMessages()
                setStep('forgotPassword')
              }}
              className="mt-4 text-center text-sm text-muted underline underline-offset-4"
            >
              Forgot password?
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setStep(step === 'signIn' ? 'signUp' : 'signIn')
              resetMessages()
            }}
            className="mt-6 text-center text-sm text-muted underline underline-offset-4"
          >
            {step === 'signIn'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </>
      )}

      {step === 'verifyCode' && (
        <>
          <p className="mt-2 text-center text-muted">Verify {email}</p>
          <form onSubmit={handleVerifyCode} className="mt-8 flex flex-col gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="6-digit code"
              className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-accent"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}
            {info && <p className="text-sm text-success">{info}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="btn-glow mt-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
            >
              {submitting ? 'One sec…' : 'Verify'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => void handleResendVerification()}
            className="mt-4 text-center text-sm text-muted underline underline-offset-4"
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => {
              resetMessages()
              setStep('signIn')
            }}
            className="mt-2 text-center text-sm text-muted"
          >
            Use a different email
          </button>
        </>
      )}

      {step === 'forgotPassword' && (
        <>
          <p className="mt-2 text-center text-muted">Reset your password.</p>
          <form onSubmit={handleForgotPassword} className="mt-8 flex flex-col gap-3">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="btn-glow mt-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
            >
              {submitting ? 'One sec…' : 'Send reset code'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              resetMessages()
              setStep('signIn')
            }}
            className="mt-6 text-center text-sm text-muted underline underline-offset-4"
          >
            Back to sign in
          </button>
        </>
      )}

      {step === 'resetCode' && (
        <>
          <p className="mt-2 text-center text-muted">Reset code sent to {email}</p>
          <form onSubmit={handleResetCode} className="mt-8 flex flex-col gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="6-digit code"
              className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-lg tracking-[0.3em] outline-none focus:border-accent"
            />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="New password (min. 8 characters)"
              className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}
            {info && <p className="text-sm text-success">{info}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="btn-glow mt-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
            >
              {submitting ? 'One sec…' : 'Reset password'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => void handleResendReset()}
            className="mt-4 text-center text-sm text-muted underline underline-offset-4"
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => {
              resetMessages()
              setStep('signIn')
            }}
            className="mt-2 text-center text-sm text-muted"
          >
            Back to sign in
          </button>
        </>
      )}
    </div>
  )
}
