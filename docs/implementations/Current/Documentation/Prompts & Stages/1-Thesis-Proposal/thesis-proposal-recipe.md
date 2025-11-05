# Stage: Thesis (`thesis`)

## Stage File Structure (Target)
{stage}/
  _work/
    prompts/
      [{model_slug}_{n}_continuation_{c}_]{stage}_{step_name}_prompt.md 
            // Only continuation prompts are unique to a model, so if it needs to continue, it needs the model_slug too. And because the same model can be called more than once within the same stage, they need the iterator {n} to uniquely determine which iteration of the model the prompt is for. 
      [{model_slug}_{n}_continuation_{c}_]{stage}_{document_key}_prompt.md 
            // Only continuation prompts are unique to a model, so if it needs to continue, it needs the model_slug too.And because the same model can be called more than once within the same stage, they need the iterator {n} to uniquely determine which iteration of the model the prompt is for.
    context/
      {model_slug}_{n}[_{stage}]_header_context.json
    assembled_json/
      {model_slug}_{n}_{step_name}_{lineage_key}[_{match_key}].json 
            // The optional match_key value is for when model_slug is looking at a document that began with lineage_key and was touched by match_key. 
      {model_slug}_{n}_{stage}_manifest.json
  raw_responses/
    {model_slug}_{n}_{stage}_{step_name}[_continuation_{c}]_raw.json 
            // The continuation key and its count value are optional and only used in a continuation. 
    {model_slug}_{n}_{stage}_{document_key}[_continuation_{c}]_raw.json 
            // The continuation key and its count value are optional and only used in a continuation. 
  documents/
    {model_slug}_{n}_{stage}_{document_key}.md
  user_feedback/
    {model_slug}_{n}_{document_key}_feedback.md
  seed_prompt.md  (bootstrap artifact; never sent directly to the model)

*File-naming guidelines*
- All model-generated filenames encode `{model_slug}` and `{n}` (model iterator, for when the same model is used n times within the stage) to avoid collisions without random suffixes.
- Step artifacts `{lineage_key}` (original model) / `{match_key}` (last model) tokens so recipe inputs can reference `{step_name}_{document_key}` deterministically.
- The `header_context[_{step_name}].json` structure ensures that the initial header_context file has a stable name, and any additional header_context files are named for the step that produces (not consumes) them.
- Per-document user feedback replaces the older monolithic `user_feedback_{stage}.md` file.

- Template Source Files:
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for thesis)
  - `Prompt Templating Examples.md` (Thesis section)
  - `dialectic_stage_recipes` thesis recipe migration (if present)

# Current State

- Stage metadata (from latest seed/migration snapshot):
  - `stage_slug`: `thesis`
  - `display_name`: `Thesis`
  - `default_system_prompt_id`: `dialectic_thesis_base_v1`
  - No dedicated `dialectic_stage_recipes` table exists yet; recipe information is implicitly encoded in `dialectic_stages` payload columns.
- `input_artifact_rules` (as stored today):
```json
{
  "sources": [
    {
      "type": "seed_prompt",
      "stage_slug": "thesis",
      "required": true,
      "purpose": "Seeds the initial proposal planning with user input and overlays"
    }
  ]
}
```
- `expected_output_artifacts` (current JSON from stage payload):
```json
{
  "system_materials": {
    "executive_summary": "outline/index of all outputs in this response and how they connect to the objective",
    "input_artifacts_summary": "brief, faithful summary of user prompt and referenced materials",
    "stage_rationale": "why these choices align with constraints, standards, and stakeholder needs",
    "progress_update": "for continuation turns, summarize what is complete vs remaining; omit on first turn",
    "validation_checkpoint": [
      "requirements addressed",
      "best practices applied",
      "feasible & compliant",
      "references integrated"
    ],
    "quality_standards": [
      "security-first",
      "maintainable",
      "scalable",
      "performance-aware"
    ],
    "diversity_rubric": {
      "prefer_standards_when": "meet constraints, well-understood by team, minimize risk/time-to-market",
      "propose_alternates_when": "materially improve performance, security, maintainability, or total cost under constraints",
      "if_comparable": "present 1-2 viable options with concise trade-offs and a clear recommendation"
    }
  },
  "documents": [
    {
      "document_key": "business_case",
      "template_filename": "thesis_business_case.md",
      "content_to_include": {
        "market_opportunity": "placeholder",
        "user_problem_validation": "placeholder",
        "competitive_analysis": "placeholder"
      }
    },
    {
      "document_key": "mvp_feature_spec_with_user_stories",
      "template_filename": "thesis_mvp_feature_spec.md",
      "content_to_include": [
        {
          "feature_name": "placeholder",
          "user_stories": ["As a <role>, I want <goal> so that <reason>."]
        }
      ]
    },
    {
      "document_key": "high_level_technical_approach_overview",
      "template_filename": "thesis_technical_approach_overview.md",
      "content_to_include": "architecture, components, data, deployment, sequencing"
    },
    {
      "document_key": "success_metrics",
      "template_filename": "thesis_success_metrics.md",
      "content_to_include": ["placeholder metric 1", "placeholder metric 2"]
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "thesis_product_requirements_document.md",
      "from_document_key": "mvp_feature_spec_with_user_stories"
    },
    {
      "template_filename": "thesis_implementation_plan_proposal.md",
      "from_document_key": "high_level_technical_approach_overview"
    }
  ]
}
```

- Stage overlays (current `domain_specific_prompt_overlays` entry for Thesis / Software Development domain — seeded in `20250613190311_domains_and_processes_improvement.sql`):
```json
{
  "role": "senior product strategist and technical architect",
  "stage_instructions": "establish the initial, comprehensive baseline; consider distinct perspectives that complement or improve standard practices; recommend the common approach when it clearly meets constraints and provides a superior benefit-cost profile versus alternatives;",
  "style_guide_markdown": "<Style Guide excerpt injected via seed; see StyleGuide.md §§1, 2.b, 3, 8, 9.b>",
  "expected_output_artifacts_json": { "system_materials": { ... }, "documents": [ ... ], "files_to_generate": [ ... ] }
}
```
- Application: When assembling the Seed Prompt (and downstream planner/turn prompts), the overlay merges into the base template to supply the stage role, stage instructions, style guide excerpt, and the `expected_output_artifacts_json` structure shown above.

## Seed Prompt Dependency
- Seed prompt artifact is saved at `{stage}/seed_prompt.md` (per stage file structure) when the stage begins.
- Planner Step 1 (`thesis_planner_header_v1`) consumes this seed prompt and emits `context/header_context.json` according to the schema detailed below.
- Turn steps read `context/header_context.json`; additional header context files follow the `{stage}/context/header_context_{step_slug}.json` convention if future planner steps produce more context.
- Storage conventions for generated documents and assembled JSON artifacts follow the `_work/prompts`, `assembled_json`, and `documents` layout defined in the Stage File Structure.

- `system_prompts` rows currently referenced for Thesis (seeded via migrations):
  - `dialectic_thesis_base_v1` (seed prompt template; stored in migration `20250613190311_domains_and_processes_improvement.sql`)
  - Additional planner/turn templates are not yet separated; only the base seed template exists in migrations.
- **Type guard gap:** existing TypeScript payload/step_info types do not include `parallel_group`, `branch_key`, or differentiated planner metadata; these must be added during the transform step.

# Target State

## Recipe: `thesis_v1`
- **Recipe Description:** Initial proposal generation producing the baseline business, product, and technical artifacts.
- **Steps Count:** 2 sequential stages (Step 1 planner, Step 2 fan-out into four parallel document turns)

### Step 1: Build Stage Header
- **Objective:** Produce the proposal `HeaderContext` describing required documents, alignment principles, and reference pointers.
- **Prompt Type:** `Planner`
- **Prompt Template Name:** `thesis_planner_header_v1` *(new template – to be authored)*
- **Input Source References:**
- `seed_prompt` (type `seed_prompt`, stage `thesis`, required)
- **Output Artifact Description:** `header_context.json` containing the schema defined below.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 1,
  "step_slug": "build-stage-header",
  "job_type": "PLAN",
  "name": "Build Stage Header",
  "prompt_template_id": "<system_prompts.id for thesis_planner_header_v1>",
  "prompt_type": "Planner",
  "inputs_required": [
    {
      "type": "seed_prompt",
      "stage_slug": "thesis",
      "document_key": "seed_prompt",
      "required": true
    }
  ],
  "inputs_relevance": [
    { "document_key": "seed_prompt", "relevance": 1.0 }
  ],
  "output_type": "HeaderContext",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "system_materials": {
    "executive_summary": "outline/index of all outputs in this response and how they connect to the objective",
    "input_artifacts_summary": "brief, faithful summary of user prompt and referenced materials",
    "stage_rationale": "why these choices align with constraints, standards, and stakeholder needs",
    "progress_update": "for continuation turns, summarize what is complete vs remaining; omit on first turn",
    "validation_checkpoint": [
      "requirements addressed",
      "best practices applied",
      "feasible & compliant",
      "references integrated"
    ],
    "quality_standards": [
      "security-first",
      "maintainable",
      "scalable",
      "performance-aware"
    ],
    "diversity_rubric": {
      "prefer_standards_when": "meet constraints, well-understood by team, minimize risk/time-to-market",
      "propose_alternates_when": "materially improve performance, security, maintainability, or total cost under constraints",
      "if_comparable": "present 1-2 viable options with concise trade-offs and a clear recommendation"
    }
  },
  "header_context_artifact": {
    "type": "header_context",
    "document_key": "header_context",
    "artifact_class": "header_context",
    "file_type": "json"
  },
  "context_for_documents": [
    {
      "document_key": "business_case",
      "content_to_include": {
        "market_opportunity": "",
        "user_problem_validation": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": "",
        "weaknesses": "",
        "opportunities": "",
        "threats": "",
        "next_steps": ""
      }
    },
    {
      "document_key": "feature_spec",
      "content_to_include": [
        {
          "feature_name": "",
          "user_stories": []
        }
      ]
    },
    {
      "document_key": "technical_approach",
      "content_to_include": {
        "architecture": "",
        "components": "",
        "data": "",
        "deployment": "",
        "sequencing": ""
      }
    },
    {
      "document_key": "success_metrics",
      "content_to_include": {
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": "",
        "leading_indicators": "",
        "lagging_indicators": "",
        "guardrails": "",
        "measurement_plan": "",
        "risk_signals": "",
        "next_steps": "",
        "data_sources": [],
        "reporting_cadence": ""
      }
    }
  ]
}
```

### Step 2a: Generate Business Case (parallel)
- **Objective:** Produce the business case document with market, problem, and competitive analysis.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `thesis_business_case_turn_v1` *(new template – to be authored)*
- **Input Source References:**
- `header_context` (type `header_context`, stage `thesis`, required)
- **Output Artifact Description:** Renders `business_case` document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-business-case",
  "parallel_group": 2,
  "branch_key": "business_case",
  "job_type": "EXECUTE",
  "name": "Generate Business Case",
  "prompt_template_id": "<system_prompts.id for thesis_business_case_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "thesis",
      "document_key": "header_context",
      "required": true
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "seed_prompt", "relevance": 0.7 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "one_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "business_case",
      "template_filename": "thesis_business_case.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "content_to_include": {
        "executive_summary": "",
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": "",
        "weaknesses": "",
        "opportunities": "",
        "threats": "",
        "next_steps": "",
        "proposal_references": []
      }
    }
  ]
}
```

### Step 2b: Generate Feature Spec (parallel)
- **Objective:** Produce the MVP feature specification with user stories and acceptance criteria scaffold.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `thesis_feature_spec_turn_v1` *(new template – to be authored)*
- **Input Source References:**
- `header_context` (type `header_context`, stage `thesis`, required)
- **Output Artifact Description:** Renders `feature_spec` document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
"step_slug": "generate-feature-spec",
  "parallel_group": 2,
  "branch_key": "feature_spec",
  "job_type": "EXECUTE",
  "name": "Generate Feature Spec",
  "prompt_template_id": "<system_prompts.id for thesis_feature_spec_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "thesis",
      "document_key": "header_context",
      "required": true
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "seed_prompt", "relevance": 0.65 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "one_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "feature_spec",
      "template_filename": "thesis_feature_spec.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "content_to_include": [
        {
          "feature_name": "",
          "user_stories": [],
          "feature_objective": "",
          "acceptance_criteria": [],
          "dependencies": [],
          "success_metrics": []
        }
      ]
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "thesis_product_requirements_document.md",
      "from_document_key": "feature_spec"
    }
  ]
}
```

### Step 2c: Generate Technical Approach Overview (parallel)
- **Objective:** Produce the high-level technical approach overview.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `thesis_technical_approach_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context.json` (type `header_context`, stage `thesis`, required)
- **Output Artifact Description:** Renders `technical_approach` document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-technical-approach",
  "parallel_group": 2,
  "branch_key": "technical_approach",
  "job_type": "EXECUTE",
  "name": "Generate Technical Approach",
  "prompt_template_id": "<system_prompts.id for thesis_technical_approach_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "thesis",
      "document_key": "header_context",
      "required": true
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "seed_prompt", "relevance": 0.6 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "one_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "technical_approach",
      "template_filename": "thesis_technical_approach.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "content_to_include": {
        "architecture": "", 
        "components": "", 
        "data": "", 
        "deployment": "", 
        "sequencing": "",
        "risk_mitigation": "",
        "open_questions": ""
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "thesis_implementation_plan_proposal.md",
      "from_document_key": "technical_approach"
    }
  ]
}
```

### Step 2d: Generate Success Metrics (parallel)
- **Objective:** Produce the success metrics document capturing KPIs and validation measures.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `thesis_success_metrics_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context.json` (type `header_context`, stage `thesis`, required)
- **Output Artifact Description:** Renders `success_metrics` document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-success-metrics",
  "parallel_group": 2,
  "branch_key": "success_metrics",
  "job_type": "EXECUTE",
  "name": "Generate Success Metrics",
  "prompt_template_id": "<system_prompts.id for thesis_success_metrics_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "thesis",
      "document_key": "header_context",
      "required": true
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "seed_prompt", "relevance": 0.8 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "one_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "success_metrics",
      "template_filename": "thesis_success_metrics.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "content_to_include": {
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": "",
        "leading_indicators": "",
        "lagging_indicators": "",
        "guardrails": "",
        "measurement_plan": "",
        "risk_signals": "",
        "next_steps": "",
        "data_sources": [],
        "reporting_cadence": "",
        "ownership": "",
        "escalation_plan": ""
      }
    }
  ]
}
```

# Transform Requirements

*   `[✅]` 1. [PROMPT] Create planner prompt template `thesis_planner_header_v1`
    *   `[✅]` 1.a. Author template file `docs/prompts/thesis/thesis_planner_header_v1.md` matching the HeaderContext schema above.
    *   `[✅]` 1.b. Add `system_prompts` row for `thesis_planner_header_v1` (include id, name, version, file path in migration).
    *   `[✅]` 1.c. Insert the Step 1 `dialectic_stage_recipes` row with `step_number = 1`, `step_slug = 'build-stage-header'`, `job_type = 'PLAN'`, `name = 'Build Stage Header'`, `prompt_template_id = system_prompts.id('thesis_planner_header_v1')`, `prompt_type = 'Planner'`, `output_type = 'HeaderContext'`, `granularity_strategy = 'all_to_one'`, and an `inputs_required` array that consumes the Thesis `seed_prompt`. Store the HeaderContext JSON (documents enumerated in the nested array) in `outputs_required` exactly as defined above.

*   `[✅]` 2. [PROMPT] Create turn prompt template `thesis_business_case_turn_v1`
    *   `[✅]` 2.a. Author template file `docs/prompts/thesis/thesis_business_case_turn_v1.md`.
    *   `[✅]` 2.b. Add `system_prompts` row for `thesis_business_case_turn_v1`.
    *   `[✅]` 2.c. Insert the Step 2 `dialectic_stage_recipes` row for `branch_key = 'business_case'` with `step_number = 2`, `step_slug = 'generate-business-case'`, `job_type = 'EXECUTE'`, `name = 'Generate Business Case'`, `prompt_template_id = system_prompts.id('thesis_business_case_turn_v1')`, `prompt_type = 'Turn'`, `parallel_group = 2`, `output_type = 'RenderedDocument'`, `granularity_strategy = 'one_to_one'`, and an `inputs_required` array that consumes the Thesis `header_context`. Persist the rendered document contract in `outputs_required` using the schema shown above.

*   `[✅]` 3. [PROMPT] Create turn prompt template `thesis_feature_spec_turn_v1`
    *   `[✅]` 3.a. Author template file `docs/prompts/thesis/thesis_feature_spec_turn_v1.md`.
    *   `[✅]` 3.b. Add `system_prompts` row for `thesis_feature_spec_turn_v1`.
    *   `[✅]` 3.c. Insert the Step 2 `dialectic_stage_recipes` row for `branch_key = 'feature_spec'` with `step_number = 2`, `step_slug = 'generate-feature-spec'`, `job_type = 'EXECUTE'`, `name = 'Generate Feature Spec'`, `prompt_template_id = system_prompts.id('thesis_feature_spec_turn_v1')`, `prompt_type = 'Turn'`, `parallel_group = 2`, `output_type = 'RenderedDocument'`, `granularity_strategy = 'one_to_one'`, and an `inputs_required` array that consumes the Thesis `header_context`. Persist the rendered document contract in `outputs_required` for the `feature_spec` document key.

*   `[✅]` 4. [PROMPT] Create turn prompt template `thesis_technical_approach_turn_v1`
    *   `[✅]` 4.a. Author template file `docs/prompts/thesis/thesis_technical_approach_turn_v1.md`, using the standardized turn prompt structure (role + style excerpt, HeaderContext injection, shared JSON-return instructions) with the `technical_approach` `content_to_include` contract injected into the content block.
    *   `[✅]` 4.b. Add `system_prompts` row for `thesis_technical_approach_turn_v1`.
    *   `[✅]` 4.c. Insert the Step 2 `dialectic_stage_recipes` row for `branch_key = 'technical_approach'` with `step_number = 2`, `step_slug = 'generate-technical-approach'`, `job_type = 'EXECUTE'`, `name = 'Generate Technical Approach'`, `prompt_template_id = system_prompts.id('thesis_technical_approach_turn_v1')`, `prompt_type = 'Turn'`, `parallel_group = 2`, `output_type = 'RenderedDocument'`, `granularity_strategy = 'one_to_one'`, and an `inputs_required` array that consumes the Thesis `header_context`. Persist the rendered document contract in `outputs_required` for the `technical_approach` document key.

*   `[✅]` 5. [PROMPT] Create turn prompt template `thesis_success_metrics_turn_v1`
    *   `[✅]` 5.a. Author template file `docs/prompts/thesis/thesis_success_metrics_turn_v1.md`, following the standardized turn prompt format (role + style excerpt, HeaderContext injection, shared JSON-return instructions) with the `success_metrics` `content_to_include` contract injected into the content block.
    *   `[✅]` 5.b. Add `system_prompts` row for `thesis_success_metrics_turn_v1`.
    *   `[✅]` 5.c. Insert the Step 2 `dialectic_stage_recipes` row for `branch_key = 'success_metrics'` with `step_number = 2`, `step_slug = 'generate-success-metrics'`, `job_type = 'EXECUTE'`, `name = 'Generate Success Metrics'`, `prompt_template_id = system_prompts.id('thesis_success_metrics_turn_v1')`, `prompt_type = 'Turn'`, `parallel_group = 2`, `output_type = 'RenderedDocument'`, `granularity_strategy = 'one_to_one'`, and an `inputs_required` array that consumes the Thesis `header_context`. Persist the rendered document contract in `outputs_required` for the `success_metrics` document key.

*  `[✅]` 6. [DB] Populate the dialectic_stage_recipe_edges for each document edge. 
    *   `[✅]` 6.a. Populate `dialectic_stage_recipe_edges` so the Step 1 planner row is the parent for every Step 2 branch row, mirroring the PLAN job that waits for its child EXECUTE jobs described in `Document-Centric Generation.md`.
    *   `[✅]` 6.b. Add the `dialectic_stage_recipe_edges` entry linking the Step 1 planner row to the `business_case` branch row so the parent PLAN job enqueues this EXECUTE job.
    *   `[✅]` 6.c. Add the `dialectic_stage_recipe_edges` entry linking the Step 1 planner row to the `feature_spec` branch row so the parent PLAN job enqueues this EXECUTE job.
    *   `[✅]` 6.d. Add the `dialectic_stage_recipe_edges` entry linking the Step 1 planner row to the `technical_approach` branch row so the parent PLAN job enqueues this EXECUTE job.
    *   `[✅]` 6.e. Add the `dialectic_stage_recipe_edges` entry linking the Step 1 planner row to the `success_metrics` branch row so the parent PLAN job enqueues this EXECUTE job.

*   `[✅]` 7. [DB] Stage configuration updates
  *   `[✅]` 7.a. Move Thesis to `recipe_name = thesis_v1`; remove legacy `input_artifact_rules` / `expected_output_artifacts` columns from the stage row.
  *   `[✅]` 7.b. Keep Thesis overlay values for `role` and `stage_instructions`; drop redundant `expected_output_artifacts_json` once the planner template provides the structure.
  *   `[✅]` 7.c. Update `supabase/seed.sql` (or add a migration) to persist the new system prompts, recipe rows, branch edges, and `parallel_group`/`branch_key` values so fresh environments match the desired recipe.
  *   `[✅]` 7.d. Add a provenance note capturing the current seed prompt and overlay source (migration `20250613190311_domains_and_processes_improvement.sql`) so the new data references have traceability.

*   `[✅]` 8. [BE] TypeScript and type-guard adjustments
  *   `[✅]` 8.a. Extend `DialecticJobPayload.step_info` and related type guards to support `prompt_template_name`, document keys, `parallel_group`, `branch_key`, and planner metadata.
  *   `[✅]` 8.b. Update payload validators for the new `inputs_required` / `outputs_required` structures, including validation of branch metadata.
  *   `[✅]` 8.c. Model the full `HeaderContext` payload and generated-file metadata (e.g., `files_to_generate.from_document_key`) in shared types and companion guards so the new planner output passes validation.
