-- Migration to add dedicated RPC functions for transaction control

-- Function to begin a transaction
-- Using LANGUAGE sql for direct execution of the BEGIN command.
-- Note: Transaction control commands like BEGIN/COMMIT/ROLLBACK are tricky
-- inside functions. For simple RPC wrappers, LANGUAGE sql executing the command
-- is often the most straightforward if the database version and RPC mechanism support it.
-- If this still causes issues, the alternative is that the RPC client itself
-- must be configured/able to send raw BEGIN/ROLLBACK commands directly,
-- bypassing the need for these wrapper functions.
DROP FUNCTION IF EXISTS public.begin_transaction(); -- Drop if exists to ensure clean apply
CREATE FUNCTION public.begin_transaction()
RETURNS TEXT -- Return a simple text confirmation
LANGUAGE sql
AS $$
BEGIN; -- This is the SQL BEGIN command
SELECT 'Transaction started'; -- Return a value
$$;

-- Function to rollback a transaction
DROP FUNCTION IF EXISTS public.rollback_transaction(); -- Drop if exists
CREATE FUNCTION public.rollback_transaction()
RETURNS TEXT -- Return a simple text confirmation
LANGUAGE sql
AS $$
ROLLBACK; -- This is the SQL ROLLBACK command
SELECT 'Transaction rolled back'; -- Return a value
$$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION public.begin_transaction() TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_transaction() TO service_role;
