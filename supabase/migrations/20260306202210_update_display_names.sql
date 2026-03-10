-- Add minimum_balance to dialectic_stages (idempotent).
ALTER TABLE public.dialectic_stages
  ADD COLUMN IF NOT EXISTS minimum_balance INTEGER NOT NULL DEFAULT 0;

-- Update display_name, description, and minimum_balance for each stage (safe to re-run).
UPDATE public.dialectic_stages
SET display_name = 'Proposal',
    description = 'Generate initial, diverse proposals for your project.',
    minimum_balance = 100000
WHERE slug = 'thesis';

UPDATE public.dialectic_stages
SET display_name = 'Review',
    description = 'Review the initial proposals and suggest improvements.',
    minimum_balance = 200000
WHERE slug = 'antithesis';

UPDATE public.dialectic_stages
SET display_name = 'Refinement',
    description = 'Combine the original idea and its improvements into a single revised vision.',
    minimum_balance = 400000
WHERE slug = 'synthesis';

UPDATE public.dialectic_stages
SET display_name = 'Planning',
    description = 'Turn the vision into a well defined high-level, end-to-end plan.',
    minimum_balance = 150000
WHERE slug = 'parenthesis';

UPDATE public.dialectic_stages
SET display_name = 'Implementation',
    description = 'Finalize the high-level plan into a detailed, ready-to-implement work plan.',
    minimum_balance = 150000
WHERE slug = 'paralysis';
