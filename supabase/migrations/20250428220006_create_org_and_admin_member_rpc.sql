-- supabase/migrations/20250428220006_create_org_and_admin_member_rpc.sql

-- Drop the function if it already exists to ensure idempotency
DROP FUNCTION IF EXISTS public.create_org_and_admin_member(uuid, text, text);

-- Create the function to insert organization and initial admin member atomically
CREATE OR REPLACE FUNCTION public.create_org_and_admin_member(
    p_user_id uuid,         -- ID of the user creating the organization
    p_org_name text,        -- Name for the new organization
    p_org_visibility text   -- Visibility ('public' or 'private')
)
RETURNS uuid -- Returns the ID of the newly created organization
LANGUAGE plpgsql
SECURITY DEFINER -- Allows the function to perform actions potentially beyond the direct user permissions
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  -- Insert the new organization
  INSERT INTO public.organizations (name, visibility)
  VALUES (p_org_name, p_org_visibility)
  RETURNING id INTO new_org_id;

  -- Insert the creating user as the initial admin member
  INSERT INTO public.organization_members (user_id, organization_id, role, status)
  VALUES (p_user_id, new_org_id, 'admin', 'active');

  -- Return the new organization's ID
  RETURN new_org_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise it to ensure the transaction is rolled back
    RAISE WARNING 'Error in create_org_and_admin_member: SQLSTATE: %, MESSAGE: %', SQLSTATE, SQLERRM;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.create_org_and_admin_member(uuid, text, text) 
IS 'Creates a new organization and adds the specified user as the initial admin member within a single transaction. Returns the new organization ID.'; 