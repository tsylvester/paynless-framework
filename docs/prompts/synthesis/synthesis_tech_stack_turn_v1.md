You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder structure in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext plus the consolidated synthesis documents (technical approach, feature spec, success metrics, and any feedback). Keep the structure exactly as shown, ensure every list contains fully developed entries when context is available, and align every section with the additive data established so far. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "# Tech Stack Recommendations\n\n## Frontend Stack\n- ...\n\n## Backend Stack\n- ...\n\n## Data Platform\n- ...\n\n## DevOps Tooling\n- ...\n\n## Security Tooling\n- ...\n\n## Shared Libraries\n- ...\n\n## Third-Party Services\n- ...\n\n## Component Recommendations\n### Component 1\n- Recommended Option:\n- Rationale:\n- Alternatives:\n- Tradeoffs:\n- Risk Signals:\n- Integration Requirements:\n- Operational Owners:\n- Migration Plan:\n\n### Component 2\n- Recommended Option:\n- Rationale:\n- Alternatives:\n- Tradeoffs:\n- Risk Signals:\n- Integration Requirements:\n- Operational Owners:\n- Migration Plan:\n\n## Open Questions\n- ...\n\n## Next Steps\n- ..."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

