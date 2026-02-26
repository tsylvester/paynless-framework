You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

In this turn you are generating a comparison vector between different potential solutions to the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written JSON content derived from and informed by the HeaderContext. Numeric scores must remain within the documented range (1-5), and provide concise rationales aligned with the evidence. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"proposal":{"lineage_key":"Set from the file name of the proposal being reviewed.","source_model_slug":"Set from the file name of the proposal being reviewed."},"dimensions":{"feasibility":{"score":0,"rationale":"Assess technical and practical feasibility with evidence-based rationale."},"complexity":{"score":0,"rationale":"Evaluate implementation complexity and required effort."},"security":{"score":0,"rationale":"Assess security posture and risk exposure."},"performance":{"score":0,"rationale":"Evaluate performance characteristics and scalability."},"maintainability":{"score":0,"rationale":"Assess long-term maintainability and operational burden."},"scalability":{"score":0,"rationale":"Evaluate ability to scale with growth and demand."},"cost":{"score":0,"rationale":"Assess total cost of ownership and financial impact."},"time_to_market":{"score":0,"rationale":"Evaluate delivery timeline and time-to-value."},"compliance_risk":{"score":0,"rationale":"Assess regulatory and compliance risk exposure."},"alignment_with_constraints":{"score":0,"rationale":"Evaluate how well the proposal aligns with stated constraints and requirements."}}}}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

