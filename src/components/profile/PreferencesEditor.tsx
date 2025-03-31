import React, { useState, useEffect } from 'react';
import { UserPreferences } from '../../types/dating.types';
import { GenderType, SexualityType, RelationshipStatus } from '../../types/profile.types';
import { useAuth } from '../../hooks/useAuth';

interface PreferencesEditorProps {
  preferences: UserPreferences;
  onSave: (updates: Partial<UserPreferences>) => Promise<void>;
}

const DISTANCE_OPTIONS = [
  { value: 1, label: '1 mile' },
  { value: 5, label: '5 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
  { value: -1, label: 'Anywhere' },
];

export function PreferencesEditor({ preferences, onSave }: PreferencesEditorProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate default age range based on user's age
  const calculateDefaultAgeRange = () => {
    if (!user?.birthDate) return [18, 99];
    const userAge = new Date().getFullYear() - new Date(user.birthDate).getFullYear();
    const minAge = Math.max(18, Math.floor(userAge / 2) + 7);
    const maxAge = Math.min(99, userAge + 3);
    return [minAge, maxAge];
  };

  // State for all preferences
  const [ageRange, setAgeRange] = useState<[number, number]>([
    preferences.ageMin || calculateDefaultAgeRange()[0],
    preferences.ageMax || calculateDefaultAgeRange()[1],
  ]);

  const [distanceMax, setDistanceMax] = useState(preferences.distanceMax || 50);
  const [heightRange, setHeightRange] = useState<[number, number]>([
    preferences.heightMinCm || 140,
    preferences.heightMaxCm || 220,
  ]);

  const [genderPreferences, setGenderPreferences] = useState<GenderType[]>(
    preferences.genderPreferences || []
  );

  const [sexualityPreferences, setSexualityPreferences] = useState<SexualityType[]>(
    preferences.sexualityPreferences || []
  );

  const [relationshipPreferences, setRelationshipPreferences] = useState<RelationshipStatus[]>(
    preferences.relationshipPreferences || []
  );

  // Update default age range when user's birth date changes
  useEffect(() => {
    if (!preferences.ageMin || !preferences.ageMax) {
      setAgeRange(calculateDefaultAgeRange());
    }
  }, [user?.birthDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSave({
        ageMin: ageRange[0],
        ageMax: ageRange[1],
        distanceMax: distanceMax === -1 ? null : distanceMax,
        heightMinCm: heightRange[0],
        heightMaxCm: heightRange[1],
        genderPreferences,
        sexualityPreferences,
        relationshipPreferences,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenderToggle = (gender: GenderType) => {
    setGenderPreferences(prev => 
      prev.includes(gender)
        ? prev.filter(g => g !== gender)
        : [...prev, gender]
    );
  };

  const handleSexualityToggle = (sexuality: SexualityType) => {
    setSexualityPreferences(prev => 
      prev.includes(sexuality)
        ? prev.filter(s => s !== sexuality)
        : [...prev, sexuality]
    );
  };

  const handleRelationshipToggle = (status: RelationshipStatus) => {
    setRelationshipPreferences(prev => 
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Age Range */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-textPrimary">Age Range</h3>
        <div className="flex items-center space-x-4">
          <input
            type="number"
            min="18"
            max="99"
            value={ageRange[0]}
            onChange={(e) => setAgeRange([parseInt(e.target.value), ageRange[1]])}
            className="input w-24"
          />
          <span className="text-textSecondary">to</span>
          <input
            type="number"
            min="18"
            max="99"
            value={ageRange[1]}
            onChange={(e) => setAgeRange([ageRange[0], parseInt(e.target.value)])}
            className="input w-24"
          />
          <span className="text-textSecondary">years</span>
        </div>
      </div>

      {/* Distance */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-textPrimary">Maximum Distance</h3>
        <select
          value={distanceMax}
          onChange={(e) => setDistanceMax(parseInt(e.target.value))}
          className="input w-full"
        >
          {DISTANCE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Height Range */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-textPrimary">Height Range</h3>
        <div className="flex items-center space-x-4">
          <input
            type="number"
            min="140"
            max="220"
            value={heightRange[0]}
            onChange={(e) => setHeightRange([parseInt(e.target.value), heightRange[1]])}
            className="input w-24"
          />
          <span className="text-textSecondary">to</span>
          <input
            type="number"
            min="140"
            max="220"
            value={heightRange[1]}
            onChange={(e) => setHeightRange([heightRange[0], parseInt(e.target.value)])}
            className="input w-24"
          />
          <span className="text-textSecondary">cm</span>
        </div>
      </div>

      {/* Gender Preferences */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-textPrimary">Gender Preferences</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={genderPreferences.length === 0}
              onChange={() => setGenderPreferences([])}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm text-textPrimary">Any gender</span>
          </label>
          {Object.values(GenderType).map((gender) => (
            <label key={gender} className="flex items-center">
              <input
                type="checkbox"
                checked={genderPreferences.includes(gender)}
                onChange={() => handleGenderToggle(gender)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="ml-2 text-sm text-textPrimary">
                {gender.charAt(0).toUpperCase() + gender.slice(1).replace('_', ' ')}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Sexuality Preferences */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-textPrimary">Sexuality Preferences</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={sexualityPreferences.length === 0}
              onChange={() => setSexualityPreferences([])}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm text-textPrimary">Any sexuality</span>
          </label>
          {Object.values(SexualityType).map((sexuality) => (
            <label key={sexuality} className="flex items-center">
              <input
                type="checkbox"
                checked={sexualityPreferences.includes(sexuality)}
                onChange={() => handleSexualityToggle(sexuality)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="ml-2 text-sm text-textPrimary">
                {sexuality.charAt(0).toUpperCase() + sexuality.slice(1).replace('_', ' ')}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Relationship Status Preferences */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-textPrimary">Relationship Status Preferences</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={relationshipPreferences.length === 0}
              onChange={() => setRelationshipPreferences([])}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm text-textPrimary">Any relationship status</span>
          </label>
          {Object.values(RelationshipStatus).map((status) => (
            <label key={status} className="flex items-center">
              <input
                type="checkbox"
                checked={relationshipPreferences.includes(status)}
                onChange={() => handleRelationshipToggle(status)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="ml-2 text-sm text-textPrimary">
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`px-6 py-2 bg-primary text-white rounded-md ${
            isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-opacity-90'
          }`}
        >
          {isSubmitting ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  );
}