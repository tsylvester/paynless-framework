-- Add last_selected_org_id column to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN last_selected_org_id UUID NULL;

-- Add foreign key constraint
ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_last_selected_org_id_fkey
FOREIGN KEY (last_selected_org_id)
REFERENCES public.organizations(id)
ON DELETE SET NULL; -- Or ON DELETE RESTRICT, depending on desired behavior if an org is deleted

-- Optional: Add an index
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_selected_org_id
ON public.user_profiles(last_selected_org_id);

COMMENT ON COLUMN public.user_profiles.last_selected_org_id IS 'Stores the ID of the last organization selected by the user in the UI.';
