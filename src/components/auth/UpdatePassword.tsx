import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UpdatePasswordFormData, AuthError } from '../../types/auth.types';
import { logger } from '../../utils/logger';
import { Shield } from 'lucide-react';

const UpdatePassword: React.FC = () => {
  const { updatePassword, isLoading } = useAuth();
  const [formData, setFormData] = useState<UpdatePasswordFormData>({
    password: '',
    confirmPassword: '',
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
      const { password, confirmPassword } = formData;
      
      if (!password.trim() || !confirmPassword.trim()) {
        setFormError('All fields are required');
        return;
      }
      
      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }
      
      if (password.length < 6) {
        setFormError('Password must be at least 6 characters');
        return;
      }
      
      await updatePassword(password);
      
      setSuccess(true);
      logger.info('Password updated successfully');
    } catch (error) {
      logger.error('Update password error:', error);
      
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
          <h2 className="mt-3 text-lg font-medium text-gray-900">Password updated successfully!</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your password has been successfully updated. You can now sign in with your new password.
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
        <Shield className="h-8 w-8 text-blue-600 mr-2" />
        <h2 className="text-2xl font-bold text-gray-800">Update Password</h2>
      </div>
      
      {formError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <span className="block sm:inline">{formError}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={formData.password}
            onChange={handleChange}
            disabled={isLoading}
          />
        </div>
        
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={formData.confirmPassword}
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
            {isLoading ? 'Updating Password...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UpdatePassword;