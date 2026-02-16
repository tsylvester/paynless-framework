# Stage: Paralysis (`paralysis`)

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
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for paralysis)
  - `Prompt Templating Examples.md` (Implementation/Paralysis section)
  - `dialectic_stage_recipes` paralysis recipe migration (if present)

# Current State

- Stage metadata (from latest seed/migration snapshot):
  - `stage_slug`: `paralysis`
  - `display_name`: `Paralysis`
  - `description`: `Finalize the solution into a production-ready implementation plan.`
  - `default_system_prompt_id`: `dialectic_paralysis_base_v1`
  - No dedicated `dialectic_stage_recipes` rows exist yet; orchestration still depends on legacy payload fields on `dialectic_stages`.
- `input_artifact_rules` (seeded via `20250623201637_add_artifact_rules.sql`):
```json
{
  "sources": [
    {
      "type": "contribution",
      "stage_slug": "parenthesis",
      "purpose": "Detailed implementation plans developed during the Parenthesis stage.",
      "required": true,
      "multiple": true,
      "section_header": "--- Implementation Plans from Parenthesis Stage ---"
    },
    {
      "type": "feedback",
      "stage_slug": "parenthesis",
      "purpose": "User's direct feedback on the implementation plans from the Parenthesis stage.",
      "required": false,
      "multiple": false,
      "section_header": "--- User Feedback on Parenthesis Stage ---"
    }
  ]
}
```
- `expected_output_artifacts` (Software Development overlay merge in `seed.sql` / `20250903211508_add_style_guide_and_update_prompts.sql`):
```json
{
  "system_materials": {
    "agent_internal_summary": "summary of which milestones are detailed in this iteration and why",
    "input_artifacts_summary": "TRD sections used, Master Plan phase/milestone references",
    "stage_rationale": "explain ordering, TDD emphasis, and how checklist conforms to style guide",
    "progress_update": "summarize completed vs remaining milestones; denote updated statuses in Master Plan",
    "generation_limits": { "max_steps": 200, "target_steps": "120-180", "max_output_lines": "600-800" },
    "document_order": [
      "actionable_checklist",
      "updated_master_plan",
      "advisor_recommendations"
    ],
    "current_document": "actionable_checklist",
    "exhaustiveness_requirement": "extreme detail; no summaries; each step includes inputs, outputs, validation; 1/a/i numbering; component labels",
    "validation_checkpoint": [
      "checklist uses style guide (status, numbering, labels)",
      "steps are atomic and testable",
      "dependency ordering enforced",
      "coverage aligns to milestone acceptance criteria"
    ],
    "quality_standards": [
      "TDD sequence present",
      "no missing dependencies",
      "no speculative steps beyond selected milestones",
      "clear file-by-file prompts"
    ]
  },
  "documents": [
    {
      "key": "actionable_checklist",
      "template_filename": "paralysis_actionable_checklist.md",
      "content_to_include": "full low-level checklist using style guide: status markers, 1/a/i numbering, component labels; each step contains inputs, outputs, validation; one-file-per-step prompts"
    },
    {
      "key": "updated_master_plan",
      "template_filename": "paralysis_updated_master_plan.md",
      "content_to_include": "copy of Master Plan with the detailed milestones set to [🚧], others unchanged"
    },
    {
      "key": "comparison_matrix",
      "template_filename": "paralysis_comparison_matrix.md",
      "content_to_include": "rubric matrix capturing weighted scores and rationales per option"
    },
    {
      "key": "comparative_analysis",
      "template_filename": "paralysis_comparative_analysis.md",
      "content_to_include": "summary of key differences, trade-offs, and consensus"
    },
    {
      "key": "recommendations",
      "template_filename": "paralysis_recommendations.md",
      "content_to_include": "advisor-style ranking with when-to-choose guidance"
    },
    {
      "key": "selection_rationale",
      "template_filename": "paralysis_selection_rationale.md",
      "content_to_include": "final recommendation, tie-breaker logic, and implementation considerations"
    }
  ],
  "files_to_generate": [
    { "template_filename": "paralysis_actionable_checklist.md", "from_document_key": "actionable_checklist" },
    { "template_filename": "paralysis_updated_master_plan.md", "from_document_key": "updated_master_plan" },
    { "template_filename": "paralysis_comparison_matrix.md", "from_document_key": "comparison_matrix" },
    { "template_filename": "paralysis_comparative_analysis.md", "from_document_key": "comparative_analysis" },
    { "template_filename": "paralysis_recommendations.md", "from_document_key": "recommendations" },
    { "template_filename": "paralysis_selection_rationale.md", "from_document_key": "selection_rationale" }
  ]
}
```
- Stage-specific overlay (`domain_specific_prompt_overlays` Software Development merge):
  - `role`: `implementation planner and TDD workflow author`
  - `stage_instructions`: `using the TRD, Master Plan, and selected milestones, generate a dependency-ordered, fine-grained, high-detail checklist of implementation prompts that follow the style guide;`
  - `style_guide_markdown`: embeds the Paralysis selections from `StyleGuide.md` (§1 Purpose & Scope, §2.a Checklists, §3 Continuations, §4 Formatting, §5 TDD Sequencing, §6 Master Plan & Milestone, §7 Implementation Checklists, §8 Prohibited, §9.a Checklist Validation, §10.a Milestone Skeleton, §10.b Checklist Skeleton). The prompt assembler injects these style guide sections automatically; the recipe’s `context_for_documents` can focus on paralysis-specific artifact expectations without duplicating the style guide text.
  - `expected_output_artifacts_json`, `generation_limits`, `continuation_policy`, `document_order`, and related keys mirror the JSON shown above. Target updates expand this JSON to cover the advisor artifacts so the overlay and recipe stay aligned.
- Prompt templates:
  - Only the base seed template `dialectic_paralysis_base_v1` is seeded today (see `20250613190311_domains_and_processes_improvement.sql`). Planner and turn templates have not been authored or linked yet.
- Storage and path conventions:
  - `FileType.Paralysis` exists in `supabase/functions/_shared/types/file_manager.types.ts`.
  - `constructStoragePath` / `deconstructStoragePath` map `stageSlug: 'paralysis'` to the `5_paralysis/` directory with subfolders for `_work/prompts`, `context/`, `assembled_json/`, `raw_responses/`, `documents/`, and `user_feedback/`, matching the Stage File Structure documented above.
  - Path constructor/deconstructor unit tests already include paralysis scenarios (`path_constructor.test.ts`, `path_deconstructor.test.ts`).
- Workflow integration:
  - `dialectic_stage_transitions` advance from Parenthesis to Paralysis on user submission of Parenthesis feedback (seeded in `20250613190311_domains_and_processes_improvement.sql`).
  - Existing integration tests (`dialectic_pipeline.integration.test.ts`, `dialectic_pipeline_user_like.integration.test.ts`) assume a monolithic paralysis job; they will require updates when the document-centric recipe is introduced.

# Target State: `paralysis_v1`
- **Recipe Description:** Iterative implementation workflow that converts the Parenthesis master plan and TRD into a high-detail checklist, updates the master plan for the next sprint cycle, and concludes with an advisor-style comparison of the resulting plans against the original request. Although earlier documentation depicts the Advisor flow as a separate stage, this target recipe intentionally embeds the advisor evaluation as Step 4 so that Paralysis remains the final iterative stage before hand-off.
- **Steps Count:** 4 sequential steps (1 planner, 2 turn executions, 1 advisor evaluation).

## Step 1: Build Implementation Header
- **Objective:** Emit `header_context.json` describing the milestones to detail, checklist sizing rules, status preservation policy, and continuation metadata for the checklist and master plan turns.
- **Prompt Type:** `Planner`
- **Prompt Template Name:** `paralysis_planner_header_v1`
- **Input Source References:**
  - `seed_prompt` (type `seed_prompt`, stage `paralysis`, required)
  - `technical_requirements` (type `document`, stage `parenthesis`, required)
  - `master_plan` (type `document`, stage `parenthesis`, required)
  - `milestone_schema` (type `document`, stage `parenthesis`, required)
  - `technical_requirements` (type `feedback`, stage `parenthesis`, required=false)
  - `master_plan` (type `feedback`, stage `parenthesis`, required=false)
  - `milestone_schema` (type `feedback`, stage `parenthesis`, required=false)
  - `actionable_checklist` (type `document`, stage `paralysis`, required=false)
  - `updated_master_plan` (type `document`, stage `paralysis`, required=false)
  - `actionable_checklist` (type `feedback`, stage `paralysis`, required=false)
  - `updated_master_plan` (type `feedback`, stage `paralysis`, required=false)
- **Output Artifact Description:** Header context JSON capturing iteration metadata, milestone slice, checklist directives, and references required by downstream turns.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 1,
  "step_slug": "build-implementation-header",
  "job_type": "PLAN",
  "name": "Build Implementation Header",
  "prompt_template_id": "<system_prompts.id for paralysis_planner_header_v1>",
  "prompt_type": "Planner",
  "inputs_required": [
    { "type": "seed_prompt", "stage_slug": "paralysis", "document_key": "seed_prompt", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": true },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false },
    { "type": "document", "stage_slug": "paralysis", "document_key": "actionable_checklist", "required": false },
    { "type": "document", "stage_slug": "paralysis", "document_key": "updated_master_plan", "required": false },
    { "type": "feedback", "stage_slug": "paralysis", "document_key": "actionable_checklist", "required": false },
    { "type": "feedback", "stage_slug": "paralysis", "document_key": "updated_master_plan", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "seed_prompt", "stage_slug": "paralysis", "relevance": 0.6 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "relevance": 1.0 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.98 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "relevance": 0.95 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.7 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.7 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.65 },
    { "document_key": "actionable_checklist", "stage_slug": "paralysis", "relevance": 0.85 },
    { "document_key": "updated_master_plan", "stage_slug": "paralysis", "relevance": 0.9 },
    { "document_key": "actionable_checklist", "stage_slug": "paralysis", "type": "feedback", "relevance": 0.6 },
    { "document_key": "updated_master_plan", "stage_slug": "paralysis", "type": "feedback", "relevance": 0.6 }
  ],
  "output_type": "HeaderContext",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "system_materials": {
    "agent_internal_summary": "summary of which milestones are detailed in this iteration and why",
    "input_artifacts_summary": "TRD sections used, Master Plan phase/milestone references",
    "stage_rationale": "explain ordering, TDD emphasis, and how checklist conforms to style guide",
    "progress_update": "summarize completed vs remaining milestones; denote updated statuses in Master Plan",
    "generation_limits": { "max_steps": 200, "target_steps": "120-180", "max_output_lines": "600-800" },
    "document_order": [
      "actionable_checklist",
      "updated_master_plan",
      "advisor_recommendations"
    ],
    "current_document": "actionable_checklist",
    "exhaustiveness_requirement": "extreme detail; no summaries; each step includes inputs, outputs, validation; follow the style guide exactly",
    "validation_checkpoint": [
      "checklist uses style guide (status, numbering, labels)",
      "steps are atomic and testable",
      "dependency ordering enforced",
      "coverage aligns to milestone acceptance criteria"
    ],
    "quality_standards": [
      "TDD sequence present",
      "no missing dependencies",
      "no speculative steps beyond selected milestones",
      "clear file-by-file prompts"
    ],
    "iteration_metadata": {
      "iteration_number": "<populate_at_runtime>",
      "previous_checklist_present": "<derived_from_storage>",
      "previous_master_plan_present": "<derived_from_storage>"
    },
    "milestones_to_detail": [],
    "status_rules": {
      "completed": "[✅]",
      "in_progress": "[🚧]",
      "unstarted": "[ ]"
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
      "document_key": "actionable_checklist",
      "content_to_include": {
        "milestone_ids": [<list the next milestone(s) to detail from the master_plan and milestone_schema>],
      }
    },
    {
      "document_key": "updated_master_plan",
      "content_to_include": {
        "preserve_completed": true,
        "set_in_progress": "[🚧]",
        "future_status": "[ ]",
        "capture_iteration_delta": true
      }
    },
    {
      "document_key": "advisor_recommendations",
      "content_to_include": {
        "require_comparison_matrix": true,
        "summarize_tradeoffs": true,
        "capture_final_recommendation": true,
        "tie_breaker_guidance": true
      }
    }
  ]
}
```

### Step 2: Generate Actionable Checklist
- **Objective:** Produce the detailed implementation checklist for the next milestone slice, adhering to the style guide and referencing the Parenthesis TRD and Master Plan.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `paralysis_actionable_checklist_turn_v1`
- **Input Source References:**
  - `header_context` (type `header_context`, stage `paralysis`, required)
  - `technical_requirements` (type `document`, stage `parenthesis`, required)
  - `master_plan` (type `document`, stage `parenthesis`, required)
  - `milestone_schema` (type `document`, stage `parenthesis`, required)
  - `actionable_checklist` (type `document`, stage `paralysis`, required=false — prior iteration checklist)
  - `actionable_checklist` (type `feedback`, stage `paralysis`, required=false)
  - `technical_requirements` (type `feedback`, stage `parenthesis`, required=false)
  - `master_plan` (type `feedback`, stage `parenthesis`, required=false)
  - `milestone_schema` (type `feedback`, stage `parenthesis`, required=false)
- **Output Artifact Description:** Markdown checklist plus assembled JSON capturing each step’s identifiers, dependencies, inputs, outputs, and validation instructions.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-actionable-checklist",
  "job_type": "EXECUTE",
  "name": "Generate Actionable Checklist",
  "branch_key": "actionable_checklist",
  "prompt_template_id": "<system_prompts.id for paralysis_actionable_checklist_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "paralysis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": true },
    { "type": "document", "stage_slug": "paralysis", "document_key": "actionable_checklist", "required": false },
    { "type": "feedback", "stage_slug": "paralysis", "document_key": "actionable_checklist", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "paralysis", "relevance": 1.0 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "relevance": 0.95 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.93 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "relevance": 0.9 },
    { "document_key": "actionable_checklist", "stage_slug": "paralysis", "relevance": 0.8 },
    { "document_key": "actionable_checklist", "stage_slug": "paralysis", "type": "feedback", "relevance": 0.65 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.6 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.6 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.55 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "per_source_document",
  "outputs_required": {
    "documents": [
      {
        "document_key": "actionable_checklist",
        "template_filename": "paralysis_actionable_checklist.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown"
      }
    ],
    "assembled_json": [
      {
        "document_key": "actionable_checklist",
        "artifact_class": "assembled_document_json",
        "fields": [
          "steps[].id",
          "steps[].status",
          "steps[].component_label",
          "steps[].inputs",
          "steps[].outputs",
          "steps[].validation",
          "steps[].tdd_sequence",
          "steps[].dependencies"
        ]
      }
    ],
    "files_to_generate": [
      { "template_filename": "paralysis_actionable_checklist.md", "from_document_key": "actionable_checklist" }
    ]
  }
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "actionable_checklist",
      "template_filename": "paralysis_actionable_checklist.md",
      "content_to_include": {
        "index": [<list the milestone(s) resolved in this section>],
        "milestone_summary": "<explain the desired outcome of this milestone>",
        "milestone_reference": {
          "id": "<extracted_from_header_context.milestones_to_detail>",
          "phase": "<extracted_from_master_plan>",
          "dependencies": "<extracted_from_milestone_schema>"
        },
        "steps": [
          {
            "status": "[<derived from the style guide legend>]",
            "component_label": "<derived_from_technical_requirements.components[]_context>",
            "numbering": "<derived_from_milestone_position>",
            "title": "<extracted_from_master_plan.milestone.title>",
            "description": "<extracted_from_technical_requirements.technical_requirements>",
            "inputs": "<extracted_from_milestone.acceptance_criteria>",
            "outputs": "<derived_from_step_purpose>",
            "validation": "<extracted_from_milestone_schema>",
            "red_test": "<stateless test that proves the flaw or gap>",
            "implementation": "<description of code required for red test to pass>",
            "green_test": "<rerun red_test to prove it passes>",
            "refactor": "<analyse against SRP, DRY, consider if the produced code can be simplified or extracted to a separate function>",
            "commit_message": "<derive a rational message using the examples in style_guide>"
          }
        ],
        "generation_limits": {
          "max_steps": 200,
          "target_steps": "120-180",
          "max_output_lines": "600-800"
        }
      }
    }
  ],
  "assembled_json": [
    {
      "document_key": "actionable_checklist",
      "artifact_class": "assembled_document_json",
      "file_type": "json"
    }
  ]
}
```

### Step 3: Generate Updated Master Plan
- **Objective:** Update the persistent master plan, marking newly detailed milestones `[🚧]`, preserving `[✅]` milestones, and leaving future work `[ ]`, while summarizing iteration deltas.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `paralysis_updated_master_plan_turn_v1`
- **Input Source References:**
  - `header_context` (type `header_context`, stage `paralysis`, required)
  - `master_plan` (type `document`, stage `parenthesis`, required)
  - `milestone_schema` (type `document`, stage `parenthesis`, required)
  - `actionable_checklist` (type `document`, stage `paralysis`, required)
  - `updated_master_plan` (type `document`, stage `paralysis`, required=false — prior iteration)
  - `updated_master_plan` (type `feedback`, stage `paralysis`, required=false)
  - `master_plan` (type `feedback`, stage `parenthesis`, required=false)
- **Output Artifact Description:** Markdown master plan reflecting new statuses plus optional assembled JSON for downstream ingestion.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 3,
  "step_slug": "generate-updated-master-plan",
  "job_type": "EXECUTE",
  "name": "Generate Updated Master Plan",
  "branch_key": "updated_master_plan",
  "prompt_template_id": "<system_prompts.id for paralysis_updated_master_plan_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "paralysis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": true },
    { "type": "document", "stage_slug": "paralysis", "document_key": "actionable_checklist", "required": true },
    { "type": "document", "stage_slug": "paralysis", "document_key": "updated_master_plan", "required": false },
    { "type": "feedback", "stage_slug": "paralysis", "document_key": "updated_master_plan", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "paralysis", "relevance": 1.0 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.95 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "relevance": 0.9 },
    { "document_key": "actionable_checklist", "stage_slug": "paralysis", "relevance": 0.92 },
    { "document_key": "updated_master_plan", "stage_slug": "paralysis", "relevance": 0.85 },
    { "document_key": "updated_master_plan", "stage_slug": "paralysis", "type": "feedback", "relevance": 0.65 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.6 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "per_source_document",
  "outputs_required": {
    "documents": [
      {
        "document_key": "updated_master_plan",
        "template_filename": "paralysis_updated_master_plan.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown"
      }
    ],
    "assembled_json": [
      {
        "document_key": "updated_master_plan",
        "artifact_class": "assembled_document_json",
        "fields": [
          "phases[].name",
          "phases[].milestones[].id",
          "phases[].milestones[].status",
          "phases[].milestones[].objective",
          "phases[].milestones[].dependencies",
          "phases[].milestones[].acceptance_criteria",
          "iteration_delta"
        ]
      }
    ],
    "files_to_generate": [
      { "template_filename": "paralysis_updated_master_plan.md", "from_document_key": "updated_master_plan" }
    ]
  }
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "updated_master_plan",
      "template_filename": "paralysis_updated_master_plan.md",
        "content_to_include": {
          "index": [<list the milestone(s) included in this section>],
          "executive_summary": "<extract from header_context>",
          "phases": [
            {
              "name": "<extract_from_synthesis_documents>",
              "objective": "<derive_from_technical_requirements>",
              "technical_context": "<extract_from_architecture_overview>",
              "implementation_strategy": "<derive_from_tech_stack>",
              "milestones": [
                {
                  "id": "<derive_from_header_context>",
                  "title": "<extract_from_master_plan>",
                  "status": "[<derive_from_iteration_state>]",
                  "objective": "<extract_from_technical_requirements>",
                  "description": "<derive_from_architecture_and_features>",
                  "technical_complexity": "<assess_from_architecture>",
                  "effort_estimate": "<derive_from_scope_and_complexity>",
                  "implementation_approach": "<derive_from_tech_stack>",
                  "test_strategy": "<derive_from_validation_requirements>",
                  "component_labels": ["<derive_from_architecture>"],
                  "inputs": ["<extract_from_dependencies>"],
                  "outputs": ["<derive_from_deliverables>"],
                  "validation": ["<extract_from_acceptance_criteria>"],
                  "dependencies": ["<extract_from_master_plan>"],
                  "iteration_delta": "<derive_from_change_tracking>"
                }
              ]
            }
          ],
          "status_summary": {
            "completed": [],
            "in_progress": [],
            "up_next": []
          },
          "technical_context": "<extract_from_synthesis_architecture>",
          "implementation_context": "<derive_from_tech_stack_analysis>",
          "test_framework": "<derive_from_validation_requirements>",
          "component_mapping": "<derive_from_architecture_components>"
        }
    }
  ],
  "assembled_json": [
    {
      "document_key": "updated_master_plan",
      "artifact_class": "assembled_document_json",
        "fields": [
          "index[]",
          "executive_summary",
          "phases[].name",
          "phases[].objective",
          "phases[].technical_context",
          "phases[].implementation_strategy",
          "phases[].milestones[].id",
          "phases[].milestones[].title",
          "phases[].milestones[].status",
          "phases[].milestones[].objective",
          "phases[].milestones[].description",
          "phases[].milestones[].technical_complexity",
          "phases[].milestones[].effort_estimate",
          "phases[].milestones[].implementation_approach",
          "phases[].milestones[].test_strategy",
          "phases[].milestones[].component_labels[]",
          "phases[].milestones[].inputs[]",
          "phases[].milestones[].outputs[]",
          "phases[].milestones[].validation[]",
          "phases[].milestones[].dependencies[]",
          "phases[].milestones[].acceptance_criteria[]",
          "phases[].milestones[].iteration_delta",
          "status_summary.completed[]",
          "status_summary.in_progress[]",
          "status_summary.up_next[]",
          "dependency_rules[]",
          "feature_scope[]",
          "features[]",
          "mvp_description",
          "market_opportunity",
          "competitive_analysis",
          "technical_context",
          "implementation_context",
          "test_framework",
          "component_mapping",
          "architecture_summary",
          "architecture",
          "services[]",
          "components[]",
          "integration_points[]",
          "dependency_resolution[]",
          "frontend_stack",
          "backend_stack",
          "data_platform",
          "devops_tooling",
          "security_tooling",
          "shared_libraries[]",
          "third_party_services[]"
        ]
    }
  ]
}
```

### Step 4: Generate Advisor Recommendations
- **Objective:** Evaluate the updated master plans produced in this iteration against the original user request, compile the comparison matrix, synthesize trade-off analysis, and issue a consolidated recommendation with tie-breaker guidance.
- **Orchestration Note:** This advisor turn is a cross-model aggregation job. Enqueue it only after every model-specific checklist and master plan turn (Steps 2 and 3 across all models) has completed successfully so all required artifacts are present.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `paralysis_advisor_recommendations_turn_v1`
- **Input Source References:**
  - `initial_user_prompt` (type `initial_user_prompt`, stage `project`, required)
  - `product_requirements` (type `document`, stage `synthesis`, required, multiple)
  - `updated_master_plan` (type `document`, stage `paralysis`, required, multiple)
  - `header_context` (type `header_context`, stage `paralysis`, required=false)
  - `advisor_recommendations` (type `document`, stage `paralysis`, required=false)
  - `advisor_recommendations` (type `feedback`, stage `paralysis`, required=false)
- **Output Artifact Description:** A single markdown + JSON artifact (`advisor_recommendations`) containing the weighted comparison matrix, comparative analysis, ranked options, final recommendation, and tie-breaker notes.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 4,
  "step_slug": "generate-advisor-recommendations",
  "job_type": "EXECUTE",
  "name": "Generate Advisor Recommendations",
  "prompt_template_id": "<system_prompts.id for paralysis_advisor_recommendations_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "project_resource", "stage_slug": "project", "document_key": "initial_user_prompt", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "product_requirements", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "paralysis", "document_key": "updated_master_plan", "required": true, "multiple": true },
    { "type": "header_context", "stage_slug": "paralysis", "document_key": "header_context", "required": false },
    { "type": "document", "stage_slug": "paralysis", "document_key": "advisor_recommendations", "required": false },
    { "type": "feedback", "stage_slug": "paralysis", "document_key": "advisor_recommendations", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "initial_user_prompt", "stage_slug": "project", "relevance": 1.0 },
    { "document_key": "product_requirements", "stage_slug": "synthesis", "relevance": 0.95 },
    { "document_key": "updated_master_plan", "stage_slug": "paralysis", "relevance": 0.95 },
    { "document_key": "header_context", "stage_slug": "paralysis", "relevance": 0.7 },
    { "document_key": "advisor_recommendations", "stage_slug": "paralysis", "relevance": 0.5 },
    { "document_key": "advisor_recommendations", "stage_slug": "paralysis", "type": "feedback", "relevance": 0.4 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "per_source_document",
  "outputs_required": {
    "documents": [
      {
        "document_key": "advisor_recommendations",
        "template_filename": "paralysis_advisor_recommendations.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown"
      }
    ],
    "assembled_json": [
      {
        "document_key": "advisor_recommendations",
        "artifact_class": "assembled_document_json",
        "fields": [
          "options[].id",
          "options[].scores[].dimension",
          "options[].scores[].weight",
          "options[].scores[].value",
          "options[].scores[].rationale",
          "options[].preferred",
          "analysis.summary",
          "analysis.tradeoffs",
          "analysis.consensus",
          "recommendation.rankings[]",
          "recommendation.tie_breakers[]"
        ]
      }
    ],
    "files_to_generate": [
      { "template_filename": "paralysis_advisor_recommendations.md", "from_document_key": "advisor_recommendations" }
    ]
  }
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "advisor_recommendations",
      "template_filename": "paralysis_advisor_recommendations.md",
      "content_to_include": {
        "comparison_matrix": [
          {
            "id": "Option A",
            "scores": [
              { "dimension": "alignment_with_constraints", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "completeness", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "feasibility", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "risk_mitigation", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "iteration_fit", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "strengths", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "weaknesses", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "opportunities", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "threats", "weight": 0.1, "value": 0.0, "rationale": "" },
              { "dimension": "dealer's choice", "weight": 0.1, "value": 0.0, "rationale": "" }
            ],
            "preferred": false
          }
        ],
        "comparative_analysis": {
          "summary": "",
          "tradeoffs": [],
          "consensus": []
        },
        "recommendation": {
          "rankings": [
            { "rank": 1, "option_id": "", "why": "", "when_to_choose": "" }
          ],
          "tie_breakers": []
        }
      }
    }
  ],
  "assembled_json": [
    {
      "document_key": "advisor_recommendations",
      "artifact_class": "assembled_document_json",
      "file_type": "json"
    }
  ]
}
```

## Transform Requirements

*   `[✅]` 1. `[DB]` Migrate the stage configuration to the recipe contract.
    *   `[✅]` 1.a. Insert the Step 1–4 rows for `paralysis_v1` into `dialectic_stage_recipes`, copying every field from the target state (branch keys, `inputs_required`, `inputs_relevance`, `outputs_required`, continuation rules).
    *   `[✅]` 1.b. Populate `dialectic_stage_recipe_edges` so Steps 2/3 depend on Step 1 and Step 4 depends on each checklist/master-plan branch row.
    *   `[✅]` 1.c. Update `dialectic_stages` to set `recipe_name = 'paralysis_v1'` and delete the legacy `input_artifact_rules` / `expected_output_artifacts` JSON so orchestration reads solely from the recipe table.

*   `[✅]` 2. `[DB]` Normalize Parenthesis → Paralysis inputs and backfill artifacts.
    *   `[✅]` 2.a. Confirm the Parenthesis stage writes documents using the exact keys consumed here (`technical_requirements`, `master_plan`, `milestone_schema`) and adjust prior migrations if any names deviate.
    *   `[✅]` 2.b. Seed lookups/backfill scripts so existing paralysis artifacts map to `actionable_checklist`, `updated_master_plan`, and `advisor_recommendations`, copying files to the new storage paths when reruns depend on them.
    *   `[✅]` 2.c. Ensure optional feedback artifacts keep the `{document_key}_feedback.md` naming convention so recipe inputs resolve without code changes.

*   `[ ]` 3. `[PROMPT]` Author and register planner/turn templates and overlays.
    *   `[✅]` 3.a. Add repository prompt files for `paralysis_planner_header_v1`, `paralysis_actionable_checklist_turn_v1`, `paralysis_updated_master_plan_turn_v1`, and `paralysis_advisor_recommendations_turn_v1`, matching the schemas in this document.
    *   `[✅]` 3.b. Insert the templates into `system_prompts` via migration, recording ids, names, versions, prompt types, and file paths for prompt assembler retrieval.
    *   `[✅]` 3.c. Update the Software Development overlay so `style_guide_markdown`, `generation_limits`, `document_order`, and iteration notes reference the new single advisor artifact and rely on the recipe’s `outputs_required` data instead of the deprecated `expected_output_artifacts_json` field. Review and remove obsolete keys from the domain_specific_prompt_overlays.overlay_values object. 
    *   `[✅]` 3.d. Refresh `Prompt Templating Examples.md`, stage worksheets, and related docs to document the four templates and the consolidated advisor artifact structure.

*   `[✅]` 7. `[DOCS]` Update downstream consumers and regression coverage.
    *   `[✅]` 7.b. Remove references to the deprecated `expected_output_artifacts_json` field, replacing them with recipe-table lookups or new artifact metadata.
