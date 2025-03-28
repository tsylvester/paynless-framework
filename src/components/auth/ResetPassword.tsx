import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ResetPasswordFormData, AuthError } from '../../types/auth.types';
import { logger } from '../../utils/logger';
import { KeyRound } from 'lucide-react';

const ResetPassword: React.FC = () => {
  const { resetPassword, isLoading } = useAuth();
  const [formData, setFormData] = useState<ResetPasswordFormData>({
    email: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(false);

    try {
      const { email } = formData;
      
      if (!email.trim()) {
        setFormError('Email is required');
        return;
      }
      
      await resetPassword(email);
      
      setSuccess(true);
      logger.info('Reset password email sent successfully');
    } catch (error) {
      logger.error('Reset password error:', error);
      
      const authError = error as AuthError;
      
      if (authError.message) {
        setFormError(authError.message);
      } else {
        setFormError('An unexpected error occurred');
      }
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-3 text-lg font-medium text-gray-900">Password reset email sent!</h2>
          <p className="mt-2 text-sm text-gray-600">
            We've sent a password reset link to your email address. Please check your inbox and click the link to reset your password.
          </p>
          <div className="mt-6">
            <a
              href="/"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
      <div className="flex items-center justify-center mb-6">
        <KeyRound className="h-8 w-8 text-blue-600 mr-2" />
        <h2 className="text-2xl font-bold text-gray-800">Reset Password</h2>
      </div>
      
      {formError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <span className="block sm:inline">{formError}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={formData.email}
            onChange={handleChange}
            disabled={isLoading}
          />
        </div>
        
        <div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? 'Sending Reset Link...' : 'Send Reset Link'}
          </button>
        </div>
      </form>
      
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">
          Remember your password?{' '}
          <a href="/" className="font-medium text-blue-600 hover:text-blue-500">
            Back to Sign In
          </a>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;