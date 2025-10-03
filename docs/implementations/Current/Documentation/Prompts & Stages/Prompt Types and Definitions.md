# Prompt Types and Definitions

This document provides a canonical definition for the different types of prompts used in the document-centric generation system. These definitions are grounded in the project's source code and TDD work plan to ensure they reflect the actual implementation.

---

### 1. Seed Prompt

*   **Purpose:** To bootstrap an entire stage of the dialectic process by producing a deterministic, auditable context package that all downstream prompts derive from.

*   **When It's Used:** It is generated and saved exactly once per stage, per session, per iteration by the service that kicks off the stage (e.g., `startSession.ts` or `submitStageResponses.ts`). The Seed Prompt is no longer sent directly to an AI model; instead it is consumed internally to assemble the stage's first planner prompt.

*   **Construction Details:** The `PromptAssembler` service constructs the Seed Prompt by combining the following components:
    1.  **Original User Input:** The most critical element, the `original_user_request` stored in `dialectic_project_resources` as a markdown file explaining what the user actually wants from the agent.   
    2.  **Base Template:** The `prompt_text` from the `system_prompts` table corresponding to the current stage that contextualizes the user's request into a specific domain and stage.
    3.  **Document Templates:** The `expected_output_template_ids` (`uuid[]`) are retrieved from the `dialectic_stages` table. The assembler then fetches the content of each corresponding template file from storage (referenced in `dialectic_document_templates`) and injects it into the base template.
    4.  **Overlays:** The `overlay_values` (`JSONB`) are fetched from the `domain_specific_prompt_overlays` table and merged into the template.
    5.  **Dynamic Context:** The `gatherContext` method is called to fetch and format prior stage artifacts (`dialectic_contributions`), user feedback (`dialectic_feedback`), and other project-level resources.

*   **Downstream Consumption:** The persisted Seed Prompt is read immediately when assembling the corresponding planner prompt so that the planner can produce the stage's `HeaderContext`. All subsequent turn prompts then reference that `HeaderContext` rather than the Seed Prompt directly.

*   **Associated Artifact:**
    *   **Path:** `{project_id}/session_{...}/iteration_{...}/{stage_dir}/`
    *   **Filename:** `seed_prompt.md`

---

### 2. Planner Prompt

*   **Purpose:** To orchestrate a specific, complex *step* within a multi-step stage recipe. Its primary function is to transform the Seed Prompt context and the stage recipe metadata into a `HeaderContext` (the shared plan for all downstream documents) and to enqueue child `'EXECUTE'` jobs. It plans the work; it does not generate the final document content itself.

*   **When It's Used:** It is assembled whenever a recipe step declares `prompt_type: "Planner"`—typically the first step of a stage. Operationally, a `'PLAN'` job is dispatched, the persisted Seed Prompt is loaded, and the resulting planner prompt is the first external prompt sent to the model for that stage.

*   **Construction Details:** The planner prompt is assembled by:
    1.  **Loading Stage Context:** Reading the saved Seed Prompt content plus the relevant stage overlays and style guides.
    2.  **Fetching the Planner Template:** Using the `prompt_template_name` from the current `DialecticRecipeStep` to select the proper row in `system_prompts`.
    3.  **Gathering Focused Inputs:** Resolving the `inputs_required` collection for the recipe step (e.g., prior-stage documents, feedback) so the planner has all materials needed to build the HeaderContext.
    4.  **Rendering:** Passing the staged context, fetched inputs, and template through the renderer to produce the final planner prompt text destined for the model.

*   **Associated Artifact:**
    *   **Path:** `{project_id}/session_{...}/iteration_{...}/{stage_dir}/_work/prompts/`
    *   **Filename:** `{model_slug}_{n}[_{step_name}]_planner_prompt.md`
    *   The optional `[_{step_name}]` segment is derived from the `name` of the `DialecticRecipeStep` and is critical for preventing filename collisions in stages that have multiple planning steps.

---

### 3. Turn Prompt

*   **Purpose:** To execute a single, discrete generation task for a specific document or a continuation of that document. Its output is the actual content (or a chunk of content) for a single artifact. It *does* the work planned by the `PlannerPrompt`.

*   **When It's Used:** It is assembled at runtime by the worker during the execution of a child `'EXECUTE'` job. Every turn job references the `HeaderContext` emitted by the preceding planner step so its output remains synchronized with sibling documents.

*   **Construction Details:** The `PromptAssembler` constructs the Turn Prompt by combining:
    1.  **Header Context:** The shared `HeaderContext` (the `SystemMaterials` object) is the primary input. It is fetched from its file in storage, referenced via the `header_context_resource_id` in the job payload.
    2.  **Document Template:** The specific template file for the document being generated (e.g., `synthesis_product_requirements_document.md`) is fetched from storage. The `HeaderContext` itself contains the `files_to_generate` array that maps a `document_key` to a `template_filename`.
    3.  **Document-Specific Data:** The job payload contains a document-specific data slice that is injected into the template.

*   **Associated Artifact:**
    *   **Path:** `{project_id}/session_{...}/iteration_{...}/{stage_dir}/_work/prompts/`
    *   **Filename:** `{model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md`
    *   The `_{document_key}` segment is essential for identifying which document this prompt is for.
    *   The optional `[_continuation_{c}]` segment is added for continuation turns, ensuring each turn's specific prompt is saved without overwriting the previous one.

---

### 4. Continuation Prompt

*   **Purpose:** To complete or correct a response from a previous model turn. This is the system's primary mechanism for error recovery and for handling outputs that exceed a model's single-turn length capacity. It is a universal mechanism that can be applied to the output of any prompt type (`Seed`, `Planner`, `Turn`, or a prior `Continuation`) for both explicit and implicit continuations.

*   **When It's Used:** It is assembled at runtime by the worker when a preceding job needs to be continued. This occurs in two distinct situations:
    1.  **Explicit Continuation:** The previous model turn completed successfully but was truncated, indicated by a `finish_reason` that is a member of the `ContinueReason` enum (e.g., `'length'`, `'max_tokens'`). This is a planned continuation.
    2.  **Implicit/Corrective Continuation:** The previous model turn failed in a way that produced incomplete or invalid content, such as a network error truncating a JSON object. This is an unplanned, corrective continuation.

*   **Construction Details:** The `assembleContinuationPrompt` function constructs the prompt by combining global and local context. The nature of this context depends on the prompt being continued:
    *   **For `TurnPrompt` Continuations:**
        *   **Global Context:** The shared `HeaderContext` from the original `'PLAN'` job is fetched from storage. This provides the model with the high-level objective, style guides, and shared plan.
        *   **Local Context:** A direct instruction is prepended to the `continuationContent` (the partial/invalid text from the previous turn).
    *   **For `SeedPrompt` and `PlannerPrompt` Continuations:**
        *   **Global Context:** These prompts do not have a `HeaderContext`. Their global context is implicitly the overall goal of the stage.
        *   **Local Context:** A direct instruction is prepended to the `continuationContent`.
    *   **Instruction Variants:** The direct instruction changes based on the reason for continuation:
        *   For **explicit continuations**, the instruction is a generic "Please continue the following text...".
        *   For **corrective continuations**, the instruction is specific to the error (e.g., "The previous response was incomplete. Please complete the following JSON object, ensuring it is syntactically valid...").

*   **Associated Artifact:**
    *   The `ContinuationPrompt` uses the same artifact naming convention as the prompt it is continuing, but with the `_continuation_{c}` segment always present and incremented. For example:
        *   `{model_slug}_{n}_{document_key}_continuation_{c}_prompt.md` (Continuing a Turn Prompt)
        *   `{model_slug}_{n}[_{step_name}]_continuation_{c}_planner_prompt.md` (Continuing a Planner Prompt)

---

### 5. Stage Recipe Specification Templates

The following sections establish a canonical template for documenting every stage, its recipe, and each step within that recipe. **Do not populate concrete values yet.** Instead, use these skeletons to record source locations (single sources of truth) and leave the data fields empty so that any missing information remains obvious during the population pass.

For every stage:

- **Use this template to capture the recipe definition before the migration work.**
- **Reference the authoritative sources** (e.g., `seed.sql`, `dialectic_stage_recipes` migrations, `Prompt Templating Examples.md`, `system_prompts` rows) so we never lose track of where each field originates.
- **Leave all placeholder values as `<TBD>` or empty**; we will fill them in during the next pass. Any blank field indicates a known-unknown (data is required but not yet defined).

The JSON stubs mirror the shape expected by the database so we can directly transform them into migrations once populated.

#### Stage Documentation Template

## Stage: <Stage Display Name> (`<stage_slug>`)

### Sources of Truth
- `dialectic_stages` row (see `seed.sql`): expected_output_artifacts, input_artifact_rules, recipe_id
- `dialectic_stage_recipes` row (see migration files): steps array structure
- `system_prompts` rows (see `seed.sql`): seed prompt template, step-specific prompt templates
- `docs/implementations/Current/Documentation/Prompt Templating Examples.md`: target document keys, header context schema, document templates
- Any overrides: `domain_specific_prompt_overlays`, project-level overlays

### Recipe: `<recipe_name>`
- **Recipe Description:** `<TBD>`
- **Steps Count:** `<TBD>`

#### Step 1: `<TBD Step Name>`
- **Objective:** `<TBD>`
- **Prompt Type:** `<Planner | Turn>`
- **Prompt Template Name:** `<TBD>`
- **Input Source References:**
  - `<Stage or HeaderContext references>`
- **Output Artifact Description:** `<TBD>`

**Recipe Step Definition JSON (schema):**
```json
{
  "current_step": 1,
  "name": "<TBD>",
  "prompt_template_name": "<TBD>",
  "prompt_type": "<Planner|Turn>",
  "inputs_required": [
    {
      "type": "<contribution|feedback|header_context>",
      "stage_slug": "<TBD>",
      "document_key": "<TBD|*>",
      "required": true
    }
  ],
  "output_type": "<HeaderContext|RenderedDocument|AssembledDocumentJson>",
  "granularity_strategy": "<all_to_one|one_to_one>"
}
```

**Step Outputs Schema Placeholder:**
```json
{
  "system_materials": { "<TBD>": "<TBD>" },
  "context_for_documents": [
    {
      "document_key": "<TBD>",
      "context_to_include": "<TBD>"
    }
  ]
}
```

> Repeat the "Step" subsection for every step in the recipe, incrementing `current_step` and updating the placeholders.

---

#### Stage Skeletons (Unpopulated)

The following skeletons instantiate the template for each stage in the current system. All placeholders must remain unfilled until the population pass.

##### Stage: Thesis (`thesis`)

- Template Source Files:
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for thesis)
  - `Prompt Templating Examples.md` (Thesis section)
  - `dialectic_stage_recipes` thesis recipe migration (if present)

###### Recipe: `<TBD>`
- **Recipe Description:** `<TBD>`
- **Steps Count:** `<TBD>`

###### Step 1: `<TBD>`
- **Objective:** `<TBD>`
- **Prompt Type:** `<Planner | Turn>`
- **Prompt Template Name:** `<TBD>`
- **Input Source References:**
  - `<TBD>`
- **Output Artifact Description:** `<TBD>`

**Recipe Step Definition JSON Placeholder:**
```json
{
  "current_step": 1,
  "name": "<TBD>",
  "prompt_template_name": "<TBD>",
  "prompt_type": "<Planner|Turn>",
  "inputs_required": [],
  "output_type": "<TBD>",
  "granularity_strategy": "<TBD>"
}
```

**Step Outputs Schema Placeholder:**
```json
{
  "system_materials": {},
  "documents": []
}
```

> Add additional steps (`current_step`: 2, 3, …) by copying the placeholders above. Do not populate values yet.

##### Stage: Antithesis (`antithesis`)

- Template Source Files:
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for antithesis)
  - `Prompt Templating Examples.md` (Review/Antithesis section)
  - `dialectic_stage_recipes` antithesis recipe migration (if present)

###### Recipe: `<TBD>`
- **Recipe Description:** `<TBD>`
- **Steps Count:** `<TBD>`

###### Step 1: `<TBD>`
- **Objective:** `<TBD>`
- **Prompt Type:** `<Planner | Turn>`
- **Prompt Template Name:** `<TBD>`
- **Input Source References:**
  - `<TBD>`
- **Output Artifact Description:** `<TBD>`

**Recipe Step Definition JSON Placeholder:**
```json
{
  "current_step": 1,
  "name": "<TBD>",
  "prompt_template_name": "<TBD>",
  "prompt_type": "<Planner|Turn>",
  "inputs_required": [],
  "output_type": "<TBD>",
  "granularity_strategy": "<TBD>"
}
```

**Step Outputs Schema Placeholder:**
```json
{
  "system_materials": {},
  "documents": []
}
```

##### Stage: Synthesis (`synthesis`)

- Template Source Files:
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for synthesis)
  - `Prompt Templating Examples.md` (Synthesis/Refinement section)
  - `dialectic_stage_recipes` synthesis recipe migration (if present)

###### Recipe: `<TBD>`
- **Recipe Description:** `<TBD>`
- **Steps Count:** `<TBD>`

###### Step 1: `<TBD>`
- **Objective:** `<TBD>`
- **Prompt Type:** `<Planner | Turn>`
- **Prompt Template Name:** `<TBD>`
- **Input Source References:**
  - `<TBD>`
- **Output Artifact Description:** `<TBD>`

**Recipe Step Definition JSON Placeholder:**
```json
{
  "current_step": 1,
  "name": "<TBD>",
  "prompt_template_name": "<TBD>",
  "prompt_type": "<Planner|Turn>",
  "inputs_required": [],
  "output_type": "<TBD>",
  "granularity_strategy": "<TBD>"
}
```

**Step Outputs Schema Placeholder:**
```json
{
  "system_materials": {},
  "documents": []
}
```

##### Stage: Parenthesis (`parenthesis`)

- Template Source Files:
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for parenthesis)
  - `Prompt Templating Examples.md` (Planning/Parenthesis section)
  - `dialectic_stage_recipes` parenthesis recipe migration (if present)

###### Recipe: `<TBD>`
- **Recipe Description:** `<TBD>`
- **Steps Count:** `<TBD>`

###### Step 1: `<TBD>`
- **Objective:** `<TBD>`
- **Prompt Type:** `<Planner | Turn>`
- **Prompt Template Name:** `<TBD>`
- **Input Source References:**
  - `<TBD>`
- **Output Artifact Description:** `<TBD>`

**Recipe Step Definition JSON Placeholder:**
```json
{
  "current_step": 1,
  "name": "<TBD>",
  "prompt_template_name": "<TBD>",
  "prompt_type": "<Planner|Turn>",
  "inputs_required": [],
  "output_type": "<TBD>",
  "granularity_strategy": "<TBD>"
}
```

**Step Outputs Schema Placeholder:**
```json
{
  "system_materials": {},
  "documents": []
}
```

##### Stage: Paralysis (`paralysis`)

- Template Source Files:
  - `seed.sql` (`dialectic_stages` / `system_prompts` entries for paralysis)
  - `Prompt Templating Examples.md` (Implementation/Paralysis section)
  - `dialectic_stage_recipes` paralysis recipe migration (if present)

###### Recipe: `<TBD>`
- **Recipe Description:** `<TBD>`
- **Steps Count:** `<TBD>`

###### Step 1: `<TBD>`
- **Objective:** `<TBD>`
- **Prompt Type:** `<Planner | Turn>`
- **Prompt Template Name:** `<TBD>`
- **Input Source References:**
  - `<TBD>`
- **Output Artifact Description:** `<TBD>`

**Recipe Step Definition JSON Placeholder:**
```json
{
  "current_step": 1,
  "name": "<TBD>",
  "prompt_template_name": "<TBD>",
  "prompt_type": "<Planner|Turn>",
  "inputs_required": [],
  "output_type": "<TBD>",
  "granularity_strategy": "<TBD>"
}
```

**Step Outputs Schema Placeholder:**
```json
{
  "system_materials": {},
  "documents": []
}
```

> Additional stages or specialized workflows (e.g., advisor flows) should copy this same structure to ensure consistency.

###### Stage File Structure (Target)
{stage}/
  _work/
    prompts/
      [{model_slug}_{n}_continuation_{c}_]{stage}_{step_name}_prompt.md 
            // Only continuation prompts are unique to a model, so if it needs to continue, it needs the model_slug too. And because the same model can be called more than once within the same stage, they need the iterator {n} to uniquely determine which iteration of the model the prompt is for. 
      [{model_slug}_{n}_continuation_{c}_]{stage}_{document_key}_prompt.md 
            // Only continuation prompts are unique to a model, so if it needs to continue, it needs the model_slug too.And because the same model can be called more than once within the same stage, they need the iterator {n} to uniquely determine which iteration of the model the prompt is for.
    context/
      header_context[_{step_name}].json
    assembled_json/
      {model_slug}_{n}_{step_name}_{lineage_key}[_{match_key}].json 
            // The optional match_key value is for when model_slug is looking at a document that began with lineage_key and was touched by match_key. 
      {model_slug}_{n}_{stage}_manifest.json
  raw_responses/
    {model_slug}_{n}_{stage}_{step_name}[_continuation_{c}]_raw.json 
            // The continuation key and its count value are optional and only used in a continuation. 
    {model_slug}_{n}_{stage}_{document_key}[_continuation_{c}]_raw.json 
            // The continuation key and its count value are optional and only used in a continuation. 
  documents/
    {model_slug}_{n}_{stage}_{document_key}.md
  user_feedback/
    {model_slug}_{n}_{document_key}_feedback.md
  seed_prompt.md  (bootstrap artifact; never sent directly to the model)

*File-naming guidelines*
- All model-generated filenames encode `{model_slug}` and `{n}` (model iterator, for when the same model is used n times within the stage) to avoid collisions without random suffixes.
- Step artifacts `{lineage_key}` (original model) / `{match_key}` (last model) tokens so recipe inputs can reference `{step_name}_{document_key}` deterministically.
- The `header_context[_{step_name}].json` structure ensures that the initial header_context file has a stable name, and any additional header_context files are named for the step that produces (not consumes) them.
- Per-document user feedback replaces the older monolithic `user_feedback_{stage}.md` file.
