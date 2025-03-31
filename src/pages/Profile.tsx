import React, { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { profileService } from '../services/profile.service';
import { logger } from '../utils/logger';
import { UserProfile } from '../types/auth.types';
import { UserPreferences, UserDetails } from '../types/dating.types';
import { ProfileEditor } from '../components/profile/ProfileEditor';
import { Loader } from 'lucide-react';
import { profileApiClient as profileApi } from '../api/clients/profile.api';

interface LoadingState {
  profile: boolean;
  preferences: boolean;
  details: boolean;
}

export function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [loadingState, setLoadingState] = useState<LoadingState>({
    profile: true,
    preferences: true,
    details: true,
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;

      try {
        // Load profile, preferences, and details independently
        const loadProfileData = async () => {
          try {
            const response = await profileApi.getMyProfile();
            if (response.error) {
              throw new Error(response.error.message);
            }
            setProfile(response.data);
          } catch (error) {
            logger.error('Error loading profile:', error);
            setError('Failed to load profile data');
          } finally {
            setLoadingState(prev => ({ ...prev, profile: false }));
          }
        };

        const loadPreferences = async () => {
          try {
            const response = await profileApi.getMyPreferences();
            if (response.error) {
              throw new Error(response.error.message);
            }
            setPreferences(response.data);
          } catch (error) {
            logger.error('Error loading preferences:', error);
            setError('Failed to load preferences');
          } finally {
            setLoadingState(prev => ({ ...prev, preferences: false }));
          }
        };

        const loadDetails = async () => {
          try {
            const response = await profileApi.getMyDetails();
            if (response.error) {
              throw new Error(response.error.message);
            }
            setDetails(response.data);
          } catch (error) {
            logger.error('Error loading details:', error);
            setError('Failed to load details');
          } finally {
            setLoadingState(prev => ({ ...prev, details: false }));
          }
        };

        // Load all data in parallel
        await Promise.all([
          loadProfileData(),
          loadPreferences(),
          loadDetails(),
        ]);
      } catch (error) {
        logger.error('Error in profile loading process', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: user.id,
        });
        setError('Failed to load profile data. Please try again.');
      }
    }

    loadProfile();
  }, [user]);

  const handleSave = async (updatedProfile: Partial<UserProfile>) => {
    if (!user) return;

    try {
      const response = await profileApi.updateProfile(updatedProfile);
      if (response.error) {
        throw new Error(response.error.message);
      }
      setProfile(response.data);
      setSuccess('Profile updated successfully');
    } catch (error) {
      logger.error('Error updating profile:', error);
      setError('Failed to update profile');
    }
  };

  const handleSavePreferences = async (updates: Partial<UserPreferences>) => {
    if (!user) return;

    try {
      const updatedPreferences = await profileService.updateUserPreferences(user.id, updates);
      if (updatedPreferences) {
        setPreferences(updatedPreferences);
        logger.info('Preferences updated successfully', { userId: user.id });
      } else {
        setError('Failed to update preferences. Please try again.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error updating preferences', {
        error: errorMessage,
        userId: user.id,
      });
      throw error;
    }
  };

  const handleSaveDetails = async (updates: Partial<UserDetails>) => {
    if (!user) return;

    try {
      const updatedDetails = await profileService.updateUserDetails(user.id, updates);
      if (updatedDetails) {
        setDetails(updatedDetails);
        logger.info('Details updated successfully', { userId: user.id });
      } else {
        setError('Failed to update details. Please try again.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error updating details', {
        error: errorMessage,
        userId: user.id,
      });
      throw error;
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
    return <Navigate to="/login" />;
  }

  const isLoading = Object.values(loadingState).some(state => state);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-textPrimary mb-8">Edit Profile</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-6">
            {/* Profile Skeleton */}
            <div className="bg-surface rounded-lg shadow-sm p-6 animate-pulse">
              <div className="flex items-center space-x-4">
                <div className="h-20 w-20 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
            </div>

            {/* Preferences Skeleton */}
            <div className="bg-surface rounded-lg shadow-sm p-6 animate-pulse">
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>

            {/* Details Skeleton */}
            <div className="bg-surface rounded-lg shadow-sm p-6 animate-pulse">
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          profile && (
            <div className="bg-surface rounded-lg shadow-sm p-6">
              <ProfileEditor
                profile={profile}
                preferences={preferences || undefined}
                details={details || undefined}
                onSave={handleSave}
                onSavePreferences={handleSavePreferences}
                onSaveDetails={handleSaveDetails}
              />
            </div>
          )
        )}
      </div>
    </Layout>
  );
}