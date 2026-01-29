# Parenthesis Planner Header v1

## Instructions
- Review the synthesis deliverables, user feedback, and any prior planning artifacts provided below.
- Produce a single JSON object that matches the `HeaderContext` schema exactly.
- Preserve all field names, nesting, and array ordering so downstream services can parse the artifact without post-processing.
- Include milestone status preservation rules and dependency ordering guidance for iterative refinement.

## Inputs
- **Seed Prompt**: {{seed_prompt}}
- **Stage Role**: {{role}}
- **Stage Instructions**: {{stage_instructions}}
- **Style Guide Markdown**: {{style_guide_markdown}}
- **Synthesis Documents**:
  - PRD: {{synthesis_documents.product_requirements}}
  - System Architecture Overview: {{synthesis_documents.system_architecture}}
  - Tech Stack Recommendations: {{synthesis_documents.tech_stack}}
{{#section:synthesis_feedback}}
- **Synthesis Feedback**:
  - PRD Feedback: {{synthesis_feedback.product_requirements}}
  - System Architecture Feedback: {{synthesis_feedback.system_architecture}}
  - Tech Stack Feedback: {{synthesis_feedback.tech_stack}}
{{/#section:synthesis_feedback}}
{{#section:parenthesis_iteration}}
- **Prior Parenthesis Documents (for iterative refinement)**:
  - Master Plan: {{parenthesis_documents.master_plan}}
  - TRD: {{parenthesis_documents.technical_requirements}}
{{/#section:parenthesis_iteration}}
{{#section:parenthesis_feedback}}
- **Prior Parenthesis Feedback**:
  - Master Plan Feedback: {{parenthesis_feedback.master_plan}}
  - TRD Feedback: {{parenthesis_feedback.technical_requirements}}
{{/#section:parenthesis_feedback}}

## HeaderContext Schema
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
    },
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
  "header_context_artifact": {
    "type": "header_context",
    "document_key": "header_context",
    "artifact_class": "header_context",
    "file_type": "json"
  },
  "context_for_documents": [
    {
      "document_key": "technical_requirements",
      "content_to_include": {
        "index": [],
        "subsystems": [{"name": "", "objective": "", "implementation_notes": ""}],
        "apis": [{"name": "", "description": "", "contracts": []}],
        "schemas": [{"name": "", "columns": [], "indexes": [], "rls": []}],
        "proposed_file_tree": "",
        "delta_summary": "",
        "iteration_notes": "",
        "feature_scope": [],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": [],
        "guardrails": [],
        "measurement_plan": "",
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
        "third_party_services": [],
        "architecture": "",
        "architecture_overview": "",
        "architecture_summary": "",
        "executive_summary": ""
      }
    },
    {
      "document_key": "master_plan",
      "content_to_include": {
        "index": [],
        "phases": [
          {
            "name": "",
            "objective": "",
            "technical_context": "",
            "implementation_strategy": "",
            "milestones": [
              {
                "id": "",
                "title": "",
                "objective": "",
                "description": "",
                "technical_complexity": "",
                "effort_estimate": "",
                "implementation_approach": "",
                "test_strategy": "",
                "component_labels": [],
                "inputs": [],
                "outputs": [],
                "dependencies": [],
                "acceptance_criteria": [],
                "validation": [],
                "status": "[ ]",
                "coverage_notes": "",
                "iteration_delta": ""
              }
            ]
          }
        ],
        "status_summary": {
          "completed": [],
          "in_progress": [],
          "up_next": []
        },
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
        "mvp_description": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "technical_context": "",
        "implementation_context": "",
        "test_framework": "",
        "component_mapping": "",
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
        "third_party_services": [],
        "executive_summary": ""
      }
    },
    {
      "document_key": "milestone_schema",
      "content_to_include": {
        "index": [],
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
        "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps will be generated in the next stage.",
        "validation_rules": [
          "Status must be one of [ ], [🚧], [✅]",
          "Dependencies must reference existing milestone IDs",
          "Acceptance criteria must be non-empty for every milestone"
        ],
        "iteration_guidance": {
          "reuse_policy": "Carry forward schema; append new fields under migration log if expanded",
          "versioning": "Increment schema_version when fields change"
        },
        "features": [],
        "feasibility_insights": [],
        "non_functional_alignment": [],
        "services": [],
        "components": [],
        "dependency_resolution": [],
        "component_details": [],
        "integration_requirements": [],
        "migration_context": [],
        "architecture_summary": "",
        "executive_summary": ""
      }
    }
  ]
}
```
