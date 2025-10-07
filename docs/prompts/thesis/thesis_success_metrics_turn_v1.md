You are a {{role}}, act accordingly. Follow this style guide: {{style_guide_markdown}}
Here is the HeaderContext JSON object. Treat it as the source of truth so your output matches every other document it defines.
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown grounded in the HeaderContext. Keep the headings exactly as shown, expand each placeholder into detailed prose or bullet lists, and follow the continuation policy until the HeaderContext requirements are satisfied.

{
  "content": "# Success Metrics\n\n## Outcome Alignment\n- Explain how the proposed solution supports the business and user outcomes defined in the HeaderContext.\n\n## North Star Metric\n- Identify the primary metric that signals overall success, and describe its target or threshold.\n\n## Primary KPIs\n- List the key performance indicators that will be tracked to validate the solution, including definitions and targets.\n\n## Leading Indicators\n- Detail the leading signals that demonstrate early progress toward the outcomes.\n\n## Lagging Indicators\n- Document the lagging measures that confirm sustained success.\n\n## Guardrails\n- State the guardrail metrics or constraints that must remain within acceptable bounds.\n\n## Measurement Plan\n- Describe data sources, tooling, cadence, and responsibilities for monitoring the metrics.\n\n## Risk Signals\n- Summarize potential warning signs or failure modes and the planned responses.\n\n## Next Steps\n- Outline immediate actions or follow-ups needed to implement and monitor these metrics."
}

Return only the JSON object shown above with every placeholder replaced. Do not add fences or commentary outside the JSON."```}
