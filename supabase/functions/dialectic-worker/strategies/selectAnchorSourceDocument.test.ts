// supabase/functions/dialectic-worker/strategies/helpers.test.ts
import { 
    assertEquals, 
    assertExists
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    SourceDocument, 
    DialecticStageRecipeStep,
    SelectAnchorResult
} from '../../dialectic-service/dialectic.interface.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { 
    selectAnchorSourceDocument 
} from './helpers.ts';

Deno.test('selectAnchorSourceDocument selects highest-relevance document among required document inputs', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'antithesis',
                document_key: FileType.SeedPrompt,
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.feature_spec,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
            {
                document_key: FileType.feature_spec,
                relevance: 0.9,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const seedPromptDoc: SourceDocument = {
        id: 'seed-prompt-doc',
        content: 'Seed prompt content',
        contribution_type: 'seed_prompt',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'antithesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'seed_prompt.md',
        storage_bucket: 'bucket-1',
        storage_path: 'path-1',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const businessCaseDoc: SourceDocument = {
        id: 'business-case-doc',
        content: 'Business case content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const featureSpecDoc: SourceDocument = {
        id: 'feature-spec-doc',
        content: 'Feature spec content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_feature_spec.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [seedPromptDoc, businessCaseDoc, featureSpecDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_found', 'Should return anchor_found status');
    if (result.status === 'anchor_found') {
        assertEquals(result.document.id, 'business-case-doc', 'Should return business_case document with highest relevance (1.0), not seed_prompt or feature_spec');
        assertEquals(result.document.document_key, FileType.business_case, 'Should return business_case document');
    }
});

Deno.test('selectAnchorSourceDocument ignores seed_prompt and feedback inputs when selecting anchor', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'antithesis',
                document_key: FileType.SeedPrompt,
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                type: 'seed_prompt',
                document_key: FileType.SeedPrompt,
                relevance: 1.0,
            },
            {
                document_key: FileType.business_case,
                relevance: 0.9,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const seedPromptDoc: SourceDocument = {
        id: 'seed-prompt-doc',
        content: 'Seed prompt content',
        contribution_type: 'seed_prompt',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'antithesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'seed_prompt.md',
        storage_bucket: 'bucket-1',
        storage_path: 'path-1',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const businessCaseDoc: SourceDocument = {
        id: 'business-case-doc',
        content: 'Business case content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [seedPromptDoc, businessCaseDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_found', 'Should return anchor_found status');
    if (result.status === 'anchor_found') {
        assertEquals(result.document.id, 'business-case-doc', 'Should return document (not seed_prompt), proving non-document inputs are excluded from anchor candidates');
        assertEquals(result.document.document_key, FileType.business_case, 'Should return business_case document despite seed_prompt having higher relevance');
    }
});

Deno.test('selectAnchorSourceDocument throws when multiple documents have identical highest relevance', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.feature_spec,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
            {
                document_key: FileType.feature_spec,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const businessCaseDoc: SourceDocument = {
        id: 'business-case-doc',
        content: 'Business case content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const featureSpecDoc: SourceDocument = {
        id: 'feature-spec-doc',
        content: 'Feature spec content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_feature_spec.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [businessCaseDoc, featureSpecDoc];

    let caughtError: Error | null = null;
    try {
        selectAnchorSourceDocument(recipeStep, sourceDocs);
    } catch (error) {
        if (error instanceof Error) {
            caughtError = error;
        } else {
            throw error;
        }
    }
    assertExists(caughtError, 'Should throw error when multiple documents have identical highest relevance');
    assertEquals(caughtError.message.includes('Ambiguous anchor selection'), true, 'Error message should mention ambiguous anchor selection');
    assertEquals(caughtError.message.includes('multiple documents with identical highest relevance'), true, 'Error message should mention multiple documents with identical highest relevance');
});

Deno.test('selectAnchorSourceDocument throws when required document input has no relevance score', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const businessCaseDoc: SourceDocument = {
        id: 'business-case-doc',
        content: 'Business case content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [businessCaseDoc];

    let caughtError: Error | null = null;
    try {
        selectAnchorSourceDocument(recipeStep, sourceDocs);
    } catch (error) {
        if (error instanceof Error) {
            caughtError = error;
        } else {
            throw error;
        }
    }
    assertExists(caughtError, 'Should throw error when required document input has no relevance score');
    assertEquals(caughtError.message.includes('Missing relevance score'), true, 'Error message should mention missing relevance score');
    assertEquals(caughtError.message.includes('required document input'), true, 'Error message should mention required document input');
});

Deno.test('selectAnchorSourceDocument returns no_anchor_required when PLAN + all_to_one with only seed_prompt input', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'antithesis',
                document_key: FileType.SeedPrompt,
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'all_to_one',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const seedPromptDoc: SourceDocument = {
        id: 'seed-prompt-doc',
        content: 'Seed prompt content',
        contribution_type: 'seed_prompt',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'antithesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'seed_prompt.md',
        storage_bucket: 'bucket-1',
        storage_path: 'path-1',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [seedPromptDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'no_anchor_required', 'PLAN + all_to_one with only seed_prompt input should return no_anchor_required');
});

Deno.test('selectAnchorSourceDocument returns anchor_not_found when anchor document not found in sourceDocs', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const wrongDocumentDoc: SourceDocument = {
        id: 'wrong-document-doc',
        content: 'Wrong document content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_feature_spec.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [wrongDocumentDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_not_found', 'Should return anchor_not_found status when anchor document not found in sourceDocs');
    if (result.status === 'anchor_not_found') {
        assertEquals(result.targetSlug, 'thesis', 'Should include targetSlug in anchor_not_found result');
        assertEquals(result.targetDocumentKey, 'business_case', 'Should include targetDocumentKey in anchor_not_found result');
    }
});

Deno.test('selectAnchorSourceDocument matches by stage and document_key or contribution_type', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'test-step',
        step_slug: 'test-step',
        step_name: 'Test Step',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const businessCaseDoc: SourceDocument = {
        id: 'business-case-doc',
        content: 'Business case content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [businessCaseDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_found', 'Should return anchor_found status');
    if (result.status === 'anchor_found') {
        assertEquals(result.document.id, 'business-case-doc', 'Should return matching document by stage and document_key');
        assertEquals(result.document.stage, 'thesis', 'Should match stage from inputs_required slug');
        assertEquals(result.document.document_key, FileType.business_case, 'Should match document_key from inputs_required');
    }
});

Deno.test('selectAnchorSourceDocument: 94.c.i - PLAN + all_to_one returns no_anchor_required', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'thesis_build_stage_header',
        step_slug: 'thesis-build-stage-header',
        step_name: 'Build Stage Header',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                document_key: FileType.SeedPrompt,
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'all_to_one',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const sourceDocs: SourceDocument[] = [];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'no_anchor_required', 'PLAN + all_to_one should return no_anchor_required');
});

Deno.test('selectAnchorSourceDocument: 94.c.ii - PLAN + per_source_document with doc inputs returns anchor_found', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'antithesis_plan',
        step_slug: 'antithesis-plan',
        step_name: 'Plan Antithesis',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const inputDoc: SourceDocument = {
        id: 'thesis-business-case',
        content: 'Business case content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [inputDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_found', 'PLAN + per_source_document with doc inputs should return anchor_found');
    if (result.status === 'anchor_found') {
        assertEquals(result.document.id, 'thesis-business-case', 'Should return the input document');
    }
});

Deno.test('selectAnchorSourceDocument: 94.c.iii - EXECUTE with doc inputs returns anchor_found with highest relevance', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'synthesis_generate',
        step_slug: 'synthesis-generate',
        step_name: 'Generate Synthesis',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Turn',
        job_type: 'EXECUTE',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
            {
                type: 'document',
                slug: 'antithesis',
                document_key: FileType.business_case_critique,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 0.8,
            },
            {
                document_key: FileType.business_case_critique,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.synthesis_pairwise_business_case,
                template_filename: 'synthesis_pairwise_business_case.md',
            }],
        },
        granularity_strategy: 'pairwise_by_origin',
        output_type: FileType.synthesis_pairwise_business_case,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const thesisDoc: SourceDocument = {
        id: 'thesis-doc',
        content: 'Thesis content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const antithesisDoc: SourceDocument = {
        id: 'antithesis-doc',
        content: 'Antithesis content',
        contribution_type: 'antithesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'antithesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case_critique.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/2_antithesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [thesisDoc, antithesisDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_found', 'EXECUTE with doc inputs should return anchor_found');
    if (result.status === 'anchor_found') {
        assertEquals(result.document.id, 'antithesis-doc', 'Should return document with highest relevance (antithesis with 1.0, not thesis with 0.8)');
    }
});

Deno.test('selectAnchorSourceDocument: 94.c.iv - EXECUTE with only header_context input returns derive_from_header_context', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'thesis_generate_business_case',
        step_slug: 'thesis-generate-business-case',
        step_name: 'Generate Business Case',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Turn',
        job_type: 'EXECUTE',
        inputs_required: [
            {
                type: 'header_context',
                slug: 'thesis',
                document_key: FileType.HeaderContext,
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'business_case.md',
            }],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.business_case,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const sourceDocs: SourceDocument[] = [];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'derive_from_header_context', 'EXECUTE with only header_context input should return derive_from_header_context');
});

Deno.test('selectAnchorSourceDocument: 94.c.v - EXECUTE producing header_context returns no_anchor_required', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'antithesis_build_header',
        step_slug: 'antithesis-build-header',
        step_name: 'Build Header Context',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'EXECUTE',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const sourceDocs: SourceDocument[] = [];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'no_anchor_required', 'EXECUTE producing header_context (not document) should return no_anchor_required');
});

Deno.test('selectAnchorSourceDocument: 94.c.vi - Thesis Step 2 (header_context input, document output) returns derive_from_header_context', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'thesis_generate_business_case',
        step_slug: 'thesis-generate-business-case',
        step_name: 'Generate Business Case',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Turn',
        job_type: 'EXECUTE',
        inputs_required: [
            {
                type: 'header_context',
                slug: 'thesis',
                document_key: FileType.HeaderContext,
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case,
                template_filename: 'business_case.md',
            }],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.business_case,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: FileType.business_case,
        execution_order: 2,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const sourceDocs: SourceDocument[] = [];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'derive_from_header_context', 'Thesis Step 2 scenario (header_context input, document output) should return derive_from_header_context');
});

Deno.test('selectAnchorSourceDocument: 94.c.vii - Antithesis Step 1 (doc inputs, header_context output) returns anchor_found', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'antithesis_build_stage_header',
        step_slug: 'antithesis-build-stage-header',
        step_name: 'Build Stage Header',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'EXECUTE',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const thesisDoc: SourceDocument = {
        id: 'thesis-doc',
        content: 'Thesis content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [thesisDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_found', 'Antithesis Step 1 scenario (doc inputs, header_context output) should return anchor_found for lineage');
    if (result.status === 'anchor_found') {
        assertEquals(result.document.id, 'thesis-doc', 'Should return the thesis document for lineage tracking');
    }
});

Deno.test('selectAnchorSourceDocument: 94.c.viii - Synthesis Step 3 (consolidation/merge) returns no_anchor_required', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'synthesis_document_business_case',
        step_slug: 'synthesis-document-business-case',
        step_name: 'Synthesis Consolidation',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Turn',
        job_type: 'EXECUTE',
        inputs_required: [
            {
                type: 'document',
                slug: 'synthesis',
                document_key: FileType.synthesis_pairwise_business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.synthesis_pairwise_business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.synthesis_document_business_case,
                template_filename: 'synthesis_document_business_case.md',
            }],
        },
        granularity_strategy: 'per_model',
        output_type: FileType.synthesis_document_business_case,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: FileType.business_case,
        execution_order: 3,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const sourceDocs: SourceDocument[] = [];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'no_anchor_required', 'Synthesis Step 3 scenario (consolidation/merge) should return no_anchor_required');
});

Deno.test('selectAnchorSourceDocument extracts document_key from file_name when document_key property is undefined', () => {
    const recipeStep: DialecticStageRecipeStep = {
        id: 'step-id-1',
        instance_id: 'instance-id-1',
        template_step_id: 'template-step-id-1',
        step_key: 'antithesis_plan',
        step_slug: 'antithesis-plan',
        step_name: 'Plan Antithesis',
        prompt_template_id: 'template-id-1',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [],
        },
        granularity_strategy: 'per_source_document',
        output_type: FileType.HeaderContext,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        branch_key: null,
        execution_order: 1,
        parallel_group: null,
        step_description: 'Test Step',
    };

    const businessCaseDoc: SourceDocument = {
        id: 'business-case-doc',
        content: 'Business case content',
        contribution_type: 'thesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        model_id: 'model-1',
        model_name: 'gpt-4',
        prompt_template_id_used: 'template-1',
        seed_prompt_url: null,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        error: null,
        citations: null,
        size_bytes: 0,
        mime_type: 'text/markdown',
        target_contribution_id: null,
        document_relationships: null,
        is_header: false,
        source_prompt_resource_id: null,
    };

    const sourceDocs: SourceDocument[] = [businessCaseDoc];

    const result: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);

    assertEquals(result.status, 'anchor_found', 'Should return anchor_found by extracting document_key from file_name');
    if (result.status === 'anchor_found') {
        assertEquals(result.document.id, 'business-case-doc', 'Should return the document with matching file_name');
    }
}); 