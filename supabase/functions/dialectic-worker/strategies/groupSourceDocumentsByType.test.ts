import { 
    assertEquals, 
    assertExists
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    SourceDocument, 
} from '../../dialectic-service/dialectic.interface.ts';
import { 
    groupSourceDocumentsByType, 
} from './helpers.ts';

// Mock Data
const MOCK_SOURCE_DOCUMENTS: SourceDocument[] = [
    { 
        id: 'thesis-1', 
        contribution_type: 'thesis', 
        stage: 'thesis',
        target_contribution_id: null,
        document_relationships: null,
        citations: [],
        created_at: '',
        edit_version: 0,
        error: null,
        file_name: '',
        is_latest_edit: false,
        model_id: '',
        model_name: '',
        raw_response_storage_path: '',
        session_id: '',
        size_bytes: 0,
        storage_bucket: '',
        storage_path: '',
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        user_id: '',
        updated_at: '',
        mime_type: 'text/plain',
        original_model_contribution_id: null,
        prompt_template_id_used: '',
        seed_prompt_url: null,
        iteration_number: 0,
        content: '',
        is_header: false,
        source_prompt_resource_id: null,
    },
    { 
        id: 'thesis-2', 
        contribution_type: 'thesis', 
        stage: 'thesis',
        target_contribution_id: null, 
        document_relationships: null,
        citations: [], 
        created_at: '', 
        edit_version: 0, 
        error: null, 
        file_name: '', 
        is_latest_edit: false, 
        model_id: '', 
        model_name: '', 
        raw_response_storage_path: '', 
        session_id: '', 
        size_bytes: 0, 
        storage_bucket: '', 
        storage_path: '', 
        tokens_used_input: 0, 
        tokens_used_output: 0, 
        processing_time_ms: 0, 
        user_id: '', 
        updated_at: '', 
        mime_type: 'text/plain',
        original_model_contribution_id: null,
        prompt_template_id_used: '',
        seed_prompt_url: null,
        iteration_number: 0,
        content: '',
        is_header: false,
        source_prompt_resource_id: null,
    },
    { 
        id: 'antithesis-1a', 
        contribution_type: 'antithesis',
        stage: 'antithesis',
        target_contribution_id: 'thesis-1',
        document_relationships: { source_group: 'thesis-1' },
        citations: [],
        created_at: '',
        edit_version: 0,
        error: null,
        file_name: '',
        is_latest_edit: false,
        model_id: '',
        model_name: '',
        raw_response_storage_path: '',
        session_id: '',
        size_bytes: 0,
        storage_bucket: '',
        storage_path: '',
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        user_id: '',
        updated_at: '',
        mime_type: 'text/plain',
        original_model_contribution_id: null,
        prompt_template_id_used: '',
        seed_prompt_url: null,
        iteration_number: 0,
        content: '',
        is_header: false,
        source_prompt_resource_id: null,
    },
    { 
        id: 'antithesis-1b', 
        contribution_type: 'antithesis', 
        stage: 'antithesis',
        target_contribution_id: 'thesis-1',
        document_relationships: { source_group: 'thesis-1' },
        citations: [],
        created_at: '',
        edit_version: 0,
        error: null,
        file_name: '',
        is_latest_edit: false,
        model_id: '',
        model_name: '',
        raw_response_storage_path: '',
        session_id: '',
        size_bytes: 0,
        storage_bucket: '',
        storage_path: '',
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        user_id: '',
        updated_at: '',
        mime_type: 'text/plain',
        original_model_contribution_id: null,
        prompt_template_id_used: '',
        seed_prompt_url: null,
        iteration_number: 0,
        content: '',
        is_header: false,
        source_prompt_resource_id: null,
    },
    { 
        id: 'antithesis-2a', 
        contribution_type: 'antithesis', 
        stage: 'antithesis',
        target_contribution_id: 'thesis-2',
        document_relationships: { source_group: 'thesis-2' },
        citations: [],
        created_at: '',
        edit_version: 0,
        error: null,
        file_name: '',
        is_latest_edit: false,
        model_id: '',
        model_name: '',
        raw_response_storage_path: '',
        session_id: '',
        size_bytes: 0,
        storage_bucket: '',
        storage_path: '',
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        user_id: '',
        updated_at: '',
        mime_type: 'text/plain',
        original_model_contribution_id: null,
        prompt_template_id_used: '',
        seed_prompt_url: null,
        iteration_number: 0,
        content: '',
        is_header: false,
        source_prompt_resource_id: null,
    },
    { 
        id: 'synthesis-1', 
        contribution_type: 'synthesis', 
        stage: 'synthesis',
        target_contribution_id: 'some-other-id',
        document_relationships: { source_group: 'some-other-id' },
        citations: [],
        created_at: '',
        edit_version: 0,
        error: null,
        file_name: '',
        is_latest_edit: false,
        model_id: '',
        model_name: '',
        raw_response_storage_path: '',
        session_id: '',
        size_bytes: 0,
        storage_bucket: '',
        storage_path: '',
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        user_id: '',
        updated_at: '',
        mime_type: 'text/plain',
        original_model_contribution_id: null,
        prompt_template_id_used: '',
        seed_prompt_url: null,
        iteration_number: 0,
        content: '',
        is_header: false,
        source_prompt_resource_id: null,
    },
];

const MOCK_NULL_TYPE_DOCUMENT: SourceDocument[] = [
    {
        id: 'null-type-1',
        contribution_type: null,
        target_contribution_id: 'thesis-1',
    },
    {
        id: 'null-type-2',
        contribution_type: null,
        target_contribution_id: 'thesis-2',
    },
] as unknown as SourceDocument[];


Deno.test('groupSourceDocumentsByType should correctly group documents by their stage', () => {
    const grouped = groupSourceDocumentsByType(MOCK_SOURCE_DOCUMENTS);

    assertExists(grouped.thesis, "Thesis group should exist");
    assertEquals(grouped.thesis.length, 2, "Should be 2 thesis documents");
    assertEquals(grouped.thesis[0].id, 'thesis-1');
    assertEquals(grouped.thesis[1].id, 'thesis-2');

    assertExists(grouped.antithesis, "Antithesis group should exist");
    assertEquals(grouped.antithesis.length, 3, "Should be 3 antithesis documents");
    assertEquals(grouped.antithesis[0].id, 'antithesis-1a');

    assertExists(grouped.synthesis, "Synthesis group should exist");
    assertEquals(grouped.synthesis.length, 1, "Should be 1 synthesis document");
    assertEquals(grouped.synthesis[0].id, 'synthesis-1');
    
    assertEquals(Object.keys(grouped).length, 3, "Should only contain keys for existing types");
});

Deno.test('groupSourceDocumentsByType should handle an empty input array', () => {
    const grouped = groupSourceDocumentsByType([]);
    assertEquals(Object.keys(grouped).length, 0, "Should return an empty object for empty input");
});

Deno.test('groupSourceDocumentsByType should handle an array with only one type of document', () => {
    const onlyTheses = MOCK_SOURCE_DOCUMENTS.filter(d => d.stage === 'thesis');
    const grouped = groupSourceDocumentsByType(onlyTheses);
    
    assertEquals(Object.keys(grouped).length, 1, "Should only have one key for 'thesis'");
    assertExists(grouped.thesis);
    assertEquals(grouped.thesis.length, 2);
});

Deno.test('groupSourceDocumentsByType should return an empty object if all documents have null contribution_type', () => {
    const grouped = groupSourceDocumentsByType(MOCK_NULL_TYPE_DOCUMENT);
    assertEquals(Object.keys(grouped).length, 0);
});
