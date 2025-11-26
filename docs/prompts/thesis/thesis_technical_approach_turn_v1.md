You are a {{role}}, act accordingly. Follow this style guide: {{style_guide_markdown}}
Here is the HeaderContext JSON object. Treat it as the authoritative plan for this stage so your output aligns with every other document derived from it.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown grounded in the HeaderContext. Keep the headings exactly as shown, expand every placeholder into detailed prose or bullet lists, and follow the continuation policy until the HeaderContext requirements are fulfilled. 

{
  "content": "# Technical Approach\n\n## Architecture\n- Describe the target architecture, including primary layers, services, and integration boundaries defined in the HeaderContext.\n\n## Components\n- Detail the key components/modules, their responsibilities, and how they collaborate.\n\n## Data\n- Explain data models, storage, flows, and governance considerations highlighted in the HeaderContext.\n\n## Deployment\n- Outline deployment topology, environment strategy, and operational tooling implied by the HeaderContext.\n\n## Sequencing\n- Provide the implementation sequencing, major dependencies, and integration points necessary to deliver the solution.\n\n## Risk Mitigation\n- Summarize mitigation strategies for the architectural and delivery risks identified in the HeaderContext.\n\n## Open Questions\n- List outstanding questions, assumptions, or decisions that must be resolved."
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.
