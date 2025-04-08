import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { logger } from '@paynless/utils';
import { useAuthStore } from '@paynless/store';

export function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { register, isLoading, error } = useAuthStore(state => ({
    register: state.register,
    isLoading: state.isLoading,
    error: state.error,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      logger.warn('Register form submitted with empty fields');
      return;
    }

    logger.info('Attempting to register user via form', { email });
    await register(email, password);
  };

  return (
    <div className="w-full max-w-md p-8 bg-surface rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">Create an Account</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          <span data-testid="register-error-message">{error.message}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} data-testid="register-form">
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-textSecondary mb-1">
            Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail size={18} className="text-textSecondary" />
            </div>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="block w-full pl-10 pr-3 py-2 border border-border rounded-md shadow-sm bg-background focus:outline-none focus:ring-primary focus:border-primary disabled:opacity-75"
              placeholder="you@example.com"
              required
            />
          </div>
        </div>
        
        <div className="mb-6">
          <label htmlFor="password" className="block text-sm font-medium text-textSecondary mb-1">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock size={18} className="text-textSecondary" />
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="block w-full pl-10 pr-3 py-2 border border-border rounded-md shadow-sm bg-background focus:outline-none focus:ring-primary focus:border-primary disabled:opacity-75"
              placeholder="••••••••"
              required
            />
          </div>
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
            isLoading ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
        
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
  );
}