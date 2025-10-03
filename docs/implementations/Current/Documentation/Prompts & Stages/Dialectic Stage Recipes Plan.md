```sql
Table: dialectic_stage_recipes
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  recipe_name             text NOT NULL                                  -- e.g. 'thesis_v1'
  step_version            integer NOT NULL DEFAULT 1                     -- per-step revision
  step_number             integer NOT NULL                               -- execution order within recipe (parallel steps share the same value)
  parallel_group          integer                                        -- flag what parallel_group parallel steps belong to, can be null if it's not a parallel step
  branch_key              text                                           -- indicates which document_key the branch generates
  step_slug               text NOT NULL                                  -- e.g. 'build-stage-header'
  step_name               text NOT NULL
  step_description        text NULL                                      -- migrate purpose/explanations here
  job_type                text NOT NULL                                  -- 'PLAN' | 'EXECUTE' | 'RENDER'
  prompt_type             text NOT NULL                                  -- 'Planner' | 'Turn' | ...
  prompt_template_id      uuid NOT NULL REFERENCES system_prompts (id)
  output_type             text NOT NULL                                  -- 'HeaderContext', 'Manifest', ...
  granularity_strategy    text NOT NULL                                  -- 'all_to_one', 'one_to_one', ...
  inputs_required         jsonb NOT NULL DEFAULT '[]'::jsonb              -- ranked inputs with document keys
  inputs_relevance        jsonb NOT NULL DEFAULT '[]'::jsonb              -- ordered list of {document_key, relevance}
  outputs_required        jsonb NOT NULL DEFAULT '[]'::jsonb              -- see structure below
  is_active               boolean NOT NULL DEFAULT true
  created_at              timestamptz NOT NULL DEFAULT now()
  updated_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  CHECK (step_number > 0)
  CHECK (jsonb_typeof(inputs_required) = 'array')
  CHECK (jsonb_typeof(inputs_relevance) = 'array')
  CHECK (jsonb_typeof(outputs_required) = 'array')
  UNIQUE (recipe_name, step_slug, step_version)
  UNIQUE (recipe_name, id)
  UNIQUE (recipe_name, step_number, step_slug) WHERE is_active = true
------------------------------------------------------------------------------------

Table: dialectic_stage_recipe_edges
------------------------------------------------------------------------------------
  recipe_name             text NOT NULL
  from_step_id            uuid NOT NULL REFERENCES dialectic_stage_recipes (id)
  to_step_id              uuid NOT NULL REFERENCES dialectic_stage_recipes (id)
  PRIMARY KEY (recipe_name, from_step_id, to_step_id)
  FOREIGN KEY (recipe_name, from_step_id) REFERENCES dialectic_stage_recipes (recipe_name, id)
  FOREIGN KEY (recipe_name, to_step_id)   REFERENCES dialectic_stage_recipes (recipe_name, id)
------------------------------------------------------------------------------------

Inputs schema (migrated from dialectic_stages.input_artifact_rules + new document keys): // this is an example, not a real concrete instance 
{
  "sources": [
    {
      "type": "document" | "feedback" | "header_context",
      "stage_slug": "thesis",
      "document_key": "business_case" | "*" | ...,
      "required": true,
      "multiple": true,
      "section_header": "--- Proposals from Thesis Stage ---",
      "purpose": "AI-generated proposals from the Thesis stage."
    }
  ]
}

Inputs relevance schema (new):
[
  {
    "document_key": "business_case",
    "type": "document",
    "relevance": 1.0            -- float 0-1 indicating priority for RAG ordering
  },
  {
    "document_key": "business_case",
    "type": "feedback",
    "relevance": 0.7
  },
  {
    "document_key": "feature_spec",
    "type": "document",
    "relevance": 0.9
  },
  {
    "document_key": "feature_spec",
    "type": "feedback",
    "relevance": 0.6
  },
  {
    "document_key": "technical_approach",
    "type": "document",
    "relevance": 0.85
  },
  {
    "document_key": "technical_approach",
    "type": "feedback",
    "relevance": 0.55
  },
  {
    "document_key": "success_metrics",
    "type": "document",
    "relevance": 0.6
  }
]

Outputs schema (migrated from expected_output_artifacts_json): // this is an example, not a real concrete instance 
{
  "documents": [
    {
      "type": "header_context",
      "document_key": "header_context",
      "context_for_documents": [
        {
          "document_key": "business_case",
          "context_to_include": { ... }
        },
        {
          ... list all documents that need context...
        }
      ]
    }
  ]
}

Notes:
- `dialectic_stages` gains a `recipe_name` column so each stage selects the recipe it wants to execute. Recipe steps remain stage-agnostic; no stage foreign key is stored on this table.
- Versioning: when a step is revised, insert a new row with the same `recipe_name` + `step_number`, increment `step_version`, mark the old row `is_active = false`, and rewire `next_step_id` / `previous_step_id` as needed. Those linkage columns always represent operational order, not historical lineage.
- Every seed prompt consumption must appear explicitly in `inputs_required` (type `seed_prompt`, document key `seed_prompt`). No extra boolean flag is stored.
- Every header_context production must appear explicitly in `outputs_required` (type `header_context`, document key `header_context`). No extra boolean flag is stored. 
- During migration, values from `input_artifact_rules.sources[]` move into `inputs_required` with document keys from the stage worksheets; `expected_output_artifacts_jsonb` from the payload migrates into `outputs_required`.
- `inputs_relevance` drives prompt-assembly ordering: store each referenced document once with a normalized float between 0 and 1 so the RAG layer can prioritize what to include, compress, or drop when token windows are tight. Stages without an override can fall back to defaults (empty array).
- Prompt templates remain in `system_prompts.prompt_template_id`.
- `recipe_name` identifiers must be concrete (e.g., `synthesis_v1`, `parenthesis_v2`); there is no “default” recipe.
- `dialectic_stage_recipes` now handles all stages; `dialectic_stages` no longer needs `input_artifact_rules` or `expected_output_artifacts` columns, `expected_output_artifacts_jsonb` can be removed from the payload types since it is now implicit.
- `dialectic_stages` needs a `recipe_name` column so each stage selects the recipe it wants to execute.
- Parallel fan-out/fan-in is modeled by inserting multiple edge rows; no scalar `next_step_id` / `previous_step_id` columns are needed.
-- Parallel steps are described using n.[a-z]. 
- Worker orchestration determines readiness by checking that every `from_step_id` in the edges table has completed for a given `to_step_id`.
- The rest of the plan (inputs/outputs schema, versioning rules, seed prompt linkage) remains unchanged.
```