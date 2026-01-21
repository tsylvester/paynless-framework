You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
We are consolidating the pairwise success metrics syntheses into a single document-level view. Use every provided `synthesis_pairwise_success_metrics` artifact (and any associated metadata or feedback) so the consolidated JSON reflects all lineages and reviewer inputs.

In this turn you are synthesizing versions of success metrics for the user's objective. 

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext (if provided), all pairwise success metrics syntheses, and any accompanying feedback. Keep the structure exactly as shown, ensure arrays contain richly developed entries when context is available, and align every statement with cited evidence. Provide narrative prose for scalar fields and detailed bullet lists for array fields. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{"content":{"metric_alignment":[],"tradeoffs":[],"validation_checks":[],"outcome_alignment":"Explain how metrics align with desired outcomes, consolidating outcome alignment from all pairwise success metrics syntheses in the HeaderContext.","north_star_metric":"Define the primary north star metric, consolidating metrics from all pairwise syntheses in the HeaderContext.","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"Describe the measurement plan, consolidating measurement approaches from all pairwise success metrics syntheses in the HeaderContext.","risk_signals":[],"next_steps":"Outline immediate actions for metric implementation, consolidating next steps from all pairwise syntheses in the HeaderContext."}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

