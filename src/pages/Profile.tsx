import { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Navigate } from 'react-router-dom';
import { logger } from '../utils/logger';
import { UserProfile } from '../types/auth.types';
import { ProfileEditor } from '../components/profile/ProfileEditor';
import { Loader, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/apiClient'

export function ProfilePage() {
  const { user, profile, setProfile, isLoading: authLoading } = useAuthStore(state => ({ 
    user: state.user,
    profile: state.profile,
    setProfile: state.setProfile,
    isLoading: state.isLoading 
  }));
  
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async (updatedProfileData: Partial<UserProfile>) => {
    if (!user || !profile) {
      setError('Cannot save profile: User or profile data missing.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      logger.info('ProfilePage: Attempting to save profile changes', { userId: user.id, changes: updatedProfileData });
      
      const updatedProfile = await api.put<UserProfile>('/profile', updatedProfileData);

      if (updatedProfile) {
        setProfile(updatedProfile);
        setSuccess('Profile updated successfully!');
        logger.info('ProfilePage: Profile updated successfully', { userId: user.id });
      } else {
        logger.warn('ProfilePage: updateCurrentUserProfile returned null', { userId: user.id });
        setError('Failed to save profile changes. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      logger.error('ProfilePage: Error updating profile', { error: errorMessage, userId: user.id });
      setError('An error occurred while saving. Please try again later.');
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <Loader className="h-8 w-8 text-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-textPrimary mb-8">Edit Profile</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-100 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <span>{success}</span>
          </div>
        )}

        {profile ? (
          <div className="bg-surface rounded-lg shadow-sm p-6">
            <ProfileEditor
              profile={profile}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </div>
        ) : (
          !error && (
            <div className="p-4 bg-yellow-100 text-yellow-700 rounded flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <span>Could not load profile information. Please try refreshing the page.</span>
            </div>
          )
        )}
      </div>
    </Layout>
  );
}