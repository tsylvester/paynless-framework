-- Migration: Correct the foreign key constraint on organization_members.user_id

BEGIN;

-- First, ensure the check_last_admin function is updated to soft-delete the org instead of erroring.
-- This is necessary because this migration may run on a database where the function has the old logic.
CREATE OR REPLACE FUNCTION check_last_admin()
RETURNS TRIGGER AS $$
DECLARE
    v_organization_id UUID;
    v_is_admin_being_removed BOOLEAN;
    v_other_admin_count INTEGER;
BEGIN
    -- Determine the organization ID from either OLD or NEW record
    IF TG_OP = 'DELETE' THEN
        v_organization_id := OLD.organization_id;
    ELSE -- TG_OP = 'UPDATE'
        v_organization_id := NEW.organization_id; -- Could also use OLD.organization_id
    END IF;

    -- Check if the organization is already deleted; if so, allow changes
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = v_organization_id AND deleted_at IS NOT NULL) THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Check if an admin is being demoted or removed (status changing from 'active' or role changing from 'admin')
    v_is_admin_being_removed := (
        TG_OP = 'DELETE' AND OLD.role = 'admin' AND OLD.status = 'active'
    ) OR (
        TG_OP = 'UPDATE' AND
        OLD.role = 'admin' AND OLD.status = 'active' AND
        (NEW.role <> 'admin' OR NEW.status <> 'active')
    );

    -- If an admin is not being removed/demoted, allow the operation
    IF NOT v_is_admin_being_removed THEN
         IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- If an admin is being removed/demoted, count other active admins in the non-deleted organization
    SELECT count(*)
    INTO v_other_admin_count
    FROM public.organization_members om
    JOIN public.organizations o ON om.organization_id = o.id
    WHERE om.organization_id = v_organization_id
      AND om.role = 'admin'
      AND om.status = 'active'
      AND o.deleted_at IS NULL
      AND om.id <> OLD.id; -- Exclude the member being updated/deleted

    -- If removing/demoting this admin leaves no other admins, soft-delete the organization
    IF v_other_admin_count = 0 THEN
        UPDATE public.organizations
        SET deleted_at = now()
        WHERE id = v_organization_id;
    END IF;

    -- Otherwise, allow the operation
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Drop the existing constraint pointing to auth.users
-- NOTE: If this constraint name is different in your DB, update the name below.
ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_user_id_fkey; -- Assuming default naming

-- Clean up orphaned organization members before adding the new constraint.
DELETE FROM public.organization_members
WHERE user_id NOT IN (SELECT id FROM public.user_profiles);

-- Add the new constraint pointing to public.user_profiles
ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_user_id_fkey -- Re-using the standard name
FOREIGN KEY (user_id)
REFERENCES public.user_profiles(id)
ON DELETE CASCADE;

COMMIT; 