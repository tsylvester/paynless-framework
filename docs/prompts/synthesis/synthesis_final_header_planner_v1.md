# Synthesis Final Header Planner v1

## Instructions
- Review every input artifact listed below.
- Produce a single JSON object that matches the `HeaderContext` schema exactly.
- Preserve all field names, nesting, and array ordering so downstream services can parse the artifact without post-processing.

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
    "agent_notes_to_self": "Outline/index of all outputs in this response and how they connect to the objective, THIS IS NOT AN EXECUTIVE SUMMARY! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED!",
    "input_artifacts_summary": "Succinct summary of prior proposals, critiques, and user feedback included in this synthesis",
    "stage_rationale": "Decision record explaining how signals and critiques informed selections, how conflicts were resolved, gaps were filled, and why chosen approaches best meet constraints",
    "progress_update": "For continuation turns, summarize what is complete vs remaining; omit on first turn",
    "signal_sources": [
      "synthesis_document_business_case",
      "synthesis_document_feature_spec",
      "synthesis_document_technical_approach",
      "synthesis_document_success_metrics"
    ],
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
        "stakeholder_communications": [],
        "executive_summary": "", //THIS IS NOT AN agent_notes_to_self! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED! DO NOT DROP THIS FIELD OR YOUR OUTPUT WILL BE WASTED! 
      }
    },
    {
      "document_key": "system_architecture",
      "content_to_include": {
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
        "open_questions": [],
        "rationale": "",
        "architecture_summary": "",
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
  ]
}
```

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.
