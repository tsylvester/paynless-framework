You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are detailing the non functional requirements for the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For array fields, populate the array with strings, each representing an item. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"security":"Detail security requirements, gaps, and recommendations.","performance":"Assess performance expectations, scalability, and response-time considerations.","reliability":"Evaluate reliability targets, redundancy, and failure recovery plans.","scalability":"Discuss scalability expectations, load management, and future growth considerations.","maintainability":"Review maintainability, codebase structure, documentation, and operational readiness.","compliance":"Identify regulatory, legal, or organizational compliance needs and current coverage.","outcome_alignment":"Explain how non-functional requirements support desired outcomes.","primary_kpis":"List key KPIs tied to non-functional success.","leading_indicators":"Document leading indicators that signal early progress on NFRs.","lagging_indicators":"Capture lagging indicators that validate long-term NFR success.","measurement_plan":"Describe measurement methods, tooling, cadence, and responsibilities.","risk_signals":"Note warning signs or thresholds that indicate emerging NFR issues.","guardrails":"Specify guardrails that must remain within acceptable bounds.","next_steps":"Outline immediate actions or follow-ups needed to address NFR gaps.","overview":"Summarize non-functional coverage, highlighting strengths and concerns across the NFR dimensions."}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

