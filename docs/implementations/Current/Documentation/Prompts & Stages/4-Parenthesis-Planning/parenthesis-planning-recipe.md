# Stage: Parenthesis (`parenthesis`)

## Stage File Structure (Target)
{stage}/
  _work/
    prompts/
      [{model_slug}_{n}_continuation_{c}_]{stage}_{step_name}_prompt.md 
            // Only continuation prompts are unique to a model, so if it needs to continue, it needs the model_slug too. And because the same model can be called more than once within the same stage, they need the iterator {n} to uniquely determine which iteration of the model the prompt is for. 
      [{model_slug}_{n}_continuation_{c}_]{stage}_{document_key}_prompt.md 
            // Only continuation prompts are unique to a model, so if it needs to continue, it needs the model_slug too.And because the same model can be called more than once within the same stage, they need the iterator {n} to uniquely determine which iteration of the model the prompt is for.
    context/
      header_context[_{step_name}].json
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
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for parenthesis)
  - `Prompt Templating Examples.md` (Planning/Parenthesis section)
  - `dialectic_stage_recipes` parenthesis recipe migration (if present)

# Current State

- Stage metadata (seeded via `20250613190311_domains_and_processes_improvement.sql`):
  - `stage_slug`: `parenthesis`
  - `display_name`: `Parenthesis`
  - `description`: `Formalize the synthesized solution into a detailed, executable plan.`
  - `default_system_prompt_id`: `dialectic_parenthesis_base_v1`
  - No dedicated `dialectic_stage_recipes` rows exist yet; behaviour is still encoded in the legacy `dialectic_stages` payload columns.
  - Source: `supabase/migrations/20250613190311_domains_and_processes_improvement.sql` (L170-L201)
- `input_artifact_rules` (from `20250623201637_add_artifact_rules.sql`):
```json
{
  "sources": [
    {
      "type": "contribution",
      "stage_slug": "synthesis",
      "purpose": "Outputs (proposals, PRDs, plans) from the Synthesis stage.",
      "required": true,
      "multiple": true,
      "section_header": "--- Outputs from Synthesis Stage ---"
    },
    {
      "type": "feedback",
      "stage_slug": "synthesis",
      "purpose": "User's direct feedback on the outputs from the Synthesis stage.",
      "required": false,
      "multiple": false,
      "section_header": "--- User Feedback on Synthesis Stage ---"
    }
  ]
}
```
  - Source: `supabase/migrations/20250623201637_add_artifact_rules.sql` (L96-L126)
- `expected_output_artifacts` (Software Development overlay merge in `seed.sql` and `20250903211508_add_style_guide_and_update_prompts.sql`):
```json
{
  "system_materials": {
    "executive_summary": "overview of formalization scope and how the Master Plan will drive iterative execution",
    "input_artifacts_summary": "succinct recap of synthesis outputs informing this plan",
    "stage_rationale": "why the chosen milestone breakdown, ordering, and architecture structure best fit constraints and objectives",
    "progress_update": "for continuation turns, summarize Master Plan changes since last iteration; omit on first turn",
    "validation_checkpoint": [
      "complete coverage of synthesized scope",
      "dependency ordering validated",
      "milestone acceptance criteria present",
      "style guide structure applied"
    ],
    "quality_standards": [
      "consistent formatting",
      "explicit ordering",
      "clear acceptance criteria",
      "testability of milestones"
    ]
  },
  "documents": [
    {
      "key": "trd",
      "template_filename": "parenthesis_trd.md",
      "content_to_include": {
        "subsystems": ["placeholder"],
        "apis": ["placeholder"],
        "schemas": ["placeholder"],
        "proposed_file_tree": "placeholder",
        "architecture_overview": "placeholder"
      }
    },
    {
      "key": "master_plan",
      "template_filename": "parenthesis_master_plan.md",
      "content_to_include": {
        "phases": [
          {
            "name": "placeholder",
            "milestones": [
              {
                "id": "M1",
                "title": "placeholder",
                "objective": "placeholder",
                "dependencies": ["none"],
                "acceptance_criteria": ["placeholder"],
                "status": "[ ]"
              }
            ]
          }
        ]
      }
    },
    {
      "key": "milestone_schema",
      "template_filename": "parenthesis_milestone_schema.md",
      "content_to_include": {
        "fields": [
          "id",
          "title",
          "objective",
          "dependencies",
          "acceptance_criteria",
          "status"
        ],
        "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps belong to next stage."
      }
    }
  ],
  "files_to_generate": [
    { "template_filename": "parenthesis_trd.md", "from_document_key": "trd" },
    { "template_filename": "parenthesis_master_plan.md", "from_document_key": "master_plan" },
    { "template_filename": "parenthesis_milestone_schema.md", "from_document_key": "milestone_schema" }
  ]
}
```
  - Sources: `supabase/seed.sql` (L650-L722) and `supabase/migrations/20250903211508_add_style_guide_and_update_prompts.sql` (L720-L775)
- Stage overlay merge injects Parenthesis-specific values into `domain_specific_prompt_overlays` (Software Development domain):
  - `role`: `principal technical planner and delivery architect`
  - `stage_instructions`: formalize the synthesized solution into a Master Plan, enforce ordering, and define milestone schema boundaries
  - `style_guide_markdown`: Parenthesis sections of the shared style guide (status markers, milestone formatting, continuation rules, generation limits)
  - `expected_output_artifacts_json`: the JSON structure shown above (kept in sync with the overlay merge)
  - Sources: `supabase/seed.sql` (L640-L726) and `supabase/migrations/20250903211508_add_style_guide_and_update_prompts.sql` (L700-L780)
- Prompt templates: only the shared base `dialectic_parenthesis_base_v1` exists today; planner/turn templates have not yet been authored or linked. Path utilities (`FileType.Parenthesis`, `constructStoragePath`, `deconstructStoragePath`) already recognise the `parenthesis` stage slug, but no recipe data drives per-document orchestration yet.
  - Sources: `supabase/seed.sql` (L55-L92); `supabase/functions/_shared/types/file_manager.types.ts` (FileType enum), `supabase/functions/_shared/utils/path_constructor.ts`, `supabase/functions/_shared/utils/path_deconstructor.ts`

## Target State

## Recipe: `parenthesis_v1`
- **Recipe Description:** Document-centric planning workflow that converts Synthesis deliverables into an iterative Technical Requirements Document, Master Plan, and Milestone Schema.
- **Steps Count:** 4 sequential steps (1 planner, 3 turns)

### Step 1: Build Planning Header
- **Objective:** Emit `header_context_parenthesis.json` that captures scope, dependency expectations, milestone status preservation rules, and continuation policy for iterative reruns.
- **Prompt Type:** `Planner`
- **Prompt Template Name:** `parenthesis_planner_header_v1`
- **Input Source References:**
  - `seed_prompt` (type `seed_prompt`, stage `parenthesis`, required)
  - `prd` (type `document`, stage `synthesis`, required)
  - `system_architecture_overview` (type `document`, stage `synthesis`, required)
  - `tech_stack_recommendations` (type `document`, stage `synthesis`, required)
  - `prd` (type `feedback`, stage `synthesis`, required=false)
  - `system_architecture_overview` (type `feedback`, stage `synthesis`, required=false)
  - `tech_stack_recommendations` (type `feedback`, stage `synthesis`, required=false)
  - `master_plan` (type `document`, stage `parenthesis`, required=false)
- **Output Artifact Description:** Header context JSON with milestone catalog, dependency graph, TRD outline inputs, continuation policy, and instructions for preserving `[✅]` milestones while marking the next milestones `[🚧]`.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 1,
  "step_slug": "build-planning-header",
  "job_type": "PLAN",
  "name": "Build Planning Header",
  "prompt_template_id": "<system_prompts.id for parenthesis_planner_header_v1>",
  "prompt_type": "Planner",
  "inputs_required": [
    { "type": "seed_prompt", "stage_slug": "parenthesis", "document_key": "seed_prompt", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "prd", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "system_architecture_overview", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "tech_stack_recommendations", "required": true },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "prd", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "system_architecture_overview", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "tech_stack_recommendations", "required": false },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "seed_prompt", "stage_slug": "parenthesis", "relevance": 0.6 },
    { "document_key": "prd", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "system_architecture_overview", "stage_slug": "synthesis", "relevance": 0.95 },
    { "document_key": "tech_stack_recommendations", "stage_slug": "synthesis", "relevance": 0.90 },
    { "document_key": "prd", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.75 },
    { "document_key": "system_architecture_overview", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.70 },
    { "document_key": "tech_stack_recommendations", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.65 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.99 }
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 }
  ],
  "output_type": "HeaderContext",
  "granularity_strategy": "all_to_one",
  "outputs_required": {
    "header_context": {
      "document_key": "header_context_parenthesis",
      "fields": [
        "milestones",
        "dependencies",
        "status_preservation_rules",
        "continuation_policy",
        "trd_outline_inputs"
      ]
    }
  }
}
```

**Step Outputs Schema (target):**
```json
{
  "system_materials": {
    "milestones": [],
    "dependency_rules": [],
    "status_preservation_rules": {
      "completed_status": "[✅]",
      "in_progress_status": "[🚧]",
      "next_actions_status": "[ ]"
    },
    "continuation_policy": {
      "iteration": "resume-from-last-open-milestone",
      "corrective": "restate-delta"
    },
    "trd_outline_inputs": {}
  }
}
```

### Step 2: Generate Technical Requirements Document
- **Objective:** Produce the updated TRD that aligns synthesized architecture with the planner’s milestone breakdown and captures deltas from any previous iteration.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `parenthesis_trd_turn_v1`
- **Input Source References:**
  - `header_context_parenthesis` (type `header_context`, stage `parenthesis`, required)
  - `system_architecture_overview` (type `document`, stage `synthesis`, required)
  - `tech_stack_recommendations` (type `document`, stage `synthesis`, required)
  - `prd` (type `document`, stage `synthesis`, required)
  - `system_architecture_overview` (type `feedback`, stage `synthesis`, required=false)
  - `tech_stack_recommendations` (type `feedback`, stage `synthesis`, required=false)
  - `prd` (type `feedback`, stage `synthesis`, required=false)
  - `trd` (type `document`, stage `parenthesis`, required=false) // if this is an iterative run, we send the last iterations TRD. 
  - `trd` (type `feedback`, stage `parenthesis`, required=false) // if this is an iterative run, we send the last iterations TRD feedback too. 
- **Output Artifact Description:** Markdown TRD plus assembled JSON capturing subsystems, APIs, schemas, file tree, and architecture rationale.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-trd",
  "job_type": "EXECUTE",
  "name": "Generate Technical Requirements Document",
  "prompt_template_id": "<system_prompts.id for parenthesis_trd_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context_parenthesis", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "system_architecture_overview", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "tech_stack_recommendations", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "prd", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "trd", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "system_architecture_overview", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "tech_stack_recommendations", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "prd", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "trd", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context_parenthesis", "stage_slug": "parenthesis", "relevance": 1.0 },
    { "document_key": "system_architecture_overview", "stage_slug": "synthesis", "relevance": 0.95 },
    { "document_key": "tech_stack_recommendations", "stage_slug": "synthesis", "relevance": 0.9 },
    { "document_key": "prd", "stage_slug": "synthesis", "relevance": 0.85 },
    { "document_key": "trd", "stage_slug": "parenthesis", "relevance": 0.99 }, // if we already have a TRD, that's our 2nd most important document
    { "document_key": "system_architecture_overview", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.80 },
    { "document_key": "tech_stack_recommendations", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.75 },
    { "document_key": "prd", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.50 },
    { "document_key": "trd", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.83 } // feedback on an existing TRD is just slightly less important than the prd 
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "one_to_one",
  "outputs_required": {
    "documents": [
      {
        "document_key": "trd",
        "template_filename": "parenthesis_trd.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown"
      }
    ],
    "assembled_json": [
      {
        "document_key": "trd",
        "artifact_class": "assembled_document_json",
        "fields": ["subsystems", "apis", "schemas", "proposed_file_tree", "architecture_overview"]
      }
    ]
  }
}
```

### Step 3: Generate Master Plan
- **Objective:** Output the dependency-ordered Master Plan marking just-detailed milestones `[🚧]`, preserving completed `[✅]`, and leaving future milestones `[ ]` for subsequent iterations.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `parenthesis_master_plan_turn_v1`
- **Input Source References:**
  - `header_context_parenthesis` (type `header_context`, stage `parenthesis`, required)
  - `trd` (type `document`, stage `parenthesis`, required)
  - `master_plan` (type `document`, stage `parenthesis`, required=false)
  - `prd` (type `document`, stage `synthesis`, required)
  - `trd` (type `feedback`, stage `parenthesis`, required=false)
  - `master_plan` (type `feedback`, stage `parenthesis`, required=false)
  - `prd` (type `feedback`, stage `synthesis`, required=false)
- **Output Artifact Description:** Markdown Master Plan plus JSON manifest enumerating phases, milestones, dependencies, acceptance criteria, and status markers.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 3,
  "step_slug": "generate-master-plan",
  "job_type": "EXECUTE",
  "name": "Generate Master Plan",
  "prompt_template_id": "<system_prompts.id for parenthesis_master_plan_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context_parenthesis", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "trd", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "document", "stage_slug": "synthesis", "document_key": "prd", "required": true },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "trd", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "prd", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context_parenthesis", "stage_slug": "parenthesis", "relevance": 1.0 },
    { "document_key": "trd", "stage_slug": "parenthesis", "relevance": 0.95 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.99 },// if we already have it, it's the most important
    { "document_key": "prd", "stage_slug": "synthesis", "relevance": 0.75 },
    { "document_key": "trd", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.90 }, // if we already have it, it's the most important feedback
    { "document_key": "prd", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.70 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "one_to_one",
  "outputs_required": {
    "documents": [
      {
        "document_key": "master_plan",
        "template_filename": "parenthesis_master_plan.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown"
      }
    ],
    "assembled_json": [
      {
        "document_key": "master_plan",
        "artifact_class": "assembled_document_json",
        "fields": ["phases", "milestones", "dependencies", "acceptance_criteria", "status"]
      }
    ]
  }
}
```

### Step 4: Generate Milestone Schema
- **Objective:** Define reusable milestone field schema and style-guide notes so Paralysis can author detailed checklists per milestone.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `parenthesis_milestone_schema_turn_v1`
- **Input Source References:**
  - `header_context_parenthesis` (type `header_context`, stage `parenthesis`, required)
  - `master_plan` (type `document`, stage `parenthesis`, required)
  - `milestone_schema` (type `document`, stage `parenthesis`, required=false)
- **Output Artifact Description:** Markdown milestone schema plus JSON descriptor covering canonical fields and style-guide notes.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 4,
  "step_slug": "generate-milestone-schema",
  "job_type": "EXECUTE",
  "name": "Generate Milestone Schema",
  "prompt_template_id": "<system_prompts.id for parenthesis_milestone_schema_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context_parenthesis", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false }, // If we have one, send it
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context_parenthesis", "stage_slug": "parenthesis", "relevance": 1.0 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.90 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "relevance": 0.95 }, // if we have one, it's more important than the master_plan
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.80 }, 
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 } // if we have it, it's more important 
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "one_to_one",
  "outputs_required": {
    "documents": [
      {
        "document_key": "milestone_schema",
        "template_filename": "parenthesis_milestone_schema.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown"
      }
    ],
    "assembled_json": [
      {
        "document_key": "milestone_schema",
        "artifact_class": "assembled_document_json",
        "fields": ["fields", "style_guide_notes", "status_markers"]
      }
    ]
  }
}
```

> *Future extension:* Once iterative forecasting artifacts are defined, insert additional planner/turn steps that generate iteration seeds or backlog harmonization manifests prior to Paralysis.
