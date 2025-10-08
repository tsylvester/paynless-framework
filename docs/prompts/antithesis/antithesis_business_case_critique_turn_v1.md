You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext plus the business case, feature spec, technical approach, success metrics, and any feedback documents included to ground every section of the critique. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "# Proposal Critique\n\n## Overview\n- Summarize the proposal, citing key context from the HeaderContext and Thesis documents.\n\n## Strengths\n- List strengths with explanations that reference supporting evidence.\n\n## Weaknesses\n- List weaknesses with explanations and potential impacts.\n\n## Opportunities\n- Identify opportunities to expand or improve the proposal.\n\n## Threats\n- Note external or internal threats that could undermine success.\n\n## Recommendations\n- Provide actionable recommendations, organized as bullet points or subsections, each describing the issue, rationale, and suggested next step.\n\n## Reviewer Notes\n- Capture any additional observations, clarifications, or assumptions that future stages should consider."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

