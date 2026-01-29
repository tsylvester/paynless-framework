You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are synthesizing a feature spec for the user's objective with its criticism to produce an improved version. 

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis feature specification, antithesis technical feasibility assessment, non-functional requirements review, comparison vector, and any feedback provided for those artifacts. Keep the structure exactly as shown, ensure arrays contain fully developed entries when context is available, and align all rationale with cited evidence. For each feature entry populate every field with detailed prose or bullet lists. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{"content":{"features":[{"feature_name":"Name the feature, synthesizing thesis feature specifications with antithesis feasibility assessments from the HeaderContext.","feature_objective":"State the feature's purpose and goals, incorporating feasibility insights and non-functional alignment from the HeaderContext.","user_stories":[],"acceptance_criteria":[],"dependencies":[],"success_metrics":[],"risk_mitigation":"Describe risk mitigation strategies, synthesizing thesis approaches with antithesis risk register feedback from the HeaderContext.","open_questions":"List open questions that remain unresolved, incorporating synthesis of thesis questions with antithesis critique feedback from the HeaderContext.","feasibility_insights":[],"non_functional_alignment":[],"score_adjustments":[]}],"feature_scope":[],"tradeoffs":[]}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

