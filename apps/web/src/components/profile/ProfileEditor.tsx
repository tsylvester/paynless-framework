import React, { useState } from 'react';
import { 
  UserProfile, 
} from '@paynless/types';

interface ProfileEditorProps {
  profile: UserProfile;
  onSave: (updates: Partial<UserProfile>) => Promise<void>;
  isSaving: boolean;
}

export function ProfileEditor({ 
  profile, 
  onSave,
  isSaving,
}: ProfileEditorProps) {
  // Basic info state
  const [first_name, setfirst_name] = useState(profile.first_name || '');
  const [last_name, setlast_name] = useState(profile.last_name || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    try {
      const updates: Partial<UserProfile> = {
        first_name,
        last_name,
      };

      await onSave(updates);
    } catch (error) {
      console.error('Error saving profile:', error);
    }
  };

  return (
    <div className="w-full max-w-lg p-8 bg-surface rounded-lg shadow-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center text-textPrimary">Edit Profile</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="mb-4">
          <label htmlFor="firstName" className="block text-sm font-medium text-textSecondary mb-1">
            First Name
          </label>
          <input
            id="firstName"
            type="text"
            value={first_name}
            onChange={(e) => setfirst_name(e.target.value)}
            className="block w-full pr-3 py-2 border border-border rounded-md shadow-sm bg-background text-textPrimary focus:outline-none focus:ring-primary focus:border-primary"
            placeholder="Enter first name"
            disabled={isSaving}
          />
        </div>
        
        <div className="mb-6">
           <label htmlFor="lastName" className="block text-sm font-medium text-textSecondary mb-1">
            Last Name
          </label>
          <input
            id="lastName"
            type="text"
            value={last_name}
            onChange={(e) => setlast_name(e.target.value)}
            className="block w-full pr-3 py-2 border border-border rounded-md shadow-sm bg-background text-textPrimary focus:outline-none focus:ring-primary focus:border-primary"
            placeholder="Enter last name"
            disabled={isSaving}
          />
        </div>
        
        <button
          type="submit"
          disabled={isSaving}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
            isSaving ? 'opacity-75 cursor-not-allowed' : ''
          }`}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}