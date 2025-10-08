```sql
Table: dialectic_recipe_templates
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  recipe_name             text NOT NULL                                 -- e.g. 'thesis'
  recipe_version          integer NOT NULL DEFAULT 1
  display_name            text
  domain_key              text
  description             text
  is_active               boolean NOT NULL DEFAULT true
  created_at              timestamptz NOT NULL DEFAULT now()
  updated_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  UNIQUE (recipe_name, recipe_version)
  UNIQUE (recipe_name) WHERE is_active = true
------------------------------------------------------------------------------------

Table: dialectic_recipe_template_steps
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  template_id             uuid NOT NULL REFERENCES dialectic_recipe_templates (id)
  step_number             integer NOT NULL                               -- execution order; parallel steps share a value
  parallel_group          integer                                        -- nullable parallel group identifier
  branch_key              text                                           -- document key lineage hint
  step_key                text NOT NULL                                  -- machine-readable identifier
  step_slug               text NOT NULL
  step_name               text NOT NULL
  step_description        text
  job_type                text NOT NULL                                  -- 'PLAN' | 'EXECUTE' | 'RENDER'
  prompt_type             text NOT NULL                                  -- 'Seed' | 'Planner' | 'Turn' | 'Continuation'
  prompt_template_id      uuid REFERENCES system_prompts (id)
  output_type             text NOT NULL
  granularity_strategy    text NOT NULL
  inputs_required         jsonb NOT NULL DEFAULT '[]'::jsonb
  inputs_relevance        jsonb NOT NULL DEFAULT '[]'::jsonb
  outputs_required        jsonb NOT NULL DEFAULT '[]'::jsonb
  created_at              timestamptz NOT NULL DEFAULT now()
  updated_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  CHECK (step_number > 0)
  CHECK (jsonb_typeof(inputs_required) = 'array')
  CHECK (jsonb_typeof(inputs_relevance) = 'array')
  CHECK (jsonb_typeof(outputs_required) = 'array')
  UNIQUE (template_id, step_key)
  UNIQUE (template_id, step_number, step_key)
------------------------------------------------------------------------------------

Table: dialectic_recipe_template_edges
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  template_id             uuid NOT NULL REFERENCES dialectic_recipe_templates (id)
  from_step_id            uuid NOT NULL REFERENCES dialectic_recipe_template_steps (id)
  to_step_id              uuid NOT NULL REFERENCES dialectic_recipe_template_steps (id)
  created_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  CHECK (from_step_id <> to_step_id)
  UNIQUE (template_id, from_step_id, to_step_id)
------------------------------------------------------------------------------------

Table: dialectic_stage_recipe_instances
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  stage_id                uuid NOT NULL REFERENCES dialectic_stages (id)
  template_id             uuid NOT NULL REFERENCES dialectic_recipe_templates (id)
  is_cloned               boolean NOT NULL DEFAULT false
  cloned_at               timestamptz
  created_at              timestamptz NOT NULL DEFAULT now()
  updated_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  UNIQUE (stage_id)
------------------------------------------------------------------------------------

Table: dialectic_stages (current)
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  slug                    text NOT NULL UNIQUE
  display_name            text NOT NULL
  description             text
  default_system_prompt_id uuid REFERENCES system_prompts (id) ON DELETE SET NULL
  recipe_template_id      uuid REFERENCES dialectic_recipe_templates (id) ON DELETE SET NULL
  active_recipe_instance_id uuid
  expected_output_template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
  created_at              timestamptz NOT NULL DEFAULT now()
  updated_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  FOREIGN KEY (id, active_recipe_instance_id)
    REFERENCES dialectic_stage_recipe_instances (stage_id, id)
    ON DELETE SET NULL
------------------------------------------------------------------------------------

Table: dialectic_stage_recipe_steps
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  instance_id             uuid NOT NULL REFERENCES dialectic_stage_recipe_instances (id)
  template_step_id        uuid REFERENCES dialectic_recipe_template_steps (id)
  step_key                text NOT NULL
  step_slug               text NOT NULL
  step_name               text NOT NULL
  job_type                text NOT NULL
  prompt_type             text NOT NULL
  prompt_template_id      uuid REFERENCES system_prompts (id)
  output_type             text NOT NULL
  granularity_strategy    text NOT NULL
  inputs_required         jsonb NOT NULL DEFAULT '[]'::jsonb
  inputs_relevance        jsonb NOT NULL DEFAULT '[]'::jsonb
  outputs_required        jsonb NOT NULL DEFAULT '[]'::jsonb
  config_override         jsonb NOT NULL DEFAULT '{}'::jsonb
  object_filter           jsonb NOT NULL DEFAULT '{}'::jsonb
  output_overrides        jsonb NOT NULL DEFAULT '{}'::jsonb
  is_skipped              boolean NOT NULL DEFAULT false
  execution_order         integer
  parallel_group          integer
  branch_key              text
  created_at              timestamptz NOT NULL DEFAULT now()
  updated_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  CHECK (jsonb_typeof(inputs_required) = 'array')
  CHECK (jsonb_typeof(inputs_relevance) = 'array')
  CHECK (jsonb_typeof(outputs_required) = 'array')
  UNIQUE (instance_id, step_key)
------------------------------------------------------------------------------------

Table: dialectic_stage_recipe_edges
------------------------------------------------------------------------------------
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  instance_id             uuid NOT NULL REFERENCES dialectic_stage_recipe_instances (id)
  from_step_id            uuid NOT NULL REFERENCES dialectic_stage_recipe_steps (id)
  to_step_id              uuid NOT NULL REFERENCES dialectic_stage_recipe_steps (id)
  created_at              timestamptz NOT NULL DEFAULT now()

Constraints / indexes:
------------------------------------------------------------------------------------
  CHECK (from_step_id <> to_step_id)
  UNIQUE (instance_id, from_step_id, to_step_id)
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
          "content_to_include": { ... }
        },
        {
          ... list all documents that need content...
        }
      ]
    }
  ]
}

Notes:
- Every seed prompt consumption must appear explicitly in `inputs_required` (type `seed_prompt`, document key `seed_prompt`). No extra boolean flag is stored.
- Every header_context production must appear explicitly in `outputs_required` (type `header_context`, document key `header_context`). No extra boolean flag is stored.
- During migration, values from `dialectic_stages.input_artifact_rules` move into `recipe_template_steps.inputs_required` with document keys from the stage worksheets; `expected_output_artifacts_jsonb` migrates into `outputs_required`. Stage rows now capture the canonical rendered deliverables through `expected_output_template_ids (uuid[])`.
- `inputs_relevance` drives prompt-assembly ordering: store each referenced document once with a normalized float so the RAG layer can prioritize what to include, compress, or drop when token windows are tight. Stages without overrides can fall back to defaults (empty array).
- Prompt templates remain referenced via `system_prompts.prompt_template_id`.
- Template identifiers (`recipe_name`, `recipe_version`) are immutable once published; new iterations insert new rows so historic stages retain their original template reference.
- `dialectic_stages` gains `recipe_template_id` (FK to `dialectic_recipe_templates`), `active_recipe_instance_id` (FK to `dialectic_stage_recipe_instances`), and `expected_output_template_ids` while dropping the legacy `input_artifact_rules` and `expected_output_artifacts` payloads.
- Stage fan-out/fan-in continues to rely on DAG edges; multiple edges model parallel execution instead of scalar next/previous columns.
- Worker orchestration determines readiness by checking that every `from_step_id` in the relevant edges table has completed for a given `to_step_id`.
- The rest of the plan (inputs/outputs schema, versioning rules, seed prompt linkage) remains unchanged.
```

## Stage Recipe Persistence Model

To support reusable template recipes today and future user-authored or user-mutated workflows, we persist recipes in two complementary layers:

1. **Template layer (immutable)**
   - `recipe_templates` catalogs canonical recipes with identifiers, version metadata, domain tags, and status flags.
   - `recipe_template_steps` stores per-step definitions (`step_key`, `step_slug`, `job_type`, `prompt_type`, `inputs_required`, `inputs_relevance`, `outputs_required`, `granularity_strategy`).
   - `recipe_template_edges` captures the directed acyclic graph for each template via `(from_step_id, to_step_id)` rows.
   - Publishing a revision inserts new rows; previous versions remain untouched for audit history.

2. **Stage-scoped instance layer (mutable, lazy clone-on-write)**
   - `stage_recipe_instances` links a stage to its selected template (`stage_id`, `template_id`) and tracks whether the template has been cloned (`is_cloned`, `cloned_at`).
   - `stage_recipe_steps` materializes per-stage step copies only when mutation is required. Each row references the seed template step (`template_step_id`) and carries override fields (`config_override`, `object_filter`, `output_overrides`, `is_skipped`, `execution_order`). Custom steps are allowed by leaving `template_step_id` null.
   - `stage_recipe_edges` stores the cloned DAG edges for mutated instances.

### Linking stages to recipes

- `dialectic_stages` gains two foreign keys: `recipe_template_id` → `recipe_templates` and `active_recipe_instance_id` → `stage_recipe_instances`.
- Stage transitions continue to reference `dialectic_stages`; no changes are required to the transition list.
- Worker orchestration resolves the DAG by:
  1. Fetching the stage’s `active_recipe_instance_id`.
  2. If `is_cloned = false`, reading from `recipe_template_steps` / `recipe_template_edges`.
  3. If `is_cloned = true`, reading from `stage_recipe_steps` / `stage_recipe_edges`.
  4. Executing steps in dependency order and persisting artifacts that reference template or cloned step IDs for provenance.

### Extension points

- Materialized execution plans (per-run snapshots) can be introduced later without schema refactors by denormalizing from the instance layer.
- User-authored recipes simply insert new `recipe_templates` rows; optional tooling can pre-seed template steps and edges prior to cloning.
- Migration tooling can rebase stages onto newer template versions by cloning into fresh instances, switching `active_recipe_instance_id`, and retaining previous instances for audit logs.

## Operational Notes

### Recommended Indexes

- `dialectic_recipe_template_steps (template_id, step_number)` — primary ordering lookup during non-cloned execution.
- `dialectic_recipe_template_edges (template_id, from_step_id)` — planner traversal and cycle validation.
- `dialectic_stage_recipe_instances (stage_id, is_cloned)` — fast resolution of execution mode.
- `dialectic_stage_recipe_steps (instance_id, execution_order) WHERE is_skipped = false` — locating ready steps in cloned instances.
- `dialectic_stage_recipe_edges (instance_id, from_step_id)` — predecessor resolution in cloned graphs.

### DAG Invariants

- Both template and instance edge tables must remain acyclic. Cycle detection occurs in application logic prior to inserting or mutating edges; workers assume a valid DAG.
- Existing `CHECK (from_step_id <> to_step_id)` constraints prevent trivial self-cycles.

### Clone-on-Write Workflow

1. Stage created → insert `dialectic_stage_recipe_instances` with `is_cloned = false`; no rows exist in instance steps/edges.
2. When a mutation is requested (skip, filter, override, custom step):
    ```sql
    BEGIN;
      -- copy template steps
      INSERT INTO dialectic_stage_recipe_steps (instance_id, template_step_id, step_key, step_slug, step_name,
        job_type, prompt_type, prompt_template_id, output_type, granularity_strategy,
        inputs_required, inputs_relevance, outputs_required, parallel_group, branch_key, execution_order)
      SELECT :instance_id, ts.id, ts.step_key, ts.step_slug, ts.step_name,
             ts.job_type, ts.prompt_type, ts.prompt_template_id, ts.output_type, ts.granularity_strategy,
             ts.inputs_required, ts.inputs_relevance, ts.outputs_required, ts.parallel_group, ts.branch_key, ts.step_number
      FROM dialectic_recipe_template_steps ts
      WHERE ts.template_id = :template_id;

      -- copy template edges
      INSERT INTO dialectic_stage_recipe_edges (instance_id, from_step_id, to_step_id)
      SELECT :instance_id, step_map.from_id, step_map.to_id
      FROM (
        SELECT te.from_step_id, te.to_step_id,
               (SELECT s.id FROM dialectic_stage_recipe_steps s WHERE s.instance_id = :instance_id AND s.template_step_id = te.from_step_id) AS from_id,
               (SELECT s.id FROM dialectic_stage_recipe_steps s WHERE s.instance_id = :instance_id AND s.template_step_id = te.to_step_id)   AS to_id
        FROM dialectic_recipe_template_edges te
        WHERE te.template_id = :template_id
      ) step_map;

      -- apply mutations (example)
      UPDATE dialectic_stage_recipe_steps SET is_skipped = true WHERE instance_id = :instance_id AND step_key = ANY(:skipped_keys);

      UPDATE dialectic_stage_recipe_instances SET is_cloned = true, cloned_at = now() WHERE id = :instance_id;
    COMMIT;
    ```

### Worker Orchestration (Pseudocode)

```python
def get_ready_steps(stage_id):
    instance = fetch_instance(stage_id)

    if not instance.is_cloned:
        return query_template_steps(instance.template_id, stage_id)
    else:
        return query_instance_steps(instance.id)


def query_template_steps(template_id, stage_id):
    return sql("""
        SELECT ts.*
        FROM dialectic_recipe_template_steps ts
        WHERE ts.template_id = :template_id
          AND NOT EXISTS (
                SELECT 1
                FROM dialectic_recipe_template_edges te
                JOIN dialectic_recipe_template_steps pred ON te.from_step_id = pred.id
                WHERE te.template_id = :template_id
                  AND te.to_step_id = ts.id
                  AND pred.id NOT IN (
                        SELECT completed.template_step_id
                        FROM worker_completed_steps completed
                        WHERE completed.stage_id = :stage_id
                  )
          )
        ORDER BY ts.step_number
    """, template_id=template_id, stage_id=stage_id)


def query_instance_steps(instance_id):
    return sql("""
        SELECT s.*
        FROM dialectic_stage_recipe_steps s
        WHERE s.instance_id = :instance_id
          AND s.is_skipped = false
          AND NOT EXISTS (
                SELECT 1
                FROM dialectic_stage_recipe_edges e
                JOIN dialectic_stage_recipe_steps pred ON e.from_step_id = pred.id
                WHERE e.instance_id = :instance_id
                  AND e.to_step_id = s.id
                  AND pred.id NOT IN (
                        SELECT completed.stage_step_id
                        FROM worker_completed_steps completed
                        WHERE completed.instance_id = :instance_id
                  )
          )
        ORDER BY COALESCE(s.execution_order, 0), s.created_at
    """, instance_id=instance_id)
```

### Consistency Guards

- Application must ensure `stage_recipe_steps.template_step_id`, when not null, references a template step belonging to the same `template_id` as the instance. Documented invariant helps detect cloning bugs.
- Consider deferred `CHECK` constraints to enforce the above if runtime cost is acceptable.

### Column Semantics

- `job_type`: one of `PLAN`, `EXECUTE`, `RENDER`.
- `prompt_type`: one of `Seed`, `Planner`, `Turn`, `Continuation`.
- `granularity_strategy`: `PerDocument`, `PerObject`, `Aggregate`, or `SinglePass` (documented for future enum/constraint work).
- `parallel_group`: null for sequential steps; matching integers denote steps that can execute concurrently.
- `branch_key`: lineage hint for document forks (e.g., `business_case`, `comparison_vector`).

### Migration Safety Checklist

1. **Pre-flight**
   - Snapshot existing `dialectic_stages.input_artifact_rules` and `expected_output_artifacts_jsonb`.
   - Identify canonical recipes and stage counts per recipe.
2. **Schema deploy**
   - Create template and instance tables plus indexes.
   - Backfill `recipe_templates` and `recipe_template_steps` from documented worksheets.
   - Create `stage_recipe_instances` rows with `is_cloned = false` and set `dialectic_stages.recipe_template_id`.
3. **Code deploy**
   - Update worker/services to read from template layer when `is_cloned = false`.
   - Monitor execution for discrepancies; keep legacy columns intact for rollback.
4. **Post-validation**
   - After stability window, drop legacy columns and run consistency audit.
5. **Rollback (within window)**
   - Revert code to legacy readers; stage data remains untouched because old columns were preserved.