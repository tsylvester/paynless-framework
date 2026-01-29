##### Stage: Synthesis (`synthesis`)

###### Stage File Structure (Target)
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
      {model_slug}_{n}_{stage}_{document_key}.json
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
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for synthesis)
  - `Prompt Templating Examples.md` (Synthesis/Refinement section)
  - `dialectic_stage_recipes` synthesis recipe migration (if present)
  - `Dialectic Modeling Explanation.md` (narrative overview of fan-out/fan-in process)

### Current State (Snapshot — `dialectic_stages`)

> Source of truth: `public.dialectic_stages` seed in `20250613190311_domains_and_processes_improvement.sql` (rows seeded via INSERT + UPDATE); `input_artifact_rules` populated in `20250623201637_add_artifact_rules.sql`.

```json
{
  "slug": "synthesis",
  "display_name": "Synthesis",
  "description": "Combine the original ideas and critiques into a single, refined version.",
  "default_system_prompt": "dialectic_synthesis_base_v1" /* seeded inline in migration – template still monolithic */,
  "input_artifact_rules": {
    "sources": [
      {
        "type": "contribution",
        "stage_slug": "thesis",
        "purpose": "AI-generated proposals from the Thesis stage.",
        "required": true,
        "multiple": true,
        "section_header": "--- Proposals from Thesis Stage ---"
      },
      {
        "type": "feedback",
        "stage_slug": "thesis",
        "purpose": "User's feedback on the Thesis stage proposals.",
        "required": false,
        "multiple": false,
        "section_header": "--- User Feedback on Thesis Stage ---"
      },
      {
        "type": "contribution",
        "stage_slug": "antithesis",
        "purpose": "Critiques generated during the Antithesis stage.",
        "required": true,
        "multiple": true,
        "section_header": "--- Critiques from Antithesis Stage ---"
      },
      {
        "type": "feedback",
        "stage_slug": "antithesis",
        "purpose": "User's direct feedback on the critiques from the Antithesis stage.",
        "required": false,
        "multiple": false,
        "section_header": "--- User Feedback on Antithesis Stage Critiques ---"
      }
    ]
  },
}
```

**Immediate observations / gaps (per X.c.i.c):**

  - No `dialectic_stage_recipes` rows exist for Synthesis; orchestration still assumes a single PLAN/EXECUTE job pair with no explicit planner/header context separation.
  - Every entry in `input_artifact_rules.sources[]` is prose-only (no `document_key`, `lineage_key`, or `granularity` metadata). Workers therefore cannot isolate specific thesis documents vs. critiques—the implementation implicitly assumes all upstream artifacts are concatenated into one blob.
  - Antithesis critiques and user feedback are treated as single-stage aggregates (`multiple: true` without identifiers), revealing the assumption that the Synthesis prompt will manually braid them rather than receiving per-document handles.
  - `expected_output_artifacts` remains `NULL`, so downstream stages depend on whatever JSON structure the monolithic system prompt emits—there is no external contract for final PRD/architecture/tech-stack outputs or for intermediate manifest/header artifacts.
  - The default system prompt `dialectic_synthesis_base_v1` is still hard-coded inside the migration (no versioned repository file), making it difficult to diff or cite changes once the multi-step recipe lands.
  - There is no persisted storage path contract for headers/manifests; nothing in the current state describes where a `HeaderContext` or manifest would live if generated, reinforcing the monolithic assumption.

**Document-key normalization targets (X.c.ii.b):**

- `input_artifact_rules.sources[*]` need deterministic `document_key` values that match upstream Thesis and Antithesis artifacts (e.g., `business_case`, `business_case_critique`, `comparison_vector`). Today they are unlabeled, so follow-up work must align them with the document-centric namespaces defined in Thesis/Antithesis worksheets.
- Downstream Synthesis outputs (PRD, architecture overview, tech stack recommendations) currently surface only inside the monolithic prompt. When we define `expected_output_artifacts`, adopt the canonical keys from `Prompt Templating Examples.md` (`product_requirements`, `system_architecture`, `tech_stack`) so later stages can reference them.
- Intermediate artifacts outlined in the target recipe (pairwise syntheses, root consolidations, global manifest, header contexts) still need to be mapped onto the conventions already spelled out in the Stage File Structure block (model slug + iterator, document_key-based filenames, `_continuation_{c}` segments, etc.). The gap isn't inventing new patterns, but ensuring every planned artifact explicitly names its `document_key` so it slots cleanly into that existing structure.
- Any historical names embedded in existing code (e.g., `lineage_*`, `final_synthesis.md`) need to be mapped to the new document-centric identifiers to prevent orphaned references during migration.

**Stage overlays & shared style guide inputs (X.c.iv.a):**

- `supabase/migrations/20250626205506_add_software_domain_overlay_values.sql`
  - **System prompt:** `dialectic_synthesis_base_v1`
  - **Domain:** Software Development
  - **overlay_values` fields:**
    - `consolidation_instructions`: directs planners to combine thesis, critiques, and feedback into a unified document set.
    - `implementation_plan_expansion`: instructs the model to broaden the initial plan across frontend/backend/database/infrastructure.
    - `output_format`: expects two artifacts — "complete, updated set of planning documents" and "detailed, high-level implementation plan."
  - **Notes for document-centric follow-up:** overlay currently assumes monolithic outputs; when we split into planner/turn steps, this guidance must be redistributed (e.g., planner headers vs. per-document turns).
- No additional domain/global overlays for Synthesis were found (e.g., no style guide constants specific to the new planner/turn artifacts). Any new planner/manifest prompts will require fresh overlays or extensions to this base payload.

**Overlay gaps to author (X.c.iv.b):**

- `synthesis_pairwise_header_planner_v1` overlay: injects pairwise header role, consolidation directives, continuation rules, and enumerates `files_to_generate` for `synthesis_pairwise_*` JSON outputs.
- `synthesis_final_header_planner_v1` overlay: supplies global synthesis objectives, signal weighting guidance, and document directives for `product_requirements`, `system_architecture`, and `tech_stack` turns.
- Turn overlays:
  - Pairwise JSON turns (`synthesis_pairwise_business_case_turn_v1`, `synthesis_pairwise_feature_spec_turn_v1`, `synthesis_pairwise_technical_approach_turn_v1`, `synthesis_pairwise_success_metrics_turn_v1`).
  - Consolidation JSON turns (`synthesis_document_business_case_turn_v1`, `synthesis_document_feature_spec_turn_v1`, `synthesis_document_technical_approach_turn_v1`, `synthesis_document_success_metrics_turn_v1`).
  - Final markdown turns (`synthesis_product_requirements_turn_v1`, `synthesis_system_architecture_turn_v1`, `synthesis_tech_stack_turn_v1`).
- Continuation overlays: instructions for the pairwise/consolidation/final turns covering explicit (`reason: 'length'`) and corrective continuation messaging.
- Shared constants: any synthesis-specific quality rubrics or scoring guidance required by the new overlays must be extracted to style-guide entries so they can be reused downstream.

# Target State

## Recipe: `synthesis_v1`
- **Recipe Description:** Document-centric synthesis workflow that transforms each reviewed Thesis proposal plus its Antithesis critiques into a unified, cross-lineage solution and final deliverables.
- **Steps Count:** 5 (Step 1 prepare pairwise header, Step 2 run pairwise synthesis turns, Step 3 consolidate documents, Step 4 generate final header, Step 5 render final deliverables)

### Step 1: Prepare Pairwise Synthesis Header
- **Objective:** Produce a shared header context that frames how each Thesis document and its corresponding Antithesis critiques should be merged during the pairwise synthesis turns. This ensures consistent instructions, continuation policy, and lineage tracking before any document-level synthesis occurs.
- **Prompt Type:** `Planner`
- **Prompt Template Name:** `synthesis_pairwise_header_planner_v1`
- **Input Source References:**
  - `seed_prompt` (type `seed_prompt`, stage `synthesis`, required)
  - `business_case` (type `document`, stage `thesis`, required, multiple)
  - `feature_spec` (type `document`, stage `thesis`, required, multiple)
  - `technical_approach` (type `document`, stage `thesis`, required, multiple)
  - `success_metrics` (type `document`, stage `thesis`, required, multiple)
  - `business_case_critique` (type `document`, stage `antithesis`, required, multiple)
  - `technical_feasibility_assessment` (type `document`, stage `antithesis`, required, multiple)
  - `non_functional_requirements` (type `document`, stage `antithesis`, required, multiple)
  - `risk_register` (type `document`, stage `antithesis`, required, multiple)
  - `dependency_map` (type `document`, stage `antithesis`, required, multiple)
  - `comparison_vector` (type `document`, stage `antithesis`, required, multiple)
  - `business_case_critique` (type `feedback`, stage `antithesis`, required=false, multiple)
  - `technical_feasibility_assessment` (type `feedback`, stage `antithesis`, required=false, multiple)
  - `non_functional_requirements` (type `feedback`, stage `antithesis`, required=false, multiple)
  - `risk_register` (type `feedback`, stage `antithesis`, required=false, multiple)
  - `dependency_map` (type `feedback`, stage `antithesis`, required=false, multiple)
  - `comparison_vector` (type `feedback`, stage `antithesis`, required=false, multiple)
- **Output Artifact Description:** `header_context_pairwise.json` providing consolidated instructions, lineage metadata, and per-document guidance for the upcoming pairwise turns.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 1,
  "step_slug": "prepare-pairwise-synthesis-header",
  "job_type": "PLAN",
  "name": "Prepare Pairwise Synthesis Header",
  "prompt_template_id": "<system_prompts.id for synthesis_pairwise_header_planner_v1>",
  "prompt_type": "Planner",
  "inputs_required": [
    { "type": "seed_prompt", "stage_slug": "synthesis", "document_key": "seed_prompt", "required": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "business_case", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "feature_spec", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "technical_approach", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "success_metrics", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "business_case_critique", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "non_functional_requirements", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "risk_register", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "dependency_map", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "comparison_vector", "required": true, "multiple": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "business_case_critique", "required": false, "multiple": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": false, "multiple": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "non_functional_requirements", "required": false, "multiple": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "risk_register", "required": false, "multiple": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "dependency_map", "required": false, "multiple": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "comparison_vector", "required": false, "multiple": true }
  ],
  "inputs_relevance": [
    { "document_key": "seed_prompt", "stage_slug": "synthesis", "relevance": 0.6 },
    { "document_key": "business_case", "stage_slug": "thesis", "relevance": 1.0 },
    { "document_key": "feature_spec", "stage_slug": "thesis", "relevance": 0.95 },
    { "document_key": "technical_approach", "stage_slug": "thesis", "relevance": 0.95 },
    { "document_key": "success_metrics", "stage_slug": "thesis", "relevance": 0.9 },
    { "document_key": "business_case_critique", "stage_slug": "antithesis", "relevance": 0.95 },
    { "document_key": "technical_feasibility_assessment", "stage_slug": "antithesis", "relevance": 0.9 },
    { "document_key": "non_functional_requirements", "stage_slug": "antithesis", "relevance": 0.85 },
    { "document_key": "risk_register", "stage_slug": "antithesis", "relevance": 0.85 },
    { "document_key": "dependency_map", "stage_slug": "antithesis", "relevance": 0.8 },
    { "document_key": "comparison_vector", "stage_slug": "antithesis", "relevance": 0.85 },
    { "document_key": "business_case_critique", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.80 },
    { "document_key": "technical_feasibility_assessment", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.75 },
    { "document_key": "non_functional_requirements", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.70 },
    { "document_key": "risk_register", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.65 },
    { "document_key": "dependency_map", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.6 },
    { "document_key": "comparison_vector", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.55 }
  ],
  "output_type": "HeaderContext",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "system_materials": {
    "executive_summary": "Summarize the intent of merging each Thesis document with its corresponding Antithesis critiques.",
    "input_artifacts_summary": "Identify the thesis and antithesis artifacts that will be combined during pairwise synthesis.",
    "stage_rationale": "Explain that this stage ensures consistent pairwise synthesis before consolidating documents across models.",
    "decision_criteria": [
      "feasibility",
      "risk",
      "non_functional_requirements",
      "dependency_alignment",
      "stakeholder_objectives"
    ],
  },
  "header_context_artifact": {
    "type": "header_context",
    "document_key": "header_context_pairwise",
    "artifact_class": "header_context",
    "file_type": "json"
  },
  "context_for_documents": [
    {
      "document_key": "synthesis_pairwise_business_case",
      "content_to_include": {
        "thesis_document": "business_case",
        "critique_document": "business_case_critique",
        "comparison_signal": "comparison_vector",
        "executive_summary": "",
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "next_steps": "",
        "proposal_references": [],
        "resolved_positions": [],
        "open_questions": []
      }
    },
    {
      "document_key": "synthesis_pairwise_feature_spec",
      "content_to_include": {
        "thesis_document": "feature_spec",
        "feasibility_document": "technical_feasibility_assessment",
        "nfr_document": "non_functional_requirements",
        "comparison_signal": "comparison_vector",
        "features": [
          {
            "feature_name": "",
            "feature_objective": "",
            "user_stories": [],
            "acceptance_criteria": [],
            "dependencies": [],
            "success_metrics": [],
            "feasibility_insights": [],
            "non_functional_alignment": [],
            "score_adjustments": []
          }
        ],
        "feature_scope": [],
        "tradeoffs": []
      }
    },
    {
      "document_key": "synthesis_pairwise_technical_approach",
      "content_to_include": {
        "thesis_document": "technical_approach",
        "risk_document": "risk_register",
        "dependency_document": "dependency_map",
        "architecture": "",
        "components": [],
        "data": "",
        "deployment": "",
        "sequencing": "",
        "risk_mitigations": [],
        "dependency_resolution": [],
        "open_questions": []
      }
    },
    {
      "document_key": "synthesis_pairwise_success_metrics",
      "content_to_include": {
        "thesis_document": "success_metrics",
        "critique_document": "business_case_critique",
        "comparison_signal": "comparison_vector",
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": [],
        "leading_indicators": [],
        "lagging_indicators": [],
        "guardrails": [],
        "measurement_plan": "",
        "risk_signals": [],
        "next_steps": "",
        "metric_alignment": [],
        "tradeoffs": [],
        "validation_checks": []
      }
    }
  ],
  "files_to_generate": [
    { "template_filename": "synthesis_pairwise_business_case.json", "from_document_key": "synthesis_pairwise_business_case" },
    { "template_filename": "synthesis_pairwise_feature_spec.json", "from_document_key": "synthesis_pairwise_feature_spec" },
    { "template_filename": "synthesis_pairwise_technical_approach.json", "from_document_key": "synthesis_pairwise_technical_approach" },
    { "template_filename": "synthesis_pairwise_success_metrics.json", "from_document_key": "synthesis_pairwise_success_metrics" }
  ]
}
```

### Step 2a: Pairwise Synthesis – Business Case
- **Objective:** Combine the Thesis business case with its Antithesis critique and comparison vector to produce a structured synthesis for the business narrative.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_pairwise_business_case_turn_v1`
- **Input Source References:**
  - `header_context_pairwise` (type `header_context`, stage `synthesis`, required)
  - `business_case` (type `document`, stage `thesis`, required)
  - `business_case_critique` (type `document`, stage `antithesis`, required)
  - `comparison_vector` (type `document`, stage `antithesis`, required)
  - `business_case_critique` (type `feedback`, stage `antithesis`, required=false)
- **Output Artifact Description:** Assembled JSON capturing resolved business positions.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "pairwise_synthesis_business_case",
  "parallel_group": 2,
  "branch_key": "synthesis_pairwise_business_case",
  "job_type": "EXECUTE",
  "name": "Pairwise Synthesis – Business Case",
  "prompt_template_id": "<system_prompts.id for synthesis_pairwise_business_case_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "business_case", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "business_case_critique", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "comparison_vector", "required": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "business_case_critique", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context_pairwise", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "business_case", "stage_slug": "thesis", "relevance": 1.0 },
    { "document_key": "business_case_critique", "stage_slug": "antithesis", "relevance": 0.95 },
    { "document_key": "comparison_vector", "stage_slug": "antithesis", "relevance": 0.9 },
    { "document_key": "business_case_critique", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.8 }
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "per_source_document"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_pairwise_business_case",
      "template_filename": "synthesis_pairwise_business_case.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<derived from thesis artifact>",
      "source_model_slug": "<derived from thesis artifact>",
      "match_keys": [
        "<derived from antithesis reviewer or reviewer combination>"
      ],
      "content_to_include": {
        "executive_summary": "",
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "resolved_positions": [],
        "open_questions": [],
        "next_steps": "",
        "proposal_references": []
      }
    }
  ]
}
```

### Step 2b: Pairwise Synthesis – Feature Spec
- **Objective:** Merge the Thesis feature specification with Antithesis feasibility and non-functional findings plus comparison scores into a structured synthesis for delivery planning.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_pairwise_feature_spec_turn_v1`
- **Input Source References:**
  - `header_context_pairwise` (type `header_context`, stage `synthesis`, required)
  - `feature_spec` (type `document`, stage `thesis`, required)
  - `technical_feasibility_assessment` (type `document`, stage `antithesis`, required)
  - `non_functional_requirements` (type `document`, stage `antithesis`, required)
  - `comparison_vector` (type `document`, stage `antithesis`, required)
  - `technical_feasibility_assessment` (type `feedback`, stage `antithesis`, required=false)
  - `non_functional_requirements` (type `feedback`, stage `antithesis`, required=false)
  - `comparison_vector` (type `feedback`, stage `antithesis`, required=false)
- **Output Artifact Description:** Assembled JSON capturing reconciled MVP scope and feasibility notes.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "pairwise_synthesis_feature_spec",
  "parallel_group": 2,
  "branch_key": "synthesis_pairwise_feature_spec",
  "job_type": "EXECUTE",
  "name": "Pairwise Synthesis – Feature Spec",
  "prompt_template_id": "<system_prompts.id for synthesis_pairwise_feature_spec_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "feature_spec", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "non_functional_requirements", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "comparison_vector", "required": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "technical_feasibility_assessment", "required": false },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "non_functional_requirements", "required": false },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "comparison_vector", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context_pairwise", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "feature_spec", "stage_slug": "thesis", "relevance": 1.0 },
    { "document_key": "technical_feasibility_assessment", "stage_slug": "antithesis", "relevance": 0.95 },
    { "document_key": "non_functional_requirements", "stage_slug": "antithesis", "relevance": 0.9 },
    { "document_key": "comparison_vector", "stage_slug": "antithesis", "relevance": 0.85 },
    { "document_key": "technical_feasibility_assessment", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.8 },
    { "document_key": "non_functional_requirements", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.75 },
    { "document_key": "comparison_vector", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.7 }
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "per_source_document"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_pairwise_feature_spec",
      "template_filename": "synthesis_pairwise_feature_spec.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<derived from thesis artifact>",
      "source_model_slug": "<derived from thesis artifact>",
      "match_keys": [
        "<derived from antithesis reviewer or reviewer combination>"
      ],
      "content_to_include": {
        "feature_scope": [],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "score_adjustments": [],
        "features": [
          {
            "feature_name": "",
            "feature_objective": "",
            "user_stories": [],
            "acceptance_criteria": [],
            "dependencies": [],
            "success_metrics": [],
            "risk_mitigation": "",
            "open_questions": ""
          }
        ],
        "tradeoffs": []
      }
    }
  ]
}
```

### Step 2c: Pairwise Synthesis – Technical Approach
- **Objective:** Combine Thesis technical approach guidance with Antithesis risk and dependency findings.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_pairwise_technical_approach_turn_v1`
- **Input Source References:**
  - `header_context_pairwise` (type `header_context`, stage `synthesis`, required)
  - `technical_approach` (type `document`, stage `thesis`, required)
  - `risk_register` (type `document`, stage `antithesis`, required)
  - `dependency_map` (type `document`, stage `antithesis`, required)
  - `risk_register` (type `feedback`, stage `antithesis`, required=false)
  - `dependency_map` (type `feedback`, stage `antithesis`, required=false)
- **Output Artifact Description:** Assembled JSON summarizing reconciled architecture decisions and mitigation strategies.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "pairwise_synthesis_technical_approach",
  "parallel_group": 2,
  "branch_key": "synthesis_pairwise_technical_approach",
  "job_type": "EXECUTE",
  "name": "Pairwise Synthesis – Technical Approach",
  "prompt_template_id": "<system_prompts.id for synthesis_pairwise_technical_approach_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "technical_approach", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "risk_register", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "dependency_map", "required": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "risk_register", "required": false },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "dependency_map", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context_pairwise", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "technical_approach", "stage_slug": "thesis", "relevance": 1.0 },
    { "document_key": "risk_register", "stage_slug": "antithesis", "relevance": 0.95 },
    { "document_key": "dependency_map", "stage_slug": "antithesis", "relevance": 0.9 },
    { "document_key": "risk_register", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.78 },
    { "document_key": "dependency_map", "stage_slug": "antithesis", "type": "feedback", "relevance": 0.74 }
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "per_source_document"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_pairwise_technical_approach",
      "template_filename": "synthesis_pairwise_technical_approach.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<derived from thesis artifact>",
      "source_model_slug": "<derived from thesis artifact>",
      "match_keys": [
        "<derived from antithesis reviewer or reviewer combination>"
      ],
      "content_to_include": {
        "architecture_alignment": [],
        "risk_mitigations": [],
        "dependency_resolution": [],
        "architecture": "",
        "components": [],
        "data": "",
        "deployment": "",
        "sequencing": "",
        "open_questions": []
      }
    }
  ]
}
```

### Step 2d: Pairwise Synthesis – Success Metrics
- **Objective:** Merge Thesis success metrics with Antithesis critique signals to finalize measurable outcomes.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_pairwise_success_metrics_turn_v1`
- **Input Source References:**
  - `header_context_pairwise` (type `header_context`, stage `synthesis`, required)
  - `success_metrics` (type `document`, stage `thesis`, required)
  - `business_case_critique` (type `document`, stage `antithesis`, required)
  - `comparison_vector` (type `document`, stage `antithesis`, required)
  - `business_case_critique` (type `feedback`, stage `antithesis`, required=false)
  - `comparison_vector` (type `feedback`, stage `antithesis`, required=false)
- **Output Artifact Description:** Assembled JSON detailing validated success metrics and trade-offs.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "pairwise_synthesis_success_metrics",
  "parallel_group": 2,
  "branch_key": "synthesis_pairwise_success_metrics",
  "job_type": "EXECUTE",
  "name": "Pairwise Synthesis – Success Metrics",
  "prompt_template_id": "<system_prompts.id for synthesis_pairwise_success_metrics_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "synthesis", "document_key": "header_context_pairwise", "required": true },
    { "type": "document", "stage_slug": "thesis", "document_key": "success_metrics", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "business_case_critique", "required": true },
    { "type": "document", "stage_slug": "antithesis", "document_key": "comparison_vector", "required": true },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "business_case_critique", "required": false },
    { "type": "feedback", "stage_slug": "antithesis", "document_key": "comparison_vector", "required": false }
  ],
  "inputs_relevance": [
    { "document_key": "header_context_pairwise", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "success_metrics", "stage_slug": "thesis", "relevance": 1.0 },
    { "document_key": "business_case_critique", "stage_slug": "antithesis", "relevance": 0.9 },
    { "document_key": "comparison_vector", "stage_slug": "antithesis", "relevance": 0.85 },
    { "document_key": "business_case_critique", "stage_slug": "antithesis", "relevance": 0.8, "type": "feedback" },
    { "document_key": "comparison_vector", "stage_slug": "antithesis", "relevance": 0.75, "type": "feedback"  }
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "per_source_document"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_pairwise_success_metrics",
      "template_filename": "synthesis_pairwise_success_metrics.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<derived from thesis artifact>",
      "source_model_slug": "<derived from thesis artifact>",
      "match_keys": [
        "<derived from antithesis reviewer or reviewer combination>"
      ],
      "content_to_include": {
        "thesis_document": "success_metrics",
        "critique_document": "business_case_critique",
        "comparison_signal": "comparison_vector",
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": [],
        "leading_indicators": [],
        "lagging_indicators": [],
        "guardrails": [],
        "measurement_plan": "",
        "risk_signals": [],
        "next_steps": "",
        "metric_alignment": [],
        "tradeoffs": [],
        "validation_checks": []
      }
    }
  ]
}
```

### Step 3a: Synthesize Business Case Across Models
- **Objective:** For the current model, merge all pairwise business case syntheses for the same document across its thesis lineages and antithesis reviewers into one consolidated document-level synthesis.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_document_business_case_turn_v1`
- **Input Source References:**
  - `synthesis_pairwise_business_case` (type `document`, stage `synthesis`, required, multiple)
- **Output Artifact Description:** Assembled JSON `synthesis_document_business_case.json` describing the unified business case synthesis.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 3,
  "step_slug": "synthesize_document_business_case",
  "parallel_group": 3,
  "branch_key": "synthesize_document_business_case",
  "job_type": "EXECUTE",
  "name": "Synthesize Business Case Across Models",
  "prompt_template_id": "<system_prompts.id for synthesis_document_business_case_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_pairwise_business_case", "required": true, "multiple": true },
  ],
  "inputs_relevance": [
    { "document_key": "synthesis_pairwise_business_case", "stage_slug": "synthesis", "relevance": 1.0 },
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_document_business_case",
      "template_filename": "synthesis_document_business_case.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<>",
      "source_model_slug": "<>",
      "content_to_include": {
        "executive_summary": "",
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "resolved_positions": [],
        "open_questions": [],
        "next_steps": "",
        "proposal_references": []
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "synthesis_document_business_case.json",
      "from_document_key": "synthesis_document_business_case"
    }
  ]
}
```

### Step 3b: Synthesize Feature Spec Across Models
- **Objective:** Combine all pairwise feature spec syntheses into a single document-level synthesis covering the MVP scope and feasibility signals.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_document_feature_spec_turn_v1`
- **Input Source References:**
  - `synthesis_pairwise_feature_spec` (type `document`, stage `synthesis`, required, multiple)
- **Output Artifact Description:** Assembled JSON `synthesis_document_feature_spec.json` recording the reconciled feature plan.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 3,
  "step_slug": "synthesize_document_feature_spec",
  "parallel_group": 3,
  "branch_key": "synthesize_document_feature_spec",
  "job_type": "EXECUTE",
  "name": "Synthesize Feature Spec Across Models",
  "prompt_template_id": "<system_prompts.id for synthesis_document_feature_spec_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_pairwise_feature_spec", "required": true, "multiple": true },
  ],
  "inputs_relevance": [
    { "document_key": "synthesis_pairwise_feature_spec", "stage_slug": "synthesis", "relevance": 1.0 },
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_document_feature_spec",
      "template_filename": "synthesis_document_feature_spec.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<>",
      "source_model_slug": "<>",
      "content_to_include": {
        "feature_scope": [],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "score_adjustments": [],
        "features": [
          {
            "feature_name": "",
            "feature_objective": "",
            "user_stories": [],
            "acceptance_criteria": [],
            "dependencies": [],
            "success_metrics": [],
            "risk_mitigation": "",
            "open_questions": ""
          }
        ],
        "tradeoffs": []
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "synthesis_document_feature_spec.json",
      "from_document_key": "synthesis_document_feature_spec"
    }
  ]
}
```

### Step 3c: Synthesize Technical Approach Across Models
- **Objective:** Combine all pairwise technical approach syntheses into one document-level synthesis.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_document_technical_approach_turn_v1`
- **Input Source References:**
  - `synthesis_pairwise_technical_approach` (type `document`, stage `synthesis`, required, multiple)
- **Output Artifact Description:** Assembled JSON `synthesis_document_technical_approach.json` capturing reconciled architecture decisions.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 3,
  "step_slug": "synthesize_document_technical_approach",
  "parallel_group": 3,
  "branch_key": "synthesize_document_technical_approach",
  "job_type": "EXECUTE",
  "name": "Synthesize Technical Approach Across Models",
  "prompt_template_id": "<system_prompts.id for synthesis_document_technical_approach_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_pairwise_technical_approach", "required": true, "multiple": true }
  ],
  "inputs_relevance": [
    { "document_key": "synthesis_pairwise_technical_approach", "stage_slug": "synthesis", "relevance": 1.0 },
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_document_technical_approach",
      "template_filename": "synthesis_document_technical_approach.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<>",
      "source_model_slug": "<>",
      "content_to_include": {
        "architecture_alignment": [],
        "risk_mitigations": [],
        "dependency_resolution": []
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "synthesis_document_technical_approach.json",
      "from_document_key": "synthesis_document_technical_approach"
    }
  ]
}
```

### Step 3d: Synthesize Success Metrics Across Models
- **Objective:** Merge all pairwise success metric syntheses into a consolidated view that records validated metrics and outstanding trade-offs.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_document_success_metrics_turn_v1`
- **Input Source References:**
  - `synthesis_pairwise_success_metrics` (type `document`, stage `synthesis`, required, multiple)
- **Output Artifact Description:** Assembled JSON `synthesis_document_success_metrics.json` capturing reconciled success metrics.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 3,
  "step_slug": "synthesize_document_success_metrics",
  "parallel_group": 3,
  "branch_key": "synthesize_document_success_metrics",
  "job_type": "EXECUTE",
  "name": "Synthesize Success Metrics Across Models",
  "prompt_template_id": "<system_prompts.id for synthesis_document_success_metrics_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_pairwise_success_metrics", "required": true, "multiple": true }
  ],
  "inputs_relevance": [
    { "document_key": "synthesis_pairwise_success_metrics", "stage_slug": "synthesis", "relevance": 1.0 }
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "synthesis_document_success_metrics",
      "template_filename": "synthesis_document_success_metrics.json",
      "artifact_class": "assembled_json",
      "file_type": "json",
      "lineage_key": "<>",
      "source_model_slug": "<>",
      "content_to_include": {
        "metric_alignment": [],
        "tradeoffs": [],
        "validation_checks": [],
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": [],
        "leading_indicators": [],
        "lagging_indicators": [],
        "guardrails": [],
        "measurement_plan": "",
        "risk_signals": [],
        "next_steps": ""
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "synthesis_document_success_metrics.json",
      "from_document_key": "synthesis_document_success_metrics"
    }
  ]
}
```

### Step 4: Generate Final Synthesis Header
- **Objective:** Produce the header context that directs downstream turns on how to render the final deliverables using the consolidated synthesis documents.
- **Prompt Type:** `Planner`
- **Prompt Template Name:** `synthesis_final_header_planner_v1`
- **Input Source References:**
  - `seed_prompt` (type `seed_prompt`, stage `synthesis`, required)
  - `synthesis_document_business_case` (type `document`, stage `synthesis`, required)
  - `synthesis_document_feature_spec` (type `document`, stage `synthesis`, required)
  - `synthesis_document_technical_approach` (type `document`, stage `synthesis`, required)
  - `synthesis_document_success_metrics` (type `document`, stage `synthesis`, required)
- **Output Artifact Description:** `header_context.json` describing system materials, continuation policy, and document guidance for final rendering.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 4,
  "step_slug": "generate-final-synthesis-header",
  "job_type": "PLAN",
  "name": "Generate Final Synthesis Header",
  "prompt_template_id": "<system_prompts.id for synthesis_final_header_planner_v1>",
  "prompt_type": "Planner",
  "inputs_required": [
    { "type": "seed_prompt", "stage_slug": "synthesis", "document_key": "seed_prompt", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true }
  ],
  "inputs_relevance": [
    { "document_key": "seed_prompt", "stage_slug": "synthesis", "relevance": 0.6 },
    { "document_key": "synthesis_document_business_case", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "synthesis_document_feature_spec", "stage_slug": "synthesis", "relevance": 0.95 },
    { "document_key": "synthesis_document_technical_approach", "stage_slug": "synthesis", "relevance": 0.95 },
    { "document_key": "synthesis_document_success_metrics", "stage_slug": "synthesis", "relevance": 0.9 }
  ],
  "output_type": "HeaderContext",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "system_materials": {
    "executive_summary": "Outline/index of all outputs in this response and how they connect to the objective",
    "input_artifacts_summary": "Succinct summary of prior proposals, critiques, and user feedback included in this synthesis",
    "stage_rationale": "Decision record explaining how signals and critiques informed selections, how conflicts were resolved, gaps were filled, and why chosen approaches best meet constraints",
    "progress_update": "For continuation turns, summarize what is complete vs remaining; omit on first turn",
    "signal_sources": ["synthesis_document_business_case", "synthesis_document_feature_spec", "synthesis_document_technical_approach", "synthesis_document_success_metrics"],
    "decision_criteria": [
      "feasibility",
      "complexity",
      "security",
      "performance",
      "maintainability",
      "scalability",
      "cost",
      "time_to_market",
      "compliance_risk",
      "alignment_with_constraints"
    ],
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
    ]
  },
  "header_context_artifact": {
    "type": "header_context",
    "document_key": "header_context",
    "artifact_class": "header_context",
    "file_type": "json"
  },
  "context_for_documents": [
    {
      "document_key": "product_requirements",
      "content_to_include": {
        "executive_summary": "",
        "mvp_description": "",
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "feature_scope": [],
        "features": [
          {
            "feature_name": "",
            "feature_objective": "",
            "user_stories": [],
            "acceptance_criteria": [],
            "dependencies": [],
            "success_metrics": [],
            "risk_mitigation": "",
            "open_questions": "",
            "tradeoffs": []
          }
        ],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "score_adjustments": [],
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": [],
        "leading_indicators": [],
        "lagging_indicators": [],
        "guardrails": [],
        "measurement_plan": "",
        "risk_signals": [],
        "resolved_positions": [],
        "open_questions": [],
        "next_steps": "",
        "proposal_references": [],
        "release_plan": [],
        "assumptions": [],
        "open_decisions": [],
        "implementation_risks": [],
        "stakeholder_communications": []
      }
    },
    {
      "document_key": "system_architecture",
      "content_to_include": {
        "architecture_summary": "",
        "architecture": "",
        "services": [],
        "components": [],
        "data_flows": [],
        "interfaces": [],
        "integration_points": [],
        "dependency_resolution": [],
        "conflict_flags": [],
        "sequencing": "",
        "risk_mitigations": [],
        "risk_signals": [],
        "security_measures": [],
        "infra_diagram_outline": [],
        "observability_strategy": [],
        "scalability_plan": [],
        "resilience_strategy": [],
        "compliance_controls": [],
        "open_questions": []
      }
    },
    {
      "document_key": "tech_stack",
      "content_to_include": {
        "frontend_stack": {},
        "backend_stack": {},
        "data_platform": {},
        "devops_tooling": {},
        "security_tooling": {},
        "shared_libraries": [],
        "third_party_services": [],
        "components": [
          {
            "component_name": "",
            "recommended_option": "",
            "rationale": "",
            "alternatives": [],
            "tradeoffs": [],
            "risk_signals": [],
            "integration_requirements": [],
            "operational_owners": [],
            "migration_plan": []
          }
        ],
        "open_questions": [],
        "next_steps": []
      }
    }
  ],
  "files_to_generate": [
    { "template_filename": "synthesis_product_requirements_document.md", "from_document_key": "product_requirements" },
    { "template_filename": "synthesis_system_architecture.md", "from_document_key": "system_architecture" },
    { "template_filename": "synthesis_tech_stack.md", "from_document_key": "tech_stack" }
  ]
}
```

### Step 5a: Render Final PRD
- **Objective:** Produce the final PRD using the business-case synthesis as the primary input, with additional context provided by the other synthesized documents.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_product_requirements_turn_v1`
- **Input Source References:**
  - `header_context` (type `header_context`, stage `synthesis`, required)
  - `synthesis_document_business_case` (type `document`, stage `synthesis`, required)
  - `synthesis_document_feature_spec` (type `document`, stage `synthesis`, required)
  - `synthesis_document_technical_approach` (type `document`, stage `synthesis`, required)
  - `synthesis_document_success_metrics` (type `document`, stage `synthesis`, required)
- **Output Artifact Description:** Final Markdown PRD aligned with the document-centric structure.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 5,
  "step_slug": "render-product_requirements",
  "parallel_group": 5,
  "branch_key": "product_requirements",
  "job_type": "EXECUTE",
  "name": "Render Final PRD",
  "prompt_template_id": "<system_prompts.id for synthesis_product_requirements_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "synthesis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "synthesis_document_business_case", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "synthesis_document_feature_spec", "stage_slug": "synthesis", "relevance": 0.9 },
    { "document_key": "synthesis_document_technical_approach", "stage_slug": "synthesis", "relevance": 0.85 },
    { "document_key": "synthesis_document_success_metrics", "stage_slug": "synthesis", "relevance": 0.8 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "product_requirements",
      "template_filename": "synthesis_product_requirements_document.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "lineage_key": "<>",
      "source_model_slug": "<>",
      "content_to_include": {
        "executive_summary": "",
        "mvp_description": "",
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "feature_scope": [],
        "features": [
          {
            "feature_name": "",
            "feature_objective": "",
            "user_stories": [],
            "acceptance_criteria": [],
            "dependencies": [],
            "success_metrics": [],
            "risk_mitigation": "",
            "open_questions": "",
            "tradeoffs": []
          }
        ],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "score_adjustments": [],
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": [],
        "leading_indicators": [],
        "lagging_indicators": [],
        "guardrails": [],
        "measurement_plan": "",
        "risk_signals": [],
        "resolved_positions": [],
        "open_questions": [],
        "next_steps": "",
        "proposal_references": [],
        "release_plan": [],
        "assumptions": [],
        "open_decisions": [],
        "implementation_risks": [],
        "stakeholder_communications": []
      }
    }
  ]
}
```

### Step 5b: Render Final System Architecture Overview
- **Objective:** Generate the final architecture overview using the technical approach synthesis as the primary input, enriched by supporting syntheses.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_system_architecture_turn_v1`
- **Input Source References:**
  - `header_context` (type `header_context`, stage `synthesis`, required)
  - `synthesis_document_technical_approach` (type `document`, stage `synthesis`, required)
  - `synthesis_document_feature_spec` (type `document`, stage `synthesis`, required)
  - `synthesis_document_business_case` (type `document`, stage `synthesis`, required)
  - `synthesis_document_success_metrics` (type `document`, stage `synthesis`, required)
- **Output Artifact Description:** Final Markdown architecture overview.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 5,
  "step_slug": "render-system-architecture-overview",
  "parallel_group": 5,
  "branch_key": "system_architecture",
  "job_type": "EXECUTE",
  "name": "Render Final System Architecture Overview",
  "prompt_template_id": "<system_prompts.id for synthesis_system_architecture_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "synthesis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "synthesis_document_technical_approach", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "synthesis_document_feature_spec", "stage_slug": "synthesis", "relevance": 0.9 },
    { "document_key": "synthesis_document_business_case", "stage_slug": "synthesis", "relevance": 0.82 },
    { "document_key": "synthesis_document_success_metrics", "stage_slug": "synthesis", "relevance": 0.78 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "system_architecture",
      "template_filename": "synthesis_system_architecture.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "lineage_key": "<>",
      "source_model_slug": "<>",
      "content_to_include": {
        "architecture_summary": "",
        "architecture": "",
        "services": [],
        "components": [],
        "data_flows": [],
        "interfaces": [],
        "integration_points": [],
        "dependency_resolution": [],
        "conflict_flags": [],
        "sequencing": "",
        "risk_mitigations": [],
        "risk_signals": [],
        "security_measures": [],
        "observability_strategy": [],
        "scalability_plan": [],
        "resilience_strategy": [],
        "compliance_controls": [],
        "open_questions": []
      }
    }
  ]
}
```

### Step 5c: Render Final Tech Stack Recommendations
- **Objective:** Produce the final tech stack guidance using the technical approach synthesis as the primary input with supporting context for trade-offs and success measures.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `synthesis_tech_stack_turn_v1`
- **Input Source References:**
  - `header_context` (type `header_context`, stage `synthesis`, required)
  - `synthesis_document_technical_approach` (type `document`, stage `synthesis`, required)
  - `synthesis_document_feature_spec` (type `document`, stage `synthesis`, required)
  - `synthesis_document_success_metrics` (type `document`, stage `synthesis`, required)
  - `synthesis_document_business_case` (type `document`, stage `synthesis`, required)
- **Output Artifact Description:** Final Markdown tech stack guidance.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 5,
  "step_slug": "render-tech-stack-recommendations",
  "parallel_group": 5,
  "branch_key": "tech_stack",
  "job_type": "EXECUTE",
  "name": "Render Final Tech Stack Recommendations",
  "prompt_template_id": "<system_prompts.id for synthesis_tech_stack_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    { "type": "header_context", "stage_slug": "synthesis", "document_key": "header_context", "required": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_technical_approach", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_feature_spec", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_success_metrics", "required": true, "multiple": true },
    { "type": "document", "stage_slug": "synthesis", "document_key": "synthesis_document_business_case", "required": true, "multiple": true }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "synthesis_document_technical_approach", "stage_slug": "synthesis", "relevance": 1.0 },
    { "document_key": "synthesis_document_feature_spec", "stage_slug": "synthesis", "relevance": 0.88 },
    { "document_key": "synthesis_document_success_metrics", "stage_slug": "synthesis", "relevance": 0.85 },
    { "document_key": "synthesis_document_business_case", "stage_slug": "synthesis", "relevance": 0.8 }
  ],
  "output_type": "RenderedDocument",
  "granularity_strategy": "all_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "tech_stack",
      "template_filename": "synthesis_tech_stack.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "lineage_key": "<>",
      "source_model_slug": "<>",
      "content_to_include": [
        {
          "component_name": "",
          "recommended_option": "",
          "rationale": "",
          "alternatives": [],
          "tradeoffs": [],
          "risk_signals": [],
          "integration_requirements": [],
          "operational_owners": [],
          "migration_plan": []
        }
      ],
      "frontend_stack": {},
      "backend_stack": {},
      "data_platform": {},
      "devops_tooling": {},
      "security_tooling": {},
      "shared_libraries": [],
      "third_party_services": [],
      "open_questions": [],
      "next_steps": []
    }
  ]
}
```

**Migration / Refactor Notes:**
- Rewrite `expected_output_artifacts` JSON to match final document keys seen above.
- Ensure downstream stages (Parenthesis, Paralysis) reference these exact keys in their `inputs_required` sections.
- Update prompt assembler to merge manifest excerpts with template instructions when building final turn prompts.

---

> As we populate actual values, use the "Current Snapshot → Issues → Target" structure to ensure every transform is documented before implementation.

# Transform Requirements

*   `[✅]` 1. [PROMPT] Create planner template `synthesis_pairwise_header_planner_v1` for Step 1.
    *   `[✅]` 1.a. Author `docs/prompts/synthesis/synthesis_pairwise_header_planner_v1.md` implementing the Step 1 HeaderContext schema (system_materials, context_for_documents, files_to_generate).
    *   `[✅]` 1.b. Insert a `system_prompts` row for this template (id, name, version, storage path) in a new migration.
    *   `[✅]` 1.c. Add the Step 1 `dialectic_stage_recipes` row (`step_number=1`, `step_slug='prepare-pairwise-synthesis-header'`, `job_type='PLAN'`, `prompt_type='Planner'`, `granularity_strategy='all_to_one'`, `output_type='HeaderContext'`) with the `inputs_required` / `inputs_relevance` arrays and HeaderContext outputs exactly as defined above.
    *   `[✅]` 1.d. Create `dialectic_stage_recipe_edges` entries linking the Step 1 planner row to every Step 2 pairwise branch so the worker fans out EXECUTE jobs after the planner completes.

*   `[✅]` 2. [PROMPT] Create pairwise turn templates for Step 2 branches.
    *   `[✅]` 2.a. Author turn templates `synthesis_pairwise_business_case_turn_v1.md`, `synthesis_pairwise_feature_spec_turn_v1.md`, `synthesis_pairwise_technical_approach_turn_v1.md`, and `synthesis_pairwise_success_metrics_turn_v1.md` under `docs/prompts/synthesis/` using the JSON schemas provided in Step 2a–2d.
    *   `[✅]` 2.b. Seed corresponding `system_prompts` rows for each turn template.
    *   `[✅]` 2.c. Insert the Step 2 `dialectic_stage_recipes` rows (`step_number=2`, `parallel_group=2`, `branch_key` per document) by copying the full `inputs_required` and `inputs_relevance` arrays from the Target definitions—include every Thesis document, all Antithesis documents referenced (e.g., critiques, feasibility assessments, NFRs, risk registers, dependency maps, comparison vectors), and the matching Antithesis feedback entries—so the runtime dependencies match the header context contracts while still emitting `output_type='AssembledDocumentJson'`, `granularity_strategy='per_source_document'`, and the documented `outputs_required` payloads (including the `match_keys` array that captures reviewer lineage or reviewer combinations).
    *   `[✅]` 2.d. Register `dialectic_stage_recipe_edges` from Step 1 planner to each Step 2 branch.
    *   `[✅]` 2.e. `[PROMPT]` For each pairwise document key (`synthesis_pairwise_business_case`, `synthesis_pairwise_feature_spec`, `synthesis_pairwise_technical_approach`, `synthesis_pairwise_success_metrics`), author the corresponding `.json` template file in `docs/templates/synthesis/` (naming matches the filenames in the target schema) and seed `dialectic_document_templates` rows pointing to those files, ensuring the template schema exposes the `match_keys` array alongside `lineage_key` / `source_model_slug`. Call out in code review that runtime persistence must store and carry `match_keys` forward so downstream consolidations keep reviewer lineage intact.

*   `[ ]` 3. [PROMPT] Create document-level consolidation turn templates for Step 3 branches.
    *   `[✅]` 3.a. Author templates `synthesis_document_business_case_turn_v1.md`, `synthesis_document_feature_spec_turn_v1.md`, `synthesis_document_technical_approach_turn_v1.md`, and `synthesis_document_success_metrics_turn_v1.md` that ingest the pairwise artifacts and emit the Stage 3 assembled JSON structures.
    *   `[✅]` 3.b. Add `system_prompts` rows for the Step 3 turn templates.
    *   `[✅]` 3.c. Insert Step 3 `dialectic_stage_recipes` rows (`step_number=3`, `parallel_group=3`, `branch_key` per document, `job_type='EXECUTE'`, `prompt_type='Turn'`, `granularity_strategy='all_to_one'`, `output_type='AssembledDocumentJson'`) capturing the required inputs, relevance weights, and outputs.
    *   `[✅]` 3.d. Add `dialectic_stage_recipe_edges` connecting each Step 2 branch to its corresponding Step 3 consolidation row.
    *   `[✅]` 3.e. `[PROMPT]` Author the consolidated document templates (`synthesis_document_business_case.json`, `synthesis_document_feature_spec.json`, `synthesis_document_technical_approach.json`, `synthesis_document_success_metrics.json`) and seed their `dialectic_document_templates` entries so the storage layer can render assembled JSON outputs for Step 3, including the new `files_to_generate` bindings.

*   `[ ]` 4. [PROMPT] Create planner template `synthesis_final_header_planner_v1` for Step 4.
    *   `[✅]` 4.a. Author `docs/prompts/synthesis/synthesis_final_header_planner_v1.md` covering the Step 4 HeaderContext schema and continuation policy.
    *   `[✅]` 4.b. Seed the `system_prompts` row for `synthesis_final_header_planner_v1`.
    *   `[✅]` 4.c. Insert the Step 4 planner row (`step_number=4`, `job_type='PLAN'`, `prompt_type='Planner'`, `granularity_strategy='all_to_one'`, `output_type='HeaderContext'`) with the listed consolidated-document inputs and relevance ordering.
    *   `[✅]` 4.d. Create `dialectic_stage_recipe_edges` linking every Step 3 branch to the Step 4 planner so the orchestrator awaits all consolidations before generating the final header.

*   `[ ]` 5. [PROMPT] Create final turn templates for Step 5 deliverables.
    *   `[✅]` 5.a. Author `synthesis_product_requirements_turn_v1.md`, `synthesis_system_architecture_turn_v1.md`, and `synthesis_tech_stack_turn_v1.md` using the Step 5 schemas (PRD, system architecture overview, tech stack recommendations).
    *   `[✅]` 5.b. Seed `system_prompts` rows for the three Step 5 turn templates.
    *   `[✅]` 5.c. Insert Step 5 `dialectic_stage_recipes` rows (`step_number=5`, `parallel_group=5`, `branch_key` per deliverable, `job_type='EXECUTE'`, `prompt_type='Turn'`, `granularity_strategy='all_to_one'`, `output_type='RenderedDocument'`) including all consolidated-document inputs and the header context.
    *   `[✅]` 5.d. Add recipe edges from the Step 4 planner to each Step 5 branch.
    *   `[✅]` 5.e. `[PROMPT]` Create and seed the final rendered markdown templates (`synthesis_product_requirements_document.md`, `synthesis_system_architecture.md`, `synthesis_tech_stack.md`) in the repository and `dialectic_document_templates` so rendering jobs have canonical outputs. Ensure the system-architecture template exposes discrete sections for `architecture_summary`, `services`, `data_flows`, `security_measures`, `integration_points`, and `rationale` to match the updated schema.

*   `[ ]` 6. [DB] Update stage configuration and recipe metadata.
    *   `[✅]` 6.a. Set `dialectic_stages.recipe_name = 'synthesis_v1'` and remove the legacy monolithic `input_artifact_rules` / `expected_output_artifacts` payloads from the stage row; those contracts are now expressed through `dialectic_stage_recipes` and `dialectic_document_templates`.
    *   `[✅]` 6.b. Audit migrations/seeds and runtime lookups to ensure no code path reintroduces or depends on the removed columns; confirm every consumer now reads inputs/outputs from the recipe-driven tables.
    *   `[✅]` 6.c. Author and seed a new non-monolithic `synthesis_seed_prompt_v1` template, point `dialectic_stages.default_system_prompt_id` (and any seed-loading callers) to the new template, then remove the legacy `dialectic_synthesis_base_v1` entry once the cut-over is complete.
    *   `[✅]` 6.d. Populate `dialectic_stages.expected_output_template_ids` with the final deliverable template ids (`product_requirements`, `system_architecture`, `tech_stack`) so downstream stages can reference the canonical files.

*   `[✅]` 7. [PROMPT] Extend overlay data for multi-step synthesis.
    *   `[✅]` 7.a. Add planner-specific overlay values (e.g., header context directives, manifest guidance) for `synthesis_pairwise_header_planner_v1` and `synthesis_final_header_planner_v1` and remove the legacy monolithic `output_format` payload so new templates are the only source of deliverable contracts. Double-check for any leftover monolithic directives or style-guide fragments that could reintroduce conflicting guidance after the new overlays land.
    *   `[✅]` 7.b. Add turn-level overlay fields for pairwise/document/final turns (stage instructions, quality checks, continuation guidance) and reference them in the new templates. Strip any obsolete directives (e.g., `implementation_plan_expansion`) that conflict with per-document outputs.
    *   `[✅]` 7.c. Ensure all overlays are stored in repository files or migrations with provenance IDs for future updates, documenting both the additions and removals.
    *   `[✅]` 7.d. Baseline removal of `output_format` and other monolithic overlay keys in the migration bundle so downstream consumers no longer receive conflicting guidance.

*   `[✅]` 10. [DB] Seed recipe graph edges, branch metadata, and file exports.
    *   `[✅]` 10.a. Populate `dialectic_stage_recipe_edges` for every parent/child relationship (Step 1 → Step 2; Step 2 → Step 3; Step 3 → Step 4; Step 4 → Step 5).
    *   `[✅]` 10.b. Include `parallel_group` and `branch_key` values in the seed data so worker orchestration can parallelize pairwise/document/final turns predictably.
    *   `[✅]` 10.c. Seed `files_to_generate` records for each Stage 3 consolidated document so storage lookups resolve the new template filenames.
