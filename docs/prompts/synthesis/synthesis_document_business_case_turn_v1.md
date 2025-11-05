You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
We are consolidating the pairwise business case syntheses into a single document-level view. Use every provided `synthesis_pairwise_business_case` artifact (and any associated metadata or feedback) as source material so the consolidated result reflects all lineages and reviewer inputs.

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext (if provided), all pairwise business case syntheses, and any accompanying feedback. Keep the structure exactly as shown, ensure arrays contain richly developed entries when context is available, and align every statement with cited evidence. Provide narrative prose for scalar fields and detailed bullet lists for array fields. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\n  \"executive_summary\": \"\",\n  \"user_problem_validation\": \"\",\n  \"market_opportunity\": \"\",\n  \"competitive_analysis\": \"\",\n  \"differentiation_&_value_proposition\": \"\",\n  \"risks_&_mitigation\": \"\",\n  \"strengths\": [],\n  \"weaknesses\": [],\n  \"opportunities\": [],\n  \"threats\": [],\n  \"resolved_positions\": [],\n  \"open_questions\": [],\n  \"next_steps\": \"\",\n  \"proposal_references\": []\n}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

