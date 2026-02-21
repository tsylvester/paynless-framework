    <!-- Template: parenthesis_milestone_schema.md -->
    {{#section:index}}
    # Index
    {index}
    {{/section:index}}

    {{#section:executive_summary}}
    # Executive Summary
    {executive_summary}
    {{/section:executive_summary}}

    {{#section:pipeline_context}}
    # Pipeline Context
    {pipeline_context}
    {{/section:pipeline_context}}

    {{#section:selection_criteria}}
    # Selection Criteria
    {selection_criteria}
    {{/section:selection_criteria}}

    {{#section:shared_infrastructure}}
    # Shared Infrastructure
    {{#each shared_infrastructure}}
    - {this}
    {{/each}}
    {{/section:shared_infrastructure}}

    {{#section:milestones}}
    # Milestones

    {{#each milestones}}
    ## {id} — {title} [{status}]

    {objective}

    {{#each nodes}}
    ### {path} {title}

    - **Objective**: {objective}
    - **Role**: {role}
    - **Module**: {module}
    - **Directionality**: {directionality}

    **Dependencies**:
    {{#each deps}}
    - {this}
    {{/each}}

    **Provides**:
    {{#each provides}}
    - {this}
    {{/each}}

    **Requirements**:
    {{#each requirements}}
    - {this}
    {{/each}}

    {{/each}}
    {{/each}}
    {{/section:milestones}}

    {{#section:iteration_semantics}}
    # Iteration Semantics
    {iteration_semantics}
    {{/section:iteration_semantics}}

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