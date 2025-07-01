-- Migration: Create placeholder notification trigger function
-- Timestamp: 20250422110000 (Example timestamp)

-- Placeholder function: Will eventually notify org admins on join request.
-- For now, it just demonstrates inserting a notification.
-- It accepts a user_id to notify and context data.
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  target_user_id UUID,
  notification_type TEXT,
  notification_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- IMPORTANT: Allows function to insert rows bypassing user RLS
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (target_user_id, notification_type, notification_data);
END;
$$;

-- Grant execute permission to the necessary role (e.g., service_role or postgres)
-- that will be invoking this function via triggers later.
-- Authenticated users should NOT typically call this directly.
GRANT EXECUTE ON FUNCTION public.create_notification_for_user(UUID, TEXT, JSONB) TO postgres; -- Or service_role
GRANT EXECUTE ON FUNCTION public.create_notification_for_user(UUID, TEXT, JSONB) TO service_role;


-- Placeholder Trigger Function (will be replaced in Phase 2)
-- This function is NOT tied to a real table yet.
-- It just demonstrates calling the helper function.
CREATE OR REPLACE FUNCTION public.handle_placeholder_event()
RETURNS TRIGGER AS $$
DECLARE
  -- Example data for testing
  example_admin_id UUID;
  example_requesting_user_id UUID;
  example_org_id UUID;
BEGIN
  -- In a real scenario, these would come from NEW row data
  -- For placeholder, try getting the current user's ID if available, otherwise use a dummy
  example_admin_id := auth.uid();
  example_requesting_user_id := '00000000-0000-0000-0000-000000000001'; -- Dummy requesting user
  example_org_id := '00000000-0000-0000-0000-000000000002'; -- Dummy org

  -- Call the helper function to create the notification
  PERFORM public.create_notification_for_user(
    example_admin_id,                               -- User to notify (placeholder)
    'join_request',                                 -- Notification type
    jsonb_build_object(                             -- Contextual data
      'requesting_user_id', example_requesting_user_id,
      'organization_id', example_org_id,
      'target_path', '/dashboard/organizations/' || example_org_id::text || '/members?action=review&user=' || example_requesting_user_id::text
    )
  );

  RETURN NEW; -- Or NULL depending on trigger type (AFTER triggers often return NULL)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;


-- NOTE: We are NOT creating the actual TRIGGER statement here
-- (e.g., CREATE TRIGGER trg_notify_on_join_request AFTER INSERT ON organization_members...)
-- because the `organization_members` table doesn't exist yet.
-- This migration only creates the reusable helper function and a placeholder trigger function body.
-- The real trigger binding will happen in Phase 2. 