import React, { Suspense, useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAuthStore } from '@paynless/store'
import type { UserProfileUpdate } from '@paynless/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

// Props are removed as component now relies on the store
// interface ProfileEditorProps {
//   profile: UserProfile | null;
//   onSave: (updatedProfile: UserProfileUpdate) => void;
//   isSaving: boolean;
// }

// Renamed the component that handles Profile (First/Last Name)
function ProfileNameEditor() {
  const {
    profile,
    isLoading, // Use store's loading state
    error, // Use store's error state
    updateProfile, // Use store's update action
  } = useAuthStore((state) => ({
    profile: state.profile,
    isLoading: state.isLoading,
    error: state.error,
    updateProfile: state.updateProfile,
  }))

  // Local state for form inputs
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Effect to initialize form state when profile loads from store
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '')
      setLastName(profile.last_name || '')
    }
  }, [profile]) // Only depends on profile now

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return // Prevent submit while already saving

    let profileUpdateError = false

    // --- Update Profile (First/Last Name) ---
    // Only update if names have changed
    if (firstName !== profile?.first_name || lastName !== profile?.last_name) {
      const profileUpdateData: UserProfileUpdate = {
        first_name: firstName,
        last_name: lastName,
      }
      const profileResult = await updateProfile(profileUpdateData)
      if (!profileResult) {
        profileUpdateError = true
        // Error is already set in the store by updateProfile
      }
    }

    // Optionally: Add success message logic here if needed,
    // checking if profileUpdateError is false

    // isLoading and error states are handled by observing the store
  }

  // Removed user check as it's not needed for name editing
  if (!profile) {
    // Handle case where profile is still null after initial load attempt
    return (
      <div className="text-center text-textSecondary">
        Profile data not available.
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg p-8 bg-surface rounded-lg shadow-md mx-auto mb-8">
      {' '}
      {/* Added margin bottom */}
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">
        Edit Name
      </h2>
      {/* Shared error display logic - might need refinement if granular errors are desired */}
      {error && (
        <div
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700"
          data-testid="profile-error-message"
        >
          <AlertCircle size={18} />
          <span>{error.message}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* First Name Input */}
        <div className="mb-4">
          <Label
            htmlFor="firstName"
            className="block text-sm font-medium text-textSecondary mb-1"
          >
            First Name
          </Label>
          <Input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="block w-full"
            placeholder="Enter first name"
            disabled={isLoading} // Disable based on store state
          />
        </div>

        {/* Last Name Input */}
        <div className="mb-6">
          <Label
            htmlFor="lastName"
            className="block text-sm font-medium text-textSecondary mb-1"
          >
            Last Name
          </Label>
          <Input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="block w-full"
            placeholder="Enter last name"
            disabled={isLoading} // Disable based on store state
          />
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={
            isLoading ||
            (firstName === profile?.first_name &&
              lastName === profile?.last_name)
          } // Also disable if no changes
          className={`w-full flex justify-center py-2 px-4 text-sm font-medium ${
            isLoading ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Saving...' : 'Save Name Changes'}
        </Button>
      </form>
    </div>
  )
}

// --- New Component for Email Editing ---
function EmailEditor() {
  const {
    user, // Get user object for email
    isLoading, // Use store's loading state
    error, // Use store's error state
    updateEmail, // Use store's update action
    refreshSession,
  } = useAuthStore((state) => ({
    user: state.user, // Add user to selector
    isLoading: state.isLoading,
    error: state.error,
    updateEmail: state.updateEmail, // <-- Add the new action
    refreshSession: state.refreshSession,
  }))

  // Local state for form inputs
  const [email, setEmail] = useState('')

  // Effect to initialize form state when user loads from store
  useEffect(() => {
    // Initialize email from user object
    if (user) {
      setEmail(user.email || '')
    }
  }, [user]) // Add user to dependency array

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading || email === user?.email) return // Prevent submit while already saving or if no change

    // --- Update Email ---

    await updateEmail(email)

    refreshSession()
  }

  if (!user) {
    // Handle case where user is still null
    return (
      <div className="text-center text-textSecondary">
        User data not available for email editing.
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg p-8 bg-surface rounded-lg shadow-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">
        Edit Email
      </h2>
      {/* Shared error display logic - might need refinement */}
      {error && (
        <div
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700"
          data-testid="email-error-message" // Changed test id
        >
          <AlertCircle size={18} />
          <span>{error.message}</span>
        </div>
      )}
      <form onSubmit={handleEmailSubmit} className="space-y-6">
        {/* Email Input */}
        <div className="mb-6">
          <Label
            htmlFor="email"
            className="block text-sm font-medium text-textSecondary mb-1"
          >
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full"
            placeholder="Enter email"
            disabled={isLoading} // Disable based on store state
          />
          {/* Use user.email for comparison */}
          {email !== user?.email && (
            <p className="mt-2 text-sm text-yellow-600">
              Changing your email requires re-verification.
            </p>
          )}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isLoading || email === user?.email} // Also disable if no changes
          className={`w-full flex justify-center py-2 px-4 text-sm font-medium ${
            isLoading || email === user?.email
              ? 'opacity-75 cursor-not-allowed'
              : ''
          }`}
        >
          {isLoading ? 'Saving...' : 'Update Email'}
        </Button>
      </form>
    </div>
  )
}

// --- Main Export Component ---
// Renders both editors
export function ProfileEditor() {
  // Potentially add shared loading/error logic display here if needed
  // Or use the store's loading/error state directly in child components as done now.
  return (
    <>
      <ProfileNameEditor />
      <EmailEditor />
    </>
  )
}
