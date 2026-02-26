You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are synthesizing a technical approach for the user's objective with its criticism to produce an improved version. 

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis technical approach, antithesis risk register, dependency map, and any feedback provided for those artifacts. Keep the structure exactly as shown, ensure arrays contain fully developed entries when context is available, and align all rationale with cited evidence. Provide narrative prose for scalar fields (`architecture`, `data`, `deployment`, `sequencing`) and rich bullet lists for array fields. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{"content":{"architecture":"Describe the system architecture, synthesizing thesis technical approach with antithesis risk register and dependency map feedback from the HeaderContext.","components":[],"data":"Explain data architecture and flows, incorporating synthesis of thesis data approach with antithesis critique feedback from the HeaderContext.","deployment":"Outline deployment strategy, synthesizing thesis deployment plans with antithesis risk mitigation feedback from the HeaderContext.","sequencing":"Describe implementation sequencing, incorporating dependency resolution and risk mitigations from the HeaderContext.","architecture_alignment":[],"risk_mitigations":[],"dependency_resolution":[],"open_questions":[]}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

