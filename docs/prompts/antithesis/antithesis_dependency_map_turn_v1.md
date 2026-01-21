You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are mapping the dependencies required to complete the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For array fields, populate the array with strings, each representing an item. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"components":[],"integration_points":[],"conflict_flags":[],"dependencies":"Detail explicit dependencies across teams, systems, or deliverables.","sequencing":"Outline the recommended implementation/order of work.","risk_mitigation":"Summarize mitigation plans for high-risk dependency areas.","open_questions":"Capture assumptions, unknowns, or follow-up actions related to dependencies.","overview":"Summarize the system's key components and why the dependency map matters for this proposal."}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

