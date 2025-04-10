import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '@paynless/store';
import type { UserProfileUpdate } from '@paynless/types';

// Props are removed as component now relies on the store
// interface ProfileEditorProps {
//   profile: UserProfile | null;
//   onSave: (updatedProfile: UserProfileUpdate) => void;
//   isSaving: boolean;
// }

export function ProfileEditor(/* Props removed */) {
  const {
    profile,
    isLoading, // Use store's loading state
    error,     // Use store's error state
    updateProfile // Use store's update action
  } = useAuthStore(state => ({
    profile: state.profile,
    isLoading: state.isLoading,
    error: state.error,
    updateProfile: state.updateProfile
  }));

  // Local state for form inputs
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Effect to initialize form state when profile loads from store
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
    }
  }, [profile]); // Dependency array ensures this runs when profile changes

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return; // Prevent submit while already saving

    const updatedProfileData: UserProfileUpdate = {
      first_name: firstName,
      last_name: lastName,
    };
    
    // Call the store action to update the profile
    await updateProfile(updatedProfileData);
    // Success/error feedback is handled by observing store's isLoading/error states
  };

  if (!profile) {
    // Handle case where profile is still null after initial load attempt
    return <div className="text-center text-textSecondary">Profile data not available.</div>;
  }

  return (
    <div className="w-full max-w-lg p-8 bg-surface rounded-lg shadow-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">Edit Profile</h2>

      {/* Display error from the store */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700" data-testid="profile-error-message">
          <AlertCircle size={18} />
          <span>{error.message}</span>
        </div>
      )}

      {/* TODO: Add success message display (e.g., using local state timed out) */}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* First Name Input */}
        <div className="mb-4">
          <label htmlFor="firstName" className="block text-sm font-medium text-textSecondary mb-1">
            First Name
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="block w-full pr-3 py-2 border border-border rounded-md shadow-sm bg-background text-textPrimary focus:outline-none focus:ring-primary focus:border-primary disabled:opacity-75"
            placeholder="Enter first name"
            disabled={isLoading} // Disable based on store state
          />
        </div>

        {/* Last Name Input */}
        <div className="mb-6">
           <label htmlFor="lastName" className="block text-sm font-medium text-textSecondary mb-1">
            Last Name
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="block w-full pr-3 py-2 border border-border rounded-md shadow-sm bg-background text-textPrimary focus:outline-none focus:ring-primary focus:border-primary disabled:opacity-75"
            placeholder="Enter last name"
            disabled={isLoading} // Disable based on store state
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading} // Disable based on store state
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
            isLoading ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}