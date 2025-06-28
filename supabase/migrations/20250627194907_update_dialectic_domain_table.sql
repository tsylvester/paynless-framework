-- Add the is_enabled column to dialectic_domains
ALTER TABLE public.dialectic_domains
ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Disable all domains by default
UPDATE public.dialectic_domains SET is_enabled = FALSE;

-- Enable the "Software Development" domain
UPDATE public.dialectic_domains
SET is_enabled = TRUE
WHERE name = 'Software Development';

-- Drop the existing policy for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to read domains" ON public.dialectic_domains;

-- Create a new policy to allow anonymous users to read enabled domains
CREATE POLICY "Allow anonymous users to read enabled domains"
ON public.dialectic_domains
FOR SELECT
TO anon, authenticated
USING (is_enabled = TRUE);
