import React from 'react';
import { useAuth } from '../hooks/useAuth';
import SignOut from '../components/auth/SignOut';
import { Shield, WifiOff, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
  const { user, isLoading, error, networkStatus, authStatus, retryAuth } = useAuth();

  const handleRetry = () => {
    retryAuth();
  };

  // Show offline warning
  const isOffline = networkStatus === 'offline';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Loading authentication state...</p>
          
          {isOffline && (
            <div className="mt-4 flex items-center text-amber-600">
              <WifiOff className="h-4 w-4 mr-1" />
              <span>Offline mode - using cached data</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="flex items-center justify-center mb-4">
        <Shield className="h-10 w-10 text-blue-600 mr-2" />
        <h1 className="text-3xl font-bold text-gray-800">Auth Framework</h1>
      </div>
      
      {isOffline && (
        <div className="w-full max-w-md bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center space-x-2">
          <WifiOff className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-700 text-sm">
            You're currently offline. Some authentication features may be limited.
          </p>
        </div>
      )}
      
      {error && authStatus !== 'authenticated' && (
        <div className="w-full max-w-md bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start space-x-2">
          <div className="text-red-600 mt-0.5 flex-shrink-0">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-red-700 text-sm font-medium">Authentication Error</p>
            <p className="text-red-600 text-sm">{error.message}</p>
            <button 
              onClick={handleRetry}
              className="mt-2 flex items-center text-xs text-red-700 hover:text-red-800"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </button>
          </div>
        </div>
      )}
      
      {user ? (
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Welcome!</h2>
            <p className="mt-2 text-gray-600">You are now signed in to the application.</p>
            {error && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
                Note: There was an issue with your last request, but your session is still active.
              </div>
            )}
          </div>
          <SignOut />
        </div>
      ) : (
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-lg text-gray-600 mb-6">Please sign in to access your account.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/signin"
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;