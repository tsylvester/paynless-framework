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

export function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;

      try {
        setIsLoading(true);
        
        // Load profile, preferences, and details in parallel
        const [userProfile, userPreferences, userDetails] = await Promise.all([
          profileService.ensureProfileExists(user.id, {
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl,
            role: user.role,
          }),
          profileService.getUserPreferences(user.id),
          profileService.getUserDetails(user.id),
        ]);

        setProfile(userProfile);
        setPreferences(userPreferences);
        setDetails(userDetails);
      } catch (error) {
        logger.error('Error loading user profile data', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: user.id,
        });
        setError('Failed to load profile. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [user]);

  const handleSave = async (updates: Partial<UserProfile>) => {
    if (!user) return;

    try {
      const updatedProfile = await profileService.createOrUpdateProfile({
        id: user.id,
        ...updates,
      });

      if (updatedProfile) {
        setProfile(updatedProfile);
        logger.info('Profile updated successfully', { userId: user.id });
      } else {
        setError('Failed to update profile. Please try again.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setError(errorMessage);
      logger.error('Error updating profile', {
        error: errorMessage,
        userId: user.id,
      });
      throw error;
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

  if (authLoading || isLoading) {
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

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-textPrimary mb-8">Edit Profile</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {profile && (
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
        )}
      </div>
    </Layout>
  );
}