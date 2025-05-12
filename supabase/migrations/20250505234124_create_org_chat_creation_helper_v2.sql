-- Define helper function to check chat creation permission

CREATE OR REPLACE FUNCTION public.check_org_chat_creation_permission(
    p_org_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    can_create BOOLEAN;
BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.organization_members om ON o.id = om.organization_id
      WHERE o.id = p_org_id                   -- Match the organization
        AND om.user_id = p_user_id            -- Match the user
        AND om.status = 'active'              -- User must be active
        AND (
          om.role = 'admin'                   -- Allow if user is admin
          OR
          o.allow_member_chat_creation = true -- OR Allow if org allows member creation
        )
    ) INTO can_create;
    RETURN can_create;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.check_org_chat_creation_permission(UUID, UUID)
IS 'Checks if a given active user is permitted to create a chat in a specific organization.';

-- Note: DOWN migration logic is omitted as per project pattern.
-- Reversal should be handled manually or via db reset if needed during development.
