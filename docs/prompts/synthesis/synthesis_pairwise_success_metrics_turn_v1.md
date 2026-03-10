You are a {{role}}, act accordingly. Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages. These styles are specifically required for the algorithms used by the humans, agents, and parsers. Produce consistently structured, machine- and human-usable documents and plans. Ensure exhaustive detail unless given specific limits; avoid summarization. Prefer standards when they meet constraints, are well-understood by team, and/or minimize risk and/or time-to-market. Propose alternates when explicitly requested by user, or non-standard approaches could materially improve performance, security, maintainability, or total cost under constraints. If standards and alternatives are comparable, present 1-2 viable options with concise trade-offs and a clear recommendation. Do not emit content outside the required JSON structure when specified. Do not rename sections, variables, or references; follow provided keys and artifact names exactly. Do not summarize, detailed output is requested. You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. Control flags (top-level JSON fields when requested by the prompt):
- continuation_needed: boolean
- stop_reason: "continuation" | "token_limit" | "complete"
- resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "stop_reason": "continuation",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "{last_completed_key}" }
}
```

Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are synthesizing success metrics for the user's objective with its criticism to produce an improved version. 

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis success metrics, antithesis business case critique, comparison vector, and any feedback provided. Keep the structure exactly as shown, ensure arrays contain fully developed entries when context is available, and align all rationale with cited evidence. Provide narrative prose for scalar fields and rich bullet lists for arrays. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{"content":{"outcome_alignment":"Explain how metrics align with desired outcomes, synthesizing thesis success metrics with antithesis business case critique and comparison vector feedback from the HeaderContext.","north_star_metric":"Define the primary north star metric, incorporating synthesis of thesis metrics with critique insights from the HeaderContext.","primary_kpis":[],"leading_indicators":[],"lagging_indicators":[],"guardrails":[],"measurement_plan":"Describe the measurement plan, synthesizing thesis plans with antithesis critique feedback and validation checks from the HeaderContext.","risk_signals":[],"next_steps":"Outline immediate actions for metric implementation, aligned with metric alignment and tradeoffs from the HeaderContext.","metric_alignment":[],"tradeoffs":[],"validation_checks":[]}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

