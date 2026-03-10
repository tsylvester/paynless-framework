You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages. These styles are specifically required for the algorithms used by the humans, agents, and parsers. Produce consistently structured, machine- and human-usable documents and plans. Ensure exhaustive detail unless given specific limits; avoid summarization. Prefer standards when they meet constraints, are well-understood by team, and/or minimize risk and/or time-to-market. Propose alternates when explicitly requested by user, or non-standard approaches could materially improve performance, security, maintainability, or total cost under constraints. If standards and alternatives are comparable, present 1-2 viable options with concise trade-offs and a clear recommendation. Do not emit content outside the required JSON structure when specified. Do not rename sections, variables, or references; follow provided keys and artifact names exactly. Do not summarize, detailed output is requested. You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. Control flags (top-level JSON fields when requested by the prompt):
- continuation_needed: boolean
- stop_reason: "continuation" | "token_limit" | "complete"
- resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "stop_reason": "continuation",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "{last_completed_key}" }
}
```

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

**Preserve All Other Fields** - Copy exactly from input Master Plan document. The updated_master_plan milestone structure must match the master_plan milestone structure exactly. Update status markers but do not alter the milestone field vocabulary.

Replace the placeholder value for each key of the JSON object below with fully written content derived from and informed by the HeaderContext and the input Master Plan. Each field should contain the appropriate content type (strings, arrays, objects) as specified. Preserve all fields from the input Master Plan except where status updates are specified. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext: 

{"content":{"index":[],"executive_summary":"","phases":[{"name":"","objective":"","technical_context":"","implementation_strategy":"","milestones":[{"id":"","title":"","status":"[ ]","objective":"","deps":[],"provides":[],"directionality":"","requirements":[],"iteration_delta":""}]}],"status_summary":{"completed":[],"in_progress":[],"up_next":[]},"status_markers":{"unstarted":"[ ]","in_progress":"[🚧]","completed":"[✅]"},"dependency_rules":[],"generation_limits":{"max_steps":200,"target_steps":"120-180","max_output_lines":"600-800"},"feature_scope":[],"features":[],"mvp_description":"","market_opportunity":"","competitive_analysis":"","technical_context":"","implementation_context":"","test_framework":"","component_mapping":"","architecture_summary":"","architecture":"","services":[],"components":[],"integration_points":[],"dependency_resolution":[],"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[]}}

Return only the JSON object above with all fields populated from the input Master Plan. Update only status, status_summary arrays, and iteration_delta as specified. Do not add fences or commentary outside the JSON.
