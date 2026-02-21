<!-- Template: paralysis_actionable_checklist.md -->
# Actionable Checklist

{{#section:milestone_ids}}
## Milestone IDs
{milestone_ids}
{{/section:milestone_ids}}

{{#section:index}}
## Index
{index}
{{/section:index}}

{{#section:milestone_summary}}
## Milestone Summary
{milestone_summary}
{{/section:milestone_summary}}

{{#section:milestone_reference}}
## Milestone Reference
- ID: {milestone_reference.id}
- Phase: {milestone_reference.phase}
- Dependencies: {milestone_reference.dependencies}
{{/section:milestone_reference}}

{{#section:steps}}
## Steps
{{#each nodes}}
*   `[ ]`   {path} **{title}**
    *   `[ ]`   `objective`
        {{#each objective}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `role`
        {{#each role}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `module`
        {{#each module}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `deps`
        {{#each deps}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `context_slice`
        {{#each context_slice}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `interface`
        {{#each interface}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `interface_tests`
        {{#each interface_tests}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `interface_guards`
        {{#each interface_guards}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `unit_tests`
        {{#each unit_tests}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `construction`
        {{#each construction}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `source`
        {{#each source}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `provides`
        {{#each provides}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `mocks`
        {{#each mocks}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `integration_tests`
        {{#each integration_tests}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `directionality`
        {{#each directionality}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `requirements`
        {{#each requirements}}
        *   `[ ]`   {this}
        {{/each}}
    *   `[ ]`   `commit`
        {{#each commit}}
        *   `[ ]`   {this}
        {{/each}}
{{/each}}
{{/section:steps}}

{{#section:_extra_content}}
# Additional Content
{_extra_content}
{{/section:_extra_content}}
