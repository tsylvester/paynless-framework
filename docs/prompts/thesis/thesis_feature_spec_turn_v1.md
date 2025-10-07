You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document. 
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here: 

{
  "content": "# Feature Specification\n\n## Feature Overview\n- List of key features with concise descriptions.\n\n## Detailed Features\n### <Feature Name 1>\n- Objective:\n- User Stories:\n  - As a <role>, I want <goal> so that <reason>.\n- Acceptance Criteria:\n  - Criteria aligned with the HeaderContext requirements.\n\n### <Feature Name 2>\n- Objective:\n- User Stories:\n  - As a <role>, I want <goal> so that <reason>.\n- Acceptance Criteria:\n  - Criteria aligned with the HeaderContext requirements.\n\n## Dependencies & Considerations\n- Highlight dependencies, risks, or technical considerations.\n\n## Success Metrics\n- Metrics to validate feature success and alignment with business goals."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.