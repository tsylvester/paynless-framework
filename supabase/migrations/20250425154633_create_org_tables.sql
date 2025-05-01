-- Migration: Create organizations and organization_members tables

-- Organizations Table
CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Visibility enum using CHECK constraint
    visibility text DEFAULT 'private'::text NOT NULL CHECK (visibility IN ('private', 'public')),
    -- Soft delete column
    deleted_at timestamp with time zone DEFAULT NULL
    -- Add future profile fields here (e.g., description, website, logo_url)
);

-- Add comment for clarity
COMMENT ON COLUMN public.organizations.visibility IS 'Controls if the organization can be discovered or joined publicly.';
COMMENT ON COLUMN public.organizations.deleted_at IS 'Timestamp when the organization was soft-deleted.';

-- Organization Members Table
CREATE TABLE public.organization_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Role enum using CHECK constraint
    role text DEFAULT 'member'::text NOT NULL CHECK (role IN ('admin', 'member')),
    -- Status enum using CHECK constraint
    status text DEFAULT 'pending'::text NOT NULL CHECK (status IN ('pending', 'active', 'removed')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add comment for clarity
COMMENT ON COLUMN public.organization_members.role IS 'User role within the organization.';
COMMENT ON COLUMN public.organization_members.status IS 'Membership status (e.g., pending invite, active, removed).';

-- Indexes for faster lookups
CREATE INDEX idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_organization_members_organization_id ON public.organization_members(organization_id);
CREATE INDEX idx_organization_members_user_org ON public.organization_members(user_id, organization_id);

-- Enable RLS (Policies will be added in a separate step/migration)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY; 