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

In this turn you are synthesizing a business case for the user's objective with its criticism to produce an improved version. 

Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the thesis business case, antithesis business case critique, comparison vector, and any critique feedback provided. Keep the structure exactly as shown, ensure every array contains fully developed entries when context is available, and align all rationale with cited evidence. For list fields (`strengths`, `weaknesses`, `opportunities`, `threats`, `resolved_positions`, `open_questions`, `proposal_references`) provide arrays of rich bullet strings. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{"content":{"executive_summary":"Provide a concise synopsis synthesizing the thesis business case with antithesis critiques, highlighting resolved positions and key insights from the HeaderContext.","user_problem_validation":"Summarize evidence that the problem is real and pressing, synthesizing thesis validation with antithesis critique feedback from the HeaderContext.","market_opportunity":"Describe the target audience, market sizing, and opportunity identified, incorporating critique insights from the HeaderContext.","competitive_analysis":"Compare the proposal against relevant alternatives, synthesizing thesis analysis with antithesis critique feedback and comparison vectors from the HeaderContext.","differentiation_&_value_proposition":"Highlight the unique advantages of the proposed approach, incorporating critique alignment and resolved positions from the HeaderContext.","risks_&_mitigation":"List the primary risks and mitigation strategies, synthesizing thesis risks with antithesis critique feedback from the HeaderContext.","strengths":"Capture the key strengths identified, incorporating synthesis of thesis strengths with critique insights from the HeaderContext.","weaknesses":"Document the weaknesses or limitations that must be managed, synthesizing thesis weaknesses with antithesis critique feedback from the HeaderContext.","opportunities":"Outline opportunities the plan can leverage, incorporating synthesis insights from the HeaderContext.","threats":"Note external threats or challenges to success, synthesizing thesis threats with antithesis critique feedback from the HeaderContext.","critique_alignment":"Explain how antithesis critiques have been addressed, incorporated, or resolved in the synthesis, referencing specific critique feedback from the HeaderContext.","next_steps":"Outline immediate actions, decisions, or follow-ups required to advance the proposal, aligned with resolved positions and open questions from the HeaderContext.","proposal_references":[],"resolved_positions":[],"open_questions":[]}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

