import React from 'react';
import { GenderType, PrivacyLevel } from '../../types/profile.types';

interface GenderSelectorProps {
  gender?: GenderType;
  pronouns?: string[];
  privacyLevel: PrivacyLevel;
  onGenderChange: (gender: GenderType | undefined) => void;
  onPronounsChange: (pronouns: string[]) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function GenderSelector({
  gender,
  pronouns = [],
  privacyLevel,
  onGenderChange,
  onPronounsChange,
  onPrivacyLevelChange,
}: GenderSelectorProps) {
  const commonPronouns = [
    ['he', 'him', 'his'],
    ['she', 'her', 'hers'],
    ['they', 'them', 'theirs'],
    ['ze', 'hir', 'hirs'],
    ['xe', 'xem', 'xyrs'],
  ];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Gender
        </label>
        <select
          value={gender || ''}
          onChange={(e) => onGenderChange(e.target.value as GenderType || undefined)}
          className="input w-full"
        >
          <option value="">Select gender</option>
          <option value={GenderType.MALE}>Male</option>
          <option value={GenderType.FEMALE}>Female</option>
          <option value={GenderType.NON_BINARY}>Non-binary</option>
          <option value={GenderType.TRANSMASCULINE}>Transmasculine</option>
          <option value={GenderType.TRANSFEMININE}>Transfeminine</option>
          <option value={GenderType.OTHER}>Other</option>
          <option value={GenderType.PREFER_NOT_TO_SAY}>Prefer not to say</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Pronouns
        </label>
        <div className="space-y-2">
          {commonPronouns.map((set, index) => (
            <label key={index} className="flex items-center">
              <input
                type="checkbox"
                checked={pronouns.includes(set.join('/'))}
                onChange={(e) => {
                  const value = set.join('/');
                  if (e.target.checked) {
                    onPronounsChange([...pronouns, value]);
                  } else {
                    onPronounsChange(pronouns.filter(p => p !== value));
                  }
                }}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="ml-2 text-sm text-textPrimary">
                {set.join('/')}
              </span>
            </label>
          ))}
          
          <div className="mt-3">
            <input
              type="text"
              placeholder="Add custom pronouns (comma-separated)"
              value={pronouns.filter(p => !commonPronouns.map(set => set.join('/')).includes(p)).join(', ')}
              onChange={(e) => {
                const customPronouns = e.target.value
                  .split(',')
                  .map(p => p.trim())
                  .filter(Boolean);
                const standardPronouns = pronouns.filter(p => 
                  commonPronouns.map(set => set.join('/')).includes(p)
                );
                onPronounsChange([...standardPronouns, ...customPronouns]);
              }}
              className="input w-full"
            />
          </div>
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