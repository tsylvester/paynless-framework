-- Migration: Add RLS policies for notifications table
-- Timestamp: 20250422103000 (Example timestamp)

-- Policy: Users can read their own notifications
CREATE POLICY "Allow user SELECT access to their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can update the 'read' status of their own notifications
-- Note: This allows updating ANY column for owned rows.
-- If we need to restrict ONLY to the 'read' column, it requires more complex trigger logic
-- or restricting update permissions at the API layer. For now, allowing full row update for owners.
CREATE POLICY "Allow user UPDATE access for their own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id); -- Redundant check, but good practice

-- Note: We are intentionally NOT adding INSERT or DELETE policies for users
-- as notifications will be created by backend triggers/functions.

-- Grant permissions for the policies to authenticated users
-- (Adjust role if using something other than 'authenticated')
ALTER TABLE public.notifications OWNER TO postgres; -- Ensure postgres owns the table

GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE ON public.notifications TO authenticated;
-- No GRANT INSERT or DELETE for 'authenticated' role based on current plan.

-- Example of how to check policies:
-- SET ROLE authenticated; -- Switch to the user role
-- SELECT * FROM public.notifications; -- Should only return rows where user_id = current_user's auth.uid()
-- UPDATE public.notifications SET read = true WHERE id = <some_notification_id>; -- Should only succeed if user_id = auth.uid()
-- RESET ROLE; -- Switch back to admin/postgres 