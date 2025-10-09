# Synthesis Pairwise Header Planner v1

## Instructions
- Review every input artifact, comparison signal, and feedback excerpt listed below.
- Produce a single JSON object that matches the `HeaderContext` schema exactly.
- Preserve all field names, nesting, and array ordering so downstream services can parse the artifact without post-processing.

## Inputs
- **Seed Prompt**: {{seed_prompt}}
- **Stage Role**: {{role}}
- **Stage Instructions**: {{stage_instructions}}
- **Style Guide Markdown**: {{style_guide_markdown}}
- **Expected Output Artifacts Definition**: {{outputs_required}}
- **Thesis Documents (per lineage)**:
  - Business Cases: {{thesis_documents.business_case}}
  - Feature Specifications: {{thesis_documents.feature_spec}}
  - Technical Approaches: {{thesis_documents.technical_approach}}
  - Success Metrics: {{thesis_documents.success_metrics}}
- **Antithesis Documents (per reviewer and lineage)**:
  - Business Case Critiques: {{antithesis_documents.business_case_critique}}
  - Technical Feasibility Assessments: {{antithesis_documents.technical_feasibility_assessment}}
  - Non-Functional Requirements Reviews: {{antithesis_documents.non_functional_requirements}}
  - Risk Registers: {{antithesis_documents.risk_register}}
  - Dependency Maps: {{antithesis_documents.dependency_map}}
  - Comparison Vectors: {{antithesis_documents.comparison_vector}}
{{#section:antithesis_feedback}}
- **Antithesis Feedback**:
  - Business Case Critique Feedback: {{antithesis_feedback.business_case_critique}}
  - Technical Feasibility Assessment Feedback: {{antithesis_feedback.technical_feasibility_assessment}}
  - Non-Functional Requirements Feedback: {{antithesis_feedback.non_functional_requirements}}
  - Risk Register Feedback: {{antithesis_feedback.risk_register}}
  - Dependency Map Feedback: {{antithesis_feedback.dependency_map}}
  - Comparison Vector Feedback: {{antithesis_feedback.comparison_vector}}
{{/#section:antithesis_feedback}}

## HeaderContext Schema
```json
{
  "system_materials": {
    "executive_summary": "Summarize the intent of merging each Thesis document with its corresponding Antithesis critiques.",
    "input_artifacts_summary": "Identify the thesis and antithesis artifacts that will be combined during pairwise synthesis.",
    "stage_rationale": "Explain that this stage ensures consistent pairwise synthesis before consolidating documents across models.",
    "decision_criteria": [
      "feasibility",
      "risk",
      "non_functional_requirements",
      "dependency_alignment",
      "stakeholder_objectives"
    ],
    "continuation_policy": "If a pairwise synthesis turn truncates, resume at the last unresolved section using the continuation prompt pattern."
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
        "comparison_signal": "comparison_vector"
      }
    },
    {
      "document_key": "synthesis_pairwise_feature_spec",
      "content_to_include": {
        "thesis_document": "feature_spec",
        "feasibility_document": "technical_feasibility_assessment",
        "nfr_document": "non_functional_requirements",
        "comparison_signal": "comparison_vector"
      }
    },
    {
      "document_key": "synthesis_pairwise_technical_approach",
      "content_to_include": {
        "thesis_document": "technical_approach",
        "risk_document": "risk_register",
        "dependency_document": "dependency_map"
      }
    },
    {
      "document_key": "synthesis_pairwise_success_metrics",
      "content_to_include": {
        "thesis_document": "success_metrics",
        "critique_document": "business_case_critique",
        "comparison_signal": "comparison_vector"
      }
    }
  ],
}
```

