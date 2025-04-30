-- Function to link pending invites when a user signs up
CREATE OR REPLACE FUNCTION public.link_pending_invites_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the new user has an email (should always be true for Supabase auth)
  IF NEW.email IS NOT NULL THEN
    -- Update any pending invites matching the new user's email
    -- Set invited_user_id to the new user's ID where it was previously NULL
    UPDATE public.invites
    SET invited_user_id = NEW.id
    WHERE
      invites.invited_email = NEW.email AND
      invites.invited_user_id IS NULL AND
      invites.status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function to authenticated users (or necessary roles)
-- This might not be strictly needed if only the trigger calls it, but good practice.
GRANT EXECUTE ON FUNCTION public.link_pending_invites_on_signup() TO authenticated;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_link_invites_on_signup ON auth.users;

-- Create the trigger to run after a user is inserted into auth.users
CREATE TRIGGER trigger_link_invites_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.link_pending_invites_on_signup();

COMMENT ON FUNCTION public.link_pending_invites_on_signup() IS 'Automatically links pending invites (where invited_user_id is NULL) to a newly signed-up user based on matching email address.';
COMMENT ON TRIGGER trigger_link_invites_on_signup ON auth.users IS 'Links pending invites to new users upon signup.';
