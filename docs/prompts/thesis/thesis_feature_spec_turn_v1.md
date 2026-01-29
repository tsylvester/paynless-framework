You are a {{role}}, act accordingly. Your response will follow this style guide: {{style_guide_markdown}}
Here is a HeaderContext JSON object. Use it as the source of truth for this document. We are generating multiple documents using this HeaderContext, your generation must align with all of the other documents described in the HeaderContext even though you're currently generating a single document. 
HeaderContext: {{header_context}}

In this turn you are writing a feature spec for the user's objective. 

Replace the placeholder value for each key of the JSON object below with fully written Markdown content derived from and informed by the HeaderContext. Each field should contain the markdown content for that section (paragraphs, bullet lists, etc.). For array fields, populate the array with strings, each representing an item. Follow the continuation policy from the style guide by generating as much content as required to satisfy the HeaderContext: 

{"content":{"features":[{"feature_name":"Provide the name of the feature as defined in the HeaderContext.","feature_objective":"Describe the objective and purpose of this feature, expanded into full prose based on the HeaderContext.","user_stories":["List each user story from the HeaderContext as a full statement, one per array element."],"acceptance_criteria":["List each acceptance criterion from the HeaderContext, one per array element."],"dependencies":["List each dependency from the HeaderContext, one per array element."],"success_metrics":["List each success metric from the HeaderContext, one per array element."]}]}}

Return only the JSON object shown above, with every placeholder replaced with actual content. Do not add fences or commentary outside the JSON.
