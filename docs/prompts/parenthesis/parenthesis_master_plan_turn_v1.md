You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the TRD, PRD, and any synthesis feedback. Keep the structure exactly as shown, ensure every array contains fully developed entries when context is available, and align all milestone planning with the synthesis deliverables and technical requirements. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "{\n  \"index\": [],\n  \"executive_summary\": \"\",\n  \"phases\": [{\"name\": \"\", \"objective\": \"\", \"milestones\": [{\"id\": \"\", \"title\": \"\", \"objective\": \"\", \"inputs\": [], \"outputs\": [], \"dependencies\": [], \"acceptance_criteria\": [], \"status\": \"[ ]\", \"coverage_notes\": \"\", \"iteration_delta\": \"\"}]}],\n  \"status_summary\": {\"completed\": [], \"in_progress\": [], \"up_next\": []},\n  \"feature_scope\": [],\n  \"features\": [],\n  \"mvp_description\": \"\",\n  \"market_opportunity\": \"\",\n  \"competitive_analysis\": \"\",\n  \"architecture_summary\": \"\",\n  \"architecture\": \"\",\n  \"services\": [],\n  \"components\": [],\n  \"integration_points\": [],\n  \"dependency_resolution\": [],\n  \"frontend_stack\": {},\n  \"backend_stack\": {},\n  \"data_platform\": {},\n  \"devops_tooling\": {},\n  \"security_tooling\": {},\n  \"shared_libraries\": [],\n  \"third_party_services\": []\n}"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.
