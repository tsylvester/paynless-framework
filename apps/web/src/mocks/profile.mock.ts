import { UserProfile } from '@paynless/types';

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
}; 