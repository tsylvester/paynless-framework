You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis business case, antithesis business case critique, comparison vector, and any critique feedback provided. Keep the structure exactly as shown, ensure every array contains fully developed entries when context is available, and align all rationale with cited evidence. For list fields (`strengths`, `weaknesses`, `opportunities`, `threats`, `resolved_positions`, `open_questions`, `proposal_references`) provide arrays of rich bullet strings. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\n  \"executive_summary\": \"\",\n  \"user_problem_validation\": \"\",\n  \"market_opportunity\": \"\",\n  \"competitive_analysis\": \"\",\n  \"differentiation_&_value_proposition\": \"\",\n  \"risks_&_mitigation\": \"\",\n  \"strengths\": [],\n  \"weaknesses\": [],\n  \"opportunities\": [],\n  \"threats\": [],\n  \"critique_alignment\": \"\",\n  \"resolved_positions\": [],\n  \"open_questions\": [],\n  \"next_steps\": \"\",\n  \"proposal_references\": []\n}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

