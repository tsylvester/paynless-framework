-- Drop the previously defined foreign key constraint if it exists
ALTER TABLE public.dialectic_contributions
DROP CONSTRAINT IF EXISTS fk_dialectic_contributions_source_contribution_id;

-- Drop the previously defined column if it exists
ALTER TABLE public.dialectic_contributions
DROP COLUMN IF EXISTS source_contribution_id;

-- Add the new flexible jsonb column for storing document relationships
ALTER TABLE public.dialectic_contributions
ADD COLUMN document_relationships JSONB NULL;

-- Add a comment to explain the purpose of the new column
COMMENT ON COLUMN public.dialectic_contributions.document_relationships IS 
'Stores relationships to other contributions, e.g., {"source": "uuid", "references": ["uuid1", "uuid2"]}. This replaces the overloaded use of target_contribution_id for derivative works and provides a flexible structure for complex, data-driven recipes.';