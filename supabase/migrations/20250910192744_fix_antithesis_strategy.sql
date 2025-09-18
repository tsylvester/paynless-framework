-- Add the missing recipe for the 'antithesis' stage
UPDATE public.dialectic_stages
SET
    input_artifact_rules = COALESCE(input_artifact_rules, '{}'::jsonb) || '{
        "processing_strategy": {
            "type": "task_isolation"
        },
        "steps": [
            {
                "step": 1,
                "name": "Generate Antithesis Critiques",
                "prompt_template_name": "default_critique_prompt",
                "inputs_required": [
                    { "type": "contribution", "stage_slug": "thesis" }
                ],
                "granularity_strategy": "per_source_document_by_lineage",
                "output_type": "antithesis"
            }
        ]
    }'::jsonb
WHERE
    slug = 'antithesis';
