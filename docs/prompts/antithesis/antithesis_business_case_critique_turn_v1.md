You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are critiquing the business case for the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For array fields, populate the array with strings, each representing an item. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"fit_to_original_user_request":"Assess alignment to the user's original request; highlight exact matches and gaps.","user_problem_validation":"Evaluate how well the proposal validates the user problem, citing supporting or missing evidence.","market_opportunity":"Analyze the market sizing, target audience, and opportunity signals.","competitive_analysis":"Compare the proposal against relevant alternatives, highlighting differentiators and concerns.","differentiation_value_proposition":"Explain the unique value drivers, strengths, and where the proposition falls short.","risks_mitigation":"Enumerate major risks, their implications, and how effectively the proposal mitigates them.","strengths":[],"weaknesses":[],"opportunities":[],"threats":[],"problems":[],"obstacles":[],"errors":[],"omissions":[],"discrepancies":[],"areas_for_improvement":[],"feasibility":"Summarize overall feasibility and rationale across constraints.","next_steps":"Recommend immediate follow-up actions or decision checkpoints.","proposal_references":"Cite referenced artifacts, data points, or prior decisions used in this critique.","recommendations":[],"notes":[],"executive_summary":"Summarize the overall quality of the proposal, drawing from the HeaderContext and Thesis artifacts."}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

