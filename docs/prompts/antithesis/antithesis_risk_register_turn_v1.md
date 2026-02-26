You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are building a risk register for the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For array fields, populate the array with strings, each representing an item. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"risk":"For every material risk, provide the detailed structure with risk title, impact, likelihood, mitigation, components affected, dependencies, sequencing considerations, risk mitigation plan, open questions, guardrails, risk signals, and next steps.","impact":"Describe the consequence if the risk materializes.","likelihood":"Estimate probability with justification.","mitigation":"Summarize the proposed mitigation or fallback plan.","seed_examples":[],"mitigation_plan":"Summarize cross-cutting mitigation themes, owners, timelines, and required resources.","notes":"Record assumptions, dependencies, or follow-up actions for downstream stages.","overview":"Summarize the overall risk posture, key drivers, and critical concerns grounded in the HeaderContext and referenced artifacts."}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

