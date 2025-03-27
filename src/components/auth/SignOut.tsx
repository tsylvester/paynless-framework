import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { logger } from '../../utils/logger';
import { LogOut } from 'lucide-react';

const SignOut: React.FC = () => {
  const { signOut, isLoading, user, isOnline, networkStatus } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      logger.info('User signed out successfully');
    } catch (error) {
      logger.error('Error signing out:', error);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <p className="text-gray-600">
          Signed in as <span className="font-medium text-gray-900">{user.email}</span>
        </p>
        
        {networkStatus === 'offline' && (
          <p className="text-amber-600 text-sm mt-1">
            You are currently offline. You can still sign out locally.
          </p>
        )}
      </div>
      
      <button
        onClick={handleSignOut}
        disabled={isLoading}
        className="flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Signing Out...
          </>
        ) : (
          <>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out {!isOnline && '(Offline Mode)'}
          </>
        )}
      </button>
    </div>
  );
};

export default SignOut;