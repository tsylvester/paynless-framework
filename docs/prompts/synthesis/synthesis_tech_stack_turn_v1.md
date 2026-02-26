You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are developing a tech stack that meets the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For object fields, provide structured content. For array fields, populate with strings representing list items. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"frontend_stack":{},"backend_stack":{},"data_platform":{},"devops_tooling":{},"security_tooling":{},"shared_libraries":[],"third_party_services":[],"components":[{"component_name":"Name the component, derived from consolidated technical approach and feature spec synthesis in the HeaderContext.","recommended_option":"Specify the recommended technology option, incorporating synthesis insights from the HeaderContext.","rationale":"Explain the rationale for the recommended option, derived from consolidated synthesis documents in the HeaderContext.","alternatives":[],"tradeoffs":[],"risk_signals":[],"integration_requirements":[],"operational_owners":[],"migration_plan":[]}],"open_questions":[],"next_steps":[]}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

