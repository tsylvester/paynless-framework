You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are assessing the feasibility of the plan to meet the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For array fields, populate the array with strings, each representing an item. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"team":"Evaluate capabilities, capacity, and skill gaps.","timeline":"Assess schedule feasibility, major milestones, and delivery risks.","cost":"Outline cost considerations, budgeting assumptions, and financial risks.","integration":"Detail integration requirements, dependencies, and potential blockers.","compliance":"Identify regulatory, security, or policy constraints and their impact.","findings":[],"architecture":"Assess the proposed architecture structure and its suitability.","components":"Review major components/modules and their responsibilities.","data":"Evaluate data flows, storage, and governance considerations.","deployment":"Examine deployment approach, environments, and operational tooling.","sequencing":"Describe implementation sequencing, dependency ordering, and critical path.","risk_mitigation":"Summarize mitigation strategies for material feasibility risks.","open_questions":"List outstanding questions, assumptions, or decisions required.","summary":"Summarize feasibility highlights, critical blockers, and confidence level."}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

