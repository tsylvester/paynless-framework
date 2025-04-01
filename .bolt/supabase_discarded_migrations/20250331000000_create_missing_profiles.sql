/*
  # Create Missing User Profiles

  1. Purpose
    - Ensure all existing users have a profile entry in user_profiles table
    - Create default profiles for any users missing them
  
  2. Implementation
    - Find all users in auth.users without a corresponding profile
    - Create default profiles for these users
    - Set default privacy settings and role
*/

-- Create profiles for users that don't have one
INSERT INTO user_profiles (id, first_name, role, privacy_settings)
SELECT 
  au.id,
  split_part(au.email, '@', 1) as first_name,
  'user' as role,
  jsonb_build_object(
    'profileVisibility', 'public',
    'allowTagging', true,
    'allowMessaging', jsonb_build_object(
      'everyone', true,
      'followers', true,
      'none', false
    ),
    'showOnlineStatus', true,
    'showActivity', true,
    'showFollowers', true,
    'showFollowing', true
  ) as privacy_settings
FROM auth.users au
LEFT JOIN user_profiles up ON au.id = up.id
WHERE up.id IS NULL; 