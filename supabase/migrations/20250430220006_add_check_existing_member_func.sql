-- supabase/migrations/YYYYMMDDHHMMSS_add_check_existing_member_func.sql
-- Replace YYYYMMDDHHMMSS with the actual timestamp

-- Function to check if an email corresponds to an active/pending member of an organization
CREATE OR REPLACE FUNCTION public.check_existing_member_by_email(
    target_org_id uuid,
    target_email text
)
RETURNS TABLE(membership_status text) -- Return the status if found, empty if not
AS $$
DECLARE
    target_user_id uuid;
BEGIN
    -- 1. Find user_id from email (can query auth.users due to SECURITY DEFINER)
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email LIMIT 1;

    -- 2. If user_id found, check membership status in the target org
    IF target_user_id IS NOT NULL THEN
        RETURN QUERY
        SELECT om.status
        FROM public.organization_members om
        WHERE om.organization_id = target_org_id
          AND om.user_id = target_user_id
          AND om.status IN ('active', 'pending'); -- Check for active or pending join request
    END IF;

    -- If user_id not found or no matching membership, return empty set
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to the authenticated role
-- The edge function client uses the 'authenticated' role's permissions
GRANT EXECUTE ON FUNCTION public.check_existing_member_by_email(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.check_existing_member_by_email(uuid, text) IS 'Checks if an email is already associated with an organization as an active member or has a pending join request. Runs with definer privileges to query auth.users.'; 