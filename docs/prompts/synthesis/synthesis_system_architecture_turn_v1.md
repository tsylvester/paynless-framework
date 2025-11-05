You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder structure in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext plus the consolidated synthesis documents (technical approach, dependency map, risk register, feature spec, success metrics, and any feedback). Keep the structure exactly as shown, ensure every list contains fully developed entries when context is available, and align every section with the additive data established so far. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "# System Architecture Overview\n\n## Architecture Summary\n- ...\n\n## Architecture\n- ...\n\n## Services\n- ...\n\n## Components\n- ...\n\n## Data Flows\n- ...\n\n## Interfaces\n- ...\n\n## Integration Points\n- ...\n\n## Dependency Resolution\n- ...\n\n## Conflict Flags\n- ...\n\n## Sequencing\n- ...\n\n## Risk Mitigations\n- ...\n\n## Risk Signals\n- ...\n\n## Security Measures\n- ...\n\n## Observability Strategy\n- ...\n\n## Scalability Plan\n- ...\n\n## Resilience Strategy\n- ...\n\n## Compliance Controls\n- ...\n\n## Open Questions\n- ..."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

