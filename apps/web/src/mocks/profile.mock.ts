import { UserProfile, UserTier } from '@paynless/types';

const mockTierDefinitions: UserTier[] = [
  { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 },
  { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 },
  { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 },
  { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null },
  { level: 99, name: 'unreachable', output_cap_tokens: null, max_models_per_project: null },
];

export const mockUserTier: UserTier = mockTierDefinitions[0];

export const mockAllTiers: UserTier[] = mockTierDefinitions;

export const mockUserProfile: UserProfile = {
  id: 'user-123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  first_name: 'John',
  last_name: 'Doe',
  last_selected_org_id: 'org-123',
  profile_privacy_setting: 'public',
  chat_context: {},
  is_subscribed_to_newsletter: false,
  has_seen_welcome_modal: false,
  role: 'user',
  signup_ref: null,
  subscribed_at: null,
  synced_to_kit_at: null,
  unsubscribed_at: null,
}; 