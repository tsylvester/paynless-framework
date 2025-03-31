/**
 * Types for dating and matching functionality
 */

export enum ReligionType {
  AGNOSTIC = 'agnostic',
  ATHEIST = 'atheist',
  BUDDHIST = 'buddhist',
  CHRISTIAN = 'christian',
  HINDU = 'hindu',
  JEWISH = 'jewish',
  MUSLIM = 'muslim',
  SIKH = 'sikh',
  SPIRITUAL = 'spiritual',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum PoliticalView {
  VERY_LIBERAL = 'very_liberal',
  LIBERAL = 'liberal',
  MODERATE = 'moderate',
  CONSERVATIVE = 'conservative',
  VERY_CONSERVATIVE = 'very_conservative',
  APOLITICAL = 'apolitical',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum SubstanceUse {
  NEVER = 'never',
  RARELY = 'rarely',
  SOCIALLY = 'socially',
  REGULARLY = 'regularly',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum EducationLevel {
  HIGH_SCHOOL = 'high_school',
  SOME_COLLEGE = 'some_college',
  ASSOCIATES = 'associates',
  BACHELORS = 'bachelors',
  MASTERS = 'masters',
  DOCTORAL = 'doctoral',
  TRADE_SCHOOL = 'trade_school',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum LookingFor {
  FRIENDSHIP = 'friendship',
  DATING = 'dating',
  LONG_TERM = 'long_term',
  MARRIAGE = 'marriage',
  CASUAL = 'casual',
  SEX = 'sex',
  NOT_SURE = 'not_sure',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export interface UserDetails {
  id: string;
  userId: string;
  tobaccoUse: SubstanceUse;
  drinking: SubstanceUse;
  cannabisUse: SubstanceUse;
  otherDrugs: SubstanceUse;
  exerciseFrequency?: string;
  dietPreferences: string[];
  pets: string[];
  privacyLevel: PrivacyLevel;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  id: string;
  userId: string;
  ageMin?: number;
  ageMax?: number;
  distanceMax?: number;
  heightMinCm?: number;
  heightMaxCm?: number;
  genderPreferences: GenderType[];
  sexualityPreferences: SexualityType[];
  relationshipPreferences: RelationshipStatus[];
  religionPreferences: ReligionType[];
  politicalPreferences: PoliticalView[];
  educationPreferences: EducationLevel[];
  lookingForPreferences: LookingFor[];
  tobaccoPreferences: SubstanceUse[];
  drinkingPreferences: SubstanceUse[];
  cannabisPreferences: SubstanceUse[];
  otherDrugsPreferences: SubstanceUse[];
  createdAt: string;
  updatedAt: string;
}

export interface MatchFilters {
  ageRange: [number, number];
  distance: number;
  gender?: GenderType[];
  sexuality?: SexualityType[];
  relationshipStatus?: RelationshipStatus[];
  religion?: ReligionType[];
  politicalView?: PoliticalView[];
  education?: EducationLevel[];
  lookingFor?: LookingFor[];
  height?: [number, number];
  tobacco?: SubstanceUse[];
  drinking?: SubstanceUse[];
  cannabis?: SubstanceUse[];
  otherDrugs?: SubstanceUse[];
}

export interface Match {
  id: string;
  userId: string;
  matchedUserId: string;
  score: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface MatchResult {
  profile: UserProfile;
  details: UserDetails;
  score: number;
  commonInterests: string[];
  distance: number;
}