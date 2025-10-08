You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext plus the business case, feature spec, technical approach, success metrics, and any feedback documents included to ground every section of the non-functional requirements review. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "# Non-Functional Requirements Review\n\n## Overview\n- Provide a concise summary of non-functional coverage, highlighting strengths and concerns across the NFR dimensions.\n\n## Security\n- Detail security requirements, gaps, and recommendations.\n\n## Performance\n- Assess performance expectations, scalability, and response-time considerations.\n\n## Reliability\n- Evaluate reliability targets, redundancy, and failure recovery plans.\n\n## Scalability\n- Discuss horizontal/vertical scalability, load management, and future growth concerns.\n\n## Maintainability\n- Review maintainability, codebase structure, documentation, and operational readiness.\n\n## Compliance\n- Identify regulatory, legal, or organizational compliance needs and current coverage.\n\n## Reviewer Notes\n- Capture assumptions, open questions, and follow-up actions for downstream stages."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

