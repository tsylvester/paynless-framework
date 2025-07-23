ALTER TABLE public.notifications
ADD COLUMN title TEXT,
ADD COLUMN message TEXT,
ADD COLUMN link_path TEXT,
ADD COLUMN is_internal_event BOOLEAN NOT NULL DEFAULT FALSE;

-- Drop the old, ambiguous function signature
DROP FUNCTION IF EXISTS public.create_notification_for_user(UUID, TEXT, JSONB);

-- Update the RPC function to handle the new columns
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  p_target_user_id UUID,
  p_notification_type TEXT,
  p_notification_data JSONB,
  p_title TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_link_path TEXT DEFAULT NULL,
  p_is_internal_event BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.notifications (
    user_id,
    type,
    data,
    title,
    message,
    link_path,
    is_internal_event
  )
  VALUES (
    p_target_user_id,
    p_notification_type,
    p_notification_data,
    p_title,
    p_message,
    p_link_path,
    p_is_internal_event
  );
END;
$$;
