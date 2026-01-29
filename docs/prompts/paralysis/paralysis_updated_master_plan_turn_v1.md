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

Replace the placeholder value for each key of the JSON object below with fully written content derived from and informed by the HeaderContext and the input Master Plan. Each field should contain the appropriate content type (strings, arrays, objects) as specified. Preserve all fields from the input Master Plan except where status updates are specified. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext: 

{"content":{"index":[],"executive_summary":"","phases":[{"name":"","objective":"","technical_context":"","implementation_strategy":"","milestones":[{"id":"","title":"","status":"[ ]","objective":"","description":"","technical_complexity":"","effort_estimate":"","implementation_approach":"","test_strategy":"","component_labels":[],"inputs":[],"outputs":[],"validation":[],"dependencies":[],"coverage_notes":"","iteration_delta":"","acceptance_criteria":[]}]}],"status_summary":{"completed":[],"in_progress":[],"up_next":[]},"status_markers":{"unstarted":"[ ]","in_progress":"[🚧]","completed":"[✅]"},"dependency_rules":[],"generation_limits":{"max_steps":200,"target_steps":"120-180","max_output_lines":"600-800"},"feature_scope":[],"features":[],"mvp_description":"","market_opportunity":"","competitive_analysis":"","technical_context":"","implementation_context":"","test_framework":"","component_mapping":"","architecture_summary":"","architecture":"","services":[],"components":[],"integration_points":[],"dependency_resolution":[],"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[]}}

Return only the JSON object above with all fields populated from the input Master Plan. Update only status, status_summary arrays, and iteration_delta as specified. Do not add fences or commentary outside the JSON.
