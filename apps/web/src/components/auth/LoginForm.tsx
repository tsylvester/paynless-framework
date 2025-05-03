import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, AlertCircle } from 'lucide-react'
import { logger } from '@paynless/utils'
import { useAuthStore } from '@paynless/store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const { login, isLoading, error } = useAuthStore((state) => ({
    login: state.login,
    isLoading: state.isLoading,
    error: state.error,
  }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      logger.warn('Login form submitted with empty fields')
      return
    }

    logger.info('Attempting to login user via form', { email })
    await login(email, password)
  }

  return (
    <div className="w-full max-w-md p-8 bg-surface rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">
        Welcome Back
      </h2>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700"
        >
          <AlertCircle size={18} />
          <span data-testid="login-error-message">{error.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} data-testid="login-form">
        <div className="mb-4">
          <Label
            htmlFor="email"
            className="block text-sm font-medium text-textSecondary mb-1"
          >
            Email
          </Label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail size={18} className="text-textSecondary" />
            </div>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="pl-10 bg-black"
              placeholder="you@example.com"
              required
            />
          </div>
        </div>

        <div className="mb-6">
          <Label
            htmlFor="password"
            className="block text-sm font-medium text-textSecondary mb-1"
          >
            Password
          </Label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock size={18} className="text-textSecondary" />
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="pl-10"
              placeholder="••••••••"
              required
            />
          </div>
          <div className="flex justify-end mt-1">
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:text-primary/90"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>

        <div className="mt-4 text-center">
          <span className="text-sm text-textSecondary">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary hover:text-primary/90">
              Sign up
            </Link>
          </span>
        </div>
      </form>
    </div>
  )
}