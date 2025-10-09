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
  - PRD: {{synthesis_documents.prd}}
  - System Architecture Overview: {{synthesis_documents.system_architecture_overview}}
  - Tech Stack Recommendations: {{synthesis_documents.tech_stack_recommendations}}
{{synthesis_feedback}}
- **Synthesis Feedback**:
  - PRD Feedback: {{synthesis_feedback.prd}}
  - System Architecture Feedback: {{synthesis_feedback.system_architecture_overview}}
  - Tech Stack Feedback: {{synthesis_feedback.tech_stack_recommendations}}
{{/synthesis_feedback}}
{{parenthesis_iteration}}
- **Prior Parenthesis Documents (for iterative refinement)**:
  - Master Plan: {{parenthesis_documents.master_plan}}
  - TRD: {{parenthesis_documents.trd}}
{{/parenthesis_iteration}}
{{parenthesis_feedback}}
- **Prior Parenthesis Feedback**:
  - Master Plan Feedback: {{parenthesis_feedback.master_plan}}
  - TRD Feedback: {{parenthesis_feedback.trd}}
{{/parenthesis_feedback}}

## HeaderContext Schema
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
    ],
  },
  "header_context_artifact": {
    "type": "header_context",
    "document_key": "header_context",
    "artifact_class": "header_context",
    "file_type": "json"
  },
  "context_for_documents": [
    {
      "document_key": "trd",
      "content_to_include": {
        "subsystems": [],
        "apis": [],
        "schemas": [],
        "proposed_file_tree": "",
        "architecture_overview": ""
      }
    },
    {
      "document_key": "master_plan",
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
        }
      }
    },
    {
      "document_key": "milestone_schema",
      "content_to_include": {
        "fields": [
          "id",
          "title",
          "objective",
          "dependencies",
          "acceptance_criteria",
          "status"
        ],
        "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps will be generated in the next stage."
      }
    }
  ]
}
```
