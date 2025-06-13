-- Attempt to drop the constraint if it exists, to make the script idempotent
ALTER TABLE public.dialectic_contributions
DROP CONSTRAINT IF EXISTS dialectic_contributions_user_id_fkey;

-- Add the foreign key constraint for user_id to auth.users
ALTER TABLE public.dialectic_contributions
ADD CONSTRAINT dialectic_contributions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users (id)
ON DELETE SET NULL;

-- Drop the model_version_details column as it's not in the plan
ALTER TABLE public.dialectic_contributions
DROP COLUMN IF EXISTS model_version_details; 