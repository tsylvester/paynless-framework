-- Add trigger to prevent changing user_id or organization_id on chats table updates

-- Trigger function definition
CREATE OR REPLACE FUNCTION public.enforce_chat_update_restrictions()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user_id is being changed
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Changing the user_id of a chat is not allowed.';
  END IF;

  -- Check if organization_id is being changed (handles NULLs correctly)
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Changing the organization_id of a chat is not allowed.';
  END IF;

  -- If checks pass, allow the update
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Note: SECURITY INVOKER is default and appropriate here, trigger runs as user performing update.

-- Trigger definition
CREATE TRIGGER enforce_chat_update_restrictions
  BEFORE UPDATE ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_chat_update_restrictions();

-- Note: DOWN migration logic omitted as per project pattern.
-- To reverse manually:
-- DROP TRIGGER IF EXISTS enforce_chat_update_restrictions ON public.chats;
-- DROP FUNCTION IF EXISTS public.enforce_chat_update_restrictions();
