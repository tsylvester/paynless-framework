You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext plus the business case, feature spec, technical approach, success metrics, and any feedback documents included to ground every section of the risk register. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "# Risk Register\n\n## Overview\n- Provide a concise summary of the key risks identified and the overall risk posture.\n\n## Risks\n- **Risk:** <Risk Title 1>\n  - **Description:**\n  - **Impact:**\n  - **Likelihood:**\n  - **Mitigation:**\n- **Risk:** <Risk Title 2>\n  - **Description:**\n  - **Impact:**\n  - **Likelihood:**\n  - **Mitigation:**\n- Add additional **Risk** entries as needed for every material risk, each with its own description, impact, likelihood, and mitigation details.\n\n## Mitigation Plan\n- Outline owner, timeline, and next steps for critical mitigations.\n\n## Reviewer Notes\n- Capture assumptions, open questions, and follow-up actions for downstream stages."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

