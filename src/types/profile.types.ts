/**
 * User profile types
 */

export enum PrivacyLevel {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  PRIVATE = 'private',
}

export enum GenderType {
  MALE = 'male',
  FEMALE = 'female',
  NON_BINARY = 'non_binary',
  TRANSMASCULINE = 'transmasculine',
  TRANSFEMININE = 'transfeminine',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum RelationshipStatus {
  INTERESTED = 'interested',
  IN_RELATIONSHIP = 'in_relationship',
  NOT_INTERESTED = 'not interested',
  ENM_POLY = 'ethical non-monogamy or poly',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum SexualityType {
  STRAIGHT = 'straight',
  GAY = 'gay',
  LESBIAN = 'lesbian',
  BISEXUAL = 'bisexual',
  PANSEXUAL = 'pansexual',
  ASEXUAL = 'asexual',
  QUEER = 'queer',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export interface Location {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  privacyLevel: PrivacyLevel;
  verified: boolean;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInfo {
  id: string;
  type: string;
  value: string;
  privacyLevel: PrivacyLevel;
  verified: boolean;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivacySettings {
  birthDate: PrivacyLevel;
  birthTime: PrivacyLevel;
  gender: PrivacyLevel;
  pronouns: PrivacyLevel;
  location: PrivacyLevel;
  sexuality: PrivacyLevel;
  relationshipStatus: PrivacyLevel;
  email: PrivacyLevel;
  phone: PrivacyLevel;
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

/**
 * API endpoint request/response types
 */
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
}

export interface AddSocialLinkRequest {
  platform: string;
  url: string;
  privacyLevel?: PrivacyLevel;
}

export interface UpdateSocialLinkRequest {
  url?: string;
  privacyLevel?: PrivacyLevel;
}

export interface AddContactInfoRequest {
  type: string;
  value: string;
  privacyLevel?: PrivacyLevel;
}

export interface UpdateContactInfoRequest {
  value?: string;
  privacyLevel?: PrivacyLevel;
}

export interface VerifyContactRequest {
  code: string;
}

export interface VerifyContactResponse {
  success: boolean;
  message?: string;
}