##### Stage: Paralysis (`paralysis`)

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
