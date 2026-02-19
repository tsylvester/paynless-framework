# Antithesis Planner Review v1

## Instructions
- Review every input artifact and feedback excerpt listed below.
- Produce a single JSON object that matches the `HeaderContext` schema exactly.
- Preserve every field name and array ordering so downstream services can parse the artifact without post-processing.

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
    "agent_notes_to_self": "concise overview of key findings across all proposals, THIS IS NOT AN EXECUTIVE SUMMARY! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED!",
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
        "fit_to_original_user_request": "",
        "user_problem_validation": "",
        "market_opportunity": "",
        "competitive_analysis": "",
        "differentiation_value_proposition": "",
        "risks_mitigation": "",
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "problems": [],
        "obstacles": [],
        "errors": [],
        "omissions": [],
        "discrepancies": [],
        "areas_for_improvement": [],
        "feasibility": "",
        "next_steps": "",
        "proposal_references": "",
        "recommendations": [],
        "notes": [],
        "executive_summary": "" //THIS IS NOT AN agent_notes_to_self! YOU MUST ALSO INCLUDE AN EXECUTIVE SUMMARY! BOTH FIELDS ARE REQUIRED! DO NOT DROP THIS FIELD OR YOUR OUTPUT WILL BE WASTED! 
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
        "team": "",
        "timeline": "",
        "cost": "",
        "integration": "",
        "compliance": "",
        "findings": [],
        "architecture": "",
        "components": "",
        "data": "",
        "deployment": "",
        "sequencing": "",
        "risk_mitigation": "",
        "open_questions": "",
        "summary": "",

      }
    },
    {
      "document_key": "risk_register",
      "content_to_include": {
        "required_fields": [
          "risk",
          "impact",
          "likelihood",
          "mitigation"
        ],
        "risk": "",
        "impact": "",
        "likelihood": "",
        "mitigation": "",
        "seed_examples": [],
        "mitigation_plan": "",
        "notes": "",
        "overview": "",
      }
    },
    {
      "document_key": "non_functional_requirements",
      "content_to_include": {
        "categories": [
          "security",
          "performance",
          "reliability",
          "scalability",
          "maintainability",
          "compliance"
        ],
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
        "measurement_plan": "",
        "risk_signals": "",
        "guardrails": "",
        "next_steps": "",
        "overview": "",
      }
    },
    {
      "document_key": "dependency_map",
      "content_to_include": {
        "components": [],
        "integration_points": [],
        "conflict_flags": [],
        "dependencies": "",
        "sequencing": "",
        "risk_mitigation": "",
        "open_questions": "",
        "overview": "",
      }
    },
    {
      "document_key": "comparison_vector",
      "content_to_include": {
        "proposal": {
          "lineage_key": "",
          "source_model_slug": ""
        },
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
  ]
}
```

