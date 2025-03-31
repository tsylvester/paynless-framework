/**
 * Type definitions for the user API endpoints
 */

export interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserNotificationSettings {
  email: boolean;
  push: boolean;
  marketing: boolean;
}

export interface UserSettings {
  notifications: UserNotificationSettings;
  theme: string;
  language: string;
  [key: string]: any; // Allow for extensible settings
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

// CORS headers for API responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};