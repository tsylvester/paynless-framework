import React from 'react';
import { PoliticalView } from '../../types/dating.types';
import { PrivacyLevel } from '../../types/profile.types';

interface PoliticalViewSelectorProps {
  politicalView?: PoliticalView;
  privacyLevel: PrivacyLevel;
  onPoliticalViewChange: (view: PoliticalView | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function PoliticalViewSelector({
  politicalView,
  privacyLevel,
  onPoliticalViewChange,
  onPrivacyLevelChange,
}: PoliticalViewSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Political Views
        </label>
        <select
          value={politicalView || ''}
          onChange={(e) => onPoliticalViewChange(e.target.value as PoliticalView || undefined)}
          className="input w-full"
        >
          <option value="">Select political view</option>
          {Object.values(PoliticalView).map((view) => (
            <option key={view} value={view}>
              {view.charAt(0).toUpperCase() + view.slice(1).replace('_', ' ')}
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