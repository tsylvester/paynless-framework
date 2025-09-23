# Prompt Types and Definitions

This document provides a canonical definition for the different types of prompts used in the document-centric generation system. These definitions are grounded in the project's source code and TDD work plan to ensure they reflect the actual implementation.

---

### 1. Seed Prompt

*   **Purpose:** To initiate an entire stage of the dialectic process. It serves as the single, comprehensive input package for the stage, containing all necessary context for the first step of generation.

*   **When It's Used:** It is generated and saved exactly once per stage, per session, per iteration by the service that kicks off the stage (e.g., `startSession.ts` or `submitStageResponses.ts`). It is the prompt associated with:
    1.  A simple, non-recipe job.
    2.  The **first step** (`current_step: 1`) of a multi-step `DialecticStageRecipe`.

*   **Construction Details:** The `PromptAssembler` service constructs the Seed Prompt by combining the following components:
    1.  **Original User Input:** The most critical element, the `original_user_request` stored in `dialectic_project_resources` as a markdown file explaining what the user actually wants from the agent.   
    2.  **Base Template:** The `prompt_text` from the `system_prompts` table corresponding to the current stage that contextualizes the user's request into a specific domain and stage.
    3.  **Document Templates:** The `expected_output_template_ids` (`uuid[]`) are retrieved from the `dialectic_stages` table. The assembler then fetches the content of each corresponding template file from storage (referenced in `dialectic_document_templates`) and injects it into the base template.
    4.  **Overlays:** The `overlay_values` (`JSONB`) are fetched from the `domain_specific_prompt_overlays` table and merged into the template.
    5.  **Dynamic Context:** The `gatherContext` method is called to fetch and format prior stage artifacts (`dialectic_contributions`), user feedback (`dialectic_feedback`), and other project-level resources.

*   **Associated Artifact:**
    *   **Path:** `{project_id}/session_{...}/iteration_{...}/{stage_dir}/`
    *   **Filename:** `seed_prompt.md`

---

### 2. Planner Prompt

*   **Purpose:** To orchestrate a specific, complex *step* within a multi-step stage recipe. Its primary function is to generate a `HeaderContext` (the shared plan for all documents in that step) and a list of child `'EXECUTE'` jobs. It plans the work; it does not generate the final document content itself.

*   **When It's Used:** It is assembled at runtime by the worker during the execution of a parent `'PLAN'` job, specifically when the `current_step` in the job's payload is **greater than 1**. The specific prompt template used is determined by the `prompt_template_name` in the `DialecticRecipeStep` for the current step.

*   **Construction Details:** The `planComplexStage` function orchestrates the construction of the Planner Prompt:
    1.  **Base Template:** The `prompt_template_name` from the current `DialecticRecipeStep` is used to fetch the correct base `prompt_text` from the `system_prompts` table.
    2.  **Dynamic Context:** The `findSourceDocuments` utility is used to gather a focused set of input artifacts (e.g., outputs from Step 1 of the current stage) as defined by the `inputs_required` property of the `DialecticRecipeStep`.
    3.  These components are then assembled into the final prompt text before being sent to the model.

*   **Associated Artifact:**
    *   **Path:** `{project_id}/session_{...}/iteration_{...}/{stage_dir}/_work/prompts/`
    *   **Filename:** `{model_slug}_{n}[_{step_name}]_planner_prompt.md`
    *   The optional `[_{step_name}]` segment is derived from the `name` of the `DialecticRecipeStep` and is critical for preventing filename collisions in stages that have multiple planning steps.

---

### 3. Turn Prompt

*   **Purpose:** To execute a single, discrete generation task for a specific document or a continuation of that document. Its output is the actual content (or a chunk of content) for a single artifact. It *does* the work planned by the `PlannerPrompt`.

*   **When It's Used:** It is assembled at runtime by the worker during the execution of a child `'EXECUTE'` job.

*   **Construction Details:** The `PromptAssembler` constructs the Turn Prompt by combining:
    1.  **Header Context:** The shared `HeaderContext` (the `SystemMaterials` object) is the primary input. It is fetched from its file in storage, referenced via the `header_context_resource_id` in the job payload.
    2.  **Document Template:** The specific template file for the document being generated (e.g., `synthesis_product_requirements_document.md`) is fetched from storage. The `HeaderContext` itself contains the `files_to_generate` array that maps a `document_key` to a `template_filename`.
    3.  **Document-Specific Data:** The job payload contains a document-specific data slice that is injected into the template.
    4.  **Variants (Continuations):** For a `Continuation Turn Prompt`, the `continueJob` logic uses the `HeaderContext` to ensure the agent understands the global context of the document. The local context is provided by a direct instruction (e.g., "Continue the following JSON object...") that prepends it to the partial, incomplete text from the previous turn's response. This ensures the model understands its overall objective from `HeaderContext` and its specific location to continue from the previous turn's response. 
        *   Note, in the event that the model turn is an incomplete json, for example if a network error truncates the response, the `Continuation Turn Prompt` must supply as much of the received json as possible. 

*   **Associated Artifact:**
    *   **Path:** `{project_id}/session_{...}/iteration_{...}/{stage_dir}/_work/prompts/`
    *   **Filename:** `{model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md`
    *   The `_{document_key}` segment is essential for identifying which document this prompt is for.
    *   The optional `[_continuation_{c}]` segment is added for continuation turns, ensuring each turn's specific prompt is saved without overwriting the previous one.
