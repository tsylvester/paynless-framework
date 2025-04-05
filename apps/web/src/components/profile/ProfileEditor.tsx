import React, { useState } from 'react';
import { User } from 'lucide-react';
import { 
  UserProfile, 
} from '@paynless/types';

interface ProfileEditorProps {
  profile: UserProfile;
  onSave: (updates: Partial<UserProfile>) => Promise<void>;
  isSaving: boolean;
}

type TabType = 'basic' | 'details' | 'preferences';

// Define tabs data structure (replace with actual tabs if needed)
const tabs: { id: TabType, name: string }[] = [
  { id: 'basic', name: 'Basic Info' },
  // Add other tabs like 'details', 'preferences' here
];

export function ProfileEditor({ 
  profile, 
  onSave,
  isSaving,
}: ProfileEditorProps) {
  // Current tab state
  const [currentTab, setCurrentTab] = useState<TabType>('basic');

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
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              disabled={isSaving}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${currentTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
                ${isSaving ? "cursor-not-allowed opacity-70" : ""}
              `}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {currentTab === 'basic' && (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Basic Information</h3>
            
            <div className="flex items-center space-x-4">
              <div className="h-20 w-20 rounded-full bg-surface flex items-center justify-center">
                <User className="h-10 w-10 text-textSecondary" />
              </div>
              
              <div className="flex-1 grid grid-cols-2 gap-4">
                <input
                  type="text"
                  value={first_name}
                  onChange={(e) => setfirst_name(e.target.value)}
                  placeholder="First Name"
                  className="input"
                  disabled={isSaving}
                />
                <input
                  type="text"
                  value={last_name}
                  onChange={(e) => setlast_name(e.target.value)}
                  placeholder="Last Name"
                  className="input"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className={`btn btn-primary ${
                isSaving ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

    </div>
  );
}