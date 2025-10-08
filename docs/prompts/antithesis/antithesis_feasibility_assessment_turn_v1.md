You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext plus the business case, feature spec, technical approach, success metrics, and any feedback documents included to ground every section of the feasibility assessment. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "# Technical Feasibility Assessment\n\n## Summary\n- Briefly summarize feasibility highlights and critical concerns.\n\n## Constraint Checklist\n### Team\n- Evaluate the team's capabilities, capacity, and skill gaps.\n### Timeline\n- Assess schedule feasibility, major milestones, and risks to delivery.\n### Cost\n- Outline cost considerations, budgeting assumptions, and financial risks.\n### Integration\n- Detail integration requirements, dependencies, and potential blockers.\n### Compliance\n- Identify regulatory, security, or policy constraints and their impact.\n\n## Findings\n- Present detailed findings, structured by constraint or major theme, citing evidence from the provided artifacts.\n\n## Recommendations\n- Provide actionable guidance to improve feasibility across constraints, including rationale and next steps.\n\n## Reviewer Notes\n- Capture any caveats, assumptions, or follow-up questions for downstream stages."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

