import {
	assertEquals,
	assertExists,
	assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { planPerSourceDocument } from '../../functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts';
import { planPerSourceGroup } from '../../functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts';
import { planPairwiseByOrigin } from '../../functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts';
import { planPerModel } from '../../functions/dialectic-worker/strategies/planners/planPerModel.ts';
import { planPerSourceDocumentByLineage } from '../../functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts';
import { planAllToOne } from '../../functions/dialectic-worker/strategies/planners/planAllToOne.ts';
import { 
    DialecticJobRow, 
    DialecticPlanJobPayload, 
    SourceDocument, 
    DialecticStageRecipeStep,
} from '../../functions/dialectic-service/dialectic.interface.ts';
import { isDialecticExecuteJobPayload } from '../../functions/_shared/utils/type-guards/type_guards.dialectic.ts';
import { FileType } from '../../functions/_shared/types/file_manager.types.ts';

// Mock Data from unit test pattern
const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
	id: 'parent-job-123',
	session_id: 'session-abc',
	user_id: 'user-def',
	stage_slug: 'thesis',
	iteration_number: 1,
	payload: {
		job_type: 'PLAN',
		projectId: 'project-xyz',
		sessionId: 'session-abc',
		stageSlug: 'thesis',
		iterationNumber: 1,
		model_id: 'model-ghi',
		walletId: 'wallet-default',
		user_jwt: 'parent-jwt-default',
	},
	attempt_count: 0,
	completed_at: null,
	created_at: new Date().toISOString(),
	error_details: null,
	max_retries: 3,
	parent_job_id: null,
	prerequisite_job_id: null,
	results: null,
	started_at: null,
	status: 'pending',
	target_contribution_id: null,
	is_test_job: false,
	job_type: 'PLAN',
};

const MOCK_SOURCE_DOC: SourceDocument = {
    id: 'doc-1',
    content: 'Doc 1 content',
    contribution_type: 'thesis',
    session_id: 'session-abc',
    user_id: 'user-def',
    stage: 'thesis',
    iteration_number: 1,
    edit_version: 1,
    is_latest_edit: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    file_name: 'f1.txt',
    storage_bucket: 'b1',
    storage_path: 'p1',
    model_id: 'm1',
    model_name: 'M1',
    prompt_template_id_used: 'p1',
    seed_prompt_url: null,
    original_model_contribution_id: null,
    raw_response_storage_path: null,
    tokens_used_input: 1,
    tokens_used_output: 1,
    processing_time_ms: 1,
    error: null,
    citations: null,
    size_bytes: 1,
    mime_type: 'text/plain',
    target_contribution_id: null,
    document_relationships: { source_group: 'doc-1' },
    is_header: false,
    source_prompt_resource_id: null,
};

const MOCK_RECIPE_STEP: DialecticStageRecipeStep = {
	id: 'step-id-123',
	instance_id: 'instance-id-456',
	template_step_id: 'template-step-id-789',
	step_key: 'generate-thesis',
	step_slug: 'generate-thesis',
	step_name: 'Generate Thesis',
	prompt_template_id: 'thesis_gen',
	prompt_type: 'Turn',
	job_type: 'EXECUTE',
	inputs_required: [],
	inputs_relevance: [],
	outputs_required: {
		documents: [{
			artifact_class: 'rendered_document',
			file_type: 'markdown',
			document_key: FileType.business_case,
			template_filename: 'business_case.md',
		}],
		assembled_json: [],
		files_to_generate: [{
			from_document_key: FileType.business_case,
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
	step_description: 'Generate Thesis',
};

Deno.test('planPerSourceDocument produces valid payloads for RENDER job creation', () => {
    // 1. Producer: Call planPerSourceDocument
    const childPayloads = planPerSourceDocument(
        [MOCK_SOURCE_DOC],
        MOCK_PARENT_JOB,
        MOCK_RECIPE_STEP,
        MOCK_PARENT_JOB.payload.user_jwt
    );

    assertEquals(childPayloads.length, 1);
    const payload = childPayloads[0];

    if (!isDialecticExecuteJobPayload(payload)) {
        throw new Error('Expected EXECUTE job payload');
    }

    // 2. Subject: Capture the generated payload (specifically document_relationships)
    const relationships = payload.document_relationships;
    const stageSlug = MOCK_PARENT_JOB.payload.stageSlug;

    if (!stageSlug) {
        throw new Error('stageSlug is required for this test');
    }

    // 3. Consumer: Run validation logic matching executeModelCallAndSave
    assertExists(relationships, 'document_relationships must be defined');
    
    if (relationships) {
        // Simulate Object.entries().find() behavior
        const stageSlugEntry = Object.entries(relationships).find(([key]) => key === stageSlug);
        
        // Assertions matching the consumer's validation requirements
        assertExists(stageSlugEntry, `document_relationships must contain key for stageSlug: ${stageSlug}`);
        
        if (stageSlugEntry) {
            const [key, value] = stageSlugEntry;
            assertEquals(key, stageSlug, 'Found entry key must match stageSlug');
            assertEquals(typeof value, 'string', 'Value must be a string');
            
            if (typeof value === 'string') {
                assert(value.trim().length > 0, 'Value must be non-empty');
                assertEquals(value, MOCK_SOURCE_DOC.id, 'Value must match source document ID');
            }
        }
    }
});

const MOCK_SOURCE_GROUP_DOCS: SourceDocument[] = [
    { ...MOCK_SOURCE_DOC, id: 'thesis-1', document_relationships: null },
    { ...MOCK_SOURCE_DOC, id: 'chunk-1a', document_relationships: { source_group: 'thesis-1' } },
];

const MOCK_GROUP_RECIPE_STEP: DialecticStageRecipeStep = {
    ...MOCK_RECIPE_STEP,
    granularity_strategy: 'per_source_group',
    output_type: FileType.ReducedSynthesis,
    outputs_required: {
        documents: [{
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            document_key: FileType.Synthesis,
            template_filename: 'synthesis.md',
        }],
        assembled_json: [],
        files_to_generate: [{
            from_document_key: FileType.Synthesis,
            template_filename: 'synthesis.md',
        }],
    },
};

Deno.test('planPerSourceGroup produces valid payloads for RENDER job creation', () => {
    // 1. Producer: Call planPerSourceGroup
    const childPayloads = planPerSourceGroup(
        MOCK_SOURCE_GROUP_DOCS,
        MOCK_PARENT_JOB,
        MOCK_GROUP_RECIPE_STEP,
        MOCK_PARENT_JOB.payload.user_jwt
    );

    assertEquals(childPayloads.length, 1, 'Should create 1 job for the single group');
    const payload = childPayloads[0];

    if (!isDialecticExecuteJobPayload(payload)) {
        throw new Error('Expected EXECUTE job payload');
    }

    // 2. Subject: Capture the generated payload (specifically document_relationships)
    const relationships = payload.document_relationships;
    const stageSlug = MOCK_PARENT_JOB.payload.stageSlug;

    if (!stageSlug) {
        throw new Error('stageSlug is required for this test');
    }

    // 3. Consumer: Run validation logic matching executeModelCallAndSave
    assertExists(relationships, 'document_relationships must be defined');
    
    if (relationships) {
        // Simulate Object.entries().find() behavior
        const stageSlugEntry = Object.entries(relationships).find(([key]) => key === stageSlug);
        
        // Assertions matching the consumer's validation requirements
        assertExists(stageSlugEntry, `document_relationships must contain key for stageSlug: ${stageSlug}`);
        
        if (stageSlugEntry) {
            const [key, value] = stageSlugEntry;
            assertEquals(key, stageSlug, 'Found entry key must match stageSlug');
            assertEquals(typeof value, 'string', 'Value must be a string');
            
            if (typeof value === 'string') {
                assert(value.trim().length > 0, 'Value must be non-empty');
                assertEquals(value, 'thesis-1', 'Value must match source group anchor ID');
            }
        }
    }
});

const MOCK_PAIRWISE_DOCS: SourceDocument[] = [
    { ...MOCK_SOURCE_DOC, id: 'thesis-1', contribution_type: 'thesis', document_relationships: null },
    { ...MOCK_SOURCE_DOC, id: 'antithesis-1a', contribution_type: 'antithesis', document_relationships: { source_group: 'thesis-1' } },
];

const MOCK_PAIRWISE_RECIPE_STEP: DialecticStageRecipeStep = {
    ...MOCK_RECIPE_STEP,
    granularity_strategy: 'pairwise_by_origin',
    output_type: FileType.PairwiseSynthesisChunk,
    outputs_required: {
        documents: [{
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            document_key: FileType.PairwiseSynthesisChunk,
            template_filename: 'pairwise_synthesis_chunk.md',
        }],
        assembled_json: [],
        files_to_generate: [{
            from_document_key: FileType.PairwiseSynthesisChunk,
            template_filename: 'pairwise_synthesis_chunk.md',
        }],
    },
};

Deno.test('planPairwiseByOrigin produces valid payloads for RENDER job creation', () => {
    // 1. Producer: Call planPairwiseByOrigin
    const childPayloads = planPairwiseByOrigin(
        MOCK_PAIRWISE_DOCS,
        MOCK_PARENT_JOB,
        MOCK_PAIRWISE_RECIPE_STEP,
        MOCK_PARENT_JOB.payload.user_jwt
    );

    assertEquals(childPayloads.length, 1, 'Should create 1 job for the single pair');
    const payload = childPayloads[0];

    if (!isDialecticExecuteJobPayload(payload)) {
        throw new Error('Expected EXECUTE job payload');
    }

    // 2. Subject: Capture the generated payload
    const relationships = payload.document_relationships;
    const stageSlug = MOCK_PARENT_JOB.payload.stageSlug;

    if (!stageSlug) {
        throw new Error('stageSlug is required for this test');
    }

    // 3. Consumer: Run validation logic
    assertExists(relationships, 'document_relationships must be defined');
    
    if (relationships) {
        const stageSlugEntry = Object.entries(relationships).find(([key]) => key === stageSlug);
        assertExists(stageSlugEntry, `document_relationships must contain key for stageSlug: ${stageSlug}`);
        
        if (stageSlugEntry) {
            const [key, value] = stageSlugEntry;
            assertEquals(key, stageSlug);
            assertEquals(typeof value, 'string');
            if (typeof value === 'string') {
                assert(value.trim().length > 0);
                assertEquals(value, 'thesis-1', 'Value must match source group anchor ID');
            }
        }
    }
});

Deno.test('planPerModel produces valid payloads for RENDER job creation', () => {
    // 1. Producer: Call planPerModel
    const childPayloads = planPerModel(
        [MOCK_SOURCE_DOC],
        MOCK_PARENT_JOB,
        MOCK_RECIPE_STEP,
        MOCK_PARENT_JOB.payload.user_jwt
    );

    assertEquals(childPayloads.length, 1);
    const payload = childPayloads[0];

    if (!isDialecticExecuteJobPayload(payload)) {
        throw new Error('Expected EXECUTE job payload');
    }

    // 2. Subject: Capture the generated payload (specifically document_relationships)
    const relationships = payload.document_relationships;
    const stageSlug = MOCK_PARENT_JOB.payload.stageSlug;

    if (!stageSlug) {
        throw new Error('stageSlug is required for this test');
    }

    // 3. Consumer: Run validation logic matching executeModelCallAndSave
    assertExists(relationships, 'document_relationships must be defined');
    
    if (relationships) {
        // Simulate Object.entries().find() behavior
        const stageSlugEntry = Object.entries(relationships).find(([key]) => key === stageSlug);
        
        // Assertions matching the consumer's validation requirements
        assertExists(stageSlugEntry, `document_relationships must contain key for stageSlug: ${stageSlug}`);
        
        if (stageSlugEntry) {
            const [key, value] = stageSlugEntry;
            assertEquals(key, stageSlug, 'Found entry key must match stageSlug');
            assertEquals(typeof value, 'string', 'Value must be a string');
            
            if (typeof value === 'string') {
                assert(value.trim().length > 0, 'Value must be non-empty');
                assertEquals(value, MOCK_SOURCE_DOC.id, 'Value must match source document ID');
            }
        }
    }
});

Deno.test('planPerSourceDocumentByLineage produces valid payloads for RENDER job creation', () => {
    // 1. Producer: Call planPerSourceDocumentByLineage
    const lineageDocs = [{ ...MOCK_SOURCE_DOC, id: 'lineage-doc-1', document_relationships: { source_group: 'group-1' } }];
    const childPayloads = planPerSourceDocumentByLineage(
        lineageDocs,
        MOCK_PARENT_JOB,
        { ...MOCK_RECIPE_STEP, granularity_strategy: 'per_source_document_by_lineage' },
        MOCK_PARENT_JOB.payload.user_jwt
    );

    assertEquals(childPayloads.length, 1);
    const payload = childPayloads[0];

    if (!isDialecticExecuteJobPayload(payload)) {
        throw new Error('Expected EXECUTE job payload');
    }

    // 2. Subject: Capture the generated payload
    const relationships = payload.document_relationships;
    const stageSlug = MOCK_PARENT_JOB.payload.stageSlug;

    if (!stageSlug) {
        throw new Error('stageSlug is required for this test');
    }

    // 3. Consumer: Run validation logic
    assertExists(relationships, 'document_relationships must be defined');
    
    if (relationships) {
        const stageSlugEntry = Object.entries(relationships).find(([key]) => key === stageSlug);
        assertExists(stageSlugEntry, `document_relationships must contain key for stageSlug: ${stageSlug}`);
        
        if (stageSlugEntry) {
            const [key, value] = stageSlugEntry;
            assertEquals(key, stageSlug);
            assertEquals(typeof value, 'string');
            if (typeof value === 'string') {
                assert(value.trim().length > 0);
                assertEquals(value, 'group-1', 'Value must match the source group ID');
            }
        }
    }
});

Deno.test('planAllToOne produces valid payloads for RENDER job creation', () => {
    // 1. Producer: Call planAllToOne
    const childPayloads = planAllToOne(
        [MOCK_SOURCE_DOC],
        MOCK_PARENT_JOB,
        { ...MOCK_RECIPE_STEP, granularity_strategy: 'all_to_one' },
        MOCK_PARENT_JOB.payload.user_jwt
    );

    assertEquals(childPayloads.length, 1);
    const payload = childPayloads[0];

    if (!isDialecticExecuteJobPayload(payload)) {
        throw new Error('Expected EXECUTE job payload');
    }

    // 2. Subject: Capture the generated payload
    const relationships = payload.document_relationships;
    const stageSlug = MOCK_PARENT_JOB.payload.stageSlug;

    if (!stageSlug) {
        throw new Error('stageSlug is required for this test');
    }

    // 3. Consumer: Run validation logic
    assertExists(relationships, 'document_relationships must be defined');
    
    if (relationships) {
        const stageSlugEntry = Object.entries(relationships).find(([key]) => key === stageSlug);
        assertExists(stageSlugEntry, `document_relationships must contain key for stageSlug: ${stageSlug}`);
        
        if (stageSlugEntry) {
            const [key, value] = stageSlugEntry;
            assertEquals(key, stageSlug);
            assertEquals(typeof value, 'string');
            if (typeof value === 'string') {
                assert(value.trim().length > 0);
                assertEquals(value, MOCK_SOURCE_DOC.id, 'Value must match the anchor document ID');
            }
        }
    }
});
