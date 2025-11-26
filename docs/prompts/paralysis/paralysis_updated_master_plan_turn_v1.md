You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

## UPDATE Operation: Master Plan Status Updates

You are updating the original Master Plan document. Use it as your base structure and preserve all fields verbatim except where specified below.

**Baseline Assumptions:**
- Milestones originally marked "[🚧]" (in-progress) → assume completed "[✅]" (plan regeneration indicates work finished)
- Milestones originally marked "[✅]" (completed) → remain "[✅]" (no backtracking)
- Milestones originally marked "[ ]" (not started) → MAY transition to "[🚧]" IFF all dependencies in `dependencies[]` are completed (ready for actionable checklist) AND chosen for next set of work. 

**Update Only:**
- `phases[].milestones[].status` - Apply baseline assumptions above
- `status_summary.completed[]` - Array of milestone IDs with status "[✅]"
- `status_summary.in_progress[]` - Array of milestone IDs with status "[🚧]"
- `status_summary.up_next[]` - Array of milestone IDs with status "[ ]"
- `iteration_delta` - Brief description of status changes in this iteration

**Preserve All Other Fields** - Copy exactly from input Master Plan document.

{
  "content": "{\n  \"index\": [],\n  \"executive_summary\": \"\",\n  \"phases\": [{\"name\": \"\", \"objective\": \"\", \"technical_context\": \"\", \"implementation_strategy\": \"\", \"milestones\": [{\"id\": \"\", \"title\": \"\", \"status\": \"[ ]\", \"objective\": \"\", \"description\": \"\", \"technical_complexity\": \"\", \"effort_estimate\": \"\", \"implementation_approach\": \"\", \"test_strategy\": \"\", \"component_labels\": [], \"inputs\": [], \"outputs\": [], \"validation\": [], \"dependencies\": [], \"coverage_notes\": \"\", \"iteration_delta\": \"\", \"acceptance_criteria\": []}]}],\n  \"status_summary\": {\"completed\": [], \"in_progress\": [], \"up_next\": []},\n  \"status_markers\": {\"unstarted\": \"[ ]\", \"in_progress\": \"[🚧]\", \"completed\": \"[✅]\"},\n  \"dependency_rules\": [],\n  \"generation_limits\": {\"max_steps\": 200, \"target_steps\": \"120-180\", \"max_output_lines\": \"600-800\"},\n  \"feature_scope\": [],\n  \"features\": [],\n  \"mvp_description\": \"\",\n  \"market_opportunity\": \"\",\n  \"competitive_analysis\": \"\",\n  \"technical_context\": \"\",\n  \"implementation_context\": \"\",\n  \"test_framework\": \"\",\n  \"component_mapping\": \"\",\n  \"architecture_summary\": \"\",\n  \"architecture\": \"\",\n  \"services\": [],\n  \"components\": [],\n  \"integration_points\": [],\n  \"dependency_resolution\": [],\n  \"frontend_stack\": {},\n  \"backend_stack\": {},\n  \"data_platform\": {},\n  \"devops_tooling\": {},\n  \"security_tooling\": {},\n  \"shared_libraries\": [],\n  \"third_party_services\": []\n}"
}

Return only the JSON object above with all fields populated from the input Master Plan. Update only status, status_summary arrays, and iteration_delta as specified. Do not add fences or commentary outside the JSON.
