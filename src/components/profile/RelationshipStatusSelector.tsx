import React from 'react';
import { RelationshipStatus, PrivacyLevel } from '../../types/profile.types';

interface RelationshipStatusSelectorProps {
  status?: RelationshipStatus;
  privacyLevel: PrivacyLevel;
  onStatusChange: (status: RelationshipStatus | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function RelationshipStatusSelector({
  status,
  privacyLevel,
  onStatusChange,
  onPrivacyLevelChange,
}: RelationshipStatusSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Relationship Status
        </label>
        <select
          value={status || ''}
          onChange={(e) => onStatusChange(e.target.value as RelationshipStatus || undefined)}
          className="input w-full"
        >
          <option value="">Select status</option>
          <option value={RelationshipStatus.INTERESTED}>Interested</option>
          <option value={RelationshipStatus.IN_RELATIONSHIP}>In a relationship</option>
          <option value={RelationshipStatus.NOT_INTERESTED}>Not interested</option>
          <option value={RelationshipStatus.ENM_POLY}>Ethical non-monogamy or poly</option>
          <option value={RelationshipStatus.PREFER_NOT_TO_SAY}>Prefer not to say</option>
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