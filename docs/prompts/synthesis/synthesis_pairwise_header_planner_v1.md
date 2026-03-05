# Synthesis Pairwise Header Planner v1

## Instructions
- Review every input artifact, comparison signal, and feedback excerpt listed below.
- Produce a single JSON object that matches the `HeaderContext` schema exactly.
- Preserve all field names, nesting, and array ordering so downstream services can parse the artifact without post-processing.

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
    "agent_notes_to_self": "Summarize the intent of merging each Thesis document with its corresponding Antithesis critiques, THIS IS NOT AN EXECUTIVE SUMMARY! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED!",
    "input_artifacts_summary": "Identify the thesis and antithesis artifacts that will be combined during pairwise synthesis.",
    "stage_rationale": "Explain that this stage ensures consistent pairwise synthesis before consolidating documents across models.",
    "decision_criteria": [
      "feasibility",
      "risk",
      "non_functional_requirements",
      "dependency_alignment",
      "stakeholder_objectives"
    ]
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
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "critique_alignment": "",
        "next_steps": "",
        "proposal_references": [],
        "resolved_positions": [],
        "open_questions": [],
        "executive_summary": "", //THIS IS NOT AN agent_notes_to_self! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED! DO NOT DROP THIS FIELD OR YOUR OUTPUT WILL BE WASTED! 
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
            "risk_mitigation": "",
            "open_questions": "",
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
        "architecture_alignment": [],
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
  ]
}
```

