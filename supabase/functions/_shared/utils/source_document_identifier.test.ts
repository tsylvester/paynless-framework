import {
    assertEquals,
    assertThrows,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { extractSourceDocumentIdentifier } from './source_document_identifier.ts';
import type { SourceDocument } from '../../dialectic-service/dialectic.interface.ts';

Deno.test('extractSourceDocumentIdentifier - extracts document_relationships.source_group from job payload', () => {
    const payload = {
        document_relationships: {
            source_group: 'thesis-doc-1',
        },
    };
    
    const result = extractSourceDocumentIdentifier(payload);
    assertEquals(result, 'thesis-doc-1');
});

Deno.test('extractSourceDocumentIdentifier - throws error when source_group is missing from job payload', () => {
    const payload = {
        document_relationships: {},
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(payload),
        Error,
        'source_group'
    );
});

Deno.test('extractSourceDocumentIdentifier - throws error when document_relationships is null in job payload', () => {
    const payload = {
        document_relationships: null,
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(payload),
        Error,
        'source_group'
    );
});

Deno.test('extractSourceDocumentIdentifier - extracts document_relationships.source_group from SourceDocument', () => {
    const sourceDoc: SourceDocument = {
        id: 'doc-1',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        contribution_type: 'thesis',
        file_name: 'thesis.md',
        storage_bucket: 'bucket',
        storage_path: 'path',
        size_bytes: 100,
        mime_type: 'text/markdown',
        content: 'content',
        model_id: null,
        model_name: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        error: null,
        citations: null,
        document_relationships: {
            source_group: 'thesis-doc-1',
        },
        is_header: false,
        source_prompt_resource_id: null,
        attempt_count: 1,
    };
    
    const result = extractSourceDocumentIdentifier(sourceDoc);
    assertEquals(result, 'thesis-doc-1');
});

Deno.test('extractSourceDocumentIdentifier - throws error when source_group is missing from SourceDocument', () => {
    const sourceDoc: SourceDocument = {
        id: 'doc-1',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        contribution_type: 'thesis',
        file_name: 'thesis.md',
        storage_bucket: 'bucket',
        storage_path: 'path',
        size_bytes: 100,
        mime_type: 'text/markdown',
        content: 'content',
        model_id: null,
        model_name: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        error: null,
        citations: null,
        document_relationships: {},
        is_header: false,
        source_prompt_resource_id: null,
        attempt_count: 2,
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(sourceDoc),
        Error,
        'source_group'
    );
});

Deno.test('extractSourceDocumentIdentifier - throws error when source_group is missing from SourceDocument with empty document_relationships', () => {
    const sourceDoc: SourceDocument = {
        id: 'doc-1',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'antithesis',
        iteration_number: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        contribution_type: 'antithesis',
        file_name: 'antithesis.md',
        storage_bucket: 'bucket',
        storage_path: 'path',
        size_bytes: 100,
        mime_type: 'text/markdown',
        content: 'content',
        model_id: null,
        model_name: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        error: null,
        citations: null,
        document_relationships: {},
        is_header: false,
        source_prompt_resource_id: null,
        attempt_count: 1,
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(sourceDoc),
        Error,
        'source_group'
    );
});

Deno.test('extractSourceDocumentIdentifier - throws error when source_group is empty string', () => {
    const payload = {
        document_relationships: {
            source_group: '',
        },
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(payload),
        Error,
        'source_group'
    );
});

Deno.test('extractSourceDocumentIdentifier - throws error when document_relationships is null', () => {
    const payload = {
        document_relationships: null,
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(payload),
        Error,
        'source_group'
    );
});

Deno.test('extractSourceDocumentIdentifier - returns null when input is not a record', () => {
    const result = extractSourceDocumentIdentifier(null);
    assertEquals(result, null);
    
    const result2 = extractSourceDocumentIdentifier('not-an-object');
    assertEquals(result2, null);
    
    const result3 = extractSourceDocumentIdentifier(123);
    assertEquals(result3, null);
});

Deno.test('extractSourceDocumentIdentifier - throws error when document_relationships is null regardless of canonicalPathParams', () => {
    const payload = {
        document_relationships: null,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
            sourceAttemptCount: 1,
        },
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(payload),
        Error,
        'source_group'
    );
});

Deno.test('extractSourceDocumentIdentifier - throws error when SourceDocument has null document_relationships', () => {
    const sourceDoc: SourceDocument = {
        id: 'doc-1',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        contribution_type: 'thesis',
        file_name: 'thesis.md',
        storage_bucket: 'bucket',
        storage_path: 'path',
        size_bytes: 100,
        mime_type: 'text/markdown',
        content: 'content',
        model_id: null,
        model_name: null,
        prompt_template_id_used: null,
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        error: null,
        citations: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
        attempt_count: 1,
    };
    
    assertThrows(
        () => extractSourceDocumentIdentifier(sourceDoc),
        Error,
        'source_group'
    );
});

