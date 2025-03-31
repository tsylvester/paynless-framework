import React from 'react';
import { PrivacyLevel } from '../../types/profile.types';

interface PhysicalAttributesProps {
  heightCm?: number;
  weightKg?: number;
  exerciseFrequency?: string;
  privacyLevel: PrivacyLevel;
  onHeightChange: (height: number | undefined) => void;
  onWeightChange: (weight: number | undefined) => void;
  onExerciseFrequencyChange: (frequency: string | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

const EXERCISE_FREQUENCIES = [
  'Never',
  'Rarely',
  '1-2 times per week',
  '3-4 times per week',
  '5+ times per week',
  'Every day',
];

export function PhysicalAttributes({
  heightCm,
  weightKg,
  exerciseFrequency,
  privacyLevel,
  onHeightChange,
  onWeightChange,
  onExerciseFrequencyChange,
  onPrivacyLevelChange,
}: PhysicalAttributesProps) {
  // Convert cm to feet and inches for display
  const heightToFeetInches = (cm?: number) => {
    if (!cm) return { feet: '', inches: '' };
    const inches = cm / 2.54;
    const feet = Math.floor(inches / 12);
    const remainingInches = Math.round(inches % 12);
    return { feet: feet.toString(), inches: remainingInches.toString() };
  };

  // Convert feet and inches to cm
  const feetInchesToCm = (feet: string, inches: string) => {
    const totalInches = (parseInt(feet) * 12) + parseInt(inches);
    return Math.round(totalInches * 2.54);
  };

  const { feet, inches } = heightToFeetInches(heightCm);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Height
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-textSecondary mb-1">
              Feet
            </label>
            <input
              type="number"
              min="0"
              max="8"
              value={feet}
              onChange={(e) => {
                const newFeet = e.target.value;
                if (newFeet && inches) {
                  onHeightChange(feetInchesToCm(newFeet, inches));
                }
              }}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">
              Inches
            </label>
            <input
              type="number"
              min="0"
              max="11"
              value={inches}
              onChange={(e) => {
                const newInches = e.target.value;
                if (feet && newInches) {
                  onHeightChange(feetInchesToCm(feet, newInches));
                }
              }}
              className="input w-full"
            />
          </div>
        </div>
        <div className="mt-2 text-sm text-textSecondary">
          {heightCm ? `${heightCm} cm` : ''}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Weight (kg)
        </label>
        <input
          type="number"
          min="0"
          max="300"
          value={weightKg || ''}
          onChange={(e) => onWeightChange(e.target.value ? parseInt(e.target.value) : undefined)}
          className="input w-full"
        />
        <div className="mt-2 text-sm text-textSecondary">
          {weightKg ? `${Math.round(weightKg * 2.20462)} lbs` : ''}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Exercise Frequency
        </label>
        <select
          value={exerciseFrequency || ''}
          onChange={(e) => onExerciseFrequencyChange(e.target.value || undefined)}
          className="input w-full"
        >
          <option value="">Select frequency</option>
          {EXERCISE_FREQUENCIES.map((freq) => (
            <option key={freq} value={freq}>{freq}</option>
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