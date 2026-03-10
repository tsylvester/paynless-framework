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

We are consolidating the pairwise business case syntheses into a single document-level view. Use every provided `synthesis_pairwise_business_case` artifact (and any associated metadata or feedback) as source material so the consolidated result reflects all lineages and reviewer inputs.

In this turn you are synthesizing versions of business cases for the user's objective. 

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext (if provided), all pairwise business case syntheses, and any accompanying feedback. Keep the structure exactly as shown, ensure arrays contain richly developed entries when context is available, and align every statement with cited evidence. Provide narrative prose for scalar fields and detailed bullet lists for array fields. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{"content":{"executive_summary":"Provide a concise synopsis consolidating all pairwise business case syntheses, highlighting resolved positions and key insights from all lineages and reviewers in the HeaderContext.","user_problem_validation":"Summarize evidence that the problem is real and pressing, consolidating validation from all pairwise syntheses and feedback in the HeaderContext.","market_opportunity":"Describe the target audience, market sizing, and opportunity, consolidating insights from all pairwise business case syntheses in the HeaderContext.","competitive_analysis":"Compare the proposal against relevant alternatives, consolidating analysis from all pairwise syntheses and comparison vectors in the HeaderContext.","differentiation_&_value_proposition":"Highlight the unique advantages of the proposed approach, consolidating value propositions from all pairwise syntheses in the HeaderContext.","risks_&_mitigation":"List the primary risks and mitigation strategies, consolidating risk analysis from all pairwise syntheses in the HeaderContext.","strengths":"Capture the key strengths identified, consolidating strengths from all pairwise business case syntheses in the HeaderContext.","weaknesses":"Document the weaknesses or limitations that must be managed, consolidating weaknesses from all pairwise syntheses in the HeaderContext.","opportunities":"Outline opportunities the plan can leverage, consolidating opportunities from all pairwise syntheses in the HeaderContext.","threats":"Note external threats or challenges to success, consolidating threats from all pairwise syntheses in the HeaderContext.","resolved_positions":[],"open_questions":[],"next_steps":"Outline immediate actions, decisions, or follow-ups required to advance the proposal, aligned with all consolidated resolved positions and open questions from the HeaderContext.","proposal_references":[]}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

