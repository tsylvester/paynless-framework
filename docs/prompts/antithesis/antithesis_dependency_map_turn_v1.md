You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext plus the business case, feature spec, technical approach, success metrics, and any feedback documents included to ground every section of the dependency map. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here:

{
  "content": "# Dependency Map\n\n## Overview\n- Summarize the system’s key components and why the dependency map matters for this proposal.\n\n## Components\n- Enumerate major components, describing their responsibilities and ownership.\n\n## Integration Points\n- Document integrations between components, upstream/downstream systems, and data flows.\n\n## Conflict Flags\n- Highlight conflicts, bottlenecks, sequencing concerns, or high-risk dependencies.\n\n## Dependencies\n- Detail explicit dependencies across teams, systems, or deliverables.\n\n## Sequencing\n- Outline the recommended implementation/order of work.\n\n## Risk Mitigation\n- Summarize mitigation plans for high-risk dependency areas.\n\n## Open Questions\n- Capture assumptions, unknowns, or follow-up actions related to dependencies."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.

