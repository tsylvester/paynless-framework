-- supabase/migrations/20250428220005_add_notify_user_on_invite_trigger.sql

-- Function to create a notification when a user is invited
CREATE OR REPLACE FUNCTION public.handle_new_invite_notification()
RETURNS TRIGGER AS $$
DECLARE
  invited_user_id uuid;
  organization_name text;
  inviter_name text;
BEGIN
  -- Find the user_id associated with the invited email
  SELECT id INTO invited_user_id FROM auth.users WHERE email = NEW.invited_email;

  -- Only proceed if the user exists in auth.users
  IF invited_user_id IS NOT NULL THEN
    -- Get organization name
    SELECT name INTO organization_name FROM public.organizations WHERE id = NEW.organization_id;

    -- Get inviter name (optional, use email if profile not found)
    SELECT COALESCE(p.full_name, u.email) INTO inviter_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.user_id
    WHERE u.id = NEW.invited_by_user_id;

    -- Insert notification for the invited user
    INSERT INTO public.notifications (user_id, type, message, metadata)
    VALUES (
      invited_user_id,
      'organization_invite', -- Notification type
      inviter_name || ' has invited you to join ' || organization_name || ' as a ' || NEW.role_to_assign || '.', -- Message
      jsonb_build_object(
        'organization_id', NEW.organization_id,
        'organization_name', organization_name,
        'invite_id', NEW.id,
        'invite_token', NEW.invite_token, -- Include token if needed for direct linking
        'inviter_id', NEW.invited_by_user_id,
        'inviter_name', inviter_name,
        'assigned_role', NEW.role_to_assign
      )
    );
  ELSE
    -- Optional: Log if the invited user doesn't exist yet (might be expected)
    RAISE LOG 'Invited user with email % not found in auth.users, no notification created.', NEW.invited_email;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS notify_user_on_invite ON public.invites;

-- Create the trigger
CREATE TRIGGER notify_user_on_invite
AFTER INSERT ON public.invites
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.handle_new_invite_notification();

COMMENT ON FUNCTION public.handle_new_invite_notification() IS 'Handles inserting a notification when a new pending invite is created.';
COMMENT ON TRIGGER notify_user_on_invite ON public.invites IS 'Triggers a notification to the invited user upon creation of a pending invite.'; 