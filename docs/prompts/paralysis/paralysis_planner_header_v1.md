# Paralysis Planner Header v1

## Instructions
- Review the Parenthesis planning artifacts, user feedback, and any prior implementation artifacts provided below.
- Produce a single JSON object that matches the `HeaderContext` schema exactly.
- Preserve all field names, nesting, and array ordering so downstream services can parse the artifact without post-processing.
- Include milestone selection criteria, iteration metadata, status preservation rules, and checklist sizing guidance for implementation planning.

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
    "agent_internal_summary": "summary of which milestones are detailed in this iteration and why",
    "input_artifacts_summary": "TRD sections used, Master Plan phase/milestone references",
    "stage_rationale": "explain ordering, TDD emphasis, and how checklist conforms to style guide",
    "progress_update": "summarize completed vs remaining milestones; denote updated statuses in Master Plan",
    "generation_limits": {"max_steps": 200, "target_steps": "120-180", "max_output_lines": "600-800"},
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
        "milestone_ids": ["<list the next milestone(s) to detail from the master_plan and milestone_schema>"],
        "index": [],
        "milestone_reference": {
          "id": "",
          "phase": "",
          "dependencies": ""
        },
        "steps": [
          {
            "status": "",
            "component_label": "",
            "numbering": "",
            "title": "",
            "description": "",
            "inputs": "",
            "outputs": "",
            "validation": "",
            "red_test": "",
            "implementation": "",
            "green_test": "",
            "refactor": "",
            "commit_message": ""
          }
        ],
        "milestone_summary": ""
      }
    },
    {
      "document_key": "updated_master_plan",
      "content_to_include": {
        "index": [],
        "executive_summary": "",
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
                "description": "",
                "technical_complexity": "",
                "effort_estimate": "",
                "implementation_approach": "",
                "test_strategy": "",
                "component_labels": [],
                "inputs": [],
                "outputs": [],
                "validation": [],
                "dependencies": [],
                "coverage_notes": "",
                "iteration_delta": "",
                "acceptance_criteria": []
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
