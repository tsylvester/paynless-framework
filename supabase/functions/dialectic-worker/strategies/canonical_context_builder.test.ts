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
    file_name: 'a-model_5_business_case.md',
    id: 'thesis-uuid-123456789',
    attempt_count: 5,
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
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
    file_name: 'b-model_0_feature_spec.md',
    id: '',
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
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
    file_name: 'c-model_0_technical_spec.md',
    id: '',
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
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
    file_name: 'd-model_0_architecture_doc.md',
    id: '',
    is_latest_edit: false,
    iteration_number: 0,
    mime_type: '',
    size_bytes: 0,
    storage_bucket: '',
    storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
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

    // With universal extraction, all docs extract from filename when model_name is missing
    assertEquals(params.sourceModelSlugs, ['b-model', 'c-model', 'd-model']);
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

Deno.test('createCanonicalPathParams extracts sourceAnchorModelSlug from filename for thesis document anchor regardless of output type', () => {
    // Universal extraction should work for ANY output type, not just HeaderContext
    // This tests that filename-based extraction works for synthesis output using thesis anchor
    const mockThesisAnchor: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'thesis',
        model_name: 'wrong-model', // Should be ignored in universal extraction
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        file_name: 'correct-model_0_business_case.md', // Filename contains correct source model
        id: 'thesis-anchor-uuid',
        attempt_count: 0,
        stage: 'thesis',
    };
    
    const params = createCanonicalPathParams(
        [mockThesisAnchor],
        'synthesis', // NOT HeaderContext - testing universal extraction
        mockThesisAnchor,
        'synthesis'
    );
    
    // Should extract 'correct-model' from filename, NOT use 'wrong-model' from model_name
    // This proves universal extraction works for any output type, not just HeaderContext
    assertExists(params.sourceAnchorModelSlug);
    assertEquals(params.sourceAnchorModelSlug, 'correct-model', 'Should extract sourceAnchorModelSlug from filename for any output type (synthesis), not just HeaderContext');
});

Deno.test('createCanonicalPathParams extracts sourceAttemptCount from filename when attempt_count field is missing', () => {
    // Universal extraction should work for ANY anchor type when DB field is missing
    // This tests that attempt count extraction works for non-header_context anchors
    const mockAnchor: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'thesis',
        model_name: 'some-model',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        file_name: 'model_7_document.md', // Filename contains attempt count 7
        id: 'anchor-uuid',
        attempt_count: undefined, // DB field is missing
        stage: 'thesis',
    };
    
    const params = createCanonicalPathParams(
        [mockAnchor],
        'synthesis', // Any output type
        mockAnchor,
        'synthesis'
    );
    
    // Should extract attempt count 7 from filename when DB field is undefined
    assertExists(params.sourceAttemptCount);
    assertEquals(params.sourceAttemptCount, 7, 'Should extract sourceAttemptCount from filename when attempt_count field is missing');
});

Deno.test('createCanonicalPathParams throws error when anchor document missing storage_path or file_name', () => {
    // No fallbacks - missing data must be fixed at source
    // System must fail loudly when anchor lacks canonical filename
    // NOTE: This test only applies when anchorDoc is non-null
    const mockAnchorWithoutFile: SourceDocument = {
        ...mockSourceDocument1,
        contribution_type: 'thesis',
        model_name: 'some-model',
        storage_path: '', // Missing storage path
        file_name: null, // Missing filename
        id: 'anchor-without-file-uuid',
        attempt_count: 0,
        stage: 'thesis',
    };
    
    // Should throw error when required fields are missing (only applies when anchorDoc is non-null)
    assertThrows(
        () => {
            createCanonicalPathParams(
                [mockAnchorWithoutFile],
                'synthesis',
                mockAnchorWithoutFile,
                'synthesis'
            );
        },
        Error,
        'Anchor document missing required storage_path or file_name',
        'Should throw error when anchor document lacks canonical filename (no fallbacks) - only applies when anchorDoc is non-null'
    );
});

Deno.test('createCanonicalPathParams handles null anchorDoc by leaving sourceAnchorModelSlug undefined', () => {
    // When anchorDoc is null (recipe has zero document-type inputs), sourceAnchorModelSlug should be undefined
    // No fallback derivation - there is no anchor, so there are no anchor-derived values
    const sourceDocs: SourceDocument[] = [
        mockSourceDocument1,
        mockSourceDocument2,
    ];
    const stage: ContributionType = 'thesis';
    const params = createCanonicalPathParams(sourceDocs, 'thesis', null, stage);
    
    assertEquals(params.sourceAnchorModelSlug, undefined, 'sourceAnchorModelSlug should be undefined when anchorDoc is null');
});

Deno.test('createCanonicalPathParams handles null anchorDoc with empty sourceDocs array', () => {
    // When anchorDoc is null and sourceDocs is empty, function should return valid result without throwing
    const sourceDocs: SourceDocument[] = [];
    const stage: ContributionType = 'thesis';
    const params = createCanonicalPathParams(sourceDocs, 'thesis', null, stage);
    
    assertEquals(params.sourceModelSlugs, undefined);
    assertEquals(params.sourceAnchorModelSlug, undefined, 'sourceAnchorModelSlug should be undefined when anchorDoc is null');
    assertEquals(params.contributionType, 'thesis');
});

Deno.test('createCanonicalPathParams handles null anchorDoc for THESIS stage', () => {
    // THESIS stage steps may have zero document-type inputs (only seed_prompt or header_context)
    // When anchorDoc is null, function should not throw and sourceAnchorModelSlug should be undefined
    const seedPromptDoc: SourceDocument = {
        id: 'seed-prompt-doc-id',
        contribution_type: 'seed_prompt',
        content: 'Seed prompt content',
        citations: [],
        created_at: '2024-01-01T00:00:00Z',
        document_relationships: {},
        edit_version: 0,
        error: null,
        file_name: null,
        is_latest_edit: false,
        iteration_number: 0,
        mime_type: 'text/plain',
        size_bytes: 0,
        storage_bucket: 'dialectic-contributions',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis',
        user_id: null,
        original_model_contribution_id: null,
        processing_time_ms: 0,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        session_id: 'session-abc',
        stage: 'thesis',
        target_contribution_id: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        model_id: '',
        updated_at: '2024-01-01T00:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
        model_name: null,
        attempt_count: 0,
    };
    
    const sourceDocs: SourceDocument[] = [seedPromptDoc];
    const stage: ContributionType = 'thesis';
    const params = createCanonicalPathParams(sourceDocs, 'thesis', null, stage);
    
    assertEquals(params.sourceAnchorModelSlug, undefined, 'sourceAnchorModelSlug should be undefined when anchorDoc is null for THESIS stage');
    assertEquals(params.contributionType, 'thesis');
});