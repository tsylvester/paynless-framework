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

Deno.test('createCanonicalPathParams extracts sourceAnchorModelSlug from HeaderContext storage path for antithesis patterns', () => {
    const mockAntithesisHeaderContext: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'header_context',
        model_name: 'claude',
        storage_path: 'project-123/session_abc12345/iteration_1/2_antithesis/_work/context',
        file_name: 'claude_critiquing_gpt-4_98765432_0_header_context.json',
        id: 'header-context-uuid-123',
        attempt_count: 0,
    };
    
    const params = createCanonicalPathParams(
        [mockAntithesisHeaderContext],
        FileType.TurnPrompt,
        mockAntithesisHeaderContext,
        'antithesis'
    );
    
    assertEquals(params.sourceAnchorModelSlug, 'gpt-4');
});

Deno.test('createCanonicalPathParams uses model_name for simple HeaderContext when no critiquing pattern exists', () => {
    const mockSimpleHeaderContext: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'header_context',
        model_name: 'gpt-4',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/_work/context',
        file_name: 'gpt-4_0_header_context.json',
        id: 'header-context-uuid-456',
        attempt_count: 0,
    };
    
    const params = createCanonicalPathParams(
        [mockSimpleHeaderContext],
        FileType.TurnPrompt,
        mockSimpleHeaderContext,
        'thesis'
    );
    
    assertEquals(params.sourceAnchorModelSlug, 'gpt-4');
});

Deno.test('createCanonicalPathParams extracts sourceAnchorModelSlug from rendered document filename when model_name is null', () => {
    const mockRenderedDocument: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'rendered_document',
        model_name: null,
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        file_name: 'mock-model_0_business_case.md',
        id: 'rendered-doc-uuid-789',
        attempt_count: 0,
        stage: 'thesis',
    };
    
    const params = createCanonicalPathParams(
        [mockRenderedDocument],
        FileType.HeaderContext,
        mockRenderedDocument,
        'antithesis'
    );
    
    assertExists(params.sourceAnchorModelSlug);
    assertEquals(params.sourceAnchorModelSlug, 'mock-model');
});

Deno.test('createCanonicalPathParams extracts sourceAnchorModelSlug from rendered document filename when creating HeaderContext for antithesis stage even when model_name exists', () => {
    // When creating HeaderContext for antithesis stage, extract from filename even if model_name exists
    // because model_name may be incorrect or represent the critiquing model, not the source model
    const mockRenderedDocument: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'rendered_document',
        model_name: 'wrong-model', // Should be ignored, extract from filename instead
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        file_name: 'mock-model_0_business_case.md', // Filename contains correct source model
        id: 'rendered-doc-uuid-789',
        attempt_count: 0,
        stage: 'thesis',
    };
    
    const params = createCanonicalPathParams(
        [mockRenderedDocument],
        FileType.HeaderContext,
        mockRenderedDocument,
        'antithesis'
    );
    
    // Should extract 'mock-model' from filename, NOT use 'wrong-model' from model_name
    assertExists(params.sourceAnchorModelSlug);
    assertEquals(params.sourceAnchorModelSlug, 'mock-model', 'Should extract sourceAnchorModelSlug from filename when creating HeaderContext for antithesis stage, ignoring model_name');
});

Deno.test('createCanonicalPathParams extracts sourceAttemptCount from rendered document filename when attempt_count is missing', () => {
    const mockRenderedDocument: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'rendered_document',
        model_name: null,
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        file_name: 'mock-model_7_business_case.md',
        id: 'rendered-doc-uuid-attempt-7',
        attempt_count: undefined,
        stage: 'thesis',
    };

    const params = createCanonicalPathParams(
        [mockRenderedDocument],
        FileType.HeaderContext,
        mockRenderedDocument,
        'antithesis'
    );

    assertExists(params.sourceAttemptCount);
    assertEquals(params.sourceAttemptCount, 7);
});

Deno.test('createCanonicalPathParams extracts sourceAnchorModelSlug from rendered document filename when creating HeaderContext for antithesis stage (model_name is null)', () => {
    const mockRenderedDocumentFromThesis: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'thesis',
        model_name: null,
        storage_path: 'project-123/session_abc12345/iteration_1/1_thesis/documents',
        file_name: 'gpt-4_0_business_case.md',
        id: 'rendered-doc-thesis-uuid',
        attempt_count: 0,
        stage: 'thesis',
    };
    
    const params = createCanonicalPathParams(
        [mockRenderedDocumentFromThesis],
        FileType.HeaderContext,
        mockRenderedDocumentFromThesis,
        'antithesis'
    );
    
    assertExists(params.sourceAnchorModelSlug);
    assertEquals(params.sourceAnchorModelSlug, 'gpt-4');
});

Deno.test('createCanonicalPathParams extracts sourceAnchorModelSlug from filename when creating HeaderContext for antithesis stage even when model_name exists', () => {
    // When creating HeaderContext for antithesis stage, we must extract sourceAnchorModelSlug
    // from the filename (which contains the original source model), NOT from model_name
    // (which may be the critiquing model or incorrect). This ensures the critiquing pattern
    // uses the correct source model slug.
    const mockRenderedDocumentFromThesis: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'thesis',
        model_name: 'claude', // This is the critiquing model, but we need the source model from filename
        storage_path: 'project-123/session_abc12345/iteration_1/1_thesis/documents',
        file_name: 'gpt-4_0_business_case.md', // Filename contains the original source model 'gpt-4'
        id: 'rendered-doc-thesis-uuid',
        attempt_count: 0,
        stage: 'thesis',
    };
    
    const params = createCanonicalPathParams(
        [mockRenderedDocumentFromThesis],
        FileType.HeaderContext,
        mockRenderedDocumentFromThesis,
        'antithesis'
    );
    
    // Should extract 'gpt-4' from filename, NOT use 'claude' from model_name
    assertExists(params.sourceAnchorModelSlug);
    assertEquals(params.sourceAnchorModelSlug, 'gpt-4', 'Should extract sourceAnchorModelSlug from filename when creating HeaderContext for antithesis stage, ignoring model_name');
});