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
- **Parenthesis Documents**:
  - TRD: {{parenthesis_documents.technical_requirements}}
  - Master Plan: {{parenthesis_documents.master_plan}}
  - Milestone Schema: {{parenthesis_documents.milestone_schema}}
{{#section:parenthesis_feedback}}
- **Parenthesis Feedback (optional)**:
  - TRD Feedback: {{parenthesis_feedback.technical_requirements}}
  - Master Plan Feedback: {{parenthesis_feedback.master_plan}}
  - Milestone Schema Feedback: {{parenthesis_feedback.milestone_schema}}
  {{/#section:parenthesis_feedback}}
  {{#section:paralysis_iteration}}
- **Prior Paralysis Documents (optional, for iterative refinement)**:
  - Actionable Checklist: {{paralysis_documents.actionable_checklist}}
  - Updated Master Plan: {{paralysis_documents.updated_master_plan}}
{{/#section:paralysis_iteration}}
{{#section:paralysis_feedback}}
- **Prior Paralysis Feedback (optional)**:
  - Actionable Checklist Feedback: {{paralysis_feedback.actionable_checklist}}
  - Updated Master Plan Feedback: {{paralysis_feedback.updated_master_plan}}
{{/#section:paralysis_feedback}}

## HeaderContext Schema
```json
{
  "system_materials": {
    "executive_summary": "summary of which milestones are detailed in this iteration and why",
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
