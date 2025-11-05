You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis success metrics, antithesis business case critique, comparison vector, and any feedback provided. Keep the structure exactly as shown, ensure arrays contain fully developed entries when context is available, and align all rationale with cited evidence. Provide narrative prose for scalar fields and rich bullet lists for arrays. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\n  \"outcome_alignment\": \"\",\n  \"north_star_metric\": \"\",\n  \"primary_kpis\": [],\n  \"leading_indicators\": [],\n  \"lagging_indicators\": [],\n  \"guardrails\": [],\n  \"measurement_plan\": \"\",\n  \"risk_signals\": [],\n  \"next_steps\": \"\",\n  \"metric_alignment\": [],\n  \"tradeoffs\": [],\n  \"validation_checks\": []\n}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

