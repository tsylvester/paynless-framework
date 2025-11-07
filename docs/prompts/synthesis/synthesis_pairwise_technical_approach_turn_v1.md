You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis technical approach, antithesis risk register, dependency map, and any feedback provided for those artifacts. Keep the structure exactly as shown, ensure arrays contain fully developed entries when context is available, and align all rationale with cited evidence. Provide narrative prose for scalar fields (`architecture`, `data`, `deployment`, `sequencing`) and rich bullet lists for array fields. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\n  \"architecture\": \"\",\n  \"components\": [],\n  \"data\": \"\",\n  \"deployment\": \"\",\n  \"sequencing\": \"\",\n  \"architecture_alignment\": [],\n  \"risk_mitigations\": [],\n  \"dependency_resolution\": [],\n  \"open_questions\": []\n}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

