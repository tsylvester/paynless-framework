// supabase/functions/dialectic-worker/strategies/helpers.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { groupSourceDocumentsByType, findRelatedContributions } from './helpers.ts';

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
    },
    { 
        id: 'antithesis-1a', 
        contribution_type: 'antithesis',
        stage: 'antithesis',
        target_contribution_id: 'thesis-1',
        document_relationships: { source: 'thesis-1' },
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
    },
    { 
        id: 'antithesis-1b', 
        contribution_type: 'antithesis', 
        stage: 'antithesis',
        target_contribution_id: 'thesis-1',
        document_relationships: { source: 'thesis-1' },
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
    },
    { 
        id: 'antithesis-2a', 
        contribution_type: 'antithesis', 
        stage: 'antithesis',
        target_contribution_id: 'thesis-2',
        document_relationships: { source: 'thesis-2' },
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
    },
    { 
        id: 'synthesis-1', 
        contribution_type: 'synthesis', 
        stage: 'synthesis',
        target_contribution_id: 'some-other-id',
        document_relationships: { source: 'some-other-id' },
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


Deno.test('findRelatedContributions should return documents with a matching source', () => {
    const antitheses = MOCK_SOURCE_DOCUMENTS.filter(doc => doc.stage === 'antithesis');
    const relatedToThesis1 = findRelatedContributions(antitheses, 'thesis-1');
    
    assertEquals(relatedToThesis1.length, 2, "Should find 2 antitheses related to thesis-1");
    assertEquals(relatedToThesis1[0].id, 'antithesis-1a');
    assertEquals(relatedToThesis1[1].id, 'antithesis-1b');

    const relatedToThesis2 = findRelatedContributions(antitheses, 'thesis-2');
    assertEquals(relatedToThesis2.length, 1, "Should find 1 antithesis related to thesis-2");
    assertEquals(relatedToThesis2[0].id, 'antithesis-2a');
});

Deno.test('findRelatedContributions should correctly find documents with a null source', () => {
    const docsWithNullSource = [
        { ...MOCK_SOURCE_DOCUMENTS[0], id: 'rel-null-1', document_relationships: { source: null } },
        { ...MOCK_SOURCE_DOCUMENTS[1], id: 'rel-null-2', document_relationships: { source: null } },
        { ...MOCK_SOURCE_DOCUMENTS[2], id: 'rel-not-null', document_relationships: { source: 'thesis-1' } }
    ] as SourceDocument[];
    
    const related = findRelatedContributions(docsWithNullSource, null);
    
    assertEquals(related.length, 2, "Should find all documents where document_relationships.source is explicitly null");
    assertExists(related.find(d => d.id === 'rel-null-1'));
    assertExists(related.find(d => d.id === 'rel-null-2'));
});

Deno.test('findRelatedContributions should return an empty array if no matches are found', () => {
    const antitheses = MOCK_SOURCE_DOCUMENTS.filter(doc => doc.stage === 'antithesis');
    const relatedToNonExistent = findRelatedContributions(antitheses, 'non-existent-id');
    assertEquals(relatedToNonExistent.length, 0, "Should return an empty array for a non-existent source ID");
});

Deno.test('findRelatedContributions should handle an empty input document array', () => {
    const related = findRelatedContributions([], 'thesis-1');
    assertEquals(related.length, 0, "Should return an empty array when given an empty document list");
}); 