You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are detailing a system architecture that meets the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For array fields, populate with strings representing list items. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"architecture":"Describe the overall system architecture, derived from consolidated technical approach synthesis in the HeaderContext.","services":[],"components":[],"data_flows":[],"interfaces":[],"integration_points":[],"dependency_resolution":[],"conflict_flags":[],"sequencing":"Describe implementation sequencing, derived from consolidated technical approach synthesis in the HeaderContext.","risk_mitigations":[],"risk_signals":[],"security_measures":[],"observability_strategy":[],"scalability_plan":[],"resilience_strategy":[],"compliance_controls":[],"open_questions":[],"rationale":"Explain the rationale for architectural decisions, incorporating consolidated synthesis insights from the HeaderContext.","architecture_summary":"Provide a concise summary of the system architecture, highlighting key components and design decisions from consolidated synthesis in the HeaderContext."}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

