-- Migration: Add RLS policies for organizations and organization_members

-- Helper function to check if a user is an active member of a non-deleted organization
-- with a specific role (or any role if required_role is NULL).
CREATE OR REPLACE FUNCTION is_org_member(
    p_org_id UUID,
    p_user_id UUID,
    required_status TEXT,
    required_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    is_member BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om
        JOIN public.organizations o ON om.organization_id = o.id
        WHERE om.organization_id = p_org_id
          AND om.user_id = p_user_id
          AND om.status = required_status
          AND (required_role IS NULL OR om.role = required_role)
          AND o.deleted_at IS NULL -- Ensure organization is not soft-deleted
    ) INTO is_member;
    RETURN is_member;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_org_member(UUID, UUID, TEXT, TEXT) TO authenticated;

-- Policies for organizations table
-- RLS should already be enabled from the table creation migration, but ALTER is safe.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Remove default permissive policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON public.organizations;

-- Allow authenticated users to create organizations
CREATE POLICY "Allow authenticated users to create organizations"
    ON public.organizations FOR INSERT
    TO authenticated
    WITH CHECK (auth.role() = 'authenticated');

-- Allow active members to view their non-deleted organizations
CREATE POLICY "Allow active members to view their non-deleted organizations"
    ON public.organizations FOR SELECT
    TO authenticated
    USING (is_org_member(id, auth.uid(), 'active')); -- Check for active membership

-- Allow admin members to update their non-deleted organizations
CREATE POLICY "Allow admins to update their non-deleted organizations"
    ON public.organizations FOR UPDATE
    TO authenticated
    USING (is_org_member(id, auth.uid(), 'active', 'admin')) -- Must be an active admin
    WITH CHECK (is_org_member(id, auth.uid(), 'active', 'admin'));

-- Policies for organization_members table
-- RLS should already be enabled from the table creation migration, but ALTER is safe.
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Remove default permissive policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON public.organization_members;

-- Allow active members to view memberships within their non-deleted organizations
CREATE POLICY "Allow active members to view memberships in their orgs"
    ON public.organization_members FOR SELECT
    TO authenticated
    USING (
        -- Check if the requesting user is an active member of the org this membership belongs to
        is_org_member(organization_id, auth.uid(), 'active')
    );

-- Allow admins to insert new members into their non-deleted organizations
CREATE POLICY "Allow admins to insert new members"
    ON public.organization_members FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Check if the requesting user is an active admin of the target org
        is_org_member(organization_id, auth.uid(), 'active', 'admin')
    );

-- Allow admins to update any membership, or users to update their own, in non-deleted orgs
CREATE POLICY "Allow admins or self to update memberships"
    ON public.organization_members FOR UPDATE
    TO authenticated
    USING (
        -- Allow if user is an active admin of the org
        is_org_member(organization_id, auth.uid(), 'active', 'admin')
        OR
        -- Allow if user is updating their own membership AND the org is not deleted
        (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND deleted_at IS NULL))
    )
    WITH CHECK (
       -- Ensure the check logic matches the using logic
        is_org_member(organization_id, auth.uid(), 'active', 'admin')
        OR
        (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND deleted_at IS NULL))
    ); 