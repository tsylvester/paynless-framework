import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { PrivacyLevel } from '../../types/profile.types';

interface BirthdaySettingsProps {
  birthDate?: string;
  birthTime?: string;
  showAge: boolean;
  showBirthday: 'full' | 'month-year' | 'year' | 'none';
  enableNotifications: boolean;
  privacyLevel: PrivacyLevel;
  onBirthDateChange: (date: string | undefined) => void;
  onBirthTimeChange: (time: string | undefined) => void;
  onShowAgeChange: (show: boolean) => void;
  onShowBirthdayChange: (show: 'full' | 'month-year' | 'year' | 'none') => void;
  onEnableNotificationsChange: (enable: boolean) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function BirthdaySettings({
  birthDate,
  birthTime,
  showAge,
  showBirthday,
  enableNotifications,
  privacyLevel,
  onBirthDateChange,
  onBirthTimeChange,
  onShowAgeChange,
  onShowBirthdayChange,
  onEnableNotificationsChange,
  onPrivacyLevelChange,
}: BirthdaySettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Birth Date
        </label>
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar className="h-5 w-5 text-textSecondary" />
            </div>
            <input
              type="date"
              value={birthDate || ''}
              onChange={(e) => onBirthDateChange(e.target.value || undefined)}
              className="input pl-10 w-full"
            />
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Clock className="h-5 w-5 text-textSecondary" />
            </div>
            <input
              type="time"
              value={birthTime || ''}
              onChange={(e) => onBirthTimeChange(e.target.value || undefined)}
              className="input pl-10 w-full"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-textPrimary mb-2">
            Display Options
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showAge}
                onChange={(e) => onShowAgeChange(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="ml-2 text-sm text-textPrimary">Show my age</span>
            </label>
            
            <div className="mt-3">
              <select
                value={showBirthday}
                onChange={(e) => onShowBirthdayChange(e.target.value as any)}
                className="input w-full"
              >
                <option value="none">Don't show birthday</option>
                <option value="full">Show full date of birth</option>
                <option value="month-year">Show month and year</option>
                <option value="year">Show year only</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={enableNotifications}
              onChange={(e) => onEnableNotificationsChange(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm text-textPrimary">
              Enable birthday notifications for followers
            </span>
          </label>
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
    </div>
  );
}
