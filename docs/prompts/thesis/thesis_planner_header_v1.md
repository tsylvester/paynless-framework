## Instructions
- Read the user objective, constraints, overlays, and references provided below.
- Analyze the inputs to understand the user's requirements, stage role, and expected outputs.
- Generate a complete JSON object matching the `HeaderContext` schema exactly.
- **CRITICAL OUTPUT FORMAT: Your response must be raw JSON only. Do NOT wrap it in markdown code blocks (no ```json or ```). Start your response with `{` and end with `}`. The system will parse your response as JSON directly.**

## Inputs
- **User Objective**: {{original_user_request}}
- **Stage Role**: {{role}}
- **Stage Instructions**: {{stage_instructions}}
- **Style Guide Markdown**: {{style_guide_markdown}}
- **Expected Output Artifacts Definition**: {{outputs_required}}

## Content Generation Requirements

**IMPORTANT:** The schema below shows the REQUIRED structure. All fields that show placeholder descriptions or empty values MUST be replaced with actual, substantive content generated from the inputs above.

**Content Generation Rules:**
1. **Do NOT copy placeholder text or empty strings literally.** Every field must contain real content.
2. **Base all content on the provided inputs:**
   - Extract requirements and objectives from the User Objective
   - Apply the Stage Role perspective to your analysis
   - Follow the Stage Instructions for this stage
   - Adhere to the Style Guide formatting and quality standards
   - Understand what documents are expected from the Expected Output Artifacts Definition
3. **Generate substantive content for every field:**
   - String fields must contain actual text (not empty strings `""`)
   - Array fields must contain actual items (not empty arrays `[]`)
   - Object fields must contain actual properties with real values
4. **Ensure content relevance:** All generated content must be relevant to the user's objective and appropriate for the stage requirements.

## HeaderContext Schema

Generate a JSON object with this exact structure. Replace all placeholder descriptions with actual content:

```json
{
  "system_materials": {
    "agent_internal_summary": "REQUIRED: Generate an outline/index of all outputs in this response and how they connect to the objective. Complete this last, after all other elements are filled, so that the summary refers to the actual content generated.",
    "input_artifacts_summary": "REQUIRED: Generate a brief, faithful summary of the user prompt and referenced materials from the User Objective.",
    "stage_rationale": "REQUIRED: Generate an explanation of why these choices align with constraints, standards, and stakeholder needs. Consider the Stage Role and Stage Instructions.",
    "progress_update": "REQUIRED: For continuation turns, generate a summary of what is complete vs remaining. Omit this field entirely on first turn (do not include it in the JSON).",
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
        "next_steps": "",
        "proposal_references": [],
        "executive_summary": ""
      }
    },
    {
      "document_key": "feature_spec",
      "content_to_include": {
        "features": [
          {
            "feature_name": "",
            "feature_objective": "",
            "user_stories": [],
            "acceptance_criteria": [],
            "dependencies": [],
            "success_metrics": []
          }
        ]
      }
    },
    {
      "document_key": "technical_approach",
      "content_to_include": {
        "architecture": "",
        "components": "",
        "data": "",
        "deployment": "",
        "sequencing": "",
        "risk_mitigation": "",
        "open_questions": ""
      }
    },
    {
      "document_key": "success_metrics",
      "content_to_include": {
        "outcome_alignment": "",
        "north_star_metric": "",
        "primary_kpis": "",
        "leading_indicators": "",
        "lagging_indicators": "",
        "guardrails": "",
        "measurement_plan": "",
        "risk_signals": "",
        "next_steps": "",
        "data_sources": [],
        "reporting_cadence": "",
        "ownership": "",
        "escalation_plan": ""
      }
    }
  ]
}
```

## Final Reminder

**Your response must:**
1. Be valid JSON starting with `{` and ending with `}`
2. NOT be wrapped in markdown code blocks (no ```json or ```)
3. Contain actual content in every field (no empty strings `""` or empty arrays `[]`)
4. Be based on the inputs provided above (User Objective, Stage Role, Stage Instructions, etc.)
5. Match the exact structure shown in the schema above

Begin your response with `{` immediately.
