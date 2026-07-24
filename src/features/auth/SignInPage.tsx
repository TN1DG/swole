import { useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'

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
      await signIn('password', formData)
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
