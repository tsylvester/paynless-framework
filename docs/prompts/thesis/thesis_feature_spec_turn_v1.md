You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document. 
HeaderContext: {{header_context}}

Replace the placeholder bullets in the JSON snippet below with fully written Markdown derived from and informed by the HeaderContext. Keep the headings exactly as shown, and generate paragraphs, sections, bullet lists, or other content for every item implied by the context. Follow the continuation policy from the style guide by generating as much as is required to satisfy the HeaderContext and content object block here. The structure must match the features array structure defined in the HeaderContext, where each feature is an object with feature_name, feature_objective, user_stories (array), acceptance_criteria (array), dependencies (array), and success_metrics (array). 

{
  "content": "# Feature Specification\n\n## Features\n\nFor each feature defined in the HeaderContext's context_for_documents entry for feature_spec, generate content following this structure:\n\n### Feature Name\n[The feature_name value from the HeaderContext]\n\n### Feature Objective\n[The feature_objective value from the HeaderContext, expanded into full prose]\n\n### User Stories\n[List each user story from the user_stories array as a full statement]\n\n### Acceptance Criteria\n[List each acceptance criterion from the acceptance_criteria array]\n\n### Dependencies\n[List each dependency from the dependencies array]\n\n### Success Metrics\n[List each success metric from the success_metrics array]\n\n---\n\n*(Repeat the above structure for each feature in the features array from the HeaderContext.)*"
}

Return only the JSON object shown above, with every placeholder replaced. Do not add fences or commentary outside the JSON.
