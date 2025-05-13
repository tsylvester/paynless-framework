-- Migration: Implement notification triggers for organization events

-- Ensure the helper function exists (defined in 20250422110000_create_placeholder_notification_trigger.sql)
-- CREATE OR REPLACE FUNCTION public.create_notification_for_user(target_user_id UUID, notification_type TEXT, notification_data JSONB) ...

-- 1. Trigger function to notify admins of a new join request
CREATE OR REPLACE FUNCTION public.handle_new_join_request()
RETURNS TRIGGER AS $$
DECLARE
    admin_record RECORD;
    org_name TEXT;
    is_org_deleted BOOLEAN;
BEGIN
    -- Check if the organization is soft-deleted
    SELECT deleted_at IS NOT NULL, name
    INTO is_org_deleted, org_name
    FROM public.organizations
    WHERE id = NEW.organization_id;

    -- Only proceed if the organization exists and is not deleted
    IF NOT FOUND OR is_org_deleted THEN
        RETURN NULL; -- Or NEW depending on preference for AFTER triggers
    END IF;

    -- Find all active admins of this organization
    FOR admin_record IN
        SELECT user_id
        FROM public.organization_members
        WHERE organization_id = NEW.organization_id
          AND role = 'admin'
          AND status = 'active'
    LOOP
        -- Create notification for each admin
        PERFORM public.create_notification_for_user(
            admin_record.user_id,
            'org_join_request',
            jsonb_build_object(
                'requesting_user_id', NEW.user_id,
                'organization_id', NEW.organization_id,
                'organization_name', org_name,
                'membership_id', NEW.id,
                'target_path', '/dashboard/organizations/' || NEW.organization_id::text || '/members?action=review&memberId=' || NEW.id::text
            )
        );
    END LOOP;

    RETURN NULL; -- AFTER triggers often return NULL
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for join requests
DROP TRIGGER IF EXISTS trg_notify_admins_on_join_request ON public.organization_members;
CREATE TRIGGER trg_notify_admins_on_join_request
AFTER INSERT ON public.organization_members
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.handle_new_join_request();


-- 2. Trigger function to notify user on role change
CREATE OR REPLACE FUNCTION public.handle_member_role_change()
RETURNS TRIGGER AS $$
DECLARE
    org_name TEXT;
    is_org_deleted BOOLEAN;
BEGIN
    -- Check if the organization is soft-deleted
    SELECT deleted_at IS NOT NULL, name
    INTO is_org_deleted, org_name
    FROM public.organizations
    WHERE id = NEW.organization_id;

    -- Only proceed if the organization exists and is not deleted
    IF NOT FOUND OR is_org_deleted THEN
        RETURN NULL;
    END IF;

    -- Create notification for the affected user
    PERFORM public.create_notification_for_user(
        NEW.user_id,
        'org_role_changed',
        jsonb_build_object(
            'organization_id', NEW.organization_id,
            'organization_name', org_name,
            'old_role', OLD.role,
            'new_role', NEW.role,
            'target_path', '/dashboard/organizations/' || NEW.organization_id::text || '/settings' -- User might check their role in settings
        )
    );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for role changes
DROP TRIGGER IF EXISTS trg_notify_user_on_role_change ON public.organization_members;
CREATE TRIGGER trg_notify_user_on_role_change
AFTER UPDATE ON public.organization_members
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role AND OLD.status = 'active' AND NEW.status = 'active') -- Notify only active members whose role actually changes
EXECUTE FUNCTION public.handle_member_role_change();


-- 3. Trigger function to notify user on removal
CREATE OR REPLACE FUNCTION public.handle_member_removed()
RETURNS TRIGGER AS $$
DECLARE
    org_name TEXT;
    is_org_deleted BOOLEAN;
BEGIN
    -- Check if the organization is soft-deleted (though removal might still happen)
    SELECT deleted_at IS NOT NULL, name
    INTO is_org_deleted, org_name
    FROM public.organizations
    WHERE id = NEW.organization_id; -- Use NEW or OLD, should be same org

    IF NOT FOUND THEN
      -- Org might be hard deleted? Or FK constraint failed? Log/handle error?
      -- For now, just exit gracefully if org not found.
      RETURN NULL;
    END IF;

    -- Create notification for the removed user
    PERFORM public.create_notification_for_user(
        NEW.user_id,
        'org_membership_removed',
        jsonb_build_object(
            'organization_id', NEW.organization_id,
            'organization_name', org_name,
            'target_path', '/dashboard/organizations' -- General path after removal
        )
    );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for member removal
DROP TRIGGER IF EXISTS trg_notify_user_on_member_removed ON public.organization_members;
CREATE TRIGGER trg_notify_user_on_member_removed
AFTER UPDATE ON public.organization_members
FOR EACH ROW
WHEN (OLD.status = 'active' AND NEW.status = 'removed')
EXECUTE FUNCTION public.handle_member_removed(); 