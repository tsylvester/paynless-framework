import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { logger } from '../utils/logger';
import { Shield } from 'lucide-react';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { hash } = window.location;
        
        if (hash) {
          const { data, error } = await supabase.auth.getSessionFromUrl();
          
          if (error) {
            logger.error('Error in auth callback:', error);
            setError(error.message);
            return;
          }
          
          if (data) {
            logger.info('Authentication successful via callback');
            navigate('/', { replace: true });
          }
        }
      } catch (error) {
        logger.error('Unexpected error in auth callback:', error);
        setError('An unexpected error occurred');
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8 text-center">
        <div className="flex items-center justify-center mb-6">
          <Shield className="h-10 w-10 text-blue-600 mr-2" />
          <h1 className="text-2xl font-bold text-gray-800">Auth Callback</h1>
        </div>
        
        {error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">Completing authentication...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthCallbackPage;