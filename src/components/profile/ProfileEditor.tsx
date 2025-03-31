import React, { useState } from 'react';
import { User, Link as LinkIcon, Table as Tabs, Component as TabsContent, List as TabsList, Refrigerator as TabsTrigger, Loader } from 'lucide-react';
import { BirthdaySettings } from './BirthdaySettings';
import { GenderSelector } from './GenderSelector';
import { LocationSelector } from './LocationSelector';
import { SexualitySelector } from './SexualitySelector';
import { RelationshipStatusSelector } from './RelationshipStatusSelector';
import { SocialLinksEditor } from './SocialLinksEditor';
import { ReligionSelector } from './ReligionSelector';
import { PoliticalViewSelector } from './PoliticalViewSelector';
import { SubstanceUseSelector } from './SubstanceUseSelector';
import { EducationSelector } from './EducationSelector';
import { PhysicalAttributes } from './PhysicalAttributes';
import { HobbiesSelector } from './HobbiesSelector';
import { LookingForSelector } from './LookingForSelector';
import { PreferencesEditor } from './PreferencesEditor';
import { 
  UserProfile, 
  PrivacyLevel,
  GenderType,
  SexualityType,
  RelationshipStatus,
  Location,
  SocialLink,
} from '../../types/profile.types';
import {
  ReligionType,
  PoliticalView,
  SubstanceUse,
  EducationLevel,
  LookingFor,
  UserPreferences,
  UserDetails,
} from '../../types/dating.types';

interface ProfileEditorProps {
  profile: UserProfile;
  preferences?: UserPreferences;
  details?: UserDetails;
  onSave: (updates: Partial<UserProfile>) => Promise<void>;
  onSavePreferences?: (updates: Partial<UserPreferences>) => Promise<void>;
  onSaveDetails?: (updates: Partial<UserDetails>) => Promise<void>;
}

type TabType = 'basic' | 'details' | 'preferences';

export function ProfileEditor({ 
  profile, 
  preferences,
  details,
  onSave,
  onSavePreferences,
  onSaveDetails,
}: ProfileEditorProps) {
  // Current tab state
  const [currentTab, setCurrentTab] = useState<TabType>('basic');
  const [isSaving, setIsSaving] = useState(false);

  // Basic info state
  const [firstName, setFirstName] = useState(profile.firstName || '');
  const [lastName, setLastName] = useState(profile.lastName || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');

  // Birthday settings state
  const [birthDate, setBirthDate] = useState(profile.birthDate);
  const [birthTime, setBirthTime] = useState(profile.birthTime);
  const [showAge, setShowAge] = useState(profile.privacySettings?.birthDate === PrivacyLevel.PUBLIC);
  const [showBirthday, setShowBirthday] = useState<'full' | 'month-year' | 'year' | 'none'>('full');
  const [enableBirthdayNotifications, setEnableBirthdayNotifications] = useState(true);
  const [birthdayPrivacy, setBirthdayPrivacy] = useState(profile.privacySettings?.birthDate || PrivacyLevel.PUBLIC);

  // Gender settings state
  const [gender, setGender] = useState(profile.gender);
  const [pronouns, setPronouns] = useState(profile.pronouns || []);
  const [genderPrivacy, setGenderPrivacy] = useState(profile.privacySettings?.gender || PrivacyLevel.PUBLIC);

  // Location settings state
  const [location, setLocation] = useState(profile.location);
  const [locationPrivacy, setLocationPrivacy] = useState(profile.privacySettings?.location || PrivacyLevel.PUBLIC);

  // Sexuality settings state
  const [sexuality, setSexuality] = useState(profile.sexuality);
  const [sexualityPrivacy, setSexualityPrivacy] = useState(profile.privacySettings?.sexuality || PrivacyLevel.PRIVATE);

  // Relationship status state
  const [relationshipStatus, setRelationshipStatus] = useState(profile.relationshipStatus);
  const [relationshipStatusPrivacy, setRelationshipStatusPrivacy] = useState(
    profile.privacySettings?.relationshipStatus || PrivacyLevel.PUBLIC
  );

  // Religion state
  const [religion, setReligion] = useState<ReligionType | undefined>(profile.religion);
  const [religionPrivacy, setReligionPrivacy] = useState(profile.privacySettings?.religion || PrivacyLevel.PUBLIC);

  // Political view state
  const [politicalView, setPoliticalView] = useState<PoliticalView | undefined>(profile.politicalView);
  const [politicalViewPrivacy, setPoliticalViewPrivacy] = useState(profile.privacySettings?.politicalView || PrivacyLevel.PRIVATE);

  // Education state
  const [education, setEducation] = useState<EducationLevel | undefined>(profile.education);
  const [school, setSchool] = useState(profile.school);
  const [occupation, setOccupation] = useState(profile.occupation);
  const [company, setCompany] = useState(profile.company);
  const [educationPrivacy, setEducationPrivacy] = useState(profile.privacySettings?.education || PrivacyLevel.PUBLIC);

  // Physical attributes state
  const [heightCm, setHeightCm] = useState(profile.heightCm);
  const [physicalPrivacy, setPhysicalPrivacy] = useState(profile.privacySettings?.height || PrivacyLevel.PUBLIC);

  // Hobbies state
  const [interests, setInterests] = useState(profile.interests || []);
  const [interestsPrivacy, setInterestsPrivacy] = useState(profile.privacySettings?.interests || PrivacyLevel.PUBLIC);

  // Looking for state
  const [lookingFor, setLookingFor] = useState<LookingFor | undefined>(profile.lookingFor);
  const [lookingForPrivacy, setLookingForPrivacy] = useState(profile.privacySettings?.lookingFor || PrivacyLevel.PUBLIC);

  // Substance use state
  const [tobaccoUse, setTobaccoUse] = useState(details?.tobaccoUse);
  const [drinking, setDrinking] = useState(details?.drinking);
  const [cannabisUse, setCannabisUse] = useState(details?.cannabisUse);
  const [otherDrugs, setOtherDrugs] = useState(details?.otherDrugs);
  const [substanceUsePrivacy, setSubstanceUsePrivacy] = useState(details?.privacyLevel || PrivacyLevel.PRIVATE);

  // Social links state
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(profile.socialLinks || []);

  // Error state
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      const updates: Partial<UserProfile> = {
        firstName,
        lastName,
        avatarUrl,
        birthDate,
        birthTime,
        gender,
        pronouns,
        location,
        sexuality,
        relationshipStatus,
        privacySettings: {
          ...profile.privacySettings,
          birthDate: birthdayPrivacy,
          gender: genderPrivacy,
          location: locationPrivacy,
          sexuality: sexualityPrivacy,
          relationshipStatus: relationshipStatusPrivacy,
          religion: religionPrivacy,
          politicalView: politicalViewPrivacy,
          education: educationPrivacy,
          height: physicalPrivacy,
          interests: interestsPrivacy,
          lookingFor: lookingForPrivacy,
        },
      };

      await onSave(updates);
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePreferences = async (updates: Partial<UserPreferences>) => {
    if (!onSavePreferences || isSaving) return;

    setIsSaving(true);
    try {
      await onSavePreferences(updates);
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDetails = async (updates: Partial<UserDetails>) => {
    if (!onSaveDetails || isSaving) return;

    setIsSaving(true);
    try {
      await onSaveDetails(updates);
    } catch (error) {
      console.error('Error saving details:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${currentTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {currentTab === 'basic' && (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Basic Information</h3>
            
            <div className="flex items-center space-x-4">
              <div className="h-20 w-20 rounded-full bg-surface flex items-center justify-center">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <User className="h-10 w-10 text-textSecondary" />
                )}
              </div>
              
              <div className="flex-1 grid grid-cols-2 gap-4">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                  className="input"
                  disabled={isSaving}
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last Name"
                  className="input"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Birthday Settings */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Birthday Settings</h3>
            <BirthdaySettings
              birthDate={birthDate}
              birthTime={birthTime}
              showAge={showAge}
              showBirthday={showBirthday}
              enableBirthdayNotifications={enableBirthdayNotifications}
              privacyLevel={birthdayPrivacy}
              onBirthDateChange={setBirthDate}
              onBirthTimeChange={setBirthTime}
              onShowAgeChange={setShowAge}
              onShowBirthdayChange={setShowBirthday}
              onEnableBirthdayNotificationsChange={setEnableBirthdayNotifications}
              onPrivacyLevelChange={setBirthdayPrivacy}
              disabled={isSaving}
            />
          </div>

          {/* Gender Settings */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Gender & Pronouns</h3>
            <GenderSelector
              gender={gender}
              pronouns={pronouns}
              privacyLevel={genderPrivacy}
              onGenderChange={setGender}
              onPronounsChange={setPronouns}
              onPrivacyLevelChange={setGenderPrivacy}
            />
          </div>

          {/* Location Settings */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Location</h3>
            <LocationSelector
              location={location}
              privacyLevel={locationPrivacy}
              onLocationChange={setLocation}
              onPrivacyLevelChange={setLocationPrivacy}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className={`
                px-4 py-2 rounded-md text-sm font-medium text-white
                ${isSaving
                  ? 'bg-primary/70 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-dark'
                }
              `}
            >
              {isSaving ? (
                <div className="flex items-center">
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </div>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Additional Details Tab */}
      {currentTab === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Sexuality Settings */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Sexuality</h3>
            <SexualitySelector
              sexuality={sexuality}
              privacyLevel={sexualityPrivacy}
              onSexualityChange={setSexuality}
              onPrivacyLevelChange={setSexualityPrivacy}
            />
          </div>

          {/* Relationship Status */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Relationship Status</h3>
            <RelationshipStatusSelector
              status={relationshipStatus}
              privacyLevel={relationshipStatusPrivacy}
              onStatusChange={setRelationshipStatus}
              onPrivacyLevelChange={setRelationshipStatusPrivacy}
            />
          </div>

          {/* Religion */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Religion</h3>
            <ReligionSelector
              religion={religion}
              privacyLevel={religionPrivacy}
              onReligionChange={setReligion}
              onPrivacyLevelChange={setReligionPrivacy}
            />
          </div>

          {/* Political Views */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Political Views</h3>
            <PoliticalViewSelector
              politicalView={politicalView}
              privacyLevel={politicalViewPrivacy}
              onPoliticalViewChange={setPoliticalView}
              onPrivacyLevelChange={setPoliticalViewPrivacy}
            />
          </div>

          {/* Education & Work */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Education & Work</h3>
            <EducationSelector
              education={education}
              school={school}
              occupation={occupation}
              company={company}
              privacyLevel={educationPrivacy}
              onEducationChange={setEducation}
              onSchoolChange={setSchool}
              onOccupationChange={setOccupation}
              onCompanyChange={setCompany}
              onPrivacyLevelChange={setEducationPrivacy}
            />
          </div>

          {/* Physical Attributes */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Physical Attributes</h3>
            <PhysicalAttributes
              heightCm={heightCm}
              privacyLevel={physicalPrivacy}
              onHeightChange={setHeightCm}
              onPrivacyLevelChange={setPhysicalPrivacy}
            />
          </div>

          {/* Hobbies & Interests */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Hobbies & Interests</h3>
            <HobbiesSelector
              interests={interests}
              privacyLevel={interestsPrivacy}
              onInterestsChange={setInterests}
              onPrivacyLevelChange={setInterestsPrivacy}
            />
          </div>

          {/* Looking For */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Looking For</h3>
            <LookingForSelector
              lookingFor={lookingFor}
              privacyLevel={lookingForPrivacy}
              onLookingForChange={setLookingFor}
              onPrivacyLevelChange={setLookingForPrivacy}
            />
          </div>

          {/* Substance Use */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Substance Use</h3>
            <SubstanceUseSelector
              tobaccoUse={tobaccoUse}
              drinking={drinking}
              cannabisUse={cannabisUse}
              otherDrugs={otherDrugs}
              privacyLevel={substanceUsePrivacy}
              onTobaccoUseChange={setTobaccoUse}
              onDrinkingChange={setDrinking}
              onCannabisUseChange={setCannabisUse}
              onOtherDrugsChange={setOtherDrugs}
              onPrivacyLevelChange={setSubstanceUsePrivacy}
            />
          </div>

          {/* Social Links */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-textPrimary">Social Links</h3>
            <SocialLinksEditor
              links={socialLinks}
              onAddLink={(platform, url, privacyLevel) => {
                setSocialLinks([
                  ...socialLinks,
                  {
                    id: crypto.randomUUID(),
                    platform,
                    url,
                    privacyLevel,
                    verified: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ]);
              }}
              onUpdateLink={(id, url, privacyLevel) => {
                setSocialLinks(
                  socialLinks.map((link) =>
                    link.id === id
                      ? { ...link, url, privacyLevel, updatedAt: new Date().toISOString() }
                      : link
                  )
                );
              }}
              onDeleteLink={(id) => {
                setSocialLinks(socialLinks.filter((link) => link.id !== id));
              }}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className={`
                px-4 py-2 rounded-md text-sm font-medium text-white
                ${isSaving
                  ? 'bg-primary/70 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-dark'
                }
              `}
            >
              {isSaving ? (
                <div className="flex items-center">
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </div>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Match Preferences Tab */}
      {currentTab === 'preferences' && preferences && onSavePreferences && (
        <PreferencesEditor
          preferences={preferences}
          onSave={handleSavePreferences}
        />
      )}
    </div>
  );
}