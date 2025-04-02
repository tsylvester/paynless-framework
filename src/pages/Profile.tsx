import React, { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/layout/Layout';
import { Navigate } from 'react-router-dom';
import { profileService } from '../services/profile.service';
import { logger } from '../utils/logger';
import { UserProfile } from '../types/auth.types';
import { ProfileEditor } from '../components/profile/ProfileEditor';
import { Loader, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function ProfilePage() {
  const { user, isLoading: authLoading } = useAuthStore(state => ({ user: state.user, isLoading: state.isLoading }));
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setIsProfileLoading(false);
      return;
    }

    setIsProfileLoading(true);
    setError(null);
    setSuccess(null);

    try {
      logger.info('ProfilePage: Loading profile for user', { userId: user.id });
      const fetchedProfile = await profileService.getCurrentUserProfile();

      if (fetchedProfile) {
        setProfile(fetchedProfile);
        logger.info('ProfilePage: Profile loaded successfully', { userId: user.id });
      } else {
        logger.warn('ProfilePage: getCurrentUserProfile returned null', { userId: user.id });
        setError('Could not load your profile data. Please try refreshing.');
        setProfile(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      logger.error('ProfilePage: Error loading profile', { error: errorMessage, userId: user.id });
      setError('Failed to load profile data. Please try again later.');
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      loadProfile();
    }
  }, [authLoading, loadProfile]);

  const handleSave = async (updatedProfileData: Partial<UserProfile>) => {
    if (!profile) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      logger.info('ProfilePage: Attempting to save profile', { userId: profile.id });
      const updatedProfile = await profileService.updateCurrentUserProfile({
        ...profile,
        ...updatedProfileData,
      });

      if (updatedProfile) {
        setProfile(updatedProfile);
        setSuccess('Profile updated successfully!');
        logger.info('ProfilePage: Profile updated successfully', { userId: profile.id });
      } else {
        logger.warn('ProfilePage: updateCurrentUserProfile returned null', { userId: profile.id });
        setError('Failed to save profile changes. Please try again.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      logger.error('ProfilePage: Error updating profile', { error: errorMessage, userId: profile.id });
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

  const isLoading = isProfileLoading;

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

        {isLoading ? (
          <div className="space-y-6">
            <div className="bg-surface rounded-lg shadow-sm p-6 animate-pulse">
              <div className="flex items-center space-x-4 mb-4">
                <div className="h-20 w-20 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-4 bg-gray-200 rounded w-2/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
              <div className="space-y-4 mt-6">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-10 bg-gray-200 rounded w-1/4 mt-4" />
              </div>
            </div>
         </div>
        ) : profile ? (
          <div className="bg-surface rounded-lg shadow-sm p-6">
            <ProfileEditor
              profile={profile}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </div>
        ) : (
          !error && (
            <div className="text-center text-gray-500 py-10">
              Could not load profile information.
            </div>
          )
        )}
      </div>
    </Layout>
  );
}