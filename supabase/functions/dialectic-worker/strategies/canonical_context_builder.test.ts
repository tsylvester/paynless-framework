// supabase/functions/dialectic-worker/strategies/canonical_context_builder.test.ts
import { assertEquals, assertExists, assertThrows } from "jsr:@std/assert";
import { createCanonicalPathParams } from "./canonical_context_builder.ts";
import { SourceDocument, ContributionType } from "../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";

const mockSourceDocument1: SourceDocument = {
    model_name: 'a-model',
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: {},
    edit_version: 0,
    error: null,
    file_name: null,
    id: 'thesis-uuid-123456789',
    attempt_count: 5,
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
    is_header: false,
    source_prompt_resource_id: null,
    }

const mockSourceDocument2: SourceDocument = {   
    model_name: 'b-model',
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: {},
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
    is_header: false,
    source_prompt_resource_id: null,
}

const mockSourceDocument3: SourceDocument = {
    model_name: 'c-model',
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: {},
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
    is_header: false,
    source_prompt_resource_id: null,
}

const mockSourceDocumentNoModelName: SourceDocument = {
    model_name: null,
    contribution_type: 'thesis',
    citations: [],
    created_at: '',
    document_relationships: {},
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
    is_header: false,
    source_prompt_resource_id: null,
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
    const stage: ContributionType = 'thesis';
    const params = createCanonicalPathParams(sourceDocs, 'thesis', mockSourceDocument1, stage);

    assertEquals(params.sourceModelSlugs, ['a-model', 'b-model', 'c-model']);
});

Deno.test('createCanonicalPathParams handles missing model names', () => {
    const sourceDocs: SourceDocument[] = [
        mockSourceDocumentNoModelName,
        mockSourceDocument2,
        mockSourceDocument3,
    ];
    const stage: ContributionType = 'thesis';
    const params = createCanonicalPathParams(sourceDocs, 'thesis', mockSourceDocument2, stage);

    assertEquals(params.sourceModelSlugs, ['b-model', 'c-model']);
});

Deno.test('createCanonicalPathParams identifies anchor document properties', () => {
    const sourceDocs: SourceDocument[] = [
        mockSourceDocument1,
        mockAntithesisDocument,
    ];
    const anchorDoc = mockSourceDocument1;
    const stage: ContributionType = 'synthesis';
    const params = createCanonicalPathParams(sourceDocs, 'pairwise_synthesis_chunk', anchorDoc, stage);

    assertExists(params.sourceAnchorType);
    assertEquals(params.sourceAnchorType, 'thesis');
    assertExists(params.sourceAnchorModelSlug);
    assertEquals(params.sourceAnchorModelSlug, 'a-model');
});


Deno.test('createCanonicalPathParams identifies paired document properties', () => {
    const sourceDocs: SourceDocument[] = [
        mockSourceDocument1, // The anchor document
        mockAntithesisDocument, // The paired document
    ];
    const anchorDoc = mockSourceDocument1;
    const stage: ContributionType = 'synthesis';
    const params = createCanonicalPathParams(sourceDocs, 'pairwise_synthesis_chunk', anchorDoc, stage);

    assertExists(params.pairedModelSlug);
    assertEquals(params.pairedModelSlug, 'b-model');
});

Deno.test('createCanonicalPathParams identifies anchor document attempt count', () => {
    const sourceDocs: SourceDocument[] = [
        mockSourceDocument1,
    ];
    const anchorDoc = mockSourceDocument1;
    const stage: ContributionType = 'antithesis';
    const params = createCanonicalPathParams(sourceDocs, 'antithesis', anchorDoc, stage);

    assertExists(params.sourceAttemptCount);
    assertEquals(params.sourceAttemptCount, 5);
});

Deno.test('createCanonicalPathParams handles empty source docs array', () => {
    const sourceDocs: SourceDocument[] = [];
    const stage: ContributionType = 'thesis';
    const params = createCanonicalPathParams(sourceDocs, 'thesis', mockSourceDocument1, stage);

    assertEquals(params.sourceModelSlugs, undefined);
    assertEquals(params.sourceAnchorType, 'thesis');
    assertEquals(params.sourceAnchorModelSlug, 'a-model');
    assertEquals(params.contributionType, 'thesis');
});

Deno.test('createCanonicalPathParams uses stage for specific FileType when appropriate', () => {
    const sourceDocs: SourceDocument[] = [mockSourceDocument1];
    const stage: ContributionType = 'antithesis'; // The stage should dictate the type
    const params = createCanonicalPathParams(sourceDocs, FileType.business_case, mockSourceDocument1, stage);
    assertEquals(params.contributionType, 'antithesis');
});

Deno.test('createCanonicalPathParams uses stage for generic FileType', () => {
    const sourceDocs: SourceDocument[] = [mockSourceDocument1];
    const stage: ContributionType = 'synthesis'; // The stage is the only source of truth here
    const params = createCanonicalPathParams(sourceDocs, FileType.business_case, mockSourceDocument1, stage);
    assertEquals(params.contributionType, 'synthesis');
});

Deno.test('createCanonicalPathParams preserves intermediate ContributionType regardless of stage', () => {
    const sourceDocs: SourceDocument[] = [mockSourceDocument1, mockAntithesisDocument];
    const stage: ContributionType = 'synthesis'; // Stage is synthesis
    // But the output type is a specific, non-stage-related intermediate artifact
    const params = createCanonicalPathParams(sourceDocs, FileType.PairwiseSynthesisChunk, mockSourceDocument1, stage);
    assertEquals(params.contributionType, 'pairwise_synthesis_chunk');
});
