-- Alter the type of model_id in dialectic_session_models to UUID
ALTER TABLE public.dialectic_session_models
ALTER COLUMN model_id TYPE UUID USING model_id::uuid;

-- Add the foreign key constraint to ai_providers
ALTER TABLE public.dialectic_session_models
ADD CONSTRAINT fk_model_id_to_ai_providers
FOREIGN KEY (model_id)
REFERENCES public.ai_providers(id)
ON DELETE RESTRICT; -- Or CASCADE, depending on desired behavior when an ai_provider is deleted. RESTRICT is safer for now.

COMMENT ON COLUMN public.dialectic_session_models.model_id IS 'Foreign key to the ai_providers table, identifying the AI model.'; 