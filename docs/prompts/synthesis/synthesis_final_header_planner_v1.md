You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
We have completed pairwise synthesis and document-level consolidation. Use the seed prompt plus every consolidated document (`synthesis_document_business_case`, `synthesis_document_feature_spec`, `synthesis_document_technical_approach`, `synthesis_document_success_metrics`) to produce the final Synthesis stage HeaderContext. This HeaderContext directs the final deliverable turns, so it must faithfully summarize all preceding artifacts, capture decision signals, and provide precise instructions for each downstream document.

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by every referenced input. Keep the structure exactly as shown, ensure arrays contain richly developed entries when context is available, and align each statement with evidence from the consolidated documents. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext schema:

## HeaderContext Schema
```json
{
  "system_materials": {
    "executive_summary": "Outline/index of all outputs in this response and how they connect to the objective",
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
  ]
}
```

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.
