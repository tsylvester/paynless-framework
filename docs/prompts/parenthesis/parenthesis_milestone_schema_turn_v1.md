You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document.
HeaderContext: {{header_context}}

You are producing the middle zoom level. The master plan (in HeaderContext) defines WHAT to build. Your job is to decompose the next dependency-frontier milestones into architectural work nodes that define HOW each piece fits together. The downstream checklist stage will expand your nodes into file-level TDD implementation steps.

Select milestones whose dependencies are all [✅] or are included in the current batch. Do not elaborate milestones whose dependencies are unmet.

Before per-milestone nodes, identify cross-cutting capabilities (middleware, validation, shared utilities) and assign each to the earliest milestone where it is needed. Downstream milestones reference these via deps.

Each node must scope to a single architectural role and a single bounded module. If a capability spans roles, it needs separate nodes per role.

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For arrays, populate with fully developed entries when context is available. For the milestones array, produce one entry per selected milestone. For each milestone's nodes array, produce one entry per architectural work unit. Each node's provides field must name the specific capabilities, modules, or integration surfaces that become available when the node completes. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext:

{"content":{"index":[],"pipeline_context":"framing paragraph explaining middle-zoom role","selection_criteria":"dependency frontier: only milestones whose deps are [✅] or in current batch","shared_infrastructure":[],"milestones":[{"id":"","title":"","status":"","objective":"","nodes":[{"path":"","title":"","objective":"","role":"","module":"","deps":[],"provides":[],"directionality":"","requirements":[]}]}],"iteration_semantics":"replace, don't extend; reference prior schema for continuity","executive_summary":"Provide a concise synopsis of the milestone schema, highlighting the selected frontier milestones and key architectural decisions derived from the HeaderContext."}}

Return only the JSON object shown above, with every placeholder replaced with actual content. Do not add fences or commentary outside the JSON.
