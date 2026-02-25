[ ] // So that find->replace will stop unrolling my damned instructions! 

# Milestone Schema Redesign: Meta-Schema to Work Breakdown

## Problem Statement
The milestone_schema step currently asks the agent to define field metadata (name, type, description) 
rather than producing milestone-level work nodes that carry architectural context forward to the 
checklist stage. The downstream actionable_checklist step lacks a structured skeleton for expanding 
milestone nodes into the Example Checklist format from Instructions for Agent.

## Objectives
- Replace the milestone_schema output from a field-definition schema to a milestone work breakdown
  containing sketch-level work nodes per milestone
- Feed system_architecture and technical_requirements into the milestone_schema step as direct inputs
- Update the actionable_checklist to expand milestone work nodes into full Checklist nodes
- Synchronize all artifacts: recipe migration, prompt templates, document templates, planner header 
  context, mapper tests

## Expected Outcome
- Parenthesis Step 4 produces milestones containing dependency-ordered work nodes with: objective, 
  role, module, deps, provides, directionality, requirements
- Paralysis Step 2 consumes those nodes and expands each into file-level TDD cycle nodes following 
  the Example Checklist skeleton
- All recipe definitions, prompt templates, document templates, planner headers, and test fixtures 
  are synchronized

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## Milestone 0: Master Plan — Align Parenthesis Master Plan to Unified Vocabulary

*   `[✅]`   [DOCS] docs/implementations/.../4-Parenthesis-Planning/`parenthesis-planning-recipe.md` **Replace master_plan milestone fields with unified vocabulary (deps, provides, directionality, requirements)**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the master_plan milestone fields in Step 3 outputs_required content_to_include and assembled_json from old vocabulary (description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels, inputs, outputs, validation, dependencies, acceptance_criteria) to unified vocabulary (deps, provides, directionality, requirements)
        *   `[✅]`   Update the Step 1 planner context_for_documents master_plan entry to include milestone structure placeholder using the unified vocabulary
        *   `[✅]`   Field mapping: dependencies[]+inputs[] → deps[], outputs[] → provides[], component_labels[] → directionality, acceptance_criteria[]+validation[] → requirements[]; description, technical_complexity, effort_estimate, implementation_approach, test_strategy dropped (those details live in milestone_schema nodes)
    *   `[✅]`   `role`
        *   `[✅]`   Design document defining the target contract for the parenthesis master_plan; all downstream files implement this contract
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to recipe design documentation for parenthesis stage Steps 1 and 3
    *   `[✅]`   `deps`
        *   `[✅]`   Unified vocabulary defined by the milestone_schema work node structure (Milestone 1) — the master_plan milestone fields must be the superset that the milestone_schema decomposes
        *   `[✅]`   Current recipe doc — Step 3 outputs (lines 531-639) define the existing master_plan milestone structure with old vocabulary
        *   `[✅]`   Current Step 1 context_for_documents master_plan entry (lines 281-316) — uses phases[] without explicit milestone structure
    *   `[✅]`   `parenthesis-planning-recipe.md`
        *   `[✅]`   Step 3 content_to_include: replace milestone object from {id, title, status, objective, description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels[], inputs[], outputs[], validation[], dependencies[], iteration_delta} to {id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta}
        *   `[✅]`   Step 3 assembled_json fields: replace phases[].milestones[].{description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels[], inputs[], outputs[], validation[], dependencies[], acceptance_criteria[]} with phases[].milestones[].{deps[], provides[], directionality, requirements[]}; keep id, title, status, objective, iteration_delta unchanged
        *   `[✅]`   Step 1 context_for_documents master_plan entry: add explicit milestone structure placeholder within phases[]: {id:"", title:"", status:"", objective:"", deps:[], provides:[], directionality:"", requirements:[], iteration_delta:""}
    *   `[✅]`   `provides`
        *   `[✅]`   Target contract for master_plan milestone structure consumed by all downstream master_plan nodes and by the milestone_schema as the source structure it decomposes
    *   `[✅]`   `directionality`
        *   `[✅]`   Design doc layer; all implementation artifacts depend inward on this definition
    *   `[✅]`   `requirements`
        *   `[✅]`   Unified milestone-level vocabulary must be: id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta
        *   `[✅]`   Phase-level fields (name, objective, technical_context, implementation_strategy) are unchanged
        *   `[✅]`   Document-level context fields (architecture_summary, services[], components[], etc.) are unchanged
        *   `[✅]`   Every milestone-level field must share vocabulary with milestone_schema node-level fields: objective, deps, provides, directionality, requirements
    *   `[✅]`   **Commit** `docs(parenthesis): align master_plan milestone structure to unified vocabulary`

*   `[✅]`   [PROMPT] docs/prompts/parenthesis/`parenthesis_planner_header_v1.md` **Update master_plan context_for_documents to use unified milestone vocabulary**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the planner header so that the master_plan context_for_documents entry contains the milestone structure with unified vocabulary instead of the current phases-only placeholder
    *   `[✅]`   `role`
        *   `[✅]`   Planner prompt template; defines what the planner agent emits as the HeaderContext for downstream turns
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the context_for_documents master_plan entry within the HeaderContext JSON schema block
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md Step 1 target — defines the target context_for_documents structure
        *   `[✅]`   Current file state — the master_plan context_for_documents entry uses phases[] without explicit milestone structure
    *   `[✅]`   `parenthesis_planner_header_v1.md`
        *   `[✅]`   Update the master_plan context_for_documents entry to include explicit milestone structure: phases[{name, objective, milestones[{id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta}]}]
        *   `[✅]`   Preserve all existing non-milestone fields (status_markers, dependency_rules, generation_limits, feature_scope, etc.)
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe design doc
    *   `[✅]`   `requirements`
        *   `[✅]`   The JSON structure must be valid and must match the recipe doc's context_for_documents entry exactly
        *   `[✅]`   Milestone placeholder must use empty strings/arrays, not descriptive text
    *   `[✅]`   **Commit** `prompt(parenthesis): planner header master_plan context uses unified milestone vocabulary`

*   `[✅]`   [PROMPT] docs/prompts/parenthesis/`parenthesis_master_plan_turn_v1.md` **Replace milestone fields in JSON template with unified vocabulary**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the turn prompt JSON template so the executing agent produces milestones with unified vocabulary fields
    *   `[✅]`   `role`
        *   `[✅]`   Turn prompt template; defines the exact JSON structure the executing agent must return
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the master_plan turn prompt template file
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md Step 3 target — defines the content_to_include structure
        *   `[✅]`   Current file state — the JSON template contains milestone fields using old vocabulary
    *   `[✅]`   `parenthesis_master_plan_turn_v1.md`
        *   `[✅]`   Replace milestone fields in the JSON template from {description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels[], inputs[], outputs[], validation[], dependencies[], acceptance_criteria[]} to {deps[], provides[], directionality, requirements[]}
        *   `[✅]`   Add instruction: "Each milestone's deps field lists milestone IDs and external prerequisites. provides lists capabilities or deliverables. directionality states the architectural layer. requirements lists acceptance criteria."
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe doc
    *   `[✅]`   `requirements`
        *   `[✅]`   The JSON template must be valid JSON parseable by the response extractor
        *   `[✅]`   Every key in the JSON template must have a corresponding entry in the recipe's assembled_json.fields
        *   `[✅]`   The prompt must not mention dropped fields (description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels)
    *   `[✅]`   **Commit** `prompt(parenthesis): master_plan turn emits milestones with unified vocabulary`

*   `[✅]`   [PROMPT] docs/templates/parenthesis/`parenthesis_master_plan.md` **Update Handlebars template to render unified milestone fields**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the document template milestone rendering to use unified vocabulary fields
    *   `[✅]`   `role`
        *   `[✅]`   Document template; defines the rendered markdown output structure for master_plan
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to Handlebars template rendering for parenthesis master_plan documents
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md — defines the content_to_include structure the template must render
        *   `[✅]`   Current file state — renders milestones with old vocabulary fields
    *   `[✅]`   `parenthesis_master_plan.md`
        *   `[✅]`   Replace milestone rendering: remove {{description}}, {{technical_complexity}}, {{effort_estimate}}, {{implementation_approach}}, {{test_strategy}}, {{#each component_labels}}, {{#each inputs}}, {{#each outputs}}, {{#each validation}}, {{#each dependencies}}, {{#each acceptance_criteria}}
        *   `[✅]`   Add milestone rendering: {{#each deps}}, {{#each provides}}, {{directionality}}, {{#each requirements}}
        *   `[✅]`   Preserve phase-level and document-level rendering unchanged
    *   `[✅]`   `directionality`
        *   `[✅]`   Template layer; depends inward on content structure
    *   `[✅]`   `requirements`
        *   `[✅]`   Every milestone-level field in content_to_include must have a corresponding rendering block
        *   `[✅]`   Missing sections must be silently omitted (existing behavior)
    *   `[✅]`   **Commit** `prompt(parenthesis): master_plan template renders unified milestone vocabulary`

*   `[✅]`   [DB] supabase/migrations/`{timestamp}_milestone_schema_work_nodes.sql` **Update parenthesis recipe Step 3: replace milestone fields in content_to_include and assembled_json**
    *   `[✅]`   `objective`
        *   `[✅]`   Migrate the parenthesis recipe Step 3 in both dialectic_recipe_template_steps and dialectic_stage_recipe_steps to use unified milestone vocabulary
        *   `[✅]`   Update the parenthesis planner Step 1 outputs_required to replace the master_plan context_for_documents milestone structure
    *   `[✅]`   `role`
        *   `[✅]`   Database migration; modifies the recipe step definitions that drive job creation and prompt assembly
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to dialectic_recipe_template_steps and dialectic_stage_recipe_steps for parenthesis Steps 1 and 3
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md — the recipe doc defines the target values
        *   `[✅]`   20251006194558_parenthesis_stage.sql — the original migration containing current Step 3 values
        *   `[✅]`   The planner Step 1 outputs_required context_for_documents master_plan entry also needs updating
    *   `[✅]`   `{timestamp}_milestone_schema_work_nodes.sql`
        *   `[✅]`   UPDATE dialectic_recipe_template_steps SET outputs_required WHERE step_key = 'generate-master-plan' AND template_id = (select id from dialectic_recipe_templates where name = 'parenthesis_v1')
        *   `[✅]`   content_to_include milestones: replace old fields with {id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta}
        *   `[✅]`   assembled_json fields: replace old milestone field paths with phases[].milestones[].{deps[], provides[], directionality, requirements[]}
        *   `[✅]`   Apply identical changes to dialectic_stage_recipe_steps for the same step_key
        *   `[✅]`   UPDATE the planner step (step_key = 'build-planning-header') outputs_required to replace the context_for_documents master_plan entry in both template and instance tables
    *   `[✅]`   `directionality`
        *   `[✅]`   Infrastructure layer; recipe definitions consumed by job creation and prompt assembly
    *   `[✅]`   `requirements`
        *   `[✅]`   All JSON must be valid and match the recipe doc target state exactly
        *   `[✅]`   Use UPDATE with WHERE clause — do not re-insert rows
        *   `[✅]`   Both template_steps and instance_steps must be updated in lockstep
        *   `[✅]`   Planner Step 1 context_for_documents must be updated in the same migration
    *   `[✅]`   **Commit** `db(parenthesis): migrate master_plan recipe step to unified milestone vocabulary`

*   `[✅]`   [TEST-UNIT] supabase/functions/_shared/utils/`mappers.parenthesis.test.ts` **Update master_plan step fixture to match new outputs_required structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the test fixture data for the master_plan step so that the outputs_required content_to_include and assembled_json use unified milestone vocabulary
    *   `[✅]`   `role`
        *   `[✅]`   Test fixture; validates that the mapper correctly transforms recipe step rows into job-ready structures
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the parenthesis stage mapper test, specifically the master_plan step fixture
    *   `[✅]`   `deps`
        *   `[✅]`   Migration from previous node — the fixture values must match what the migration writes
        *   `[✅]`   Current file state — the master_plan step fixture contains old milestone vocabulary
    *   `[✅]`   `mappers.parenthesis.test.ts`
        *   `[✅]`   Replace the master_plan step fixture's outputs_required: replace content_to_include milestone fields and assembled_json fields to use unified vocabulary
    *   `[✅]`   `directionality`
        *   `[✅]`   Test layer; depends inward on migration values, validates mapper behavior
    *   `[✅]`   `requirements`
        *   `[✅]`   Every value in the fixture must be string-encoded JSON matching the migration's jsonb values after parsing
        *   `[✅]`   Run the mapper test to confirm it passes with the new fixture
    *   `[✅]`   **Commit** `test(parenthesis): mapper fixture reflects master_plan unified milestone vocabulary`

## Milestone 1: Parenthesis Producer — Emit Milestone Work Nodes

*   `[✅]`   [DOCS] docs/implementations/.../4-Parenthesis-Planning/`parenthesis-planning-recipe.md` **Update Step 4 target state from field schema to milestone work breakdown**
    *   `[✅]`   `objective`
        *   `[✅]`   Redefine Step 4's purpose from "Define reusable milestone field schema" to "Decompose the next dependency-frontier milestones into architectural work nodes"
        *   `[✅]`   Add system_architecture and technical_requirements as direct Step 4 inputs
        *   `[✅]`   Replace content_to_include from fields[] to milestones[] containing nodes[]
        *   `[✅]`   Replace assembled_json field paths from fields[].name to milestones[].nodes[].objective etc.
        *   `[✅]`   Update Step 1 planner context_for_documents milestone_schema entry to match
    *   `[✅]`   `role`
        *   `[✅]`   Design document defining the target contract for the parenthesis recipe; all downstream files (prompts, templates, migrations, tests) implement this contract
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to recipe design documentation for parenthesis stage Step 1 and Step 4
    *   `[✅]`   `deps`
        *   `[✅]`   Example Checklist structure from Instructions for Agent.md:227-289 — defines the node skeleton
        *   `[✅]`   Current recipe doc state — lines 635-772 define the existing Step 4 contract
        *   `[✅]`   Current Step 1 planner context_for_documents — lines 317-343 define the milestone_schema entry
    *   `[✅]`   `parenthesis-planning-recipe.md`
        *   `[✅]`   Step 4 Objective: change from "Define reusable milestone field schema and style-guide notes" to "Decompose dependency-frontier milestones from the master plan into architectural work nodes that define HOW each piece fits together for downstream checklist expansion"
        *   `[✅]`   Step 4 inputs_required: add `{"type":"document","slug":"synthesis","document_key":"system_architecture","required":true}` and `{"type":"document","slug":"parenthesis","document_key":"technical_requirements","required":true}` and corresponding feedback entries
        *   `[✅]`   Step 4 inputs_relevance: add system_architecture at 0.92, technical_requirements at 0.88, their feedback entries at 0.70
        *   `[✅]`   Step 4 outputs_required.documents[0].content_to_include: replace `"fields":[...]` with new structure:
            *   `[✅]`   `"pipeline_context"` — framing paragraph explaining middle-zoom role
            *   `[✅]`   `"selection_criteria"` — dependency frontier: only milestones whose deps are [✅] or in current batch
            *   `[✅]`   `"shared_infrastructure":[]` — cross-cutting patterns factored out of individual milestones
            *   `[✅]`   `"milestones":[{"id":"","title":"","status":"","objective":"","nodes":[{"path":"","title":"","objective":"","role":"","module":"","deps":[],"provides":[],"directionality":"","requirements":[]}]}]`
            *   `[✅]`   `"iteration_semantics"` — replace, don't extend; reference prior schema for continuity
        *   `[✅]`   Step 4 outputs_required.assembled_json[0].fields: replace field-definition paths with `"milestones[].id"`, `"milestones[].title"`, `"milestones[].status"`, `"milestones[].nodes[].path"`, `"milestones[].nodes[].title"`, `"milestones[].nodes[].objective"`, `"milestones[].nodes[].role"`, `"milestones[].nodes[].module"`, `"milestones[].nodes[].deps[]"`, `"milestones[].nodes[].provides[]"`, `"milestones[].nodes[].directionality"`, `"milestones[].nodes[].requirements[]"`, `"shared_infrastructure[]"`, `"selection_criteria"`, `"pipeline_context"`
        *   `[✅]`   Step 1 context_for_documents milestone_schema entry: replace fields[] placeholder with milestones[] placeholder matching the content_to_include structure above
    *   `[✅]`   `provides`
        *   `[✅]`   Target contract definition consumed by all other nodes in this milestone
    *   `[✅]`   `directionality`
        *   `[✅]`   Design doc layer; all implementation artifacts depend inward on this definition
    *   `[✅]`   `requirements`
        *   `[✅]`   Every field name, nesting depth, and array structure in this doc must be reproduced exactly in the migration, prompt template, document template, and planner header
        *   `[✅]`   Node sketch fields limited to: objective, role, module, deps, provides, directionality, requirements — no context_slice, interfaces, tests, construction, mocks (those are deferred to paralysis)
        *   `[✅]`   Each milestone node must scope to a single architectural role and bounded module
    *   `[✅]`   **Commit** `docs(parenthesis): redefine milestone_schema Step 4 target from field schema to milestone work breakdown`

*   `[✅]`   [PROMPT] docs/prompts/parenthesis/`parenthesis_planner_header_v1.md` **Replace milestone_schema context_for_documents from field definitions to milestone work node placeholders**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the planner header so that when the parenthesis planner generates a HeaderContext, the milestone_schema context_for_documents entry contains the milestones/nodes placeholder structure instead of the fields[] placeholder
    *   `[✅]`   `role`
        *   `[✅]`   Planner prompt template; defines what the planner agent emits as the HeaderContext for downstream turns
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the context_for_documents[2] entry (document_key: milestone_schema) within the HeaderContext JSON schema block
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md Step 1 target — defines the target context_for_documents structure
        *   `[✅]`   Current file state — lines 173-242 contain the milestone_schema context_for_documents entry with fields[]
    *   `[✅]`   `parenthesis_planner_header_v1.md`
        *   `[✅]`   Replace lines 173-242: remove the entire fields[] array, style_guide_notes, validation_rules, iteration_guidance block
        *   `[✅]`   Insert new structure matching the recipe doc target: pipeline_context, selection_criteria, shared_infrastructure[], milestones[{id, title, status, objective, nodes[{path, title, objective, role, module, deps[], provides[], directionality, requirements[]}]}], iteration_semantics
        *   `[✅]`   Preserve index[], executive_summary, architecture_summary, and context-forwarding fields (features, services, components, dependency_resolution, etc.)
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe design doc, produces outward to planner agent execution
    *   `[✅]`   `requirements`
        *   `[✅]`   The JSON structure in this file must be valid JSON and must match the recipe doc's context_for_documents entry exactly
        *   `[✅]`   Placeholder values must use empty strings/arrays, not descriptive text, so the planner fills them
    *   `[✅]`   **Commit** `prompt(parenthesis): planner header milestone_schema context_for_documents uses milestone work nodes`

*   `[✅]`   [PROMPT] docs/prompts/parenthesis/`parenthesis_milestone_schema_turn_v1.md` **Replace meta-schema JSON template with milestone work breakdown template and add pipeline framing**
    *   `[✅]`   `objective`
        *   `[✅]`   Rewrite the turn prompt so the agent produces milestones containing dependency-ordered work nodes instead of field definitions
        *   `[✅]`   Add a framing paragraph explaining the pipeline position (middle zoom between master plan and checklist)
        *   `[✅]`   Add dependency-frontier selection instruction
        *   `[✅]`   Add shared-infrastructure identification instruction
    *   `[✅]`   `role`
        *   `[✅]`   Turn prompt template; defines the exact JSON structure the executing agent must return
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the milestone_schema turn prompt template file
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md Step 4 target — defines the content_to_include structure
        *   `[✅]`   parenthesis_planner_header_v1.md — the HeaderContext this prompt receives will contain the new milestone_schema context
        *   `[✅]`   Current file state — line 9 contains the JSON template with fields[] and iteration_guidance
    *   `[✅]`   `parenthesis_milestone_schema_turn_v1.md`
        *   `[✅]`   Replace the one-sentence framing ("In this turn you are writing the milestone schema that describes a high level overview") with a pipeline-position paragraph: "You are producing the middle zoom level. The master plan (in HeaderContext) defines WHAT to build. Your job is to decompose the next dependency-frontier milestones into architectural work nodes that define HOW each piece fits together. The downstream checklist stage will expand your nodes into file-level TDD implementation steps."
        *   `[✅]`   Add dependency-frontier instruction: "Select milestones whose dependencies are all [✅] or are included in the current batch. Do not elaborate milestones whose dependencies are unmet."
        *   `[✅]`   Add shared-infrastructure instruction: "Before per-milestone nodes, identify cross-cutting capabilities (middleware, validation, shared utilities) and assign each to the earliest milestone where it is needed. Downstream milestones reference these via deps."
        *   `[✅]`   Add node scoping rule: "Each node must scope to a single architectural role and a single bounded module. If a capability spans roles, it needs separate nodes per role."
        *   `[✅]`   Replace the JSON template: remove the fields[], style_guide_notes, validation_rules, iteration_guidance keys; insert the milestones[] structure with pipeline_context, selection_criteria, shared_infrastructure[], milestones[].nodes[], iteration_semantics, executive_summary
        *   `[✅]`   Update the instruction line from "Replace the placeholder value for each key" to include: "For the milestones array, produce one entry per selected milestone. For each milestone's nodes array, produce one entry per architectural work unit. Each node's provides field must name the specific capabilities, modules, or integration surfaces that become available when the node completes."
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe doc and planner header, consumed outward by executing agent
    *   `[✅]`   `requirements`
        *   `[✅]`   The JSON template must be valid JSON parseable by the response extractor
        *   `[✅]`   Every key in the JSON template must have a corresponding entry in the recipe's assembled_json.fields
        *   `[✅]`   The prompt must not mention field definitions, schema versioning, or field-level metadata
    *   `[✅]`   **Commit** `prompt(parenthesis): milestone_schema turn emits work nodes with pipeline framing and frontier selection`

*   `[✅]`   [PROMPT] docs/templates/parenthesis/`parenthesis_milestone_schema.md` **Replace field-rendering Handlebars with milestone-node-rendering structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the document template so it renders milestones containing work nodes instead of field definitions
    *   `[✅]`   `role`
        *   `[✅]`   Document template; defines the rendered markdown output structure for milestone_schema
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to Handlebars template rendering for parenthesis milestone_schema documents
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md — defines the content_to_include structure the template must render
        *   `[✅]`   Current file state — lines 12-23 render {{#each fields}} with {name}, {type}, {description}
    *   `[✅]`   `parenthesis_milestone_schema.md`
        *   `[✅]`   Remove: {{#section:fields}} block (lines 12-23), {{#section:style_guide_notes}}, {{#section:validation_rules}}, {{#section:iteration_guidance}}
        *   `[✅]`   Add: {{#section:pipeline_context}} rendering the framing paragraph
        *   `[✅]`   Add: {{#section:selection_criteria}} rendering the frontier selection rule
        *   `[✅]`   Add: {{#section:shared_infrastructure}} with {{#each shared_infrastructure}} rendering cross-cutting patterns
        *   `[✅]`   Add: {{#section:milestones}} with {{#each milestones}} rendering:
            *   `[✅]`   Milestone header: ## {id} — {title} [{status}]
            *   `[✅]`   {objective}
            *   `[✅]`   {{#each nodes}} rendering each node with: ### {path} {title}, objective, role, module, deps (as list), provides (as list), directionality, requirements (as list)
        *   `[✅]`   Add: {{#section:iteration_semantics}} rendering replacement/continuity guidance
        *   `[✅]`   Preserve: {{#section:index}}, {{#section:executive_summary}}, {{#section:architecture_summary}}, and the catch-all sections (services, components, etc.)
    *   `[✅]`   `directionality`
        *   `[✅]`   Template layer; depends inward on content structure definition, consumed by document renderer
    *   `[✅]`   `requirements`
        *   `[✅]`   Every key in the content_to_include must have a corresponding {{#section}} or {{#each}} block
        *   `[✅]`   Nested {{#each}} blocks (milestones → nodes) must be supported by the Handlebars renderer
        *   `[✅]`   Missing sections must be silently omitted (existing <!-- Missing sections --> behavior)
    *   `[✅]`   **Commit** `prompt(parenthesis): milestone_schema template renders milestone work nodes`

*   `[✅]`   [DB] supabase/migrations/`{timestamp}_milestone_schema_work_nodes.sql` **Update parenthesis recipe Step 4: add inputs, replace content_to_include and assembled_json**
    *   `[✅]`   `objective`
        *   `[✅]`   Migrate the parenthesis recipe Step 4 in both dialectic_recipe_template_steps and dialectic_stage_recipe_steps to:
            *   `[✅]`   Add system_architecture and technical_requirements as inputs
            *   `[✅]`   Replace content_to_include from fields[] to milestones[].nodes[] structure
            *   `[✅]`   Replace assembled_json field paths
        *   `[✅]`   Update the parenthesis planner Step 1 outputs_required to replace the milestone_schema context_for_documents entry
    *   `[✅]`   `role`
        *   `[✅]`   Database migration; modifies the recipe step definitions that drive job creation and prompt assembly
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to dialectic_recipe_template_steps and dialectic_stage_recipe_steps for parenthesis Steps 1 and 4
    *   `[✅]`   `deps`
        *   `[✅]`   parenthesis-planning-recipe.md — the recipe doc defines the target values
        *   `[✅]`   20251006194558_parenthesis_stage.sql — the original migration containing current Step 4 values (lines 1456-1620 for template step, 1622-1718 for instance step)
        *   `[✅]`   The planner Step 1 outputs_required context_for_documents milestone_schema entry also needs updating (defined in same migration, earlier in the file)
    *   `[✅]`   `{timestamp}_milestone_schema_work_nodes.sql`
        *   `[✅]`   UPDATE dialectic_recipe_template_steps SET step_description, inputs_required, inputs_relevance, outputs_required WHERE step_key = 'generate-milestone-schema' AND template_id = (select id from dialectic_recipe_templates where name = 'parenthesis_v1')
        *   `[✅]`   step_description: 'Decompose dependency-frontier milestones into architectural work nodes for downstream checklist expansion.'
        *   `[✅]`   inputs_required: add system_architecture (document, synthesis, required), technical_requirements (document, parenthesis, required), and their feedback entries to the existing 5-entry array
        *   `[✅]`   inputs_relevance: add system_architecture at 0.92, technical_requirements at 0.88, their feedback at 0.70
        *   `[✅]`   outputs_required: replace content_to_include.fields[] with content_to_include.{pipeline_context, selection_criteria, shared_infrastructure[], milestones[].nodes[], iteration_semantics, executive_summary, index[]}; replace assembled_json.fields[] with milestone-path extraction fields
        *   `[✅]`   Apply identical changes to dialectic_stage_recipe_steps WHERE step_key = 'generate-milestone-schema' AND instance_id = (parenthesis instance)
        *   `[✅]`   UPDATE the planner step (step_key = 'build-planning-header') outputs_required to replace the context_for_documents milestone_schema entry in both template and instance tables
    *   `[✅]`   `directionality`
        *   `[✅]`   Infrastructure layer; recipe definitions are consumed by job creation (processComplexJob) and prompt assembly (executeModelCallAndSave)
    *   `[✅]`   `requirements`
        *   `[✅]`   All JSON must be valid and match the recipe doc target state exactly
        *   `[✅]`   Use UPDATE with ON CONFLICT or WHERE clause — do not re-insert rows
        *   `[✅]`   Both template_steps and instance_steps must be updated in lockstep
        *   `[✅]`   Planner Step 1 context_for_documents must be updated in the same migration
    *   `[✅]`   **Commit** `db(parenthesis): migrate milestone_schema recipe step to work-node structure with expanded inputs`

*   `[✅]`   [TEST-UNIT] supabase/functions/_shared/utils/`mappers.parenthesis.test.ts` **Update milestone_schema step fixture to match new outputs_required structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the test fixture data for the milestone_schema step so that the outputs_required, inputs_required, and inputs_relevance match the new migration values
    *   `[✅]`   `role`
        *   `[✅]`   Test fixture; validates that the mapper correctly transforms recipe step rows into job-ready structures
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the parenthesis stage mapper test, specifically the milestone_schema step fixture (~line 192-198)
    *   `[✅]`   `deps`
        *   `[✅]`   Migration from previous node — the fixture values must match what the migration writes
        *   `[✅]`   Current file state — line 195 contains the outputs_required with fields[] structure
    *   `[✅]`   `mappers.parenthesis.test.ts`
        *   `[✅]`   Replace line 192-195 inputs_required fixture: add system_architecture and technical_requirements entries
        *   `[✅]`   Replace line 193-194 inputs_relevance fixture: add system_architecture and technical_requirements entries
        *   `[✅]`   Replace line 195 outputs_required fixture: replace fields[] content_to_include with milestones[].nodes[] structure; replace assembled_json fields[] with milestone-path extraction
    *   `[✅]`   `directionality`
        *   `[✅]`   Test layer; depends inward on migration values, validates mapper behavior
    *   `[✅]`   `requirements`
        *   `[✅]`   Every value in the fixture must be a string-encoded JSON matching the migration's jsonb values byte-for-byte (after parsing)
        *   `[✅]`   Run the mapper test to confirm it passes with the new fixture
    *   `[✅]`   **Commit** `test(parenthesis): mapper fixture reflects milestone_schema work-node structure`

## Milestone 2: Paralysis Consumer — Expand Work Nodes into Example Checklist

*   `[✅]`   [DOCS] docs/implementations/.../5-Paralysis-Implementation/`paralysis-planning-recipe.md` **Document that milestone_schema now contains work nodes and update Step 2 output structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the paralysis recipe doc to reflect that the milestone_schema input now contains milestones[].nodes[] instead of fields[]
        *   `[✅]`   Update the Step 2 (actionable_checklist) content_to_include and assembled_json to align with the Example Checklist node structure from Instructions for Agent.md:227-289
        *   `[✅]`   Update the Step 1 planner's context_for_documents for actionable_checklist to instruct frontier-aware elaboration
    *   `[✅]`   `role`
        *   `[✅]`   Design document defining the target contract for the paralysis recipe; all downstream paralysis files implement this contract
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to recipe design documentation for paralysis stage Steps 1 and 2
    *   `[✅]`   `deps`
        *   `[✅]`   Milestone 1 — the milestone_schema structure this recipe consumes
        *   `[✅]`   Example Checklist from Instructions for Agent.md:227-289 — the target output shape
        *   `[✅]`   Doc-Centric FE Fixes 2.md — the concrete exemplar of the target checklist output
        *   `[✅]`   Current recipe doc — Step 2 outputs schema (lines 375-423) and Step 1 planner context (lines 264-289)
    *   `[✅]`   `paralysis-planning-recipe.md`
        *   `[✅]`   Step 1 context_for_documents actionable_checklist entry: replace steps[] placeholder with nodes[] placeholder following Example Checklist skeleton (objective, role, module, deps, context_slice, interface, type guard tests, type guards, unit tests, construction, source, provides, mocks, integration tests, directionality, requirements, commit)
        *   `[✅]`   Step 1 context_for_documents: add frontier-elaboration instruction: "Elaborate nodes from milestone_schema in dependency order. If generation limits are reached before exhausting the batch, use continuation flags."
        *   `[✅]`   Step 2 outputs_required content_to_include: replace steps[].{red_test, implementation, green_test, refactor, commit_message} with nodes following Example Checklist skeleton
        *   `[✅]`   Step 2 outputs_required assembled_json fields: replace steps[].id, steps[].status etc. with nodes[].path, nodes[].objective, nodes[].role, nodes[].deps[], nodes[].interface, nodes[].unit_tests[], nodes[].source, nodes[].provides, nodes[].integration_tests[], nodes[].requirements[], nodes[].commit
    *   `[✅]`   `provides`
        *   `[✅]`   Target contract for paralysis prompt/template/migration changes
    *   `[✅]`   `directionality`
        *   `[✅]`   Design doc layer; depends inward on Milestone 1 structure and Example Checklist, consumed outward by implementation nodes
    *   `[✅]`   `requirements`
        *   `[✅]`   The actionable_checklist output structure must produce markdown indistinguishable in structure from Doc-Centric FE Fixes 2.md (modulo content)
        *   `[✅]`   The Example Checklist skeleton must be embedded or referenced, not paraphrased
    *   `[✅]`   **Commit** `docs(paralysis): recipe doc consumes milestone work nodes, outputs Example Checklist structure`

*   `[✅]`   [PROMPT] docs/prompts/paralysis/`paralysis_planner_header_v1.md` **Update actionable_checklist context_for_documents to expect milestone work nodes and emit Example Checklist placeholders**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the actionable_checklist context_for_documents entry so the planner emits a HeaderContext that guides the checklist agent to expand milestone nodes into Example Checklist nodes
    *   `[✅]`   `role`
        *   `[✅]`   Planner prompt template for paralysis stage
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to context_for_documents[0] (document_key: actionable_checklist) within the HeaderContext JSON schema block
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md — defines the target context structure
        *   `[✅]`   Current file state — lines 63-91 contain the steps[] placeholder with red_test/green_test/refactor fields
    *   `[✅]`   `paralysis_planner_header_v1.md`
        *   `[✅]`   Replace lines 63-91: remove steps[] array with red_test/implementation/green_test/refactor/commit_message
        *   `[✅]`   Insert new context_for_documents for actionable_checklist containing:
            *   `[✅]`   milestone_ids: [] (unchanged)
            *   `[✅]`   index: [] (unchanged)
            *   `[✅]`   elaboration_instruction: "For each milestone node from the milestone_schema, expand into a full Example Checklist node. Elaborate in dependency order. Use continuation if limits reached."
            *   `[✅]`   node_skeleton: the Example Checklist structure — objective, role, module, deps, context_slice, interface, interface tests, interface guards, unit tests, construction, source, provides, mocks, integration tests, directionality, requirements, commit
            *   `[✅]`   milestone_summary: "" (unchanged)
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe doc target
    *   `[✅]`   `requirements`
        *   `[✅]`   The node_skeleton must be structurally complete — every sub-item from Instructions for Agent:227-289 must be representable
        *   `[✅]`   JSON must be valid
    *   `[✅]`   **Commit** `prompt(paralysis): planner header emits Example Checklist skeleton for actionable_checklist context`

*   `[✅]`   [PROMPT] docs/prompts/paralysis/`paralysis_actionable_checklist_turn_v1.md` **Replace step template with Example Checklist node expansion from milestone work nodes**
    *   `[✅]`   `objective`
        *   `[✅]`   Rewrite the turn prompt so the agent takes milestone work nodes and expands each into the full Example Checklist structure
        *   `[✅]`   Add framing that explains: "Each node in the milestone_schema represents a single source file's complete TDD cycle. Your job is to fill in every sub-item: objective, role, module, deps with provider/layer/direction/context_slice, context_slice, interface changes, type guard tests, type guards, unit tests, construction, source implementation, provides, mocks, integration tests, directionality, requirements, commit."
    *   `[✅]`   `role`
        *   `[✅]`   Turn prompt template for paralysis actionable_checklist step
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the actionable_checklist turn prompt file
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md — Step 2 output structure
        *   `[✅]`   Instructions for Agent.md:227-289 — Example Checklist skeleton
        *   `[✅]`   Current file state — line 9 contains JSON template with steps[].red_test/green_test/refactor
    *   `[✅]`   `paralysis_actionable_checklist_turn_v1.md`
        *   `[✅]`   Replace lines 5-7 framing: add pipeline explanation — milestone_schema provides sketch-level nodes, this step expands each into full file-level TDD detail
        *   `[✅]`   Add instruction: "For each milestone node, produce a top-level checklist entry: `[✅] [component_label] [path]/[function] **Title**` followed by every sub-item from the Example Checklist skeleton"
        *   `[✅]`   Add instruction: "Each node equals one source file's entire TDD cycle. Nodes are dependency-ordered with lowest dependencies first."
        *   `[✅]`   Add instruction: "If the milestone_schema node's deps list a provider, verify that provider has a corresponding node earlier in the checklist or is already completed."
        *   `[✅]`   Replace JSON template: remove steps[].{status, component_label, numbering, red_test, implementation, green_test, refactor, commit_message}; insert nodes[] with Example Checklist sub-items
        *   `[✅]`   Ensure the JSON template keys match the recipe doc's content_to_include and assembled_json fields
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe doc and Example Checklist skeleton
    *   `[✅]`   `requirements`
        *   `[✅]`   The output must be structurally indistinguishable from Doc-Centric FE Fixes 2.md (node format, nesting, sub-items)
        *   `[✅]`   JSON template must be valid and parseable
        *   `[✅]`   Every key must have a corresponding assembled_json field path in the recipe
    *   `[✅]`   **Commit** `prompt(paralysis): actionable_checklist turn expands milestone nodes into Example Checklist`

*   `[✅]`   [PROMPT] docs/templates/paralysis/`paralysis_actionable_checklist.md` **Update Handlebars template to render Example Checklist nodes instead of flat steps**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the document template so it renders full Example Checklist nodes with all sub-items
    *   `[✅]`   `role`
        *   `[✅]`   Document template for paralysis actionable_checklist rendered output
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to Handlebars template rendering for paralysis actionable_checklist documents
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md — defines the content_to_include structure
        *   `[✅]`   Current file state — lines 26-29 render {steps} as a single block
    *   `[✅]`   `paralysis_actionable_checklist.md`
        *   `[✅]`   Replace {{#section:steps}} block: instead of just `{steps}`, render {{#each nodes}} with each node's sub-items: objective, role, module, deps, context_slice, interface, type guard tests, guards, unit tests, construction, source, provides, mocks, integration tests, directionality, requirements, commit
        *   `[✅]`   Add {{#section:elaboration_instruction}} to include the frontier-elaboration guidance
        *   `[✅]`   Preserve milestone_ids, index, milestone_summary, milestone_reference sections
    *   `[✅]`   `directionality`
        *   `[✅]`   Template layer; depends inward on content structure, consumed by document renderer
    *   `[✅]`   `requirements`
        *   `[✅]`   Nested {{#each}} blocks must render correctly
        *   `[✅]`   Missing sub-items must be silently omitted
    *   `[✅]`   **Commit** `prompt(paralysis): actionable_checklist template renders Example Checklist nodes`

*   `[✅]`   [DB] supabase/migrations/`{timestamp}_milestone_schema_work_nodes.sql` **Update paralysis recipe Step 2: replace content_to_include and assembled_json for Example Checklist structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Migrate the paralysis recipe Step 2 in both dialectic_recipe_template_steps and dialectic_stage_recipe_steps to use the Example Checklist content_to_include and assembled_json
        *   `[✅]`   Update the paralysis planner Step 1 outputs_required context_for_documents for actionable_checklist
    *   `[✅]`   `role`
        *   `[✅]`   Database migration; modifies recipe step definitions consumed by job creation and prompt assembly
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to dialectic_recipe_template_steps and dialectic_stage_recipe_steps for paralysis Steps 1 and 2
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md — defines the target values
        *   `[✅]`   20251006194605_paralysis_stage.sql — original migration (lines 407-523 for template step, 525-608 for instance step; planner at lines 310-405)
    *   `[✅]`   `{timestamp}_milestone_schema_work_nodes.sql`
        *   `[✅]`   UPDATE dialectic_recipe_template_steps SET outputs_required WHERE step_key = 'generate-actionable-checklist' AND template_id = (select id from dialectic_recipe_templates where name = 'paralysis_v1')
        *   `[✅]`   content_to_include: replace steps[] with nodes[] following Example Checklist skeleton
        *   `[✅]`   assembled_json fields: replace steps[].id etc. with nodes[].path, nodes[].objective, nodes[].role etc.
        *   `[✅]`   Apply identical changes to dialectic_stage_recipe_steps for same step_key
        *   `[✅]`   UPDATE the planner step (step_key = 'build-implementation-header') outputs_required context_for_documents actionable_checklist entry in both template and instance tables
    *   `[✅]`   `directionality`
        *   `[✅]`   Infrastructure layer; consumed by job creation and prompt assembly
    *   `[✅]`   `requirements`
        *   `[✅]`   All JSON must be valid
        *   `[✅]`   Both template_steps and instance_steps updated in lockstep
        *   `[✅]`   Planner Step 1 context_for_documents updated in same migration
    *   `[✅]`   **Commit** `db(paralysis): migrate actionable_checklist recipe step to Example Checklist node structure`

*   `[✅]`   [TEST-UNIT] supabase/functions/_shared/utils/`mappers.paralysis.test.ts` **Update actionable_checklist step fixture to match new outputs_required structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the test fixture data for the actionable_checklist step so that the outputs_required matches the new migration values with Example Checklist node structure
    *   `[✅]`   `role`
        *   `[✅]`   Test fixture; validates that the mapper correctly transforms recipe step rows into job-ready structures
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the paralysis stage mapper test, specifically the actionable_checklist step fixture (~line 141-145 for planner context, plus the generate-actionable-checklist step fixture)
    *   `[✅]`   `deps`
        *   `[✅]`   Migration from previous node — the fixture values must match what the migration writes
        *   `[✅]`   Current file state — line 141-145 contains the planner step outputs_required with steps[] context_for_documents; the actionable_checklist step fixture contains the steps[] content_to_include
    *   `[✅]`   `mappers.paralysis.test.ts`
        *   `[✅]`   Replace the planner step (build-implementation-header) fixture's outputs_required context_for_documents actionable_checklist entry: replace steps[] with nodes[] per Example Checklist skeleton
        *   `[✅]`   Replace the actionable_checklist step fixture's outputs_required: replace content_to_include steps[] with nodes[]; replace assembled_json fields from steps[].id etc. to nodes[].path etc.
    *   `[✅]`   `directionality`
        *   `[✅]`   Test layer; depends inward on migration values, validates mapper behavior
    *   `[✅]`   `requirements`
        *   `[✅]`   Every value in the fixture must be string-encoded JSON matching the migration's jsonb values after parsing
        *   `[✅]`   Run the mapper test to confirm it passes with the new fixture
    *   `[✅]`   **Commit** `test(paralysis): mapper fixture reflects actionable_checklist Example Checklist node structure`

## Milestone 3: Updated Master Plan — Align Paralysis Updated Master Plan to Unified Vocabulary

*   `[✅]`   [DOCS] docs/implementations/.../5-Paralysis-Implementation/`paralysis-planning-recipe.md` **Replace updated_master_plan milestone fields with unified vocabulary and add milestone structure to planner context**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the updated_master_plan milestone fields in Step 3 outputs_required content_to_include, Step Outputs Schema, and assembled_json from old vocabulary to unified vocabulary (deps, provides, directionality, requirements)
        *   `[✅]`   Update the Step 1 planner context_for_documents updated_master_plan entry to include the milestone structure placeholder with unified vocabulary (currently only has status preservation directives)
        *   `[✅]`   Field mapping identical to Milestone 0: dependencies[]+inputs[] → deps[], outputs[] → provides[], component_labels[] → directionality, acceptance_criteria[]+validation[] → requirements[]; description, technical_complexity, effort_estimate, implementation_approach, test_strategy dropped
    *   `[✅]`   `role`
        *   `[✅]`   Design document defining the target contract for the paralysis updated_master_plan; closes the alignment loop started in Milestone 0
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to recipe design documentation for paralysis stage Steps 1 and 3
    *   `[✅]`   `deps`
        *   `[✅]`   Milestone 0 — the master_plan unified vocabulary this document must mirror exactly
        *   `[✅]`   Current recipe doc — Step 3 Recipe Step Definition JSON (lines 528-556) and Step Outputs Schema (lines 559-664) define the existing updated_master_plan structure with old vocabulary
        *   `[✅]`   Current Step 1 context_for_documents updated_master_plan entry (lines 291-299) — only has status preservation directives, no milestone structure
    *   `[✅]`   `paralysis-planning-recipe.md`
        *   `[✅]`   Step 3 Recipe Step Definition JSON assembled_json (lines 537-549): replace phases[].milestones[].{dependencies, acceptance_criteria} with phases[].milestones[].{deps[], provides[], directionality, requirements[]}; keep id, status, objective, iteration_delta
        *   `[✅]`   Step 3 Step Outputs Schema content_to_include (lines 566-604): replace milestone object from {id, title, status, objective, description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels[], inputs[], outputs[], validation[], dependencies[], iteration_delta} to {id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta}
        *   `[✅]`   Step 3 Step Outputs Schema assembled_json (lines 608-661): replace phases[].milestones[].{description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels[], inputs[], outputs[], validation[], dependencies[], acceptance_criteria[]} with phases[].milestones[].{deps[], provides[], directionality, requirements[]}
        *   `[✅]`   Step 1 context_for_documents updated_master_plan entry: add milestone structure placeholder {phases:[{milestones:[{id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta}]}]} alongside existing status preservation directives
    *   `[✅]`   `provides`
        *   `[✅]`   Target contract for updated_master_plan structure; closes the alignment loop — master_plan (Milestone 0) → milestone_schema (Milestone 1) → actionable_checklist (Milestone 2) → updated_master_plan (Milestone 3) all use the same vocabulary
    *   `[✅]`   `directionality`
        *   `[✅]`   Design doc layer; all implementation artifacts depend inward on this definition
    *   `[✅]`   `requirements`
        *   `[✅]`   The updated_master_plan milestone structure must be identical to the master_plan milestone structure from Milestone 0
        *   `[✅]`   Status preservation directives (preserve_completed, set_in_progress, future_status, capture_iteration_delta) must be retained
        *   `[✅]`   Document-level context fields (architecture_summary, services[], components[], etc.) are unchanged
    *   `[✅]`   **Commit** `docs(paralysis): align updated_master_plan milestone structure to unified vocabulary`

*   `[✅]`   [PROMPT] docs/prompts/paralysis/`paralysis_planner_header_v1.md` **Update updated_master_plan context_for_documents to include unified milestone structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the planner header so that the updated_master_plan context_for_documents entry contains the milestone structure with unified vocabulary alongside existing status preservation directives
    *   `[✅]`   `role`
        *   `[✅]`   Planner prompt template for paralysis stage
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to context_for_documents updated_master_plan entry within the HeaderContext JSON schema block
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md — defines the target context structure
        *   `[✅]`   Current file state — the updated_master_plan context_for_documents entry only has status preservation directives (preserve_completed, set_in_progress, future_status, capture_iteration_delta)
    *   `[✅]`   `paralysis_planner_header_v1.md`
        *   `[✅]`   Update the updated_master_plan context_for_documents entry to include milestone structure placeholder: phases[{milestones[{id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta}]}]
        *   `[✅]`   Preserve existing status preservation directives (preserve_completed, set_in_progress, future_status, capture_iteration_delta)
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe doc target
    *   `[✅]`   `requirements`
        *   `[✅]`   JSON must be valid
        *   `[✅]`   Milestone structure must match Milestone 0's master_plan structure exactly
    *   `[✅]`   **Commit** `prompt(paralysis): planner header updated_master_plan context uses unified milestone vocabulary`

*   `[✅]`   [PROMPT] docs/prompts/paralysis/`paralysis_updated_master_plan_turn_v1.md` **Replace milestone fields in JSON template with unified vocabulary**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the turn prompt JSON template so the executing agent produces the updated master plan with milestones using unified vocabulary fields
    *   `[✅]`   `role`
        *   `[✅]`   Turn prompt template for paralysis updated_master_plan step
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the updated_master_plan turn prompt template file
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md Step 3 target — defines the content_to_include structure
        *   `[✅]`   Current file state — the JSON template contains milestone fields using old vocabulary
    *   `[✅]`   `paralysis_updated_master_plan_turn_v1.md`
        *   `[✅]`   Replace milestone fields in the JSON template from old vocabulary to {deps[], provides[], directionality, requirements[]}
        *   `[✅]`   Add instruction: "The updated_master_plan milestone structure must match the master_plan milestone structure exactly. Update status markers but do not alter the milestone field vocabulary."
    *   `[✅]`   `directionality`
        *   `[✅]`   Prompt layer; depends inward on recipe doc
    *   `[✅]`   `requirements`
        *   `[✅]`   The JSON template must be valid JSON parseable by the response extractor
        *   `[✅]`   Every key must have a corresponding entry in the recipe's assembled_json.fields
        *   `[✅]`   The milestone structure must be identical to the master_plan's
    *   `[✅]`   **Commit** `prompt(paralysis): updated_master_plan turn emits milestones with unified vocabulary`

*   `[✅]`   [PROMPT] docs/templates/paralysis/`paralysis_updated_master_plan.md` **Update Handlebars template to render unified milestone fields**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the document template milestone rendering to use unified vocabulary fields
    *   `[✅]`   `role`
        *   `[✅]`   Document template for paralysis updated_master_plan rendered output
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to Handlebars template rendering for paralysis updated_master_plan documents
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md — defines the content_to_include structure the template must render
        *   `[✅]`   Current file state — renders milestones with old vocabulary fields
    *   `[✅]`   `paralysis_updated_master_plan.md`
        *   `[✅]`   Replace milestone rendering: remove old vocabulary field blocks (description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels, inputs, outputs, validation, dependencies, acceptance_criteria)
        *   `[✅]`   Add milestone rendering: {{#each deps}}, {{#each provides}}, {{directionality}}, {{#each requirements}}
        *   `[✅]`   Preserve phase-level and document-level rendering unchanged
    *   `[✅]`   `directionality`
        *   `[✅]`   Template layer; depends inward on content structure
    *   `[✅]`   `requirements`
        *   `[✅]`   Every milestone-level field in content_to_include must have a corresponding rendering block
        *   `[✅]`   Missing sections must be silently omitted
    *   `[✅]`   **Commit** `prompt(paralysis): updated_master_plan template renders unified milestone vocabulary`

*   `[✅]`   [DB] supabase/migrations/`{timestamp}_milestone_schema_work_nodes.sql` **Update paralysis recipe Step 3: replace milestone fields in content_to_include and assembled_json**
    *   `[✅]`   `objective`
        *   `[✅]`   Migrate the paralysis recipe Step 3 in both dialectic_recipe_template_steps and dialectic_stage_recipe_steps to use unified milestone vocabulary
        *   `[✅]`   Update the paralysis planner Step 1 outputs_required to update the context_for_documents updated_master_plan entry
    *   `[✅]`   `role`
        *   `[✅]`   Database migration; modifies recipe step definitions consumed by job creation and prompt assembly
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to dialectic_recipe_template_steps and dialectic_stage_recipe_steps for paralysis Steps 1 and 3
    *   `[✅]`   `deps`
        *   `[✅]`   paralysis-planning-recipe.md — the recipe doc defines the target values
        *   `[✅]`   20251006194605_paralysis_stage.sql — the original migration containing current Step 3 values
        *   `[✅]`   The planner Step 1 outputs_required context_for_documents updated_master_plan entry also needs updating
    *   `[✅]`   `{timestamp}_milestone_schema_work_nodes.sql`
        *   `[✅]`   UPDATE dialectic_recipe_template_steps SET outputs_required WHERE step_key = 'generate-updated-master-plan' AND template_id = (select id from dialectic_recipe_templates where name = 'paralysis_v1')
        *   `[✅]`   content_to_include milestones: replace old fields with {id, title, status, objective, deps[], provides[], directionality, requirements[], iteration_delta}
        *   `[✅]`   assembled_json fields: replace old milestone field paths with phases[].milestones[].{deps[], provides[], directionality, requirements[]}
        *   `[✅]`   Apply identical changes to dialectic_stage_recipe_steps for the same step_key
        *   `[✅]`   UPDATE the planner step (step_key = 'build-implementation-header') outputs_required to update the context_for_documents updated_master_plan entry in both template and instance tables
    *   `[✅]`   `directionality`
        *   `[✅]`   Infrastructure layer; consumed by job creation and prompt assembly
    *   `[✅]`   `requirements`
        *   `[✅]`   All JSON must be valid and match the recipe doc target state exactly
        *   `[✅]`   Both template_steps and instance_steps updated in lockstep
        *   `[✅]`   Planner Step 1 context_for_documents must be updated in the same migration
    *   `[✅]`   **Commit** `db(paralysis): migrate updated_master_plan recipe step to unified milestone vocabulary`

*   `[✅]`   [TEST-UNIT] supabase/functions/_shared/utils/`mappers.paralysis.test.ts` **Update updated_master_plan step fixture to match new outputs_required structure**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the test fixture data for the updated_master_plan step so that the outputs_required uses unified milestone vocabulary
        *   `[✅]`   Update the planner step (build-implementation-header) fixture's context_for_documents updated_master_plan entry to include milestone structure
    *   `[✅]`   `role`
        *   `[✅]`   Test fixture; validates that the mapper correctly transforms recipe step rows into job-ready structures
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the paralysis stage mapper test, specifically the updated_master_plan step fixture and the planner step fixture's context_for_documents
    *   `[✅]`   `deps`
        *   `[✅]`   Migration from previous node — the fixture values must match what the migration writes
        *   `[✅]`   Current file state — the updated_master_plan step fixture and planner fixture contain old milestone vocabulary
    *   `[✅]`   `mappers.paralysis.test.ts`
        *   `[✅]`   Replace the updated_master_plan step fixture's outputs_required: content_to_include and assembled_json fields to use unified vocabulary
        *   `[✅]`   Replace the planner step (build-implementation-header) fixture's outputs_required context_for_documents updated_master_plan entry to include milestone structure
    *   `[✅]`   `directionality`
        *   `[✅]`   Test layer; depends inward on migration values
    *   `[✅]`   `requirements`
        *   `[✅]`   Every value in the fixture must be string-encoded JSON matching the migration's jsonb values after parsing
        *   `[✅]`   Run the mapper test to confirm it passes with the new fixture
    *   `[✅]`   **Commit** `test(paralysis): mapper fixture reflects updated_master_plan unified milestone vocabulary`

## Milestone 4: Validation and Documentation Sync

*   `[✅]`   [DOCS] docs/implementations/.../`Dialectic Modeling Explanation.md` **Update stage descriptions to reflect milestone work nodes and Example Checklist output**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the Parenthesis and Paralysis stage descriptions in the explanation doc to reflect the new document structures
    *   `[✅]`   `role`
        *   `[✅]`   Canonical reference documentation for the dialectic pipeline; consumed by developers and future agents
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the Parenthesis and Paralysis rows in the stage table (lines 36-37) and the stage-by-stage execution sections (lines 349-374)
    *   `[✅]`   `deps`
        *   `[✅]`   Milestone 1 and 2 design docs — the updated recipe docs define what these descriptions should say
    *   `[✅]`   `Dialectic Modeling Explanation.md`
        *   `[✅]`   Line 36 Parenthesis outputs: change "Milestone Schema" description from field-definition language to "Milestone Work Breakdown — dependency-ordered architectural work nodes per milestone"
        *   `[✅]`   Line 37 Paralysis outputs: change "Actionable Checklist" description to reference "Example Checklist structure with full TDD cycle per source file"
        *   `[✅]`   Lines 349-358 Parenthesis section: update Step 4 description from "Define reusable milestone field schema" to "Decompose dependency-frontier milestones into architectural work nodes"
        *   `[✅]`   Lines 364-374 Paralysis section: update Step 2 description to reference expanding milestone work nodes into Example Checklist structure
    *   `[✅]`   `directionality`
        *   `[✅]`   Documentation layer; depends on all prior implementation being complete
    *   `[✅]`   `requirements`
        *   `[✅]`   Descriptions must be factually accurate against the updated recipe docs
        *   `[✅]`   Do not alter the document count formula or fan-out/fan-in pattern descriptions (those are unchanged)
    *   `[✅]`   **Commit** `docs(dialectic): update stage descriptions for milestone work nodes and Example Checklist output`

*   `[✅]`   [DOCS] docs/implementations/.../`Prompt Templating Examples.md` **Update parenthesis and paralysis prompt examples to show new structures**
    *   `[✅]`   `objective`
        *   `[✅]`   Update the Parenthesis milestone_schema and Paralysis actionable_checklist examples in the prompt templating doc to reflect the new JSON templates and content structures
    *   `[✅]`   `role`
        *   `[✅]`   Reference documentation showing example prompt/response pairs for each stage
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the Parenthesis and Paralysis sections of the templating examples doc
    *   `[✅]`   `deps`
        *   `[✅]`   Updated prompt templates from Milestones 1 and 2 — the examples must match the actual templates
    *   `[✅]`   `Prompt Templating Examples.md`
        *   `[✅]`   Replace the Parenthesis milestone_schema example: show a milestones[].nodes[] response instead of fields[] response
        *   `[✅]`   Replace the Paralysis actionable_checklist example: show Example Checklist nodes instead of steps[] with red_test/green_test
    *   `[✅]`   `directionality`
        *   `[✅]`   Documentation layer; depends on prompt template changes
    *   `[✅]`   `requirements`
        *   `[✅]`   Examples must be valid JSON parseable by the response extractor
        *   `[✅]`   Examples must demonstrate realistic content, not just placeholders
    *   `[✅]`   **Commit** `docs(prompts): update templating examples for milestone work nodes and Example Checklist`

*   `[✅]`   [TEST-INT] Integration validation pass **Verify end-to-end parenthesis→paralysis document flow with new structures**
    *   `[✅]`   `objective`
        *   `[✅]`   Confirm the full pipeline: parenthesis planner emits HeaderContext with milestones[] context → milestone_schema turn produces milestones[].nodes[] → paralysis planner reads milestone_schema and emits checklist context → actionable_checklist turn produces Example Checklist nodes
    *   `[✅]`   `role`
        *   `[✅]`   Integration validation; proves the synchronization chain holds across all artifacts
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the parenthesis Step 1→4 → paralysis Step 1→2 document flow
    *   `[✅]`   `deps`
        *   `[✅]`   All nodes from Milestones 1 and 2 must be complete
        *   `[✅]`   supabase/integration_tests/services/dialectic_full_dag_traversal.integration.test.ts — if this test exists and covers parenthesis→paralysis, it needs fixture updates
    *   `[✅]`   Integration validation
        *   `[✅]`   Apply the migration to a local Supabase instance
        *   `[✅]`   Verify the recipe step rows contain the correct inputs_required, inputs_relevance, outputs_required values by querying both template and instance tables
        *   `[✅]`   Verify the mapper tests pass: `deno test mappers.parenthesis.test.ts` and `deno test mappers.paralysis.test.ts`
        *   `[✅]`   If dialectic_full_dag_traversal.integration.test.ts references milestone_schema or actionable_checklist content structures, update its fixtures
    *   `[✅]`   `directionality`
        *   `[✅]`   Integration test layer; validates the full artifact chain
    *   `[✅]`   `requirements`
        *   `[✅]`   Migration applies cleanly with no errors
        *   `[✅]`   All mapper tests pass
        *   `[✅]`   No orphaned references to fields[], style_guide_notes, validation_rules, iteration_guidance in any recipe step definition
        *   `[✅]`   No orphaned references to steps[].red_test, steps[].green_test, steps[].refactor in any paralysis recipe step definition
    *   `[✅]`   **Commit** `test(integration): validate parenthesis→paralysis pipeline with milestone work nodes`

*   `[✅]`   `[BE]` prompt-assembler/`assembleContinuationPrompt` **Self-fetch prior raw output from `target_contribution_id`; remove caller-provided `continuationContent`**
    *   `[✅]`   `objective`
        *   `[✅]`   `assembleContinuationPrompt` must resolve the prior model output content itself by querying `dialectic_contributions` for the row identified by `target_contribution_id` and downloading the stored file — identically to how it already fetches the header context contribution
        *   `[✅]`   The `continuationContent: string` field must be removed from `AssembleContinuationPromptDeps` — it is not a caller concern; the function owns this fetch entirely
        *   `[✅]`   The function must throw `PRECONDITION_FAILED: target_contribution_id is required` when `job.payload` does not narrow through `isRecord` to a payload with a non-empty string `target_contribution_id`
        *   `[✅]`   The function must throw when the `dialectic_contributions` query for the prior output contribution fails or returns no row
        *   `[✅]`   The function must throw when the storage download for the prior output contribution fails
        *   `[✅]`   The resolved and downloaded content replaces `continuationContent` as the local variable passed to `getJsonCorrectiveInstruction` and appended to `promptParts` — all downstream logic is unchanged
        *   `[✅]`   No caller may supply or override this content
    *   `[✅]`   `role`
        *   `[✅]`   Prompt-assembly leaf function; adapter layer
        *   `[✅]`   Pure producer: called by `prompt-assembler.ts` facade; has no consumers of its own output beyond the facade
    *   `[✅]`   `module`
        *   `[✅]`   `supabase/functions/_shared/prompt-assembler/`
        *   `[✅]`   Operates exclusively on `dialectic_contributions` and storage; no write side-effects to either
        *   `[✅]`   Boundary: receives typed deps struct; returns `AssembledPrompt`; all I/O is injected via `dbClient` and `fileManager`
    *   `[✅]`   `deps`
        *   `[✅]`   `prompt-assembler.interface.ts` · adapter · inward · `AssembleContinuationPromptDeps` (type only — `continuationContent` removed)
        *   `[✅]`   `supabase_storage_utils.ts` · adapter · inward · `downloadFromStorage` (already imported; used for both header context and prior output downloads)
        *   `[✅]`   `type_guards.ts` · adapter · inward · `isRecord` (already imported; used to narrow `job.payload` before accessing `target_contribution_id`)
        *   `[✅]`   `dialectic.interface.ts` · domain · inward · `HeaderContext` (unchanged)
        *   `[✅]`   `file_manager.types.ts` · port · inward · `FileType` (unchanged)
        *   `[✅]`   Confirm no reverse dependency introduced: function does not import from `prompt-assembler.ts`, `processSimpleJob.ts`, or any consumer layer
    *   `[✅]`   `context_slice`
        *   `[✅]`   `AssembleContinuationPromptDeps` provides: `dbClient`, `fileManager`, `job`, `project`, `session`, `stage`, `gatherContext`, `sourceContributionId?` — `continuationContent` is removed
        *   `[✅]`   All injection is interface-shaped; no concrete supabase client or file manager is imported
    *   `[✅]`   interface/`prompt-assembler.interface.ts`
        *   `[✅]`   `AssembleContinuationPromptDeps`: remove `continuationContent: string` — field is deleted entirely, not made optional
        *   `[✅]`   No other fields added or removed from this interface in this node
        *   `[✅]`   `AssemblePromptOptions` is NOT modified in this node (that is Node 2's concern)
    *   `[✅]`   unit/`assembleContinuationPrompt.test.ts`
        *   `[✅]`   Replace the top-level `createHeaderContextContributionMock` helper with a `createContributionsMock` helper typed as `(entries: Record<string, { storage_bucket: string; storage_path: string; file_name: string; contribution_type: string }>) => { select: (state: MockQueryBuilderState) => Promise<...> }` — dispatches on the `id` eq-filter value to return the matching typed row, returns a typed 404 error shape for any unknown ID; no untyped fields or partial objects
        *   `[✅]`   Every test job fixture must set `target_contribution_id` on `job.payload.target_contribution_id` to a constant `PRIOR_OUTPUT_CONTRIB_ID` (e.g. `"prior-output-contrib-123"`)
        *   `[✅]`   Every test must configure `dialectic_contributions` in the mock client using `createContributionsMock`, mapping `PRIOR_OUTPUT_CONTRIB_ID` to a valid contribution row (`storage_bucket: "dialectic_contributions"`, `storage_path: "path/to/prior"`, `file_name: "prior_output.json"`, `contribution_type: "antithesis"`) and where applicable mapping `HEADER_CONTEXT_CONTRIBUTION_ID` to its header-context row
        *   `[✅]`   Every test must configure `storageMock.downloadResult` to return the prior output content as a `Blob` when called with the prior output bucket and path, in addition to any existing header-context path handling
        *   `[✅]`   Every call to `assembleContinuationPrompt` must have `continuationContent` removed from the argument object — passing it is a type error after the interface change
        *   `[✅]`   Category A (A.1–A.4): assert that the storage download spy for the prior output path is called; assert `result.promptContent.endsWith(priorOutputContent)` where `priorOutputContent` is the string returned by the storage mock for the prior output contribution
        *   `[✅]`   Category B (B.1–B.6): the incomplete or malformed JSON that previously was `continuationContent` is now returned by the storage mock for the prior output contribution; assert `result.promptContent.endsWith(incompleteJson)` or `.endsWith(malformedJson)` respectively
        *   `[✅]`   Category C (C.1–C.4): same pattern — content served from mock storage for the prior output contribution
        *   `[✅]`   D.1: rewrite entirely — remove all three `assertRejects` calls for `null`/`undefined`/`""` `continuationContent`; replace with a test that provides a job whose `payload.target_contribution_id` is absent (payload does not contain the key), asserts `assertRejects` with `Error` and message containing `"PRECONDITION_FAILED"`
        *   `[✅]`   D.2: add `target_contribution_id` to `job.payload` + prior output contribution mock + storage mock for prior output; existing assertion that header-context storage failure throws `"Failed to download header context file from storage"` is unchanged
        *   `[✅]`   D.3: add `target_contribution_id` to `job.payload` + prior output contribution mock + storage mock for prior output; existing assertion that the call succeeds without header context for PLAN jobs is unchanged
        *   `[✅]`   D.4: add `target_contribution_id` to `job.payload` + prior output contribution mock + storage mock for prior output so the function reaches the FileManager call; existing `assertRejects` for FileManager error is unchanged
        *   `[✅]`   D.5: no `target_contribution_id` needed — the function throws on `selected_model_ids` before reaching the contribution fetch; no change to this test
        *   `[✅]`   E.1: `target_contribution_id` is already in `job.payload` in the existing fixture; add prior output contribution mock + storage mock; remove `continuationContent` from the call; existing `sourceContributionId` forwarding assertion is unchanged
        *   `[✅]`   F (10.b.i–10.b.iv): add `target_contribution_id` to `job.payload` + prior output contribution + storage mock to each fixture; remove `continuationContent` from each call; existing header-context assertions are unchanged
    *   `[✅]`   `construction`
        *   `[✅]`   After the existing `selected_model_ids` check: call `isRecord(job.payload)` — if it does not narrow, throw `"PRECONDITION_FAILED: target_contribution_id is required"`
        *   `[✅]`   After narrowing: if `typeof job.payload.target_contribution_id !== 'string' || job.payload.target_contribution_id.length === 0`, throw `"PRECONDITION_FAILED: target_contribution_id is required"` — no fallback to row-level field; continuation jobs always carry this in the payload (set by `continueJob.ts`)
        *   `[✅]`   Assign `const targetContributionId: string = job.payload.target_contribution_id` — fully typed, no cast
        *   `[✅]`   Query `dialectic_contributions` selecting `id, storage_bucket, storage_path, file_name` where `id = targetContributionId` — same query shape as the existing header context fetch
        *   `[✅]`   Validate `storage_bucket`, `storage_path`, and `file_name` are non-empty strings on the returned row — same guard pattern as header context
        *   `[✅]`   Construct path as `${priorContrib.storage_path}/${priorContrib.file_name}` — same pattern as header context path construction
        *   `[✅]`   Download via `downloadFromStorage(dbClient, priorContrib.storage_bucket, priorPath)` and throw `"Failed to download prior output file from storage"` on error or missing data
        *   `[✅]`   Decode: `const continuationContent: string = new TextDecoder().decode(buffer)` — typed, no cast; all downstream usage is unchanged
    *   `[✅]`   `assembleContinuationPrompt.ts`
        *   `[✅]`   Remove the `!continuationContent` precondition check and its throw
        *   `[✅]`   After `selected_model_ids` check: add `isRecord` guard on `job.payload`, then non-empty string check on `job.payload.target_contribution_id`, throw `PRECONDITION_FAILED` on either failure
        *   `[✅]`   Add prior output contribution DB query, storage path validation, storage download, and decode to produce `continuationContent: string`
        *   `[✅]`   All other logic (header context fetch, `getJsonCorrectiveInstruction`, `promptParts` assembly, `fileManager.uploadAndRegisterFile`) remains structurally unchanged
    *   `[✅]`   `requirements`
        *   `[✅]`   A continuation job produces a prompt whose final segment is exactly the raw content stored at the prior output contribution path
        *   `[✅]`   The function never relies on the caller for content; any caller that previously passed `continuationContent` receives a TypeScript compile error
        *   `[✅]`   All existing instruction-selection logic is driven by the fetched content, not a caller-supplied string
        *   `[✅]`   All existing header context, FileType routing, `turnIndex`, `branchKey`, `parallelGroup` behaviors are preserved
    *   `[✅]`   **Commit** `fix: supabase/functions/_shared/prompt-assembler assembleContinuationPrompt self-fetches prior output from target_contribution_id; removes caller-supplied continuationContent`
        *   `[✅]`   `prompt-assembler.interface.ts`: removed `continuationContent: string` from `AssembleContinuationPromptDeps`
        *   `[✅]`   `assembleContinuationPrompt.test.ts`: replaced `createHeaderContextContributionMock` with `createContributionsMock`; all tests supply `target_contribution_id` in payload and prior-output storage mock; removed `continuationContent` from all call sites; D.1 rewritten to assert PRECONDITION_FAILED on missing payload `target_contribution_id`
        *   `[✅]`   `assembleContinuationPrompt.ts`: removed `continuationContent` precondition; added `isRecord` guard, `target_contribution_id` check and throw, contribution query, storage download, and decode; downstream logic unchanged

*   `[✅]`   `[BE]` prompt-assembler/`prompt-assembler` **Route continuation by `target_contribution_id` on `DialecticJobRow`; remove `continuationContent` from `AssemblePromptOptions`**
    *   `[✅]`   `objective`
        *   `[✅]`   The `assemble()` facade currently routes to `assembleContinuationPrompt` when `options.continuationContent` is truthy — this condition will never be true after Node 1 removes the field; routing must change to detect a continuation job by checking `options.job.target_contribution_id`, which is typed directly on `DialecticJobRow` as `string | null` — no narrowing or cast required
        *   `[✅]`   `continuationContent?: string` must be removed from `AssemblePromptOptions` — passing it is no longer meaningful and the interface must not permit it
        *   `[✅]`   The `assembleContinuationPrompt` call site inside `assemble()` must not pass `continuationContent` in the deps object
        *   `[✅]`   All other routing branches (PLAN → `assemblePlannerPrompt`, EXECUTE → `assembleTurnPrompt`, etc.) are unchanged
    *   `[✅]`   `role`
        *   `[✅]`   Facade / router; adapter layer
        *   `[✅]`   Immediate consumer of `assembleContinuationPrompt`; immediate producer for `processSimpleJob.ts`
    *   `[✅]`   `module`
        *   `[✅]`   `supabase/functions/_shared/prompt-assembler/`
        *   `[✅]`   Boundary: `IPromptAssembler.assemble(options: AssemblePromptOptions)` is the only public entry point for continuation routing
    *   `[✅]`   `deps`
        *   `[✅]`   `assembleContinuationPrompt.ts` · adapter · inward · `AssembleContinuationPromptDeps` (updated in Node 1 — no `continuationContent`)
        *   `[✅]`   `prompt-assembler.interface.ts` · adapter · inward · `AssemblePromptOptions` (updated here — `continuationContent` removed)
        *   `[✅]`   Confirm no reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `AssemblePromptOptions` after this node: `project`, `session`, `stage`, `projectInitialUserPrompt`, `iterationNumber`, `job?`, `sourceContributionId?` — `continuationContent` deleted
        *   `[✅]`   Routing predicate reads `options.job.target_contribution_id` — typed as `string | null` on `DialecticJobRow`, no narrowing or guard required; condition is `typeof options.job.target_contribution_id === 'string' && options.job.target_contribution_id.length > 0`
    *   `[✅]`   interface/`prompt-assembler.interface.ts`
        *   `[✅]`   `AssemblePromptOptions`: remove `continuationContent?: string` — field deleted entirely
        *   `[✅]`   `AssembleContinuationPromptDeps` is already corrected in Node 1 and must not be re-edited here
    *   `[✅]`   unit/`prompt-assembler.test.ts`
        *   `[✅]`   Any existing test that passes `continuationContent` to `assemble()` must be updated to instead set `target_contribution_id` on the job fixture — confirm the test still asserts routing to `assembleContinuationPrompt`
        *   `[✅]`   Add a test asserting that a job with a non-empty string `target_contribution_id` routes to `assembleContinuationPrompt` regardless of job type
        *   `[✅]`   Add a test asserting that a job with `target_contribution_id: null` does NOT route to `assembleContinuationPrompt`
        *   `[✅]`   All other routing tests are unchanged
    *   `[✅]`   `prompt-assembler.ts`
        *   `[✅]`   In `assemble()`: replace `if (options.continuationContent)` with `if (options.job && typeof options.job.target_contribution_id === 'string' && options.job.target_contribution_id.length > 0)` — `target_contribution_id` is a direct typed field on `DialecticJobRow`, no cast or narrowing required
        *   `[✅]`   Remove `continuationContent: options.continuationContent` from the deps object passed to `this.assembleContinuationPrompt()`
        *   `[✅]`   All other branches in `assemble()` are unchanged
    *   `[✅]`   `requirements`
        *   `[✅]`   Any job with a non-empty `target_contribution_id` routes to `assembleContinuationPrompt`; any job without one follows existing PLAN/EXECUTE routing
        *   `[✅]`   No caller can inject content through `AssemblePromptOptions`; the type system enforces this
    *   `[✅]`   **Commit** `fix: supabase/functions/_shared/prompt-assembler prompt-assembler routes continuation by target_contribution_id; removes continuationContent from AssemblePromptOptions`
        *   `[✅]`   `prompt-assembler.interface.ts`: removed `continuationContent?: string` from `AssemblePromptOptions`
        *   `[✅]`   `prompt-assembler.test.ts`: updated routing tests to use `target_contribution_id`; added two new routing boundary tests
        *   `[✅]`   `prompt-assembler.ts`: replaced `options.continuationContent` routing condition with `options.job.target_contribution_id` check; removed `continuationContent` from `assembleContinuationPrompt` call site

*   `[✅]`   `[BE]` dialectic-worker/`processSimpleJob` **Remove hardcoded `continuationContent` placeholder**
    *   `[✅]`   `objective`
        *   `[✅]`   Remove the `let continuationContent: string | undefined` declaration and the `continuationContent = 'Please continue.'` assignment — dead code after Nodes 1 and 2
        *   `[✅]`   Remove the `if (continuationContent) { assembleOptions.continuationContent = continuationContent; }` block — `AssemblePromptOptions` no longer has this field; passing it is a type error
        *   `[✅]`   The `sourceContributionId` variable and its `assembleOptions.sourceContributionId = sourceContributionId` assignment remain — still forwarded for storage path metadata
    *   `[✅]`   `role`
        *   `[✅]`   Job orchestrator; adapter layer
        *   `[✅]`   Consumer of `IPromptAssembler.assemble()`; the change here is a pure removal of dead scaffolding
    *   `[✅]`   `module`
        *   `[✅]`   `supabase/functions/dialectic-worker/`
    *   `[✅]`   `deps`
        *   `[✅]`   `prompt-assembler.interface.ts` · adapter · inward · `AssemblePromptOptions` (updated in Node 2 — no `continuationContent`)
        *   `[✅]`   Confirm no reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `AssemblePromptOptions` passed to `assemble()`: `project`, `session`, `stage`, `projectInitialUserPrompt`, `iterationNumber`, `job`, `sourceContributionId?` — no `continuationContent`
    *   `[✅]`   unit/`processSimpleJob.test.ts`
        *   `[✅]`   Locate the existing test that asserts `assembleOptions.continuationContent === 'Please continue.'` and remove it.
        *   `[✅]`   Assert that `assembleOptions.sourceContributionId` is still forwarded correctly when `target_contribution_id` is present
        *   `[✅]`   All other `processSimpleJob` tests are unchanged
    *   `[✅]`   `processSimpleJob.ts`
        *   `[✅]`   Delete the `let continuationContent: string | undefined` declaration
        *   `[✅]`   Delete the `continuationContent = 'Please continue.'` assignment
        *   `[✅]`   Delete the `if (continuationContent) { assembleOptions.continuationContent = continuationContent; }` block
        *   `[✅]`   Retain the `sourceContributionId` resolution and `assembleOptions.sourceContributionId = sourceContributionId` assignment unchanged
    *   `[✅]`   `requirements`
        *   `[✅]`   Continuation jobs produce prompts whose content comes from the stored prior output — not from a hardcoded string in the orchestrator
        *   `[✅]`   `processSimpleJob` is agnostic to content continuation; it passes the job to `assemble()` and the facade and leaf function handle the rest
    *   `[✅]`   **Commit** `fix: supabase/functions/dialectic-worker processSimpleJob removes hardcoded continuationContent placeholder`
        *   `[✅]`   `processSimpleJob.test.ts`: updated test to assert no `continuationContent` in `assembleOptions`; retained `sourceContributionId` forwarding assertion
        *   `[✅]`   `processSimpleJob.ts`: removed `continuationContent` variable, assignment, and conditional pass-through

*   `[✅]`   [BE] supabase/functions/dialectic-worker/`findSourceDocuments` **Replace substring document_key matching with exact deconstructStoragePath comparison across all input rule cases**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace the substring-based `document_key` matching in `findSourceDocuments.ts` with exact matching via `deconstructStoragePath`. Currently, the DB queries use `.ilike('file_name', '%${documentKey}%')` (lines 303, 358, 397, 454) and the post-fetch filter `recordMatchesDocumentKey` delegates to `fileNameContainsDocumentKey` which uses `.includes()` (line 137). Both are substring matches. A `document_key` like `'header_context'` falsely matches files containing `'header_context_pairwise'` because `'header_context_pairwise'.includes('header_context')` is true. The fix must use `deconstructStoragePath` to extract the exact `documentKey` from each record's `storage_path`/`file_name` and compare with `===` against `rule.document_key`.
        *   `[✅]`   Remove the `ilike` pre-filter from all four DB queries (`document` line 301-304, `header_context` line 356-359, `contribution` line 395-398, `seed_prompt/project_resource` line 452-455). The DB cannot run `deconstructStoragePath`, so document_key filtering must happen entirely in TypeScript after fetch.
        *   `[✅]`   Replace the `fileNameContainsDocumentKey` function (lines 133-138) with a new function that calls `deconstructStoragePath({ storageDir: record.storage_path, fileName: record.file_name })` and returns `deconstructed.documentKey === documentKey` using strict equality.
        *   `[✅]`   Update `recordMatchesDocumentKey` (lines 140-164) to call the new exact-match function instead of `fileNameContainsDocumentKey`. The existing exact checks for `DialecticProjectResourceRow.resource_description.document_key` (line 150-153) and `DialecticContributionRow.contribution_type` (line 156-160) remain unchanged — they are already exact comparisons.
        *   `[✅]`   This is a single permanent fix that resolves substring false-positive matching for all input rule types (`document`, `header_context`, `contribution`, `seed_prompt`, `project_resource`) via the shared `recordMatchesDocumentKey` helper.
    *   `[✅]`   `role`
        *   `[✅]`   Infrastructure adapter — `findSourceDocuments` fetches and filters source artifacts from the database for downstream planner consumption. It is the single point where `document_key` matching occurs against DB records.
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the source document retrieval logic within the dialectic-worker edge function
        *   `[✅]`   Specifically: the `recordMatchesDocumentKey` shared helper, the `fileNameContainsDocumentKey` helper it delegates to, and the four `ilike` pre-filters in the `switch` cases for `document`, `header_context`, `contribution`, and `seed_prompt/project_resource`
    *   `[✅]`   `deps`
        *   `[✅]`   `deconstructStoragePath` from `supabase/functions/_shared/utils/path_deconstructor.ts` — already imported at line 7. Adapter layer. Provides `DeconstructedPathInfo.documentKey` extraction from `storageDir` + `fileName`. No new import needed.
        *   `[✅]`   `DeconstructedPathInfo` from `supabase/functions/_shared/utils/path_deconstructor.types.ts` — the return type of `deconstructStoragePath`. Its `documentKey?: string` field is the exact parsed document key. Not imported directly (inferred from function return), no import needed.
        *   `[✅]`   `SourceRecord` type alias (line 116) — `DialecticContributionRow | DialecticProjectResourceRow | DialecticFeedbackRow`. All three have `storage_path: string | null` and `file_name: string | null`. After `ensureRecordsHaveStorage` (lines 202-210) throws on null values, these fields are guaranteed non-null at runtime, but TypeScript does not narrow them. The replacement function must guard for null before calling `deconstructStoragePath`.
        *   `[✅]`   `InputRule` from `dialectic.interface.ts` (lines 1610-1627) — `document_key?: FileType`. Already used by `findSourceDocuments` via `rule.document_key`. No change needed.
        *   `[✅]`   Confirm no reverse dependency is introduced — `findSourceDocuments` already imports `deconstructStoragePath`; no new imports required
    *   `[✅]`   `context_slice`
        *   `[✅]`   From `deconstructStoragePath`: the function signature `(params: { storageDir: string; fileName: string }) => DeconstructedPathInfo` and specifically the `documentKey?: string` field on the return type
        *   `[✅]`   From `SourceRecord`: the `storage_path: string | null` and `file_name: string | null` fields present on all three union members
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers — `deconstructStoragePath` is in `_shared/utils` (infrastructure), consumed by `dialectic-worker` (adapter). Dependency direction is inward.
    *   `[✅]`   unit/`findSourceDocuments.test.ts`
        *   `[✅]`   Test: when a `header_context` rule has `document_key: 'header_context'`, a contribution with file_name that deconstructs to `documentKey: 'header_context_pairwise'` must NOT be returned — proving the substring false positive is eliminated
        *   `[✅]`   Test: when a `header_context` rule has `document_key: 'header_context'`, a contribution with file_name that deconstructs to `documentKey: 'header_context'` must be returned — proving exact match works
        *   `[✅]`   Test: when a `document` rule has `document_key: 'system_architecture'`, a project resource with file_name that deconstructs to `documentKey: 'system_architecture_v2'` must NOT be returned — proving substring false positive is eliminated for the `document` case
        *   `[✅]`   Test: when a `document` rule has `document_key: 'system_architecture'`, a project resource with file_name that deconstructs to `documentKey: 'system_architecture'` must be returned — proving exact match works for the `document` case
    *   `[✅]`   `construction`
        *   `[✅]`   The new exact-match function replaces `fileNameContainsDocumentKey`. It accepts `(record: SourceRecord, documentKey: string)` and returns `boolean`. It calls `deconstructStoragePath` with the record's `storage_path` and `file_name` after guarding for null on both fields (returning `false` if either is null, since a record without storage info cannot match a document_key). It compares `deconstructed.documentKey === documentKey` with strict equality.
        *   `[✅]`   `fileNameContainsDocumentKey` is deleted entirely — it must not exist after this change
        *   `[✅]`   No factory or constructor changes needed — `findSourceDocuments` signature and return type are unchanged
        *   `[✅]`   Prohibited: no substring matching (`.includes()`, `ilike`, regex) on file_name for document_key purposes anywhere in this file
    *   `[✅]`   `findSourceDocuments.ts`
        *   `[✅]`   Delete `fileNameContainsDocumentKey` function (lines 133-138)
        *   `[✅]`   Create replacement function (e.g., `fileNameMatchesDocumentKeyExact`) that: checks `record.storage_path` and `record.file_name` are non-null strings; calls `deconstructStoragePath({ storageDir: record.storage_path, fileName: record.file_name })`; returns `deconstructed.documentKey === documentKey`
        *   `[✅]`   Update `recordMatchesDocumentKey` (line 145) to call the new exact-match function instead of `fileNameContainsDocumentKey`
        *   `[✅]`   `document` case (lines 301-304): remove the `if (rule.document_key) { ... ilike ... }` block. The `filterRecordsByDocumentKey` call at line 315 handles filtering in TypeScript via the now-exact `recordMatchesDocumentKey`.
        *   `[✅]`   `header_context` case (lines 356-359): remove the `if (rule.document_key) { ... ilike ... }` block. The `filterRecordsByDocumentKey` call at line 371 handles filtering in TypeScript via the now-exact `recordMatchesDocumentKey`.
        *   `[✅]`   `contribution` case (lines 395-398): remove the `if (rule.document_key) { ... .or('file_name.ilike...') ... }` block. The `filterRecordsByDocumentKey` call at line 410 handles filtering in TypeScript via the now-exact `recordMatchesDocumentKey`. The `contribution_type` check remains in `recordMatchesDocumentKey` (line 156-160) — it is an existing exact comparison unaffected by this change.
        *   `[✅]`   `seed_prompt/project_resource` case (lines 452-455): remove the `if (!isInitialUserPromptProjectResource && rule.document_key) { ... ilike ... }` block. The `filterRecordsByDocumentKey` call at line 466 handles filtering in TypeScript via the now-exact `recordMatchesDocumentKey`.
    *   `[✅]`   `directionality`
        *   `[✅]`   Adapter layer (dialectic-worker)
        *   `[✅]`   All dependencies are inward-facing: imports `deconstructStoragePath` from `_shared/utils` (infrastructure), imports types from `dialectic-service` (domain)
        *   `[✅]`   Provides are outward-facing: `findSourceDocuments` is consumed by the planner strategy layer
    *   `[✅]`   `requirements`
        *   `[✅]`   `fileNameContainsDocumentKey` must be deleted — no substring `.includes()` matching on file_name for document_key purposes
        *   `[✅]`   All four `ilike` pre-filters must be removed from DB queries — document_key filtering happens exclusively in TypeScript via `deconstructStoragePath`
        *   `[✅]`   `recordMatchesDocumentKey` must use `deconstructStoragePath` for exact `documentKey` comparison via `===`
        *   `[✅]`   Null guard on `record.storage_path` and `record.file_name` before calling `deconstructStoragePath` — return `false` if either is null (no fallback, no default, no substring match)
        *   `[✅]`   Existing exact checks in `recordMatchesDocumentKey` for `DialecticProjectResourceRow.resource_description.document_key` and `DialecticContributionRow.contribution_type` remain unchanged
        *   `[✅]`   No type casting, no defaults, no fallbacks
        *   `[✅]`   Tests must prove that substring false positives (e.g., `'header_context'` matching `'header_context_pairwise'`) are eliminated

*   `[✅]`   [BE] supabase/functions/dialectic-worker/strategies/planners/`planAllToOne` **Select header_context_id by the recipe step's defined document_key**
    *   `[✅]`   `objective`
        *   `[✅]`   Fix the `header_context_id` selection in `planAllToOne.ts` (lines 305-314). Currently, the `.find()` on `sourceDocs` filters only by `contribution_type === 'header_context'` and `model_id === parentJob.payload.model_id`. It has no `document_key` filter. When multiple `header_context` source documents exist for the same model (e.g., one with `document_key: 'header_context'` and another with `document_key: 'header_context_pairwise'`), the `.find()` returns the first one arbitrarily. The recipe step's `inputs_required` defines the exact `document_key` for the `header_context` input via the `InputRule.document_key` field. The planner must extract that `document_key` and include it in the `.find()` filter.
        *   `[✅]`   `SourceDocument.document_key` is already populated by `findSourceDocuments.ts` via `deconstructStoragePath` (line 30 of `findSourceDocuments.ts`), so no additional call to `deconstructStoragePath` is needed in the planner — direct `===` comparison on `d.document_key` is sufficient.
    *   `[✅]`   `role`
        *   `[✅]`   Application logic — `planAllToOne` is a granularity planner strategy that creates child job payloads from source documents and recipe steps. It is responsible for correctly wiring `header_context_id` into execute job payloads.
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the `planAllToOne` granularity planner strategy within `dialectic-worker/strategies/planners/`
        *   `[✅]`   Specifically: the `header_context_id` selection block at lines 305-314
    *   `[✅]`   `deps`
        *   `[✅]`   `SourceDocument` from `dialectic.interface.ts` (lines 1443-1453) — its `document_key?: string` field is already populated by `findSourceDocuments`. Domain type. No change needed.
        *   `[✅]`   `InputRule` from `dialectic.interface.ts` (lines 1610-1627) — its `document_key?: FileType` field defines the required document_key for each input. Domain type. No change needed.
        *   `[✅]`   `GranularityPlannerFn` from `dialectic.interface.ts` (lines 1548-1553) — function signature provides `recipeStep: DialecticRecipeStep` which carries `inputs_required: InputRule[]`. No change needed.
        *   `[✅]`   `findSourceDocuments` (Node 1) — producer that populates `SourceDocument.document_key` via `deconstructStoragePath`. Must be fixed first to ensure exact document_key values on source documents. Adapter layer. Dependency is inward.
        *   `[✅]`   Confirm no reverse dependency is introduced — `planAllToOne` already consumes `SourceDocument` and `DialecticRecipeStep`; no new imports required
    *   `[✅]`   `context_slice`
        *   `[✅]`   From `DialecticRecipeStep`: the `inputs_required: InputRule[]` field, specifically entries where `type === 'header_context'`
        *   `[✅]`   From `InputRule`: the `document_key?: FileType` field — the exact document_key the recipe step requires for the `header_context` input
        *   `[✅]`   From `SourceDocument`: the `document_key?: string` field — the exact document_key parsed from the file path by `findSourceDocuments`
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers — `planAllToOne` imports types from `dialectic-service` (domain). Dependency direction is inward.
    *   `[✅]`   unit/`planAllToOne.test.ts`
        *   `[✅]`   Test: when `inputs_required` has a `header_context` rule with `document_key: FileType.HeaderContext`, and `sourceDocs` contains two header_context documents for the same model_id — one with `document_key: FileType.HeaderContext` and one with `document_key: FileType.HeaderContextPairwise` — the planner must select the document whose `document_key` matches `FileType.HeaderContext`, not the first one in the array
        *   `[✅]`   Test: when `inputs_required` has a `header_context` rule with `document_key: FileType.HeaderContextPairwise`, and `sourceDocs` contains two header_context documents for the same model_id — one with `document_key: FileType.HeaderContext` and one with `document_key: FileType.HeaderContextPairwise` — the planner must select the document whose `document_key` matches `FileType.HeaderContextPairwise`
    *   `[✅]`   `construction`
        *   `[✅]`   No new constructors or factories needed. The fix adds a local variable extraction and a filter condition to the existing `.find()` call.
        *   `[✅]`   Extract the `header_context` `InputRule` from `recipeStep.inputs_required` using `.find((rule) => rule?.type === 'header_context')` to access `rule.document_key`
        *   `[✅]`   Prohibited: no fallback if `document_key` is undefined on the rule — if the rule has no `document_key`, the existing behavior (match by `contribution_type` and `model_id` only) continues unchanged. This is not a default — it is the absence of an additional filter when the rule does not specify one.
    *   `[✅]`   `planAllToOne.ts`
        *   `[✅]`   Extract the `header_context` `InputRule`: change line 305-306 from `recipeStep.inputs_required.some((rule) => rule?.type === 'header_context')` to use `.find()` instead of `.some()` so the matched rule is available. Store the result as `headerContextRule`. Derive `requiresHeaderContext` from `headerContextRule !== undefined`. Extract `requiredDocumentKey` from `headerContextRule.document_key`.
        *   `[✅]`   Update the `.find()` at lines 310-313 to add a `document_key` filter: `sourceDocs.find((d) => d.contribution_type === 'header_context' && d.model_id === parentJob.payload.model_id && (requiredDocumentKey ? d.document_key === requiredDocumentKey : true))`
        *   `[✅]`   Update the error message at line 317 to include the `requiredDocumentKey` value for debuggability
    *   `[✅]`   `directionality`
        *   `[✅]`   Application layer (planner strategy)
        *   `[✅]`   All dependencies are inward-facing: imports types from `dialectic-service` (domain), consumes `SourceDocument[]` produced by `findSourceDocuments` (adapter)
        *   `[✅]`   Provides are outward-facing: produces `DialecticExecuteJobPayload[]` consumed by the job orchestrator
    *   `[✅]`   `requirements`
        *   `[✅]`   The `.find()` for `header_context_id` must include a `document_key` filter derived from the recipe step's `inputs_required` rule where `type === 'header_context'`
        *   `[✅]`   When `requiredDocumentKey` is defined, only `sourceDocs` entries with `d.document_key === requiredDocumentKey` may match
        *   `[✅]`   When `requiredDocumentKey` is undefined (rule has no `document_key` field), the existing behavior (match by `contribution_type` and `model_id` only) is preserved — this is the absence of a filter, not a default
        *   `[✅]`   No type casting, no defaults, no fallbacks
        *   `[✅]`   Tests must prove that with two header_context documents for the same model_id but different document_keys, the planner selects the correct one based on the recipe step's `inputs_required` rule

*   `[✅]`   [BE] supabase/functions/dialectic-worker/strategies/planners/`planPerModel` **Select header_context_id by the recipe step's defined document_key**
    *   `[✅]`   `objective`
        *   `[✅]`   Fix the `header_context_id` selection in `planPerModel.ts` (lines 239-246). Same defect as `planAllToOne`: the `.find()` on `sourceDocs` filters only by `contribution_type === 'header_context'` and `model_id === modelId`. It has no `document_key` filter. When multiple `header_context` source documents exist for the same model (e.g., one with `document_key: 'header_context'` and another with `document_key: 'header_context_pairwise'`), the `.find()` returns the first one arbitrarily. The recipe step's `inputs_required` defines the exact `document_key` for the `header_context` input via the `InputRule.document_key` field. The planner must extract that `document_key` and include it in the `.find()` filter.
        *   `[✅]`   `SourceDocument.document_key` is already populated by `findSourceDocuments.ts` via `deconstructStoragePath` (line 30 of `findSourceDocuments.ts`), so no additional call to `deconstructStoragePath` is needed in the planner — direct `===` comparison on `d.document_key` is sufficient.
    *   `[✅]`   `role`
        *   `[✅]`   Application logic — `planPerModel` is a granularity planner strategy that creates per-model child job payloads from source documents and recipe steps. It is responsible for correctly wiring `header_context_id` into execute job payloads.
    *   `[✅]`   `module`
        *   `[✅]`   Bounded to the `planPerModel` granularity planner strategy within `dialectic-worker/strategies/planners/`
        *   `[✅]`   Specifically: the `header_context_id` selection block at lines 239-246
    *   `[✅]`   `deps`
        *   `[✅]`   `SourceDocument` from `dialectic.interface.ts` (lines 1443-1453) — its `document_key?: string` field is already populated by `findSourceDocuments`. Domain type. No change needed.
        *   `[✅]`   `InputRule` from `dialectic.interface.ts` (lines 1610-1627) — its `document_key?: FileType` field defines the required document_key for each input. Domain type. No change needed.
        *   `[✅]`   `GranularityPlannerFn` from `dialectic.interface.ts` (lines 1548-1553) — function signature provides `recipeStep: DialecticRecipeStep` which carries `inputs_required: InputRule[]`. No change needed.
        *   `[✅]`   `findSourceDocuments` (Node 1) — producer that populates `SourceDocument.document_key` via `deconstructStoragePath`. Must be fixed first to ensure exact document_key values on source documents. Adapter layer. Dependency is inward.
        *   `[✅]`   `planAllToOne` (Node 2) — sibling planner with identical fix pattern. No dependency, but same approach for consistency.
        *   `[✅]`   Confirm no reverse dependency is introduced — `planPerModel` already consumes `SourceDocument` and `DialecticRecipeStep`; no new imports required
    *   `[✅]`   `context_slice`
        *   `[✅]`   From `DialecticRecipeStep`: the `inputs_required: InputRule[]` field, specifically entries where `type === 'header_context'`
        *   `[✅]`   From `InputRule`: the `document_key?: FileType` field — the exact document_key the recipe step requires for the `header_context` input
        *   `[✅]`   From `SourceDocument`: the `document_key?: string` field — the exact document_key parsed from the file path by `findSourceDocuments`
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers — `planPerModel` imports types from `dialectic-service` (domain). Dependency direction is inward.
    *   `[✅]`   unit/`planPerModel.test.ts`
        *   `[✅]`   Test: when `inputs_required` has a `header_context` rule with `document_key: FileType.HeaderContext`, and `sourceDocs` contains two header_context documents for the same model_id — one with `document_key: FileType.HeaderContext` and one with `document_key: FileType.HeaderContextPairwise` — the planner must select the document whose `document_key` matches `FileType.HeaderContext`, not the first one in the array
        *   `[✅]`   Test: when `inputs_required` has a `header_context` rule with `document_key: FileType.HeaderContextPairwise`, and `sourceDocs` contains two header_context documents for the same model_id — one with `document_key: FileType.HeaderContext` and one with `document_key: FileType.HeaderContextPairwise` — the planner must select the document whose `document_key` matches `FileType.HeaderContextPairwise`
    *   `[✅]`   `construction`
        *   `[✅]`   No new constructors or factories needed. The fix adds a local variable extraction and a filter condition to the existing `.find()` call.
        *   `[✅]`   Extract the `header_context` `InputRule` from `recipeStep.inputs_required` using `.find((rule) => rule?.type === 'header_context')` to access `rule.document_key`
        *   `[✅]`   Note: `planPerModel` uses `modelId` (local const from line 20: `const modelId = parentJob.payload.model_id`) rather than `parentJob.payload.model_id` inline — maintain this existing pattern
        *   `[✅]`   Prohibited: no fallback if `document_key` is undefined on the rule — if the rule has no `document_key`, the existing behavior (match by `contribution_type` and `model_id` only) continues unchanged. This is not a default — it is the absence of an additional filter when the rule does not specify one.
    *   `[✅]`   `planPerModel.ts`
        *   `[✅]`   Extract the `header_context` `InputRule`: change lines 239-240 from `recipeStep.inputs_required.some((rule) => rule?.type === 'header_context')` to use `.find()` instead of `.some()` so the matched rule is available. Store the result as `headerContextRule`. Derive `requiresHeaderContext` from `headerContextRule !== undefined`. Extract `requiredDocumentKey` from `headerContextRule.document_key`.
        *   `[✅]`   Update the `.find()` at lines 242-245 to add a `document_key` filter: `sourceDocs.find((d) => d.contribution_type === 'header_context' && d.model_id === modelId && (requiredDocumentKey ? d.document_key === requiredDocumentKey : true))`
        *   `[✅]`   Update the error message at line 248 to include the `requiredDocumentKey` value for debuggability
    *   `[✅]`   `directionality`
        *   `[✅]`   Application layer (planner strategy)
        *   `[✅]`   All dependencies are inward-facing: imports types from `dialectic-service` (domain), consumes `SourceDocument[]` produced by `findSourceDocuments` (adapter)
        *   `[✅]`   Provides are outward-facing: produces `(DialecticExecuteJobPayload | DialecticPlanJobPayload)[]` consumed by the job orchestrator
    *   `[✅]`   `requirements`
        *   `[✅]`   The `.find()` for `header_context_id` must include a `document_key` filter derived from the recipe step's `inputs_required` rule where `type === 'header_context'`
        *   `[✅]`   When `requiredDocumentKey` is defined, only `sourceDocs` entries with `d.document_key === requiredDocumentKey` may match
        *   `[✅]`   When `requiredDocumentKey` is undefined (rule has no `document_key` field), the existing behavior (match by `contribution_type` and `model_id` only) is preserved — this is the absence of a filter, not a default
        *   `[✅]`   No type casting, no defaults, no fallbacks
        *   `[✅]`   Tests must prove that with two header_context documents for the same model_id but different document_keys, the planner selects the correct one based on the recipe step's `inputs_required` rule

*   `[✅]`   [COMMIT] `fix(dialectic-worker): exact document_key matching in findSourceDocuments and planner header_context_id selection`
    *   `[✅]`   `findSourceDocuments.ts`: replaced substring `.includes()` and `ilike` document_key matching with exact `deconstructStoragePath`-based `===` comparison; removed `fileNameContainsDocumentKey`; removed `ilike` pre-filters from all four DB query cases (`document`, `header_context`, `contribution`, `seed_prompt/project_resource`)
    *   `[✅]`   `planAllToOne.ts`: extract `document_key` from recipe step `inputs_required` `header_context` rule; add `document_key` filter to `header_context_id` `.find()` selection
    *   `[✅]`   `planPerModel.ts`: same fix as `planAllToOne` — extract `document_key` from recipe step `inputs_required` `header_context` rule; add `document_key` filter to `header_context_id` `.find()` selection


# ToDo

    - Regenerate individual specific documents on demand without regenerating inputs or other sibling documents 
    -- User reports that a single document failed and they liked the other documents, but had to regenerate the entire stage
    -- User requests option to only regenerate the exact document that failed
    -- Initial investigation shows this should be possible, all the deps are met, we just need a means to dispatch a job for only the exact document that errored or otherwise wasn't produced so that the user does't have to rerun the entire stage to get a single document
    -- Added bonus, this lets users "roll the dice" to get a different/better/alternative version of an existing document if they want to try again 
    -- FOR CONSIDERATION: This is a powerful feature but implies a branch in the work
    --- User generates stage, all succeeds
    --- User advances stages, decides they want to fix an oversight in a prior stage
    --- User regenerates a prior document
    --- Now subsequent documents derived from the original are invalid
    --- Is this a true branch/iteration, or do we highlight the downstream products so that those can be regenerated from the new input that was produced? 
    --- If we "only" highlight downstream products, all downstream products are invalid, because the header_context used to generate them would be invalid 
    --- PROPOSED: Implement regeneration prior to stage advancement, disable regeneration for documents who have downstream documents, set up future sprint for branching/iteration to support hints to regenerate downstream documents if a user regenerates upstream documents
    --- BLOCKER: Some stages are fundamentally dependent on all prior outputs, like synthesis, and the entire stage needs to be rerun if thesis/antithesis documents are regenerated

    - Set baseline values for each stage "Generate" action and encourage users to top up their account if they are at risk of NSF
    -- Pause the work mid-stream if NSF and encourage user to top up to continue 

    - hydrateAllStages doesn't, but the stage-specific one does
    -- Front end shows "complete" and "Submit Responses" as soon as a document is available instead of waiting for the entire stage to actually complete 
    -- Populating document list is unreliable
    -- Total progress indicator loses track constantly
    -- Stage completion indicators lose track the moment they're defocused

    - New user sign in banner doesn't display, throws console error  
    -- Chase, diagnose, fix 

   - Generating spinner stays present until page refresh 
   -- Needs to react to actual progress 
   -- Stop the spinner when a condition changes 

   - Checklist does not correctly find documents when multiple agents are chosen 

   - Refactor EMCAS to break apart the functions, segment out the tests
   -- Move gatherArtifacts call to processSimpleJob
   -- Decide where to measure & RAG

   - Switch to stream-to-buffer instead of chunking
   -- This lets us render the buffer in real time to show document progress 

   - Build test fixtures for major function groups 
   -- Provide standard mock factories and objects 

   - Show exact job progress in front end as pop up while working, then minimize to documents once documents arrive 