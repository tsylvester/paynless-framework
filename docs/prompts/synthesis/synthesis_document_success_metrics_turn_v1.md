You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
We are consolidating the pairwise success metrics syntheses into a single document-level view. Use every provided `synthesis_pairwise_success_metrics` artifact (and any associated metadata or feedback) so the consolidated JSON reflects all lineages and reviewer inputs.

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext (if provided), all pairwise success metrics syntheses, and any accompanying feedback. Keep the structure exactly as shown, ensure arrays contain richly developed entries when context is available, and align every statement with cited evidence. Provide narrative prose for scalar fields and detailed bullet lists for array fields. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\n  \"metric_alignment\": [],\n  \"tradeoffs\": [],\n  \"validation_checks\": [],\n  \"outcome_alignment\": \"\",\n  \"north_star_metric\": \"\",\n  \"primary_kpis\": [],\n  \"leading_indicators\": [],\n  \"lagging_indicators\": [],\n  \"guardrails\": [],\n  \"measurement_plan\": \"\",\n  \"risk_signals\": [],\n  \"next_steps\": \"\"\n}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

