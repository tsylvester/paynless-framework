ALTER TABLE public.dialectic_contributions
DROP COLUMN IF EXISTS cost_usd;

COMMENT ON TABLE public.dialectic_contributions IS 'Stores contributions made during a dialectic session. The cost_usd column has been removed in favor of token-based accounting using tokens_used_input and tokens_used_output.';
