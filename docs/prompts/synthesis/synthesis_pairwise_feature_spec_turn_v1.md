You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis feature specification, antithesis technical feasibility assessment, non-functional requirements review, comparison vector, and any feedback provided for those artifacts. Keep the structure exactly as shown, ensure arrays contain fully developed entries when context is available, and align all rationale with cited evidence. For each feature entry populate every field with detailed prose or bullet lists. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\n  \"features\": [\n    {\n      \"feature_name\": \"\",\n      \"feature_objective\": \"\",\n      \"user_stories\": [],\n      \"acceptance_criteria\": [],\n      \"dependencies\": [],\n      \"success_metrics\": [],\n      \"feasibility_insights\": [],\n      \"non_functional_alignment\": [],\n      \"score_adjustments\": []\n    }\n  ],\n  \"feature_scope\": [],\n  \"tradeoffs\": []\n}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

