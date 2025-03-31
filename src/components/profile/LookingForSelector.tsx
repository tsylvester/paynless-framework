import React from 'react';
import { LookingFor } from '../../types/dating.types';
import { PrivacyLevel } from '../../types/profile.types';

interface LookingForSelectorProps {
  lookingFor?: LookingFor;
  privacyLevel: PrivacyLevel;
  onLookingForChange: (looking: LookingFor | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function LookingForSelector({
  lookingFor,
  privacyLevel,
  onLookingForChange,
  onPrivacyLevelChange,
}: LookingForSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Looking For
        </label>
        <div className="space-y-2">
          {Object.values(LookingFor).map((type) => (
            <label key={type} className="flex items-center">
              <input
                type="radio"
                checked={lookingFor === type}
                onChange={() => onLookingForChange(type)}
                className="rounded-full border-border text-primary focus:ring-primary"
              />
              <span className="ml-2 text-sm text-textPrimary">
                {type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')}
              </span>
            </label>
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