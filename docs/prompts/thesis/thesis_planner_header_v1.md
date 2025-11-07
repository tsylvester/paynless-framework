# Thesis Planner Header v1

## Instructions
- Read the user objective, constraints, overlays, and references provided below.
- Produce a single JSON object matching the `HeaderContext` schema exactly.

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
    "executive_summary": "outline/index of all outputs in this response and how they connect to the objective",
    "input_artifacts_summary": "brief, faithful summary of user prompt and referenced materials",
    "stage_rationale": "why these choices align with constraints, standards, and stakeholder needs",
    "progress_update": "for continuation turns, summarize what is complete vs remaining; omit on first turn",
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
    ],
    "diversity_rubric": {
      "prefer_standards_when": "meet constraints, well-understood by team, minimize risk/time-to-market",
      "propose_alternates_when": "materially improve performance, security, maintainability, or total cost under constraints",
      "if_comparable": "present 1-2 viable options with concise trade-offs and a clear recommendation"
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
      "document_key": "business_case",
      "content_to_include": {
        "market_opportunity": "",
        "user_problem_validation": "",
        "competitive_analysis": "",
        "differentiation_&_value_proposition": "",
        "risks_&_mitigation": "",
        "strengths": "",
        "weaknesses": "",
        "opportunities": "",
        "threats": "",
        "next_steps": ""
      }
    },
    {
      "document_key": "feature_spec",
      "content_to_include": [
        {
          "feature_name": "",
          "user_stories": []
        }
      ]
    },
    {
      "document_key": "technical_approach",
      "content_to_include": {
        "architecture": "", 
        "components": "", 
        "data": "", 
        "deployment": "", 
        "sequencing": ""
      }
    },
    {
      "document_key": "success_metrics",
      "content_to_include": {
        "placeholder metric 1": "",
        "placeholder metric 2": ""
      }
    }
  ],
}
```
