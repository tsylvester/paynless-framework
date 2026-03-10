# Paralysis Planner Header v1

## Instructions
- Review the Parenthesis planning artifacts, user feedback, and any prior implementation artifacts provided below.
- Produce a single JSON object that matches the `HeaderContext` schema exactly.
- Preserve all field names, nesting, and array ordering so downstream services can parse the artifact without post-processing.
- Include milestone selection criteria, iteration metadata, status preservation rules, and checklist sizing guidance for implementation planning.

Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages. These styles are specifically required for the algorithms used by the humans, agents, and parsers. Produce consistently structured, machine- and human-usable documents and plans. Ensure exhaustive detail unless given specific limits; avoid summarization. Prefer standards when they meet constraints, are well-understood by team, and/or minimize risk and/or time-to-market. Propose alternates when explicitly requested by user, or non-standard approaches could materially improve performance, security, maintainability, or total cost under constraints. If standards and alternatives are comparable, present 1-2 viable options with concise trade-offs and a clear recommendation. Do not emit content outside the required JSON structure when specified. Do not rename sections, variables, or references; follow provided keys and artifact names exactly. Do not summarize, detailed output is requested. You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. Control flags (top-level JSON fields when requested by the prompt):
- continuation_needed: boolean
- stop_reason: "continuation" | "token_limit" | "complete"
- resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "stop_reason": "continuation",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "{last_completed_key}" }
}
```

## Inputs
- **Seed Prompt**: {{seed_prompt}}
- **Stage Role**: {{role}}
- **Stage Instructions**: {{stage_instructions}}
- **Expected Output Artifacts Definition**: {{outputs_required}}

## HeaderContext Schema
```json
{
  "system_materials": {
    "agent_notes_to_self": "summary of which milestones are detailed in this iteration and why, THIS IS NOT AN EXECUTIVE SUMMARY! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED!",
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
        "elaboration_instruction": "For each milestone from the milestone_schema, expand into a fully described work node with all the elements provided. Elaborate in dependency order. If generation limits are reached before exhausting the batch, use continuation flags.",
        "node_skeleton": {
          "path": "",
          "title": "",
          "objective": [],
          "role": [],
          "module": [],
          "deps": [],
          "context_slice": [],
          "interface": [],
          "interface_tests": [],
          "interface_guards": [],
          "unit_tests": [],
          "construction": [],
          "source": [],
          "provides": [],
          "mocks": [],
          "integration_tests": [],
          "directionality": [],
          "requirements": [],
          "commit": []
        },
        "milestone_summary": ""
      }
    },
    {
      "document_key": "updated_master_plan",
      "content_to_include": {
        "index": [],
        "executive_summary": "", //THIS IS NOT AN agent_notes_to_self! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED! DO NOT DROP THIS FIELD OR YOUR OUTPUT WILL BE WASTED! 
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
        "tie_breaker_guidance": true,
        "comparison_matrix": [],
        "analysis": {
          "summary": "",
          "tradeoffs": "",
          "consensus": ""
        },
        "recommendation": {
          "rankings": [],
          "tie_breakers": []
        }
      }
    }
  ]
}
```
