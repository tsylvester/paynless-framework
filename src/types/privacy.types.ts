/**
 * Types for user privacy settings
 */

export enum ProfileVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  PRIVATE = 'private',
}

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  allowTagging: boolean;
  allowMessaging: {
    everyone: boolean;
    followers: boolean;
    none: boolean;
  };
  showOnlineStatus: boolean;
  showActivity: boolean;
  showFollowers: boolean;
  showFollowing: boolean;
}

/**
 * Request/response types for privacy API endpoints
 */
export interface UpdatePrivacySettingsRequest {
  settings: Partial<PrivacySettings>;
}

export interface GetPrivacySettingsResponse {
  settings: PrivacySettings;
}