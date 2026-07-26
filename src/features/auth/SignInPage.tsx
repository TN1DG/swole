import { useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Box, Button, TextField, Typography } from '@mui/material'
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
