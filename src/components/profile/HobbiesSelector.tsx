import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PrivacyLevel } from '../../types/profile.types';

interface HobbiesSelectorProps {
  interests: string[];
  privacyLevel: PrivacyLevel;
  onInterestsChange: (interests: string[]) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

const COMMON_HOBBIES = [
  'Reading',
  'Writing',
  'Photography',
  'Cooking',
  'Baking',
  'Hiking',
  'Camping',
  'Traveling',
  'Gaming',
  'Music',
  'Art',
  'Dancing',
  'Yoga',
  'Meditation',
  'Running',
  'Cycling',
  'Swimming',
  'Gym',
  'Sports',
  'Movies',
  'TV Shows',
  'Theatre',
  'Concerts',
  'Museums',
  'Gardening',
  'DIY',
  'Crafts',
  'Technology',
  'Programming',
  'Languages',
  'Volunteering',
  'Politics',
  'Science',
  'History',
  'Philosophy',
  'Animals',
  'Nature',
  'Fashion',
  'Beauty',
  'Food',
  'Wine',
  'Beer',
  'Coffee',
  'Tea',
];

export function HobbiesSelector({
  interests,
  privacyLevel,
  onInterestsChange,
  onPrivacyLevelChange,
}: HobbiesSelectorProps) {
  const [newHobby, setNewHobby] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleAddHobby = (hobby: string) => {
    if (hobby && !interests.includes(hobby)) {
      onInterestsChange([...interests, hobby]);
    }
    setNewHobby('');
    setShowSuggestions(false);
  };

  const handleRemoveHobby = (hobby: string) => {
    onInterestsChange(interests.filter(h => h !== hobby));
  };

  const filteredSuggestions = COMMON_HOBBIES.filter(
    hobby => !interests.includes(hobby) &&
    hobby.toLowerCase().includes(newHobby.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Hobbies & Interests
        </label>
        
        <div className="relative">
          <div className="flex space-x-2">
            <input
              type="text"
              value={newHobby}
              onChange={(e) => {
                setNewHobby(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Add a hobby or interest"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={() => handleAddHobby(newHobby)}
              disabled={!newHobby}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {showSuggestions && newHobby && (
            <div className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-md shadow-lg max-h-60 overflow-auto">
              {filteredSuggestions.map((hobby) => (
                <button
                  key={hobby}
                  type="button"
                  onClick={() => handleAddHobby(hobby)}
                  className="w-full text-left px-4 py-2 hover:bg-primary/10 text-sm"
                >
                  {hobby}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {interests.map((hobby) => (
            <span
              key={hobby}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary/10 text-primary"
            >
              {hobby}
              <button
                type="button"
                onClick={() => handleRemoveHobby(hobby)}
                className="ml-2 text-primary hover:text-primary/80"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Privacy Level
        </label>
        <select
          value={privacyLevel}
          onChange={(e) => onPrivacyLevelChange(e.target.value as PrivacyLevel)}
          className="input w-full"
        >
          <option value={PrivacyLevel.PUBLIC}>Public</option>
          <option value={PrivacyLevel.FOLLOWERS}>Followers Only</option>
          <option value={PrivacyLevel.PRIVATE}>Private</option>
        </select>
      </div>
    </div>
  );
}