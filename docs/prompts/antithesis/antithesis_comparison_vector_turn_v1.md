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

In this turn you are generating a comparison vector between different potential solutions to the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written JSON content derived from and informed by the HeaderContext. Numeric scores must remain within the documented range (1-5), and provide concise rationales aligned with the evidence. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"proposal":{"lineage_key":"Set from the file name of the proposal being reviewed.","source_model_slug":"Set from the file name of the proposal being reviewed."},"dimensions":{"feasibility":{"score":0,"rationale":"Assess technical and practical feasibility with evidence-based rationale."},"complexity":{"score":0,"rationale":"Evaluate implementation complexity and required effort."},"security":{"score":0,"rationale":"Assess security posture and risk exposure."},"performance":{"score":0,"rationale":"Evaluate performance characteristics and scalability."},"maintainability":{"score":0,"rationale":"Assess long-term maintainability and operational burden."},"scalability":{"score":0,"rationale":"Evaluate ability to scale with growth and demand."},"cost":{"score":0,"rationale":"Assess total cost of ownership and financial impact."},"time_to_market":{"score":0,"rationale":"Evaluate delivery timeline and time-to-value."},"compliance_risk":{"score":0,"rationale":"Assess regulatory and compliance risk exposure."},"alignment_with_constraints":{"score":0,"rationale":"Evaluate how well the proposal aligns with stated constraints and requirements."}}}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

