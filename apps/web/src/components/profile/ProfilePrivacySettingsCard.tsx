'use client';

import React from 'react';
import { useAuthStore } from '@paynless/store';
import type { ProfilePrivacySetting } from '@paynless/types'; // UserProfile not directly needed here now
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertCircle } from 'lucide-react'; // For error icon
// Button might not be needed if Select triggers save on change directly
// import { Button } from "@/components/ui/button"; 

export const ProfilePrivacySettingsCard: React.FC = () => {
  const profile = useAuthStore((state) => state.profile);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  // For more granular control, you might have specific isLoading/error states in authStore
  // e.g., isProfileUpdating, profileUpdateError
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);

  const currentSetting = profile?.profile_privacy_setting;

  const handleSettingChange = (newSetting: ProfilePrivacySetting) => {
    if (newSetting && newSetting !== currentSetting) {
      console.log('[ProfilePrivacySettingsCard] Attempting to update privacy setting to:', newSetting);
      updateProfile({ profile_privacy_setting: newSetting })
        .then(() => {
          console.log('[ProfilePrivacySettingsCard] Privacy setting update successful.');
        })
        .catch((err) => {
          console.error('[ProfilePrivacySettingsCard] Privacy setting update failed:', err);
          // Error is already set in authStore by updateProfile, so UI will react
        });
    }
  };

  if (!profile && !isLoading && !error) { // Initial loading state before profile is fetched
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-textPrimary">Profile Privacy</CardTitle>
          <CardDescription>Adjust who can see your profile information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6 text-center">
            <p className="text-muted-foreground">Loading profile settings...</p>
        </CardContent>
      </Card>
    );
  }
  // If profile is null but it IS loading or IS an error, the main card will handle it.

  const privacyOptions: { value: ProfilePrivacySetting; label: string; description: string }[] = [
    {
      value: 'private',
      label: 'Private',
      description: 'Only you and members of organizations you share can see your profile details.'
    },
    {
      value: 'public',
      label: 'Public',
      description: 'Anyone can see your basic profile details (name, avatar).'
    },
    // {
    //   value: 'members_only',
    //   label: 'Members Only',
    //   description: 'Only members of organizations you belong to can see your profile details.'
    // },
  ];

  // Find the current option to display its description in the trigger
  const selectedOptionDetails = privacyOptions.find(opt => opt.value === (currentSetting || 'private'));

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-textPrimary">Profile Privacy</CardTitle>
        <CardDescription>Adjust who can see your profile information.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <Label htmlFor="profile-privacy-select" className="font-semibold text-textSecondary">Privacy Setting</Label>
          <Select 
            value={currentSetting || 'private'} 
            onValueChange={(value) => handleSettingChange(value as ProfilePrivacySetting)}
            disabled={isLoading || !profile} // Also disable if profile somehow still null here
            name="profile-privacy-select"
            id="profile-privacy-select"
          >
            <SelectTrigger className="w-full text-left" data-testid="privacy-select-trigger">
              {/* Display current selection's label and description in the trigger */}
              {selectedOptionDetails ? (
                <div className="flex flex-col">
                  <span className="font-medium">{selectedOptionDetails.label}</span>
                  <span className="text-xs text-muted-foreground">{selectedOptionDetails.description}</span>
                </div>
              ) : (
                <SelectValue placeholder="Select your profile privacy" />
              )}
            </SelectTrigger>
            <SelectContent className="bg-popover/80 backdrop-blur-md" data-testid="select-content-wrapper">
              {privacyOptions.map(option => (
                <SelectItem 
                  key={option.value} 
                  value={option.value} 
                  className="cursor-pointer" 
                  data-testid={`privacy-option-${option.value}`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground pt-1">
            This setting controls who can view your profile details like name and activity.
          </p>
        </div>
      </CardContent>
      {(isLoading || error) && (
        <CardFooter className={`border-t pt-4 mt-6 ${error ? 'bg-destructive/10 border-destructive/30' : ''}`}>
          {isLoading && !error && <p data-testid="loading-indicator" className="text-sm text-muted-foreground animate-pulse w-full text-center">Saving settings...</p>}
          {error && (
            <div data-testid="error-message" className="w-full flex items-center gap-2 text-destructive p-3 rounded-md bg-destructive/10">
              <AlertCircle size={18} />
              <span>Error updating settings: {error.message}</span>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}; 