<!-- Template: parenthesis_milestone_schema.md -->
{{#section:index}}
# Index
{index}
{{/section:index}}

{{#section:executive_summary}}
# Executive Summary
{executive_summary}
{{/section:executive_summary}}

{{#section:fields}}
# Milestone Schema Fields

{{#each fields}}
## {name}
- **Type**: {type}
- **Description**: {description}
{{#if values}}
- **Values**: {values}
{{/if}}
{{/each}}
{{/section:fields}}

{{#section:style_guide_notes}}
# Style Guide Notes
{style_guide_notes}
{{/section:style_guide_notes}}

{{#section:validation_rules}}
# Validation Rules
{{#each validation_rules}}
- {this}
{{/each}}
{{/section:validation_rules}}

{{#section:iteration_guidance}}
# Iteration Guidance
- **Reuse Policy**: {iteration_guidance.reuse_policy}
- **Versioning**: {iteration_guidance.versioning}
{{/section:iteration_guidance}}

{{#section:features}}
# Features Context
{features}
{{/section:features}}

{{#section:feasibility_insights}}
# Feasibility Insights
{feasibility_insights}
{{/section:feasibility_insights}}

{{#section:non_functional_alignment}}
# Non-Functional Alignment
{non_functional_alignment}
{{/section:non_functional_alignment}}

{{#section:architecture_summary}}
# Architecture Summary
{architecture_summary}
{{/section:architecture_summary}}

{{#section:services}}
# Services
{services}
{{/section:services}}

{{#section:components}}
# Components
{components}
{{/section:components}}

{{#section:dependency_resolution}}
# Dependency Resolution
{dependency_resolution}
{{/section:dependency_resolution}}

{{#section:component_details}}
# Component Details
{component_details}
{{/section:component_details}}

{{#section:integration_requirements}}
# Integration Requirements
{integration_requirements}
{{/section:integration_requirements}}

{{#section:migration_context}}
# Migration Context
{migration_context}
{{/section:migration_context}}

<!-- Missing sections will be omitted by the renderer -->
{{#section:_not_provided}}
<!-- Section not provided by model: {_not_provided} -->
{{/section:_not_provided}}
