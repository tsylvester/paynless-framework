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
      "key": "technical_requirements",
      "template_filename": "parenthesis_technical_requirements.md",
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
    { "template_filename": "parenthesis_technical_requirements.md", "from_document_key": "technical_requirements" },
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

# Target State

## Recipe: `parenthesis_v1`
- **Recipe Description:** Document-centric planning workflow that converts Synthesis deliverables into an iterative Technical Requirements Document, Master Plan, and Milestone Schema.
- **Steps Count:** 4 sequential steps (1 planner, 3 turns)

### Step 1: Build Planning Header
- **Objective:** Emit `header_context_parenthesis.json` that captures scope, dependency expectations, milestone status preservation rules, and continuation policy for iterative reruns.
- **Prompt Type:** `Planner`
- **Prompt Template Name:** `parenthesis_planner_header_v1`
- **Input Source References:**
  - `seed_prompt` (type `seed_prompt`, stage `parenthesis`, required)
  - `product_requirements` (type `document`, stage `synthesis`, required)
  - `system_architecture` (type `document`, stage `synthesis`, required)
  - `tech_stack` (type `document`, stage `synthesis`, required)
  - `product_requirements` (type `feedback`, stage `synthesis`, required=false)
  - `system_architecture` (type `feedback`, stage `synthesis`, required=false)
  - `tech_stack` (type `feedback`, stage `synthesis`, required=false)
  - `master_plan` (type `document`, stage `parenthesis`, required=false)
  - `master_plan` (type `feedback`, stage `parenthesis`, required=false)
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
    { "type": "document", "stage_slug": "synthesis", "document_key": "product_requirements", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "system_architecture", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "tech_stack", "required": true },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "product_requirements", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "system_architecture", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "tech_stack", "required": false },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "seed_prompt", "stage_slug": "parenthesis", "relevance": 0.6 },
    { "document_key": "product_requirements", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "system_architecture", "stage_slug": "synthesis", "relevance": 0.95 },
    { "document_key": "tech_stack", "stage_slug": "synthesis", "relevance": 0.90 },
    { "document_key": "product_requirements", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.75 },
    { "document_key": "system_architecture", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.70 },
    { "document_key": "tech_stack", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.65 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.99 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 }
  ],
  "output_type": "HeaderContext",
  "granularity_strategy": "all_to_one"
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
      "unstarted_status": "[ ]"
    },
    "technical_requirements_outline_inputs": {
      "subsystems": [],
      "apis": [],
      "schemas": [],
      "proposed_file_tree": "",
      "architecture_overview": ""
    }
  },
  "header_context_artifact": {
    "document_key": "header_context",
    "artifact_class": "header_context",
    "file_type": "json"
  },
  "context_for_documents": [
    {
      "document_key": "technical_requirements",
      "template_filename": "parenthesis_technical_requirements.md",
      "content_to_include": {
        "subsystems": [],
        "apis": [],
        "schemas": [],
        "proposed_file_tree": "",
        "architecture_overview": "",
        "feature_scope": [],
        "features": [],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": [],
        "guardrails": [],
        "measurement_plan": "",
        "architecture_summary": "",
        "architecture": "",
        "services": [],
        "components": [],
        "data_flows": [],
        "interfaces": [],
        "integration_points": [],
        "dependency_resolution": [],
        "security_measures": [],
        "observability_strategy": [],
        "scalability_plan": [],
        "resilience_strategy": [],
        "frontend_stack": {},
        "backend_stack": {},
        "data_platform": {},
        "devops_tooling": {},
        "security_tooling": {},
        "shared_libraries": [],
        "third_party_services": []
      }
    },
    {
      "document_key": "master_plan",
      "template_filename": "parenthesis_master_plan.md",
      "content_to_include": {
        "phases": [],
        "status_markers": {
          "unstarted": "[ ]",
          "in_progress": "[🚧]",
          "completed": "[✅]"
        },
        "dependency_rules": [],
        "generation_limits": {
          "max_steps": 200,
          "target_steps": "120-180",
          "max_output_lines": "600-800"
        },
        "feature_scope": [],
        "features": [],
        "executive_summary": "",
        "mvp_description": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "architecture_summary": "",
        "architecture": "",
        "services": [],
        "components": [],
        "integration_points": [],
        "dependency_resolution": [],
        "frontend_stack": {},
        "backend_stack": {},
        "data_platform": {},
        "devops_tooling": {},
        "security_tooling": {},
        "shared_libraries": [],
        "third_party_services": []
      }
    },
    {
      "document_key": "milestone_schema",
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
        "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps will be generated in the next stage.",
        "features": [],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "success_metrics": [],
        "architecture_summary": "",
        "services": [],
        "components": [],
        "dependency_resolution": [],
        "components": [],
        "integration_requirements": [],
        "migration_context": []
      }
    }
  ]
}
```

Include the latest committed `master_plan` document and any feedback when rerunning the stage so the planner can maintain status markers across iterations.

### Step 2: Generate Technical Requirements Document
- **Objective:** Produce the updated TRD that aligns synthesized architecture with the planner’s milestone breakdown and captures deltas from any previous iteration.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `parenthesis_technical_requirements_turn_v1`
- **Input Source References:**
  - `header_context_parenthesis` (type `header_context`, stage `parenthesis`, required)
  - `system_architecture` (type `document`, stage `synthesis`, required)
  - `tech_stack` (type `document`, stage `synthesis`, required)
  - `product_requirements` (type `document`, stage `synthesis`, required)
  - `technical_requirements` (type `document`, stage `parenthesis`, required=false — include the prior TRD when this stage is rerun)
  - `system_architecture` (type `feedback`, stage `synthesis`, required=false)
  - `tech_stack` (type `feedback`, stage `synthesis`, required=false)
  - `product_requirements` (type `feedback`, stage `synthesis`, required=false)
  - `technical_requirements` (type `feedback`, stage `parenthesis`, required=false — include the latest TRD feedback on iterative runs)
- **Output Artifact Description:** Markdown TRD plus assembled JSON capturing subsystems, APIs, schemas, file tree, and architecture rationale.

When this step is executed for subsequent iterations, provide the most recent `technical_requirements` document and feedback so the turn prompt can describe deltas accurately.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-technical_requirements",
  "job_type": "EXECUTE",
  "name": "Generate Technical Requirements Document",
  "branch_key": "technical_requirements",
  "prompt_template_id": "<system_prompts.id for parenthesis_technical_requirements_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "system_architecture", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "tech_stack", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "product_requirements", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "system_architecture", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "tech_stack", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "product_requirements", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "parenthesis", "relevance": 1.0 },
    { "document_key": "system_architecture", "stage_slug": "synthesis", "relevance": 0.95 },
    { "document_key": "tech_stack", "stage_slug": "synthesis", "relevance": 0.9 },
    { "document_key": "product_requirements", "stage_slug": "synthesis", "relevance": 0.85 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "relevance": 0.99 },
    { "document_key": "system_architecture", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.80 },
    { "document_key": "tech_stack", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.75 },
    { "document_key": "product_requirements", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.50 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.83 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "per_source_document",
  "outputs_required": {
    "documents": [
      {
        "document_key": "technical_requirements",
        "template_filename": "parenthesis_technical_requirements.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown",
        "content_to_include": {
          "index": [],
          "executive_summary": "",
          "subsystems": [{ "name": "", "objective": "", "implementation_notes": "" }],
          "apis": [{ "name": "", "description": "", "contracts": [] }],
          "schemas": [{ "name": "", "columns": [], "indexes": [], "rls": [] }],
          "proposed_file_tree": "",
          "architecture_overview": "",
          "delta_summary": "",
          "iteration_notes": ""
        }
      }
    ],
    "files_to_generate": [
      { "template_filename": "parenthesis_technical_requirements.md", "from_document_key": "technical_requirements" }
    ],
    "assembled_json": [
      {
        "document_key": "technical_requirements",
        "artifact_class": "assembled_document_json",
        "fields": [
          "subsystems[].name",
          "subsystems[].objective",
          "subsystems[].implementation_notes",
          "apis[].name",
          "apis[].description",
          "apis[].contracts[]",
          "schemas[].name",
          "schemas[].columns[]",
          "schemas[].indexes[]",
          "schemas[].rls[]",
          "proposed_file_tree",
          "architecture_overview",
          "delta_summary",
          "iteration_notes",
          "feature_scope[]",
          "feasibility_insights[]",
          "non_functional_alignment[]",
          "outcome_alignment",
          "north_star_metric",
          "primary_kpis[]",
          "guardrails[]",
          "measurement_plan",
          "architecture_summary",
          "architecture",
          "services[]",
          "components[]",
          "data_flows[]",
          "interfaces[]",
          "integration_points[]",
          "dependency_resolution[]",
          "security_measures[]",
          "observability_strategy[]",
          "scalability_plan[]",
          "resilience_strategy[]",
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
}
```

### Step 3: Generate Master Plan
- **Objective:** Output the dependency-ordered Master Plan marking just-detailed milestones `[🚧]`, preserving completed `[✅]`, and leaving future milestones `[ ]` for subsequent iterations.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `parenthesis_master_plan_turn_v1`
- **Input Source References:**
  - `header_context_parenthesis` (type `header_context`, stage `parenthesis`, required)
  - `technical_requirements` (type `document`, stage `parenthesis`, required)
  - `master_plan` (type `document`, stage `parenthesis`, required=false — supply the prior plan on later iterations)
  - `product_requirements` (type `document`, stage `synthesis`, required)
  - `technical_requirements` (type `feedback`, stage `parenthesis`, required=false)
  - `master_plan` (type `feedback`, stage `parenthesis`, required=false — include status feedback when rerunning)
  - `product_requirements` (type `feedback`, stage `synthesis`, required=false)
- **Output Artifact Description:** Markdown Master Plan plus JSON manifest enumerating phases, milestones, dependencies, acceptance criteria, and status markers.

Present the previously generated Master Plan and feedback during iterative runs so the turn can preserve existing statuses and add `[🚧]` markers only where new work is detailed.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 3,
  "step_slug": "generate-master-plan",
  "job_type": "EXECUTE",
  "name": "Generate Master Plan",
  "branch_key": "master_plan",
  "prompt_template_id": "<system_prompts.id for parenthesis_master_plan_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "document", "stage_slug": "synthesis", "document_key": "product_requirements", "required": true },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "technical_requirements", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "feedback", "stage_slug": "synthesis", "document_key": "product_requirements", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "parenthesis", "relevance": 1.0 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "relevance": 0.95 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.99 },
    { "document_key": "product_requirements", "stage_slug": "synthesis", "relevance": 0.75 },
    { "document_key": "technical_requirements", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.90 },
    { "document_key": "product_requirements", "stage_slug": "synthesis", "type": "feedback", "relevance": 0.70 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "per_source_document",
  "outputs_required": {
    "documents": [
      {
        "document_key": "master_plan",
        "template_filename": "parenthesis_master_plan.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown",
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
    ],
    "files_to_generate": [
      { "template_filename": "parenthesis_master_plan.md", "from_document_key": "master_plan" }
    ],
    "assembled_json": [
      {
        "document_key": "master_plan",
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
}
```

### Step 4: Generate Milestone Schema
- **Objective:** Define reusable milestone field schema and style-guide notes so Paralysis can author detailed checklists per milestone.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `parenthesis_milestone_schema_turn_v1`
- **Input Source References:**
  - `header_context_parenthesis` (type `header_context`, stage `parenthesis`, required)
  - `master_plan` (type `document`, stage `parenthesis`, required)
  - `milestone_schema` (type `document`, stage `parenthesis`, required=false — include prior schema when refining the structure)
  - `master_plan` (type `feedback`, stage `parenthesis`, required=false)
  - `milestone_schema` (type `feedback`, stage `parenthesis`, required=false — provide prior schema feedback on iterative runs)
- **Output Artifact Description:** Markdown milestone schema plus JSON descriptor covering canonical fields and style-guide notes.

Provide the previous milestone schema and related feedback on subsequent executions so the schema can evolve without losing prior guidance.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 4,
  "step_slug": "generate-milestone-schema",
  "job_type": "EXECUTE",
  "name": "Generate Milestone Schema",
  "branch_key": "milestone_schema",
  "prompt_template_id": "<system_prompts.id for parenthesis_milestone_schema_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "parenthesis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "master_plan", "required": true },
    { "type": "document", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "master_plan", "required": false },
    { "type": "feedback", "stage_slug": "parenthesis", "document_key": "milestone_schema", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "parenthesis", "relevance": 1.0 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "relevance": 0.90 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "relevance": 0.95 },
    { "document_key": "master_plan", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.80 },
    { "document_key": "milestone_schema", "stage_slug": "parenthesis", "type": "feedback", "relevance": 0.85 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "per_source_document",
  "outputs_required": {
    "documents": [
      {
        "document_key": "milestone_schema",
        "template_filename": "parenthesis_milestone_schema.md",
        "artifact_class": "rendered_document",
        "file_type": "markdown",
        "content_to_include": {
          "index": [],
          "executive_summary": "",
          "fields": [
            {
              "name": "id",
              "type": "string",
              "description": "Stable milestone identifier (e.g., M1, M1.a)"
            },
            {
              "name": "title",
              "type": "string",
              "description": "Short milestone name"
            },
            {
              "name": "objective",
              "type": "string",
              "description": "Narrative summary of milestone goal"
            },
            {
              "name": "dependencies",
              "type": "string[]",
              "description": "List of prerequisite milestone IDs"
            },
            {
              "name": "acceptance_criteria",
              "type": "string[]",
              "description": "Checklist of validation outcomes"
            },
            {
              "name": "inputs",
              "type": "string[]",
              "description": "Artifacts required before work begins"
            },
            {
              "name": "outputs",
              "type": "string[]",
              "description": "Artifacts produced when milestone completes"
            },
            {
              "name": "status",
              "type": "enum",
              "values": ["[ ]", "[🚧]", "[✅]"],
              "description": "Current completion status"
            }
          ],
          "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps belong to next stage.",
          "validation_rules": [
            "Status must be one of [ ], [🚧], [✅]",
            "Dependencies must reference existing milestone IDs",
            "Acceptance criteria must be non-empty for every milestone"
          ],
          "iteration_guidance": {
            "reuse_policy": "Carry forward schema; append new fields under migration log if expanded",
            "versioning": "Increment schema_version when fields change"
          }
        }
      }
    ],
    "files_to_generate": [
      { "template_filename": "parenthesis_milestone_schema.md", "from_document_key": "milestone_schema" }
    ],
    "assembled_json": [
      {
        "document_key": "milestone_schema",
        "artifact_class": "assembled_document_json",
        "fields": [
          "fields[].name",
          "fields[].type",
          "fields[].description",
          "fields[].values[]",
          "style_guide_notes",
          "validation_rules[]",
          "iteration_guidance.reuse_policy",
          "iteration_guidance.versioning",
          "features[]",
          "feasibility_insights[]",
          "non_functional_alignment[]",
          "architecture_summary",
          "services[]",
          "components[]",
          "dependency_resolution[]",
          "component_details[]",
          "integration_requirements[]",
          "migration_context[]"
        ]
      }
    ]
  }
}
```

> *Future extension:* Once iterative forecasting artifacts are defined, insert additional planner/turn steps that generate iteration seeds or backlog harmonization manifests prior to Paralysis.

# Transform Requirements

*   `[ ]` 1. `[PROMPT]` Author and register Parenthesis planner/turn templates.
    *   `[✅]` 1.a. Create `docs/prompts/parenthesis/parenthesis_planner_header_v1.md` implementing the Step 1 header context schema (system_materials milestone rules, context_for_documents entries, continuation policy) using the overlay guidance for Parenthesis.
    *   `[✅]` 1.b. Author `docs/prompts/parenthesis/parenthesis_technical_requirements_turn_v1.md`, `parenthesis_master_plan_turn_v1.md`, and `parenthesis_milestone_schema_turn_v1.md`, each matching the markdown + assembled JSON structures defined in Steps 2–4 (including delta summaries, status markers, iteration notes, validation rules).
    *   `[✅]` 1.c. Insert new `system_prompts` rows for all four templates in a migration, documenting id/name/version/prompt_type/stage associations and storing file paths so they can be retrieved by the PromptAssembler.
    *   `[✅]` 1.d. Update the Parenthesis entry in `domain_specific_prompt_overlays` (Software Development domain) to add per-template overlay values (role, stage instructions, style-guide snippets, continuation wording). Remove the obsolete `expected_output_artifacts_json` payload and any other obsolete keys once the planner template supplies the contract to avoid duplicate definitions.

*   `[ ]` 2. `[DB]` Seed `dialectic_stage_recipes` rows and execution graph.
    *   `[✅]` 2.a. Insert the Step 1 planner row (`step_number=1`, `step_slug='build-planning-header'`, `job_type='PLAN'`, `prompt_type='Planner'`, `granularity_strategy='all_to_one'`) along with the exact `inputs_required` and `inputs_relevance` values from the target state (seed prompt, Synthesis deliverables/feedback, optional prior master plan + feedback, header context schema).
    *   `[✅]` 2.b. Insert Step 2, Step 3, and Step 4 turn rows for `technical_requirements`, `master_plan`, and `milestone_schema` (`job_type='EXECUTE'`, `prompt_type='Turn'`, `granularity_strategy='per_source_document'`, `branch_key` set to the document key) capturing all required inputs (header context, Synthesis artifacts, optional prior Parenthesis documents + feedback), relevance weights, markdown/JSON outputs, and continuation policies.
    *   `[✅]` 2.c. Populate `dialectic_stage_recipe_edges` so Step 1 → Step 2 → Step 3 → Step 4, ensuring orchestration waits for each dependency before scheduling the next step.

*   `[✅]` 3. `[DB]` Update Parenthesis stage configuration.
    *   `[✅]` 3.a. Set `dialectic_stages.recipe_template_id = v_template_id` to link the stage to the `parenthesis_v1` recipe template.
    *   `[✅]` 3.b. Populate `expected_output_template_ids` with the template IDs for `parenthesis_technical_requirements.md`, `parenthesis_master_plan.md`, and `parenthesis_milestone_schema.md` so downstream stages can fetch canonical files by id.
    *   `[✅]` 3.c. Record migration provenance for the stage configuration changes.

*   `[✅]` 4. `[PROMPT]` Verify and seed Parenthesis document templates.
    *   `[✅]` 4.a. Confirm the markdown templates referenced by the target state exist (update them if necessary to include status markers, iteration/delta sections, dependency summaries, validation bullets).
    *   `[✅]` 4.b. If any template is missing, create it under `docs/templates/parenthesis/` (or the repository's template location) and seed a matching `dialectic_document_templates` row with the correct bucket/path/document_key so `files_to_generate` pointers resolve.
