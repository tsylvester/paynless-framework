# Stage: Antithesis (`antithesis`)

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
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for antithesis)
  - `Prompt Templating Examples.md` (Review/Antithesis section)
  - `dialectic_stage_recipes` antithesis recipe migration (if present)

# Current State

- Stage metadata (from latest seed/migration snapshot):
  - `stage_slug`: `antithesis`
  - `display_name`: `Antithesis`
  - `default_system_prompt_id`: `dialectic_antithesis_base_v1`
  - No dedicated `dialectic_stage_recipes` table exists yet; recipe information is implicitly encoded in `dialectic_stages` payload columns.
- `input_artifact_rules` (as stored today):
```json
{
  "sources": [
    {
      "type": "contribution",
      "stage_slug": "thesis",
      "purpose": "AI-generated proposals from the preceding stage.",
      "required": true,
      "multiple": true,
      "section_header": "--- Proposals from Previous Stage ---"
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "purpose": "User's direct feedback on the proposals from the preceding stage.",
      "required": false,
      "multiple": false,
      "section_header": "--- User Feedback on Previous Stage ---"
    }
  ]
}
```
- `expected_output_artifacts` (current JSON from stage payload):
```json
{
  "system_materials": {
    "executive_summary": "concise overview of key findings across all proposals",
    "input_artifacts_summary": "summary of proposals and any user feedback included for review",
    "stage_rationale": "explain the review approach and criteria used",
    "progress_update": "for continuation turns, summarize completed vs pending review areas; omit on first turn",
    "validation_checkpoint": [
      "major technical concerns identified",
      "risk mitigation strategies proposed",
      "alternatives considered where applicable",
      "references and standards checked"
    ],
    "quality_standards": [
      "evidence-based",
      "actionable",
      "balanced",
      "complete"
    ]
  },
  "documents": [
    {
      "key": "per_proposal_critique",
      "template_filename": "antithesis_per_proposal_critique.md",
      "content_to_include": {
        "proposal_id": "placeholder",
        "source_model_slug": "placeholder",
        "strengths": ["placeholder"],
        "weaknesses": ["placeholder"],
        "recommendations": ["placeholder"],
        "notes": ["placeholder"]
      }
    },
    {
      "key": "technical_feasibility_assessment",
      "template_filename": "antithesis_feasibility_assessment.md",
      "content_to_include": "feasibility across constraints (team, timeline, cost), integration with existing systems, and compliance"
    },
    {
      "key": "risk_register",
      "template_filename": "antithesis_risk_register.md",
      "content_to_include": [
        { "risk": "placeholder", "impact": "placeholder", "likelihood": "placeholder", "mitigation": "placeholder" }
      ]
    },
    {
      "key": "non_functional_requirements",
      "template_filename": "antithesis_non_functional_requirements.md",
      "content_to_include": ["security", "performance", "reliability", "scalability", "maintainability", "compliance"]
    },
    {
      "key": "dependency_map",
      "template_filename": "antithesis_dependency_map.md",
      "content_to_include": "mapping of major components and their inter-dependencies; highlight conflicts and sequencing concerns"
    },
    {
      "key": "comparison_vector",
      "template_filename": "antithesis_comparison_vector.json",
      "content_to_include": {
        "proposal_id": "placeholder",
        "dimensions": {
          "feasibility": { "score": 3, "rationale": "placeholder" },
          "complexity": { "score": 3, "rationale": "placeholder" },
          "security": { "score": 3, "rationale": "placeholder" },
          "performance": { "score": 3, "rationale": "placeholder" },
          "maintainability": { "score": 3, "rationale": "placeholder" },
          "scalability": { "score": 3, "rationale": "placeholder" },
          "cost": { "score": 3, "rationale": "placeholder" },
          "time_to_market": { "score": 3, "rationale": "placeholder" },
          "compliance_risk": { "score": 3, "rationale": "placeholder" },
          "alignment_with_constraints": { "score": 3, "rationale": "placeholder" }
        }
      }
    }
  ],
  "files_to_generate": [
    { "template_filename": "antithesis_per_proposal_critique.md", "from_document_key": "per_proposal_critique" },
    { "template_filename": "antithesis_feasibility_assessment.md", "from_document_key": "technical_feasibility_assessment" },
    { "template_filename": "antithesis_risk_register.md", "from_document_key": "risk_register" },
    { "template_filename": "antithesis_non_functional_requirements.md", "from_document_key": "non_functional_requirements" },
    { "template_filename": "antithesis_dependency_map.md", "from_document_key": "dependency_map" },
    { "template_filename": "antithesis_comparison_vector.json", "from_document_key": "comparison_vector" }
  ]
}
```
- Stage overlays (current `domain_specific_prompt_overlays` entry for Antithesis / Software Development domain — seeded in `20250613190311_domains_and_processes_improvement.sql`):
```json
{
  "role": "senior reviewer and feasibility analyst",
  "stage_instructions": "for the provided proposal only, critically analyze against constraints, standards, and references; identify gaps, risks, inconsistencies, and integration issues; produce clear, actionable recommendations and normalized comparison signals for downstream synthesis;",
  "style_guide_markdown": "<Style Guide excerpt injected via seed; see StyleGuide.md §§1, 2.b, 3, 8, 9.b>",
  "expected_output_artifacts_json": { "system_materials": { ... }, "documents": [ ... ], "files_to_generate": [ ... ] }
}
```
- Application: When assembling the review prompts, the overlay merges with the base template to supply reviewer role, instructions, style guide, and the output artifact schema listed above.

## Seed Prompt Dependency
- Seed prompt artifact for the review stage is saved at `{stage}/seed_prompt.md` and encapsulates the proposals to be critiqued.
- The Antithesis planner (to be defined) consumes Thesis documents listed in the `input_artifact_rules`, emits `context/header_context.json`, and downstream turn prompts reference that header context for per-document critiques and assessments.

# Target State

## Recipe: `antithesis_v1`
- **Recipe Description:** Per-proposal review workflow that converts a single Thesis proposal into a complete critique bundle for downstream synthesis.
- **Steps Count:** 7 (one planner step followed by six branch documents) executed once per proposal.

### Step 1: Prepare Proposal Review Plan
- **Objective:** Produce the per-proposal `HeaderContext` describing how to critique a single Thesis proposal, the risk lenses to apply, and how to normalize findings.
- **Prompt Type:** `Planner`
- **Prompt Template Name:** `antithesis_planner_review_v1` *(new template – to be authored)*
- **Input Source References:**
  - `seed_prompt` (type `seed_prompt`, stage `antithesis`, required) – anchors the review instructions for this stage/run.
  - `business_case` (type `documents`, stage `thesis`, required) – provides the proposal narrative under review.
  - `feature_spec` (type `documents`, stage `thesis`, required) – supplies granular feature data for feasibility analysis.
  - `technical_approach` (type `documents`, stage `thesis`, required) – informs architecture, dependency, and non-functional review.
  - `success_metrics` (type `documents`, stage `thesis`, required) – frames how success will be evaluated for this proposal.
  - `business_case` (type `feedback`, stage `thesis`, required=false) – optional user feedback saved alongside the Thesis business case document.
  - `feature_spec` (type `feedback`, stage `thesis`, required=false) – optional user feedback aligned to the MVP feature specification document.
  - `technical_approach` (type `feedback`, stage `thesis`, required=false) – optional user feedback for the high-level technical approach document.
  - `success_metrics` (type `feedback`, stage `thesis`, required=false) – optional user feedback for the success metrics document.
- **Output Artifact Description:** `header_context.json` capturing per-proposal review metadata, request-specific constraints, and document-specific guidance for the downstream turn prompts.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 1,
  "step_slug": "prepare-proposal-review-plan",
  "job_type": "PLAN",
  "name": "Prepare Proposal Review Plan",
  "prompt_template_id": "<system_prompts.id for antithesis_planner_review_v1>",
  "prompt_type": "Planner",
  "inputs_required": [
    {
      "type": "seed_prompt",
      "stage_slug": "antithesis",
      "document_key": "seed_prompt",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": true
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": false
    }
  ],
  "inputs_relevance": [
    { "document_key": "seed_prompt", "relevance": 1.0 },
    { "document_key": "business_case", "relevance": 1.0 },
    { "document_key": "feature_spec", "relevance": 0.9 },
    { "document_key": "technical_approach", "relevance": 0.9 },
    { "document_key": "success_metrics", "relevance": 0.8 },
    { "document_key": "business_case", "type": "feedback", "relevance": 0.6 },
    { "document_key": "feature_spec", "type": "feedback", "relevance": 0.6 },
    { "document_key": "technical_approach", "type": "feedback", "relevance": 0.6 },
    { "document_key": "success_metrics", "type": "feedback", "relevance": 0.6 }
  ],
  "output_type": "HeaderContext",
  "granularity_strategy": "per_source_document_by_lineage"
}
```

**Step Outputs Schema (target):**
```json
{
  "system_materials": {
    "executive_summary": "concise overview of key findings across all proposals",
    "input_artifacts_summary": "summary of proposals and any user feedback included for review",
    "stage_rationale": "explain the review approach and criteria used",
    "progress_update": "for continuation turns, summarize completed vs pending review areas; omit on first turn",
    "validation_checkpoint": [
      "major technical concerns identified",
      "risk mitigation strategies proposed",
      "alternatives considered where applicable",
      "references and standards checked"
    ],
    "quality_standards": [
      "evidence-based",
      "actionable",
      "balanced",
      "complete"
    ]
  },
  "review_metadata": {
    "proposal_identifier": {
      "lineage_key": "<from the file name of the proposal being reviewed>",
      "source_model_slug": "<from the file name of the proposal being reviewed>"
    },
    "proposal_summary": "",
    "review_focus": [
      "feasibility",
      "risk",
      "non_functional_requirements",
      "dependencies",
      "comparison_signals"
    ],
    "user_constraints": [],
    "normalization_guidance": {
      "scoring_scale": "1-5",
      "required_dimensions": [
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
      ]
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
      "document_key": "business_case_critique",
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
        "next_steps": "",
        "proposal_references": [],
        "recommendations": [],
        "notes": []
      }
    },
    {
      "document_key": "technical_feasibility_assessment",
      "content_to_include": {
        "constraint_checklist": [
          "team",
          "timeline",
          "cost",
          "integration",
          "compliance"
        ],
        "findings": [
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
        "architecture": "",
        "components": "",
        "data": "",
        "deployment": "",
        "sequencing": "",
        "risk_mitigation": "",
        "open_questions": ""
      }
    },
    {
      "document_key": "risk_register",
      "content_to_include": [
        {
          "risk": "",
          "impact": "",
          "likelihood": "",
          "mitigation": "",
          "components": "",
          "dependencies": [],
          "sequencing": "",
          "risk_mitigation": "",
          "open_questions": "",
          "guardrails": "",
          "risk_signals": "",
          "next_steps": ""
        }
      ]
    },
    {
      "document_key": "non_functional_requirements",
      "content_to_include": {
        "security": "",
        "performance": "",
        "reliability": "",
        "scalability": "",
        "maintainability": "",
        "compliance": "",
        "outcome_alignment": "",
        "primary_kpis": "",
        "leading_indicators": "",
        "lagging_indicators": "",
        "guardrails": "",
        "measurement_plan": "",
        "risk_signals": "",
        "next_steps": ""
      }
    },
    {
      "document_key": "dependency_map",
      "content_to_include": {
        "components": [],
        "integration_points": [],
        "conflict_flags": [],
        "dependencies": [],
        "sequencing": "",
        "risk_mitigation": "",
        "open_questions": ""
      }
    },
    {
      "document_key": "comparison_vector",
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
        "dimensions": {
          "feasibility": { "score": 3, "rationale": "placeholder" },
          "complexity": { "score": 3, "rationale": "placeholder" },
          "security": { "score": 3, "rationale": "placeholder" },
          "performance": { "score": 3, "rationale": "placeholder" },
          "maintainability": { "score": 3, "rationale": "placeholder" },
          "scalability": { "score": 3, "rationale": "placeholder" },
          "cost": { "score": 3, "rationale": "placeholder" },
          "time_to_market": { "score": 3, "rationale": "placeholder" },
          "compliance_risk": { "score": 3, "rationale": "placeholder" },
          "alignment_with_constraints": { "score": 3, "rationale": "placeholder" }
        }
      }
    }
  ]
}
```

### Step 2a: Generate Per-Proposal Critique (parallel)
- **Objective:** Produce the critique document with strengths, weaknesses, recommendations, and reviewer notes for the single proposal.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `antithesis_business_case_critique_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context` (type `header_context`, stage `antithesis`, required) – directs critique focus and normalization for the current proposal.
  - `business_case` (type `documents`, stage `thesis`, required) – provides proposal narrative content for the critique.
  - `feature_spec` (type `documents`, stage `thesis`, required) – offers feature-level detail to evaluate coverage and alignment.
  - `technical_approach` (type `documents`, stage `thesis`, required) – supplies architecture context for integration commentary.
  - `success_metrics` (type `documents`, stage `thesis`, required) – frames evaluation criteria for strengths/weaknesses.
  - `business_case` (type `feedback`, stage `thesis`, required=false) – optional user feedback associated with the business case.
  - `feature_spec` (type `feedback`, stage `thesis`, required=false) – optional user feedback for the feature specification.
  - `technical_approach` (type `feedback`, stage `thesis`, required=false) – optional user insight regarding the technical approach.
  - `success_metrics` (type `feedback`, stage `thesis`, required=false) – optional user feedback about success metrics.
- **Output Artifact Description:** Renders the `business_case_critique` Markdown document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-business-case-critique",
  "parallel_group": 2,
  "branch_key": "business_case_critique",
  "job_type": "EXECUTE",
  "name": "Generate Per-Proposal Critique",
  "prompt_template_id": "<system_prompts.id for antithesis_business_case_critique_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "antithesis",
      "document_key": "header_context",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": true
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": false
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "business_case", "relevance": 0.95 },
    { "document_key": "feature_spec", "relevance": 0.85 },
    { "document_key": "technical_approach", "relevance": 0.75 },
    { "document_key": "success_metrics", "relevance": 0.65 },
    { "document_key": "business_case", "type": "feedback", "relevance": 0.6 },
    { "document_key": "feature_spec", "type": "feedback", "relevance": 0.6 },
    { "document_key": "technical_approach", "type": "feedback", "relevance": 0.6 },
    { "document_key": "success_metrics", "type": "feedback", "relevance": 0.6 }
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
      "document_key": "business_case_critique",
      "template_filename": "antithesis_business_case_critique.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "lineage_key": "<from the filename of the file being critiqued>",
      "source_model_slug": "<from the filename of the file being critiqued>",
      "content_to_include": {
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "recommendations": [],
        "notes": []
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "antithesis_business_case_critique.md",
      "from_document_key": "business_case_critique"
    }
  ]
}
```

### Step 2b: Generate Technical Feasibility Assessment (parallel)
- **Objective:** Document technical feasibility findings and identified risks for the proposal.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `antithesis_feasibility_assessment_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context` (type `header_context`, stage `antithesis`, required)
  - `business_case` (type `documents`, stage `thesis`, required)
  - `feature_spec` (type `documents`, stage `thesis`, required)
  - `technical_approach` (type `documents`, stage `thesis`, required)
  - `success_metrics` (type `documents`, stage `thesis`, required)
  - `business_case` (type `feedback`, stage `thesis`, required=false)
  - `feature_spec` (type `feedback`, stage `thesis`, required=false)
  - `technical_approach` (type `feedback`, stage `thesis`, required=false)
  - `success_metrics` (type `feedback`, stage `thesis`, required=false)
- **Output Artifact Description:** Renders the `technical_feasibility_assessment` Markdown document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-technical-feasibility-assessment",
  "parallel_group": 2,
  "branch_key": "technical_feasibility_assessment",
  "job_type": "EXECUTE",
  "name": "Generate Technical Feasibility Assessment",
  "prompt_template_id": "<system_prompts.id for antithesis_feasibility_assessment_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "antithesis",
      "document_key": "header_context",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": true
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": false
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "feature_spec", "relevance": 0.9 },
    { "document_key": "technical_approach", "relevance": 0.85 },
    { "document_key": "business_case", "relevance": 0.7 },
    { "document_key": "success_metrics", "relevance": 0.6 },
    { "document_key": "business_case", "type": "feedback", "relevance": 0.45 },
    { "document_key": "feature_spec", "type": "feedback", "relevance": 0.45 },
    { "document_key": "technical_approach", "type": "feedback", "relevance": 0.45 },
    { "document_key": "success_metrics", "type": "feedback", "relevance": 0.45 }
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
      "document_key": "technical_feasibility_assessment",
      "template_filename": "antithesis_feasibility_assessment.md",
      "artifact_class": "rendered_document",
      "lineage_key": "<from the filename of the file being critiqued>",
      "source_model_slug": "<from the filename of the file being critiqued>",
      "file_type": "markdown",
      "content_to_include": {
        "constraint_checklist": [
          "team",
          "timeline",
          "cost",
          "integration",
          "compliance"
        ],
        "findings": [
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
      "template_filename": "antithesis_feasibility_assessment.md",
      "from_document_key": "technical_feasibility_assessment"
    }
  ]
}
```

### Step 2c: Generate Risk Register (parallel)
- **Objective:** Produce a risk register capturing proposal-specific risks, impact, likelihood, and mitigations.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `antithesis_risk_register_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context` (type `header_context`, stage `antithesis`, required)
  - `success_metrics` (type `documents`, stage `thesis`, required)
  - `technical_approach` (type `documents`, stage `thesis`, required)
  - `feature_spec` (type `documents`, stage `thesis`, required)
  - `business_case` (type `documents`, stage `thesis`, required)
  - `success_metrics` (type `feedback`, stage `thesis`, required=false)
  - `technical_approach` (type `feedback`, stage `thesis`, required=false)
  - `feature_spec` (type `feedback`, stage `thesis`, required=false)
  - `business_case` (type `feedback`, stage `thesis`, required=false)
- **Output Artifact Description:** Renders the `risk_register` Markdown document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-risk-register",
  "parallel_group": 2,
  "branch_key": "risk_register",
  "job_type": "EXECUTE",
  "name": "Generate Risk Register",
  "prompt_template_id": "<system_prompts.id for antithesis_risk_register_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "antithesis",
      "document_key": "header_context",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": true
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": false
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "success_metrics", "relevance": 0.9 },
    { "document_key": "technical_approach", "relevance": 0.8 },
    { "document_key": "feature_spec", "relevance": 0.75 },
    { "document_key": "business_case", "relevance": 0.65 },
    { "document_key": "success_metrics", "type": "feedback", "relevance": 0.7 },
    { "document_key": "technical_approach", "type": "feedback", "relevance": 0.6 },
    { "document_key": "feature_spec", "type": "feedback", "relevance": 0.55 },
    { "document_key": "business_case", "type": "feedback", "relevance": 0.5 }
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
      "document_key": "risk_register",
      "template_filename": "antithesis_risk_register.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "lineage_key": "<from the filename of the file being critiqued>",
      "source_model_slug": "<from the filename of the file being critiqued>",
      "content_to_include": [
        {
          "risk": "",
          "impact": "",
          "likelihood": "",
          "mitigation": "",
          "open_questions": "",
          "guardrails": "",
          "risk_signals": "",
          "next_steps": ""
        }
      ]
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "antithesis_risk_register.md",
      "from_document_key": "risk_register"
    }
  ]
}
```

### Step 2d: Generate Non-Functional Requirements Review (parallel)
- **Objective:** Capture the non-functional requirements evaluation for the proposal.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `antithesis_non_functional_requirements_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context` (type `header_context`, stage `antithesis`, required)
  - `technical_approach` (type `documents`, stage `thesis`, required)
  - `success_metrics` (type `documents`, stage `thesis`, required)
  - `feature_spec` (type `documents`, stage `thesis`, required)
  - `business_case` (type `documents`, stage `thesis`, required)
  - `technical_approach` (type `feedback`, stage `thesis`, required=false)
  - `success_metrics` (type `feedback`, stage `thesis`, required=false)
  - `feature_spec` (type `feedback`, stage `thesis`, required=false)
  - `business_case` (type `feedback`, stage `thesis`, required=false)
- **Output Artifact Description:** Renders the `non_functional_requirements` Markdown document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-non-functional-requirements-review",
  "parallel_group": 2,
  "branch_key": "non_functional_requirements",
  "job_type": "EXECUTE",
  "name": "Generate Non-Functional Requirements Review",
  "prompt_template_id": "<system_prompts.id for antithesis_non_functional_requirements_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "antithesis",
      "document_key": "header_context",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": true
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": false
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "technical_approach", "relevance": 0.9 },
    { "document_key": "success_metrics", "relevance": 0.8 },
    { "document_key": "feature_spec", "relevance": 0.7 },
    { "document_key": "business_case", "relevance": 0.6 },
    { "document_key": "technical_approach", "type": "feedback", "relevance": 0.6 },
    { "document_key": "success_metrics", "type": "feedback", "relevance": 0.55 },
    { "document_key": "feature_spec", "type": "feedback", "relevance": 0.5 },
    { "document_key": "business_case", "type": "feedback", "relevance": 0.45 }
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
      "document_key": "non_functional_requirements",
      "template_filename": "antithesis_non_functional_requirements.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "lineage_key": "<from the filename of the file being critiqued>",
      "source_model_slug": "<from the filename of the file being critiqued>",
      "content_to_include": {
        "security": "",
        "performance": "",
        "reliability": "",
        "scalability": "",
        "maintainability": "",
        "compliance": "",
        "outcome_alignment": "",
        "primary_kpis": "",
        "leading_indicators": "",
        "lagging_indicators": "",
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "antithesis_non_functional_requirements.md",
      "from_document_key": "non_functional_requirements"
    }
  ]
}
```

### Step 2e: Generate Dependency Map (parallel)
- **Objective:** Document the dependency map, highlighting conflicts, sequencing, and integration concerns.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `antithesis_dependency_map_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context` (type `header_context`, stage `antithesis`, required)
  - `technical_approach` (type `documents`, stage `thesis`, required)
  - `feature_spec` (type `documents`, stage `thesis`, required)
  - `business_case` (type `documents`, stage `thesis`, required)
  - `success_metrics` (type `documents`, stage `thesis`, required)
  - `technical_approach` (type `feedback`, stage `thesis`, required=false)
  - `feature_spec` (type `feedback`, stage `thesis`, required=false)
  - `business_case` (type `feedback`, stage `thesis`, required=false)
  - `success_metrics` (type `feedback`, stage `thesis`, required=false)
- **Output Artifact Description:** Renders the `dependency_map` Markdown document.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-dependency-map",
  "parallel_group": 2,
  "branch_key": "dependency_map",
  "job_type": "EXECUTE",
  "name": "Generate Dependency Map",
  "prompt_template_id": "<system_prompts.id for antithesis_dependency_map_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "antithesis",
      "document_key": "header_context",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": true
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": false
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "technical_approach", "relevance": 0.9 },
    { "document_key": "feature_spec", "relevance": 0.85 },
    { "document_key": "business_case", "relevance": 0.75 },
    { "document_key": "success_metrics", "relevance": 0.65 },
    { "document_key": "technical_approach", "type": "feedback", "relevance": 0.5 },
    { "document_key": "feature_spec", "type": "feedback", "relevance": 0.45 },
    { "document_key": "business_case", "type": "feedback", "relevance": 0.4 },
    { "document_key": "success_metrics", "type": "feedback", "relevance": 0.35 }
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
      "document_key": "dependency_map",
      "template_filename": "antithesis_dependency_map.md",
      "artifact_class": "rendered_document",
      "file_type": "markdown",
      "lineage_key": "<from the filename of the file being critiqued>",
      "source_model_slug": "<from the filename of the file being critiqued>",
      "content_to_include": {
        "components": [],
        "integration_points": [],
        "conflict_flags": [],
        "dependencies": [],
        "sequencing": "",
        "open_questions": ""
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "antithesis_dependency_map.md",
      "from_document_key": "dependency_map"
    }
  ]
}
```

### Step 2f: Generate Comparison Vector (parallel)
- **Objective:** Produce the JSON comparison vector for the proposal, normalizing scores across required dimensions.
- **Prompt Type:** `Turn`
- **Prompt Template Name:** `antithesis_comparison_vector_turn_v1` *(new template – to be authored)*
- **Input Source References:**
  - `header_context` (type `header_context`, stage `antithesis`, required)
  - `business_case` (type `documents`, stage `thesis`, required)
  - `feature_spec` (type `documents`, stage `thesis`, required)
  - `technical_approach` (type `documents`, stage `thesis`, required)
  - `success_metrics` (type `documents`, stage `thesis`, required)
  - `business_case` (type `feedback`, stage `thesis`, required=false)
  - `feature_spec` (type `feedback`, stage `thesis`, required=false)
  - `technical_approach` (type `feedback`, stage `thesis`, required=false)
  - `success_metrics` (type `feedback`, stage `thesis`, required=false)
- **Output Artifact Description:** Persists the `comparison_vector` JSON artifact used by Synthesis to compare proposals.

**Recipe Step Definition JSON (target):**
```json
{
  "step_number": 2,
  "step_slug": "generate-comparison-vector",
  "parallel_group": 2,
  "branch_key": "comparison_vector",
  "job_type": "EXECUTE",
  "name": "Generate Comparison Vector",
  "prompt_template_id": "<system_prompts.id for antithesis_comparison_vector_turn_v1>",
  "prompt_type": "Turn",
  "inputs_required": [
    {
      "type": "header_context",
      "stage_slug": "antithesis",
      "document_key": "header_context",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": true
    },
    {
      "type": "document",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": true
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "business_case",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "feature_spec",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "technical_approach",
      "required": false
    },
    {
      "type": "feedback",
      "stage_slug": "thesis",
      "document_key": "success_metrics",
      "required": false
    }
  ],
  "inputs_relevance": [
    { "document_key": "header_context", "relevance": 1.0 },
    { "document_key": "business_case", "relevance": 0.95 },
    { "document_key": "feature_spec", "relevance": 0.95 },
    { "document_key": "technical_approach", "relevance": 0.9 },
    { "document_key": "success_metrics", "relevance": 0.85 },
    { "document_key": "business_case", "type": "feedback", "relevance": 0.75 },
    { "document_key": "feature_spec", "type": "feedback", "relevance": 0.7 },
    { "document_key": "technical_approach", "type": "feedback", "relevance": 0.7 },
    { "document_key": "success_metrics", "type": "feedback", "relevance": 0.65 }
  ],
  "output_type": "AssembledDocumentJson",
  "granularity_strategy": "one_to_one"
}
```

**Step Outputs Schema (target):**
```json
{
  "documents": [
    {
      "document_key": "comparison_vector",
      "template_filename": "antithesis_comparison_vector.json",
      "artifact_class": "assembled_document_json",
      "file_type": "json",
      "lineage_key": "<from the filename of the file being critiqued>",
      "source_model_slug": "<from the filename of the file being critiqued>",
      "content_to_include": {
        "dimensions": {
          "feasibility": { "score": 0, "rationale": "" },
          "complexity": { "score": 0, "rationale": "" },
          "security": { "score": 0, "rationale": "" },
          "performance": { "score": 0, "rationale": "" },
          "maintainability": { "score": 0, "rationale": "" },
          "scalability": { "score": 0, "rationale": "" },
          "cost": { "score": 0, "rationale": "" },
          "time_to_market": { "score": 0, "rationale": "" },
          "compliance_risk": { "score": 0, "rationale": "" },
          "alignment_with_constraints": { "score": 0, "rationale": "" }
        }
      }
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "antithesis_comparison_vector.json",
      "from_document_key": "comparison_vector"
    }
  ]
}
```

# Transform Requirements

*   `[✅]` 1. [PROMPT] Create planner prompt template `antithesis_planner_review_v1`
    *   `[✅]` 1.a. Author template file `docs/prompts/antithesis/antithesis_planner_review_v1.md` that emits the HeaderContext schema defined above (including `proposal_identifier.lineage_key` and `proposal_identifier.source_model_slug`, review focus, normalization guidance, document contexts).
    *   `[✅]` 1.b. Add the `system_prompts` row for `antithesis_planner_review_v1`, recording id/name/version/file path in the migration bundle.
    *   `[✅]` 1.c. Insert the Step 1 `dialectic_stage_recipes` row with `step_number = 1`, `step_slug = 'prepare-proposal-review-plan'`, `job_type = 'PLAN'`, `prompt_type = 'Planner'`, the full `inputs_required` / `inputs_relevance` arrays, and the `outputs_required` payload matching the HeaderContext JSON.
    *   `[✅]` 1.d. Populate `dialectic_stage_recipe_edges` to make the Step 1 planner the parent for each Step 2 branch (`business_case_critique`, `technical_feasibility_assessment`, `risk_register`, `non_functional_requirements`, `dependency_map`, `comparison_vector`).
    *   `[✅]` 1.e. Update the planner template migration to emit the canonical `system_materials` keys while adding the `review_metadata` block exactly as documented—specifically ensure `proposal_identifier.lineage_key` and `proposal_identifier.source_model_slug` are populated for worker metadata.

*   `[✅]` 2. [PROMPT] Create turn prompt template `antithesis_business_case_critique_turn_v1`
    *   `[✅]` 2.a. Author template file `docs/prompts/antithesis/antithesis_business_case_critique_turn_v1.md` aligned to the critique schema (strengths, weaknesses, recommendations, notes).
    *   `[✅]` 2.b. Add the corresponding `system_prompts` row.
    *   `[✅]` 2.c. Insert the Step 2 recipe row with `branch_key = 'business_case_critique'`, `parallel_group = 2`, the documented `inputs_required` / `inputs_relevance`, and the rendered document contract in `outputs_required`.
    *   `[✅]` 2.d. Add the edge linking the planner step to this branch.

*   `[✅]` 3. [PROMPT] Create turn prompt template `antithesis_feasibility_assessment_turn_v1`
    *   `[✅]` 3.a. Author template file `docs/prompts/antithesis/antithesis_feasibility_assessment_turn_v1.md` that walks feasibility across team, timeline, cost, integration, compliance.
    *   `[✅]` 3.b. Add the `system_prompts` row and ensure the migration ties it to the recipe row.
    *   `[✅]` 3.c. Insert the Step 2 recipe row for `branch_key = 'technical_feasibility_assessment'` with the full `inputs_required`, `inputs_relevance`, and Markdown output contract.
    *   `[✅]` 3.d. Add the dependency edge from the planner to this branch.

*   `[✅]` 4. [PROMPT] Create turn prompt template `antithesis_risk_register_turn_v1`
    *   `[✅]` 4.a. Author template file `docs/prompts/antithesis/antithesis_risk_register_turn_v1.md` capturing risk, impact, likelihood, mitigation fields.
    *   `[✅]` 4.b. Add the `system_prompts` row.
    *   `[✅]` 4.c. Insert the Step 2 recipe row for `branch_key = 'risk_register'`, including `inputs_required`, `inputs_relevance`, and the structured risk list in `outputs_required`.
    *   `[✅]` 4.d. Add the edge from the planner step to this branch.

*   `[✅]` 5. [PROMPT] Create turn prompt template `antithesis_non_functional_requirements_turn_v1`
    *   `[✅]` 5.a. Author template file `docs/prompts/antithesis/antithesis_non_functional_requirements_turn_v1.md` that evaluates the six NFR dimensions.
    *   `[✅]` 5.b. Add the matching `system_prompts` row.
    *   `[✅]` 5.c. Insert the Step 2 recipe row for `branch_key = 'non_functional_requirements'` with its `inputs_required`, `inputs_relevance`, and Markdown schema.
    *   `[✅]` 5.d. Add the planner→branch edge.

*   `[✅]` 6. [PROMPT] Create turn prompt template `antithesis_dependency_map_turn_v1`
    *   `[✅]` 6.a. Author template file `docs/prompts/antithesis/antithesis_dependency_map_turn_v1.md` to generate the dependency map narrative.
    *   `[✅]` 6.b. Register the `system_prompts` row.
    *   `[✅]` 6.c. Insert the Step 2 recipe row for `branch_key = 'dependency_map'` with documented `inputs_required`, `inputs_relevance`, and the rendered document payload.
    *   `[✅]` 6.d. Add the planner→branch edge.

*   `[✅]` 7. [PROMPT] Create turn prompt template `antithesis_comparison_vector_turn_v1`
    *   `[✅]` 7.a. Author template file `docs/prompts/antithesis/antithesis_comparison_vector_turn_v1.md` that emits the JSON vector with normalized scores/rationales.
    *   `[✅]` 7.b. Add the `system_prompts` row.
    *   `[✅]` 7.c. Insert the Step 2 recipe row for `branch_key = 'comparison_vector'` with `output_type = 'AssembledDocumentJson'`, the `inputs_required`, `inputs_relevance`, and JSON schema in `outputs_required`.
    *   `[✅]` 7.d. Add the edge from the planner step to this branch.

*   `[ ]` 8. [DB] Stage configuration updates
    *   `[✅]` 8.a. Update the `dialectic_stages` row for `antithesis` to reference `recipe_name = antithesis_v1`, removing legacy `input_artifact_rules` / `expected_output_artifacts` JSON once the recipe data is authoritative.
    *   `[✅]` 8.b. Trim `domain_specific_prompt_overlays.overlay_values` for Antithesis to drop redundant `expected_output_artifacts_json` once the planner template supplies the structure, and replace legacy placeholders (e.g., `model_id`) with the metadata required by the target header context (`proposal_identifier.lineage_key`, `proposal_identifier.source_model_slug`, etc.).
    *   `[✅]` 8.c. Extend the migration so each Step 2 recipe row persists the `inputs_required` and `inputs_relevance` arrays documented above (including thesis document and feedback artifacts per branch) and ensures feedback sources use the base document keys with `type = 'feedback'`.
    *   `[✅]` 8.d. Verify the Stage File Structure enumerates storage locations for per-document feedback artifacts and reference those paths when populating `inputs_required` so migrations and runtime logic stay aligned.
    *   `[✅]` 8.e. `[DB]` Author a migration and seed update that rewrites the Antithesis `dialectic_stages.input_artifact_rules` to use the document-centric sources (`type: "document" / "feedback"`) with the target `document_key` names and removes the legacy contribution-based entries.
