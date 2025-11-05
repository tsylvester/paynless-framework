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
- **Thesis Documents**:
  - Business Case: {{thesis_documents.business_case}}
  - Feature Specification: {{thesis_documents.feature_spec}}
  - Technical Approach: {{thesis_documents.technical_approach}}
  - Success Metrics: {{thesis_documents.success_metrics}}
{{#section:thesis_feedback}}
- **Thesis Feedback**:
  - Business Case Feedback: {{thesis_feedback.business_case}}
  - Feature Specification Feedback: {{thesis_feedback.feature_spec}}
  - Technical Approach Feedback: {{thesis_feedback.technical_approach}}
  - Success Metrics Feedback: {{thesis_feedback.success_metrics}}
{{/#section:thesis_feedback}}

## HeaderContext Schema
```json
{
  "system_materials": {
    "executive_summary": "concise overview of key findings across all proposals",
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
    "continuation_policy": "single-proposal review; continue until all artifacts for this proposal are complete",
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
        "strengths": [],
        "weaknesses": [],
        "opportunities": [],
        "threats": [],
        "recommendations": [],
        "notes": []
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
        "findings": []
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
        "seed_examples": []
      }
    },
    {
      "document_key": "non_functional_requirements",
      "content_to_include": [
        "security",
        "performance",
        "reliability",
        "scalability",
        "maintainability",
        "compliance"
      ]
    },
    {
      "document_key": "dependency_map",
      "content_to_include": {
        "components": [],
        "integration_points": [],
        "conflict_flags": []
      }
    },
    {
      "document_key": "comparison_vector",
      "content_to_include": {
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

