You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document. 
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here: 

{
  "content": "# Feature Specification\n\n## Feature Overview\n- Summarize the key features and how they deliver the HeaderContext objectives.\n\n## Detailed Features\n### Feature Summary\n- Feature Name: <Name>\n- Feature Objective:\n  - Describe the outcome this feature enables.\n- User Stories:\n  - List the user stories from the HeaderContext, written as full statements.\n- Acceptance Criteria:\n  - Enumerate acceptance criteria that validate the feature meets expectations.\n- Dependencies:\n  - Identify upstream/downstream elements required for delivery.\n- Success Metrics:\n  - Highlight the success metrics associated with this feature.\n\n*(Repeat the section above for each feature defined in the HeaderContext.)*\n\n## Dependencies & Considerations\n- Explain cross-feature dependencies, sequencing concerns, and technical considerations.\n\n## Success Metrics\n- Summarize how feature-level success metrics roll up to the stage outcomes."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.