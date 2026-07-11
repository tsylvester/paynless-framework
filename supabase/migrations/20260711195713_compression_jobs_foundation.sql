alter type public.dialectic_job_type_enum add value if not exists 'COMPRESS';

INSERT INTO public.system_prompts (
    id,
    name,
    prompt_text,
    is_active,
    version,
    description,
    user_selectable,
    document_template_id
) VALUES (
    gen_random_uuid(),
    'compression_context_v1',
    'You are compressing a source that is context for a downstream agent. That agent will use the compressed result, alongside other documents, to populate the target schema below. Your output must preserve every fact that could contribute to any field of the target schema.

{{#section:json_mode}}
The source is a completed JSON structure. Return EXACTLY the same JSON structure with its values compressed:
- Every key must be present in your output. Do not add, rename, remove, or reorder keys.
- Object shapes must not change.
- Arrays may lose low-value elements; keep every element that could contribute to the target schema.
- Condense string values in place.
Return ONLY the compressed JSON.
{{/section:json_mode}}
{{#section:text_mode}}
The source is a document. Return ONLY the compressed document text.
{{/section:text_mode}}

Remove: duplicated information, examples, narrative, historical discussion, intermediate reasoning.
Preserve: requirements, constraints, assumptions, accepted decisions, identifiers, user corrections, unresolved questions.

Stage intent: {{stage_intent}}

Target schema (what the downstream agent must populate):
{{outputs_required}}

{{#section:chunk_context}}
The source is chunk {{chunk_index}} of {{chunk_total}} of a larger document. Compress this chunk on its own terms; do not attempt to summarize the whole document.
{{/section:chunk_context}}

Source:
{{source_content}}',
    true,
    1,
    'Mode-aware compression prompt template for COMPRESS jobs: preserves target-schema-relevant facts; JSON mode enforces exact-structure return',
    false,
    null
)
ON CONFLICT (name) DO UPDATE
    SET prompt_text = EXCLUDED.prompt_text,
        is_active = EXCLUDED.is_active,
        version = EXCLUDED.version,
        description = EXCLUDED.description,
        user_selectable = EXCLUDED.user_selectable,
        document_template_id = EXCLUDED.document_template_id;
