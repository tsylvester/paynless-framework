You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are synthesizing success metrics for the user's objective with its criticism to produce an improved version. 

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis success metrics, antithesis business case critique, comparison vector, and any feedback provided. Keep the structure exactly as shown, ensure arrays contain fully developed entries when context is available, and align all rationale with cited evidence. Provide narrative prose for scalar fields and rich bullet lists for arrays. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{"content":{"outcome_alignment":"Explain how metrics align with desired outcomes, synthesizing thesis success metrics with antithesis business case critique and comparison vector feedback from the HeaderContext.","north_star_metric":"Define the primary north star metric, incorporating synthesis of thesis metrics with critique insights from the HeaderContext.","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"Describe the measurement plan, synthesizing thesis plans with antithesis critique feedback and validation checks from the HeaderContext.","risk_signals":[],"next_steps":"Outline immediate actions for metric implementation, aligned with metric alignment and tradeoffs from the HeaderContext.","metric_alignment":[],"tradeoffs":[],"validation_checks":[]}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

