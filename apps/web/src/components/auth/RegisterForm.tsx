import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, AlertCircle } from 'lucide-react'
import { logger } from '@paynless/utils'
import { useAuthStore } from '@paynless/store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FaGoogle } from 'react-icons/fa'

export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [subscribe, setSubscribe] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const { register, handleOAuthLogin, subscribeToNewsletter, isLoading, error: authError } = useAuthStore(
    (state) => ({
      register: state.register,
      handleOAuthLogin: state.handleOAuthLogin,
      subscribeToNewsletter: state.subscribeToNewsletter,
      isLoading: state.isLoading,
      error: state.error,
    })
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      logger.warn('Register form submitted with empty fields')
      return
    }

    setIsSubmitting(true)

    try {
      logger.info('Attempting to register user via form', { email })
      await register(email, password)

      if (subscribe) {
        // This is a non-blocking call
        subscribeToNewsletter(email);
      }

      logger.info('[RegisterForm] Register action succeeded, navigating to dashboard.')
      navigate('/dashboard', { replace: true })

    } catch (error) {
      logger.error('[RegisterForm] Register action failed in component:', { errorMessage: error instanceof Error ? error.message : String(error) })
      setIsSubmitting(false)
    }
  }

  const handleGoogleRegister = async () => {
    try {
      await handleOAuthLogin('google');
      // Navigation on success is handled by Supabase redirect
    } catch (error) {
      logger.error('[RegisterForm] Google Register action failed in component:', { errorMessage: error instanceof Error ? error.message : String(error) });
      // The error state in the store will be set by the action, which will be displayed
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-surface rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">
        Create an Account
      </h2>

      {authError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          <span data-testid="register-error-message">{authError.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} data-testid="register-form">
        <div className="mb-4">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail size={18} className="text-textSecondary" />
            </div>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="pl-10"
              placeholder="you@example.com"
              required
            />
          </div>
        </div>

        <div className="mb-6">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock size={18} className="text-textSecondary" />
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="pl-10"
              placeholder="••••••••"
              required
            />
          </div>
        </div>

        <div className="mb-6 flex items-center space-x-2">
            <Checkbox id="subscribe" checked={subscribe} onCheckedChange={(checked) => setSubscribe(Boolean(checked))} />
            <Label htmlFor="subscribe" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Receive system notices and updates by email.
            </Label>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || isLoading}
          className={`w-full flex justify-center py-2 px-4 ${
            (isSubmitting || isLoading) ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {isSubmitting || isLoading ? 'Creating account...' : 'Create account'}
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-2 text-textSecondary">
              Or continue with
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleGoogleRegister}
          disabled={isLoading}
        >
          <FaGoogle className="mr-2 h-4 w-4" />
          Sign up with Google
        </Button>

        <div className="mt-4 text-center">
          <span className="text-sm text-textSecondary">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary/90">
              Sign in
            </Link>
          </span>
        </div>
      </form>
    </div>
  )
}