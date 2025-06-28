-- Migration 20250627000000_fix_user_deletion_constraints.sql

-- 1. Fix dialectic_project_resources.user_id foreign key
-- Drop the existing constraint
-- The original constraint might not have a user-defined name if added directly in CREATE TABLE without a name.
-- We need to find its system-generated name or drop by column reference if possible (though standard SQL is by name).
-- Assuming the default name pattern or that it was named 'dialectic_project_resources_user_id_fkey' previously.
-- If this DROP fails due to name, it will need to be looked up in pg_catalog.pg_constraint.
ALTER TABLE public.dialectic_project_resources
DROP CONSTRAINT IF EXISTS dialectic_project_resources_user_id_fkey;

-- Add the constraint back with ON DELETE CASCADE
ALTER TABLE public.dialectic_project_resources
ADD CONSTRAINT dialectic_project_resources_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users (id)
ON DELETE CASCADE;


-- 2. Fix payment_transactions.user_id foreign key
-- The user_id column in payment_transactions is nullable.
-- The original CREATE TABLE statement did not specify an ON DELETE action for its FK to auth.users.
-- We will add/re-add the constraint with ON DELETE SET NULL.

-- Drop existing constraint if it was named (e.g., payment_transactions_user_id_fkey)
-- or if it has a system-generated name.
ALTER TABLE public.payment_transactions
DROP CONSTRAINT IF EXISTS payment_transactions_user_id_fkey;

-- Add the constraint with ON DELETE SET NULL (column is already nullable)
ALTER TABLE public.payment_transactions
ADD CONSTRAINT payment_transactions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users (id)
ON DELETE SET NULL;

COMMENT ON COLUMN public.dialectic_project_resources.user_id IS 'FK to auth.users.id. Cascades on user deletion.';
COMMENT ON COLUMN public.payment_transactions.user_id IS 'User initiating the payment. FK to auth.users.id. Sets to NULL on user deletion.'; 