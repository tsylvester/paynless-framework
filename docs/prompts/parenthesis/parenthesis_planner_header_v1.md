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
- **Expected Output Artifacts Definition**: {{outputs_required}}

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
    "agent_notes_to_self": "overview of formalization scope and how the Master Plan will drive iterative execution, THIS IS NOT AN EXECUTIVE SUMMARY! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED!",
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
        "executive_summary": "" //THIS IS NOT AN agent_notes_to_self! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED! DO NOT DROP THIS FIELD OR YOUR OUTPUT WILL BE WASTED! 
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
                "status": "[ ]",
                "objective": "",
                "deps": [],
                "provides": [],
                "directionality": "",
                "requirements": [],
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
        "executive_summary": "" //THIS IS NOT AN agent_notes_to_self! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED! DO NOT DROP THIS FIELD OR YOUR OUTPUT WILL BE WASTED! 
      }
    },
    {
      "document_key": "milestone_schema",
      "content_to_include": {
        "index": [],
        "pipeline_context": "framing paragraph explaining middle-zoom role",
        "selection_criteria": "dependency frontier: only milestones whose deps are [✅] or in current batch",
        "shared_infrastructure": [],
        "milestones": [
          {
            "id": "",
            "title": "",
            "status": "",
            "objective": "",
            "nodes": [
              {
                "path": "",
                "title": "",
                "objective": "",
                "role": "",
                "module": "",
                "deps": [],
                "provides": [],
                "directionality": "",
                "requirements": []
              }
            ]
          }
        ],
        "iteration_semantics": "replace, don't extend; reference prior schema for continuity",
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
        "executive_summary": "" //THIS IS NOT AN agent_notes_to_self! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED! DO NOT DROP THIS FIELD OR YOUR OUTPUT WILL BE WASTED! 
      }
    }
  ]
}
```
