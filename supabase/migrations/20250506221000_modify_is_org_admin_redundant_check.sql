-- Modify is_org_admin function to add redundant role check

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Check if the organization exists and is not deleted
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id AND deleted_at IS NULL) THEN
    RETURN FALSE;
  END IF;

  -- Check if the current user is an active admin member of the organization
  RETURN EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = org_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin' -- Original check
        AND om.status = 'active'
        AND om.role = 'admin' -- <<< Add redundant explicit check here
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

ALTER FUNCTION public.is_org_admin(uuid) SET search_path = public, pg_catalog;

-- Re-add comment
COMMENT ON FUNCTION public.is_org_admin(uuid) IS 'Checks if the current authenticated user is an active admin of the specified non-deleted organization.'; 