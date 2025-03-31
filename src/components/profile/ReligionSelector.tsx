import React from 'react';
import { ReligionType } from '../../types/dating.types';
import { PrivacyLevel } from '../../types/profile.types';

interface ReligionSelectorProps {
  religion?: ReligionType;
  privacyLevel: PrivacyLevel;
  onReligionChange: (religion: ReligionType | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function ReligionSelector({
  religion,
  privacyLevel,
  onReligionChange,
  onPrivacyLevelChange,
}: ReligionSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Religion
        </label>
        <select
          value={religion || ''}
          onChange={(e) => onReligionChange(e.target.value as ReligionType || undefined)}
          className="input w-full"
        >
          <option value="">Select religion</option>
          {Object.values(ReligionType).map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
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