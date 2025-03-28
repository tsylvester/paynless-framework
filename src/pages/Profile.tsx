import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import { UserCircle, Calendar, Loader } from 'lucide-react';
import { logger } from '../utils/logger';
import UserNameField from '../components/profile/UserNameField';
import EmailField from '../components/profile/EmailField';
import PasswordChangeField from '../components/profile/PasswordChangeField';
import EmailVerificationBanner from '../components/profile/EmailVerificationBanner';

interface ProfileData {
  id: string;
  user_name: string | null;
  created_at: string;
  updated_at: string;
}

const Profile: React.FC = () => {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch user data from Auth API to check email verification status
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          logger.error('Error fetching user data:', userError);
          setError('Failed to load user data');
          return;
        }
        
        // Check if email is verified using email_confirmed_at from auth
        setIsVerified(!!userData.user.email_confirmed_at);
        
        // Fetch profile data from Supabase
        const { data, error } = await supabase
          .from('profiles')
          .select('id, user_name, created_at, updated_at')
          .eq('id', user.id)
          .single();

        if (error) {
          logger.error('Error fetching profile:', error);
          setError('Failed to load profile data');
          
          // If no profile exists, try to create one
          if (error.code === 'PGRST116') {
            await createProfile();
          }
          return;
        }

        setProfileData(data as ProfileData);
        logger.debug('Profile loaded successfully', data);
      } catch (err) {
        logger.error('Unexpected error fetching profile:', err);
        setError('An unexpected error occurred while fetching your profile');
      } finally {
        setIsLoading(false);
      }
    };

    const createProfile = async () => {
      try {
        // Create a new profile for this user
        const { data, error } = await supabase
          .from('profiles')
          .insert([
            { 
              id: user.id, 
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ])
          .select()
          .single();

        if (error) {
          logger.error('Error creating profile:', error);
          setError('Failed to create profile');
          return;
        }

        setProfileData(data as ProfileData);
        logger.info('New profile created successfully', data);
      } catch (err) {
        logger.error('Unexpected error creating profile:', err);
        setError('An unexpected error occurred while creating your profile');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  // Format date for better display
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleUserNameUpdate = (newUserName: string) => {
    if (profileData) {
      setProfileData({
        ...profileData,
        user_name: newUserName,
        updated_at: new Date().toISOString()
      });
    }
  };

  const handleEmailUpdate = () => {
    // Just update the UI temporarily - actual verification status
    // will be updated on the next page load from the auth API
    setIsVerified(false);
  };

  // If the user is not logged in, show access denied
  if (!user) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
          <p className="text-gray-600">Please sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !profileData) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Error Loading Profile</h2>
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const created_at = profileData?.created_at ? formatDate(profileData.created_at) : 'N/A';

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center py-10 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl w-full">
        <div className="flex items-center mb-8">
          <div className="bg-blue-100 p-4 rounded-full">
            <UserCircle className="h-10 w-10 text-blue-600" />
          </div>
          <div className="ml-4">
            <h1 className="text-2xl font-bold text-gray-800">User Profile</h1>
            <p className="text-gray-600">Manage your account information</p>
          </div>
        </div>

        {!isVerified && (
          <div className="mb-6">
            <EmailVerificationBanner 
              email={user.email || ''} 
              isVerified={isVerified} 
            />
          </div>
        )}

        <div className="space-y-6">
          {/* Username field */}
          <UserNameField 
            userName={profileData?.user_name ?? "Username"} 
            onUpdate={handleUserNameUpdate} 
          />

          {/* Email field */}
          <EmailField 
            email={user.email || ''} 
            onUpdate={handleEmailUpdate} 
          />

          {/* Password change field */}
          <PasswordChangeField />

          {/* Account created date (read-only) */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-start">
              <Calendar className="h-5 w-5 text-gray-500 mt-1 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-500">Account Created</p>
                <p className="mt-1 text-lg text-gray-800">{created_at}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;