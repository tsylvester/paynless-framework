-- Create View: v_pending_membership_requests
-- Combines pending membership requests with user profile and email
-- Depends on: organizations, organization_members, user_profiles, auth.users

-- Drop view if it exists (makes migration replayable)
DROP VIEW IF EXISTS public.v_pending_membership_requests;

-- Create the View
CREATE VIEW public.v_pending_membership_requests AS
SELECT
    om.id,                       -- membership id
    om.user_id,                  -- user id
    om.organization_id,
    om.status,                   -- should be 'pending_approval'
    om.created_at,
    om.role,                     -- role requested/assigned
    up.first_name,
    up.last_name,
    au.email AS user_email       -- Email from auth.users
FROM
    public.organization_members om
LEFT JOIN
    public.user_profiles up ON om.user_id = up.id
LEFT JOIN
    auth.users au ON om.user_id = au.id
WHERE
    om.status = 'pending_approval';

-- Grant permissions: Allow authenticated users (or specific roles) to select from the view
-- Adjust the role (e.g., 'authenticated', 'service_role', or a custom role) as needed based on your RLS strategy.
-- Granting to 'authenticated' assumes RLS policies on the underlying tables will appropriately restrict row visibility.
GRANT SELECT ON public.v_pending_membership_requests TO authenticated; 