ALTER TABLE public.dialectic_contributions
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dialectic_contributions.user_id IS 'Identifier of the user who made this contribution (if it\''s a user edit or original prompt)';

CREATE INDEX idx_dialectic_contributions_user_id
ON public.dialectic_contributions (user_id);

CREATE INDEX idx_dialectic_contributions_model_id
ON public.dialectic_contributions (model_id);
