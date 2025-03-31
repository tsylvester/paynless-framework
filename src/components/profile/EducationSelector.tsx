import React from 'react';
import { EducationLevel } from '../../types/dating.types';
import { PrivacyLevel } from '../../types/profile.types';

interface EducationSelectorProps {
  education?: EducationLevel;
  school?: string;
  occupation?: string;
  company?: string;
  privacyLevel: PrivacyLevel;
  onEducationChange: (education: EducationLevel | undefined) => void;
  onSchoolChange: (school: string | undefined) => void;
  onOccupationChange: (occupation: string | undefined) => void;
  onCompanyChange: (company: string | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function EducationSelector({
  education,
  school,
  occupation,
  company,
  privacyLevel,
  onEducationChange,
  onSchoolChange,
  onOccupationChange,
  onCompanyChange,
  onPrivacyLevelChange,
}: EducationSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Education Level
        </label>
        <select
          value={education || ''}
          onChange={(e) => onEducationChange(e.target.value as EducationLevel || undefined)}
          className="input w-full"
        >
          <option value="">Select education level</option>
          {Object.values(EducationLevel).map((level) => (
            <option key={level} value={level}>
              {level.charAt(0).toUpperCase() + level.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          School/University
        </label>
        <input
          type="text"
          value={school || ''}
          onChange={(e) => onSchoolChange(e.target.value || undefined)}
          placeholder="Enter school or university name"
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Occupation
        </label>
        <input
          type="text"
          value={occupation || ''}
          onChange={(e) => onOccupationChange(e.target.value || undefined)}
          placeholder="Enter your occupation"
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Company
        </label>
        <input
          type="text"
          value={company || ''}
          onChange={(e) => onCompanyChange(e.target.value || undefined)}
          placeholder="Enter company name"
          className="input w-full"
        />
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