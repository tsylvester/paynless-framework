You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the business case, feature spec, technical approach, success metrics, and any feedback documents included to ground every dimension of the comparison vector. Keep the structure exactly as shown, numeric scores must remain within the documented range, and provide concise rationales aligned with the evidence. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\"proposal\": {\"lineage_key\": \"\", \"source_model_slug\": \"\"},\"dimensions\": {\"feasibility\": { \"score\": 0, \"rationale\": \"\" },\"complexity\": { \"score\": 0, \"rationale\": \"\" },\"security\": { \"score\": 0, \"rationale\": \"\" },\"performance\": { \"score\": 0, \"rationale\": \"\" },\"maintainability\": { \"score\": 0, \"rationale\": \"\" },\"scalability\": { \"score\": 0, \"rationale\": \"\" },\"cost\": { \"score\": 0, \"rationale\": \"\" },\"time_to_market\": { \"score\": 0, \"rationale\": \"\" },\"compliance_risk\": { \"score\": 0, \"rationale\": \"\" },\"alignment_with_constraints\": { \"score\": 0, \"rationale\": \"\" }}}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

