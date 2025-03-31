import React from 'react';
import { SubstanceUse } from '../../types/dating.types';
import { PrivacyLevel } from '../../types/profile.types';

interface SubstanceUseSelectorProps {
  tobaccoUse?: SubstanceUse;
  drinking?: SubstanceUse;
  cannabisUse?: SubstanceUse;
  otherDrugs?: SubstanceUse;
  privacyLevel: PrivacyLevel;
  onTobaccoUseChange: (use: SubstanceUse | undefined) => void;
  onDrinkingChange: (use: SubstanceUse | undefined) => void;
  onCannabisUseChange: (use: SubstanceUse | undefined) => void;
  onOtherDrugsChange: (use: SubstanceUse | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function SubstanceUseSelector({
  tobaccoUse,
  drinking,
  cannabisUse,
  otherDrugs,
  privacyLevel,
  onTobaccoUseChange,
  onDrinkingChange,
  onCannabisUseChange,
  onOtherDrugsChange,
  onPrivacyLevelChange,
}: SubstanceUseSelectorProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Tobacco Use
        </label>
        <select
          value={tobaccoUse || ''}
          onChange={(e) => onTobaccoUseChange(e.target.value as SubstanceUse || undefined)}
          className="input w-full"
        >
          <option value="">Select frequency</option>
          {Object.values(SubstanceUse).map((use) => (
            <option key={use} value={use}>
              {use.charAt(0).toUpperCase() + use.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Drinking
        </label>
        <select
          value={drinking || ''}
          onChange={(e) => onDrinkingChange(e.target.value as SubstanceUse || undefined)}
          className="input w-full"
        >
          <option value="">Select frequency</option>
          {Object.values(SubstanceUse).map((use) => (
            <option key={use} value={use}>
              {use.charAt(0).toUpperCase() + use.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Cannabis Use
        </label>
        <select
          value={cannabisUse || ''}
          onChange={(e) => onCannabisUseChange(e.target.value as SubstanceUse || undefined)}
          className="input w-full"
        >
          <option value="">Select frequency</option>
          {Object.values(SubstanceUse).map((use) => (
            <option key={use} value={use}>
              {use.charAt(0).toUpperCase() + use.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Other Substances
        </label>
        <select
          value={otherDrugs || ''}
          onChange={(e) => onOtherDrugsChange(e.target.value as SubstanceUse || undefined)}
          className="input w-full"
        >
          <option value="">Select frequency</option>
          {Object.values(SubstanceUse).map((use) => (
            <option key={use} value={use}>
              {use.charAt(0).toUpperCase() + use.slice(1).replace('_', ' ')}
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