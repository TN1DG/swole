import { useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'

// One screen for both sign-in and sign-up; `flow` switches between them.
export function SignInPage() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
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
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6">
      <h1 className="text-center text-4xl font-black tracking-tight">
        SWOLE
      </h1>
      <p className="mt-2 text-center text-muted">
        {flow === 'signIn' ? 'Welcome back.' : 'Create your account.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
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
          autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
          placeholder="Password (min. 8 characters)"
          className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
        >
          {submitting ? 'One sec…' : flow === 'signIn' ? 'Sign In' : 'Sign Up'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setFlow(flow === 'signIn' ? 'signUp' : 'signIn')
          setError(null)
        }}
        className="mt-6 text-center text-sm text-muted underline underline-offset-4"
      >
        {flow === 'signIn'
          ? "Don't have an account? Sign up"
          : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
