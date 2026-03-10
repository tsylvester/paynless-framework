// supabase/functions/dialectic-worker/strategies/helpers.test.ts
import { 
    assertEquals, 
    assertExists
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    SourceDocument, 
    DialecticStageRecipeStep,
} from '../../dialectic-service/dialectic.interface.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { 
    selectAnchorForCanonicalPathParams
} from './selectAnchorForCanonicalPathParams.ts';

Deno.test('selectAnchorForCanonicalPathParams returns highest-relevance document when multiple document inputs have different relevance scores', () => {
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

    const result = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);

    assertExists(result, 'Should return a document');
    assertEquals(result.id, 'business-case-doc', 'Should return business_case document with highest relevance (1.0), not feature_spec (0.9)');
});

Deno.test('selectAnchorForCanonicalPathParams returns null when inputs_relevance array is empty', () => {
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

    const result = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);

    assertEquals(result, null, 'Should return null when inputs_relevance array is empty');
});

Deno.test('selectAnchorForCanonicalPathParams returns null when inputs_required has no document inputs', () => {
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

    const seedPromptDoc: SourceDocument = {
        id: 'seed-prompt-doc',
        content: 'Seed prompt content',
        contribution_type: 'seed_prompt',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'thesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'seed_prompt.md',
        storage_bucket: 'bucket-1',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis',
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

    const result = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);

    assertEquals(result, null, 'Should return null when inputs_required has no document inputs');
});

Deno.test('selectAnchorForCanonicalPathParams returns null when no matching source document due to stage mismatch', () => {
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
        file_name: 'gpt-4_0_business_case.md',
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

    const sourceDocs: SourceDocument[] = [antithesisDoc];

    const result = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);

    assertEquals(result, null, 'Should return null when no matching source document due to stage mismatch (thesis vs antithesis)');
});

Deno.test('selectAnchorForCanonicalPathParams returns null when no matching source document due to document_key mismatch', () => {
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

    const sourceDocs: SourceDocument[] = [featureSpecDoc];

    const result = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);

    assertEquals(result, null, 'Should return null when no matching source document due to document_key mismatch (business_case vs feature_spec)');
});

Deno.test('selectAnchorForCanonicalPathParams throws error when multiple document inputs have identical highest relevance', () => {
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
        selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);
    } catch (error) {
        if (error instanceof Error) {
            caughtError = error;
        } else {
            throw error;
        }
    }
    assertExists(caughtError, 'Should throw error when multiple document inputs have identical highest relevance');
    assertEquals(caughtError.message.includes('ambiguous') || caughtError.message.includes('Ambiguous'), true, 'Error message should indicate ambiguous selection');
});

Deno.test('selectAnchorForCanonicalPathParams extracts document_key from source document filename using deconstructStoragePath', () => {
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

    const result = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);

    assertExists(result, 'Should return a document by extracting document_key from filename');
    assertEquals(result.id, 'business-case-doc', 'Should match document by extracting business_case from filename gpt-4_0_business_case.md');
});

Deno.test('selectAnchorForCanonicalPathParams matches source documents by both stage and extracted document_key from filename', () => {
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

    const antithesisBusinessCaseDoc: SourceDocument = {
        id: 'antithesis-business-case-doc',
        content: 'Antithesis business case content',
        contribution_type: 'antithesis',
        session_id: 'session-1',
        user_id: 'user-1',
        stage: 'antithesis',
        iteration_number: 1,
        edit_version: 1,
        is_latest_edit: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: 'gpt-4_0_business_case.md',
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

    const sourceDocs: SourceDocument[] = [businessCaseDoc, antithesisBusinessCaseDoc];

    const result = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);

    assertExists(result, 'Should return a document matching both stage and document_key');
    assertEquals(result.id, 'business-case-doc', 'Should return thesis document (stage match), not antithesis document (stage mismatch), even though both have business_case document_key');
    assertEquals(result.stage, 'thesis', 'Should match by stage');
}); 