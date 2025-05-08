import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, AlertCircle } from 'lucide-react'
import { logger } from '@paynless/utils'
import { useAuthStore } from '@paynless/store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const register = useAuthStore((state) => state.register)
  const authError = useAuthStore((state) => state.error)

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

      logger.info('[RegisterForm] Register action succeeded, navigating to dashboard.')
      navigate('/dashboard', { replace: true })

    } catch (error) {
      logger.error('[RegisterForm] Register action failed in component:', { errorMessage: error instanceof Error ? error.message : String(error) })
      setIsSubmitting(false)
    }
  }

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

        <Button
          type="submit"
          disabled={isSubmitting}
          className={`w-full flex justify-center py-2 px-4 ${
            isSubmitting ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {isSubmitting ? 'Creating account...' : 'Create account'}
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
