/**
 * Type definitions for the user API endpoints
 */

export enum PrivacyLevel {
  PUBLIC = 'public',
  PRIVATE = 'private',
  FRIENDS = 'friends'
}

export enum GenderType {
  MALE = 'male',
  FEMALE = 'female',
  NON_BINARY = 'non_binary',
  OTHER = 'other'
}

export enum SexualityType {
  STRAIGHT = 'straight',
  GAY = 'gay',
  LESBIAN = 'lesbian',
  BISEXUAL = 'bisexual',
  PANSEXUAL = 'pansexual',
  OTHER = 'other'
}

export enum RelationshipStatus {
  SINGLE = 'single',
  IN_RELATIONSHIP = 'in_relationship',
  MARRIED = 'married',
  DIVORCED = 'divorced',
  WIDOWED = 'widowed',
  OTHER = 'other'
}

export interface Location {
  city?: string;
  state?: string;
  country?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface SocialLink {
  platform: string;
  url: string;
  privacyLevel: PrivacyLevel;
}

export interface ContactInfo {
  type: string;
  value: string;
  privacyLevel: PrivacyLevel;
}

export interface PrivacySettings {
  birthDate?: PrivacyLevel;
  gender?: PrivacyLevel;
  location?: PrivacyLevel;
  sexuality?: PrivacyLevel;
  relationshipStatus?: PrivacyLevel;
  religion?: PrivacyLevel;
  politicalView?: PrivacyLevel;
  education?: PrivacyLevel;
  height?: PrivacyLevel;
  interests?: PrivacyLevel;
  lookingFor?: PrivacyLevel;
}

export interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  birthDate?: string;
  birthTime?: string;
  gender?: GenderType;
  pronouns?: string[];
  location?: Location;
  sexuality?: SexualityType;
  relationshipStatus?: RelationshipStatus;
  role: string;
  privacySettings: PrivacySettings;
  socialLinks: SocialLink[];
  contactInfo: ContactInfo[];
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
  birthDate?: string;
  birthTime?: string;
  gender?: GenderType;
  pronouns?: string[];
  location?: Location;
  sexuality?: SexualityType;
  relationshipStatus?: RelationshipStatus;
  privacySettings?: Partial<PrivacySettings>;
  socialLinks?: SocialLink[];
  contactInfo?: ContactInfo[];
}

// CORS headers for API responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};