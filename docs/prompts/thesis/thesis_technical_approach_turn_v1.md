You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document. 
HeaderContext: {{header_context}}

In this turn you are writing a product requirements document that describes how to meet the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext: 

{"content":{"architecture":"Describe the target architecture, including primary layers, services, and integration boundaries defined in the HeaderContext.","components":"Detail the key components/modules, their responsibilities, and how they collaborate.","data":"Explain data models, storage, flows, and governance considerations highlighted in the HeaderContext.","deployment":"Outline deployment topology, environment strategy, and operational tooling implied by the HeaderContext.","sequencing":"Provide the implementation sequencing, major dependencies, and integration points necessary to deliver the solution.","risk_mitigation":"Summarize mitigation strategies for the architectural and delivery risks identified in the HeaderContext.","open_questions":"List outstanding questions, assumptions, or decisions that must be resolved."}}

Return only the JSON object shown above, with every placeholder replaced with actual content. Do not add fences or commentary outside the JSON.
