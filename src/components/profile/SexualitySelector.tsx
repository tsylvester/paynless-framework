import React from 'react';
import { SexualityType, PrivacyLevel } from '../../types/profile.types';

interface SexualitySelectorProps {
  sexuality?: SexualityType;
  privacyLevel: PrivacyLevel;
  onSexualityChange: (sexuality: SexualityType | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function SexualitySelector({
  sexuality,
  privacyLevel,
  onSexualityChange,
  onPrivacyLevelChange,
}: SexualitySelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Sexuality
        </label>
        <select
          value={sexuality || ''}
          onChange={(e) => onSexualityChange(e.target.value as SexualityType || undefined)}
          className="input w-full"
        >
          <option value="">Select sexuality</option>
          <option value={SexualityType.STRAIGHT}>Straight</option>
          <option value={SexualityType.GAY}>Gay</option>
          <option value={SexualityType.LESBIAN}>Lesbian</option>
          <option value={SexualityType.BISEXUAL}>Bisexual</option>
          <option value={SexualityType.PANSEXUAL}>Pansexual</option>
          <option value={SexualityType.ASEXUAL}>Asexual</option>
          <option value={SexualityType.QUEER}>Queer</option>
          <option value={SexualityType.OTHER}>Other</option>
          <option value={SexualityType.PREFER_NOT_TO_SAY}>Prefer not to say</option>
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