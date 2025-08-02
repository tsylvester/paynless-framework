// supabase/functions/dialectic-worker/strategies/canonical_context_builder.test.ts
import { assertEquals, assertExists } from "jsr:@std/assert";
import { createCanonicalPathParams } from "./canonical_context_builder.ts";
import { SourceDocument } from "../../dialectic-service/dialectic.interface.ts";

const mockSourceDocument1: SourceDocument = {
    model_name: 'a-model',
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: [],
    edit_version: 0,
    error: null,
    file_name: null,
    id: '',
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: '',
    user_id: null,
    content: '',
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: '',
    seed_prompt_url: '',
    session_id: '',
    stage: '',
    target_contribution_id: '',
    tokens_used_input: 0,
    tokens_used_output: 0,
    model_id: '',
    updated_at: '',
}

const mockSourceDocument2: SourceDocument = {   
    model_name: 'b-model',
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: [],
    edit_version: 0,
    error: null,
    file_name: null,
    id: '',
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: '',
    user_id: null,
    content: '',
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: '',
    seed_prompt_url: '',
    session_id: '',
    stage: '',
    target_contribution_id: '',
    tokens_used_input: 0,
    tokens_used_output: 0,
    model_id: '',
    updated_at: '',
}

const mockSourceDocument3: SourceDocument = {
    model_name: 'c-model',
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: [],
    edit_version: 0,
    error: null,
    file_name: null,
    id: '',
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: '',
    user_id: null,
    content: '',
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: '',
    seed_prompt_url: '',
    session_id: '',
    stage: '',
    target_contribution_id: '',
    tokens_used_input: 0,
    tokens_used_output: 0,
    model_id: '',
    updated_at: '',
}

const mockSourceDocumentNoModelName: SourceDocument = {
    model_name: null,
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: [],
    edit_version: 0,
    error: null,
    file_name: null,
    id: '',
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: '',
    user_id: null,
    content: '',
    original_model_contribution_id: null,
    processing_time_ms: 0,
    prompt_template_id_used: null,
    raw_response_storage_path: '',
    seed_prompt_url: '',
    session_id: '',
    stage: '',
    target_contribution_id: '',
    tokens_used_input: 0,
    tokens_used_output: 0,
    model_id: '',
    updated_at: '',
}

const mockAntithesisDocument: SourceDocument = {
    ...mockSourceDocument2, // copy base properties
    contribution_type: 'antithesis',
    id: 'antithesis-uuid-abcdefg'
};

Deno.test('createCanonicalPathParams correctly sorts model slugs', () => {
    const sourceDocs: SourceDocument[] = [
        mockSourceDocument1,
        mockSourceDocument2,
        mockSourceDocument3,
    ];

    const params = createCanonicalPathParams(sourceDocs, 'test_type');

    assertEquals(params.sourceModelSlugs, ['a-model', 'b-model', 'c-model']);
});

Deno.test('createCanonicalPathParams handles missing model names', () => {
    const sourceDocs: SourceDocument[] = [
        mockSourceDocumentNoModelName,
        mockSourceDocument2,
        mockSourceDocument3,
    ];

    const params = createCanonicalPathParams(sourceDocs, 'test_type');

    assertEquals(params.sourceModelSlugs, ['b-model', 'c-model']);
});

Deno.test('createCanonicalPathParams identifies primary source ID', () => {
    const sourceDocs: SourceDocument[] = [
        { ...mockSourceDocument1, id: 'thesis-uuid-123456789' },
        mockAntithesisDocument,
    ];

    const params = createCanonicalPathParams(sourceDocs, 'test_type');

    assertExists(params.sourceContributionIdShort);
    assertEquals(params.sourceContributionIdShort, 'thesisuu');
});

Deno.test('createCanonicalPathParams handles no primary source', () => {
    const sourceDocs: SourceDocument[] = [
        { ...mockSourceDocument2, contribution_type: 'antithesis' },
        { ...mockSourceDocument3, contribution_type: 'synthesis' },
    ];

    const params = createCanonicalPathParams(sourceDocs, 'test_type');

    assertEquals(params.sourceContributionIdShort, undefined);
});

Deno.test('createCanonicalPathParams handles empty source docs array', () => {
    const sourceDocs: SourceDocument[] = [];
    const params = createCanonicalPathParams(sourceDocs, 'test_type');

    assertEquals(params.sourceModelSlugs, undefined);
    assertEquals(params.sourceContributionIdShort, undefined);
    assertEquals(params.contributionType, 'test_type');
});
