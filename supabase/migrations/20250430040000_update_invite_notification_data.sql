-- Migration: Update handle_new_invite_notification to use 'data' column and correct JSON structure

BEGIN;

-- Function to create a notification when a user is invited
CREATE OR REPLACE FUNCTION public.handle_new_invite_notification()
RETURNS TRIGGER AS $$
DECLARE
  invited_user_id uuid;
  organization_name text;
  inviter_name text;
  full_name text;
BEGIN
  -- Find the user_id associated with the invited email
  SELECT id INTO invited_user_id FROM auth.users WHERE email = NEW.invited_email;

  -- Only proceed if the user exists in auth.users
  IF invited_user_id IS NOT NULL THEN
    -- Get organization name
    SELECT name INTO organization_name FROM public.organizations WHERE id = NEW.organization_id;

    -- Get inviter name (optional, use email if profile/name not found)
    SELECT
      TRIM(p.first_name || ' ' || p.last_name), -- Construct full name
      u.email
    INTO
      full_name, -- Store constructed full name
      inviter_name -- Default to email if name is blank
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON u.id = p.id -- Correct join table and condition
    WHERE u.id = NEW.invited_by_user_id;

    -- Use the constructed full name if it's not blank, otherwise keep the email
    IF full_name IS NOT NULL AND full_name <> '' THEN
      inviter_name := full_name;
    END IF;

    -- Insert notification for the invited user using the 'data' column
    INSERT INTO public.notifications (user_id, type, data) -- Corrected columns
    VALUES (
      invited_user_id,
      'organization_invite', -- Notification type
      jsonb_build_object(
        'subject', 'Organization Invitation', -- Add a subject line
        'message', COALESCE(inviter_name, 'Someone') || ' has invited you to join ' || COALESCE(organization_name, 'an organization') || ' as a ' || NEW.role_to_assign || '.', -- Generated message text
        'target_path', '/accept-invite/' || NEW.invite_token, -- Path to accept invite page
        'organization_id', NEW.organization_id,
        'organization_name', organization_name,
        'invite_id', NEW.id,
        'invite_token', NEW.invite_token, -- Keep token for reference if needed
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

-- Re-apply the trigger (ensure it points to the updated function)
-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS notify_user_on_invite ON public.invites;

-- Create the trigger
CREATE TRIGGER notify_user_on_invite
AFTER INSERT ON public.invites
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.handle_new_invite_notification();

COMMIT; 