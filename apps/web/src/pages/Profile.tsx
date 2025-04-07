import { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { logger } from '@paynless/utils';
import { UserProfileUpdate, UserProfile } from '@paynless/types';
import { useAuthStore } from '@paynless/store';
import { ProfileEditor } from '../components/profile/ProfileEditor';

export function ProfilePage() {
  const {
    profile: currentProfile, 
    isLoading: authLoading, 
    error: authError, 
    updateProfile
  } = useAuthStore(state => ({
    profile: state.profile,
    isLoading: state.isLoading,
    error: state.error,
    updateProfile: state.updateProfile
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSave = async (updates: Partial<UserProfile>) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    logger.info('Updating profile via ProfileEditor with data:', updates);

    try {
      const profileData: UserProfileUpdate = {
        first_name: updates.first_name,
        last_name: updates.last_name,
      };
      const success = await updateProfile(profileData);

      if (success) {
        setSubmitSuccess(true);
        logger.info('Profile update successful via ProfileEditor and store action');
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        const errorMsg = authError?.message || 'Failed to update profile.';
        setSubmitError(errorMsg);
        logger.error('Profile update failed via ProfileEditor and store action', { storeError: authError });
      }
    } catch (e) {
      logger.error('Unexpected error during profile update submission via ProfileEditor', { error: e });
      setSubmitError('An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading && !currentProfile) {
    return <Layout><div className="flex justify-center items-center h-64"><p>Loading profile...</p></div></Layout>;
  }

  if (!currentProfile) {
    return <Layout><div className="text-center p-4 text-red-600">Could not load profile data. {authError?.message}</div></Layout>;
  }

  return (
    <Layout>
      <ProfileEditor 
        profile={currentProfile} 
        onSave={handleSave} 
        isSaving={isSubmitting}
      />
      <div className="max-w-lg mx-auto mt-4">
        {submitSuccess && <div className="p-3 bg-green-100 border border-green-300 text-green-800 rounded-md text-center">Profile updated successfully!</div>}
        {submitError && <div className="p-3 bg-red-100 border border-red-300 text-red-800 rounded-md text-center">Error: {submitError}</div>}
      </div>
    </Layout>
  );
}