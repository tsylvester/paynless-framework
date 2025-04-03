import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { logger } from '../../utils/logger';
import { useAuthStore } from '../../store/authStore';

interface LoginFormProps {
  onSuccess?: () => void;
  redirectPath?: string;
}

export function LoginForm({ onSuccess, redirectPath = '/' }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const login = useAuthStore(state => state.login);
  const navigate = useNavigate();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      logger.info('Attempting to login user via form', { email });
      const user = await login(email, password);
      
      if (user) {
        logger.info('Login successful, redirecting user');
        if (onSuccess) {
          onSuccess();
        } else {
          navigate(redirectPath);
        }
      } else {
        setError('Invalid email or password');
        logger.warn('Login failed, invalid credentials', { email });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Login form error', { error: errorMessage, email });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="w-full max-w-md p-8 bg-surface rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">Welcome Back</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
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
              className="block w-full pl-10 pr-3 py-2 border border-border rounded-md shadow-sm bg-background focus:outline-none focus:ring-primary focus:border-primary"
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
              className="block w-full pl-10 pr-3 py-2 border border-border rounded-md shadow-sm bg-background focus:outline-none focus:ring-primary focus:border-primary"
              placeholder="••••••••"
              required
            />
          </div>
          <div className="flex justify-end mt-1">
            <Link to="/forgot-password" className="text-sm text-primary hover:text-primary/90">
              Forgot password?
            </Link>
          </div>
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
            isSubmitting ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
        
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
  );
}