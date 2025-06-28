-- Migration: Create notifications table
-- Timestamp: 20250422100000 (Example timestamp)

-- Create the notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  data JSONB NULL,              -- Stores context: target_path, org_id, requesting_user_id, membership_id etc.
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Foreign Key constraint referencing auth.users
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add comments for clarity
COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users.';
COMMENT ON COLUMN public.notifications.user_id IS 'The user who should receive the notification.';
COMMENT ON COLUMN public.notifications.type IS 'Categorizes the notification (e.g., ''join_request'', ''invite_sent'').';
COMMENT ON COLUMN public.notifications.data IS 'JSONB payload containing contextual data for the notification (e.g., target link, related entity IDs).';
COMMENT ON COLUMN public.notifications.read IS 'Indicates whether the user has read the notification.';

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON public.notifications(user_id, read);

-- Enable Row Level Security (RLS) on the new table
-- Policies will be added in a separate step/migration (Step 1.2).
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY; 