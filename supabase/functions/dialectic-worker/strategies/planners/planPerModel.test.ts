// supabase/functions/dialectic-worker/strategies/planners/planPerModel.test.ts
import {
	assertEquals,
	assertExists,
	assert,
	assertThrows,
	assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
	DialecticJobRow,
	SourceDocument,
	DialecticPlanJobPayload,
	DialecticStageRecipeStep,
	DialecticExecuteJobPayload,
	DialecticRecipeTemplateStep,
	ContextForDocument,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planPerModel } from './planPerModel.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { isJson } from '../../../_shared/utils/type-guards/type_guards.common.ts';
import { isDialecticExecuteJobPayload } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
	{
		id: 'doc-1',
		content: 'Source document 1',
		contribution_type: 'thesis',
		model_name: 'gpt-4',
		document_key: FileType.business_case,
	},
	{
		id: 'doc-2',
		content: 'Source document 2',
		contribution_type: 'thesis',
		model_name: 'claude-3-opus',
		document_key: FileType.business_case,
	},
].map((d) => ({
	...d,
	session_id: 'session-abc',
	user_id: 'user-def',
	stage: 'thesis',
	iteration_number: 1,
	edit_version: 1,
	is_latest_edit: true,
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	file_name: `${d.model_name}_0_business_case.md`,
	storage_bucket: 'test-bucket',
	storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
	model_id: d.model_name,
	prompt_template_id_used: 'template-123',
	target_contribution_id: null,
	seed_prompt_url: null,
	original_model_contribution_id: null,
	raw_response_storage_path: null,
	tokens_used_input: 100,
	tokens_used_output: 200,
	processing_time_ms: 1000,
	error: null,
	citations: null,
	size_bytes: 100,
	mime_type: 'text/markdown',
	document_relationships: null,
	is_header: false,
	source_prompt_resource_id: null,
	attempt_count: 0,
}));

const MOCK_PAYLOAD: DialecticPlanJobPayload = {
	projectId: 'project-xyz',
	sessionId: 'session-abc',
	stageSlug: 'synthesis',
	iterationNumber: 1,
	model_id: 'model-parent',
	walletId: 'wallet-default',
	user_jwt: 'user-jwt-123',
};

if(!isJson(MOCK_PAYLOAD)) {
	throw new Error('Mock payload is not a valid JSON');
}

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
	id: 'parent-job-123',
	session_id: 'session-abc',
	user_id: 'user-def',
	stage_slug: 'synthesis',
	iteration_number: 1,
	payload: MOCK_PAYLOAD,
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

const MOCK_RECIPE_STEP: DialecticStageRecipeStep = {
	id: 'step-id-123',
	instance_id: 'instance-id-456',
	template_step_id: 'template-step-id-789',
	step_key: 'generate-technical_requirements',
	step_slug: 'generate-technical_requirements',
	step_name: 'Generate Technical Requirements Document',
	prompt_template_id: 'technical_requirements_template_v1',
	prompt_type: 'Turn',
	job_type: 'EXECUTE',
	inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
	inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
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
	granularity_strategy: 'per_model',
	output_type: FileType.technical_requirements,
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	config_override: {},
	is_skipped: false,
	object_filter: {},
	output_overrides: {},
	branch_key: null,
	execution_order: 1,
	parallel_group: null,
	step_description: 'Generate Technical Requirements Document',
};

Deno.test('planPerModel should create a single job with correct properties', () => {
	const childPayloads = planPerModel(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		MOCK_RECIPE_STEP,
		MOCK_PARENT_JOB.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly one child job');

	const jobPayload = childPayloads[0];
	assertExists(jobPayload);

	if (isDialecticExecuteJobPayload(jobPayload)) {
		assertEquals(jobPayload.prompt_template_id, MOCK_RECIPE_STEP.prompt_template_id);
		assert(!('prompt_template_name' in jobPayload), 'The deprecated prompt_template_name property should not be present');
		assertEquals(jobPayload.output_type, MOCK_RECIPE_STEP.output_type);
		assertEquals(jobPayload.model_id, MOCK_PARENT_JOB.payload.model_id, "Child job's model_id should match the parent job's model_id");
		assertEquals(
			jobPayload.sourceContributionId,
			MOCK_SOURCE_DOCS[0].id,
			'sourceContributionId should match the anchor document id when provided'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel should throw an error if sourceDocs are empty', () => {
	assertThrows(
		() => {
			planPerModel([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'Invalid inputs for planPerModel: At least one source document is required.'
	);
});

Deno.test('planPerModel should throw an error if parent job has no model_id', () => {
	const parentJobWithoutModel = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	parentJobWithoutModel.payload.model_id = undefined;

	assertThrows(
		() => {
			planPerModel(
				MOCK_SOURCE_DOCS,
				parentJobWithoutModel,
				MOCK_RECIPE_STEP,
				MOCK_PARENT_JOB.payload.user_jwt
			);
		},
		TypeError,
		`Invalid parent job for planPerModel: model_id is missing.`
	);
});

Deno.test(
	'planPerModel sets sourceContributionId to null when anchor document id is missing',
	() => {
		const sourceDocsMissingAnchorId: SourceDocument[] = MOCK_SOURCE_DOCS.map(
			(doc, index) => {
				if (index === 0) {
					return {
						...doc,
						id: '',
					};
				}
				return doc;
			}
		);

		const childPayloads = planPerModel(
			sourceDocsMissingAnchorId,
			MOCK_PARENT_JOB,
			MOCK_RECIPE_STEP,
			MOCK_PARENT_JOB.payload.user_jwt
		);

		assertEquals(childPayloads.length, 1);
		assertEquals(
			childPayloads[0].sourceContributionId,
			null,
			'sourceContributionId should be null when the planner lacks an anchor id'
		);
	}
);

Deno.test('planPerModel includes planner_metadata with recipe_step_id in child payloads', () => {
	const mockRecipeStepWithId: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		id: 'recipe-step-model-789',
	};

	const childJobs = planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, mockRecipeStepWithId, MOCK_PARENT_JOB.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	if (isDialecticExecuteJobPayload(job)) {
		assertExists(job.planner_metadata, 'Child job should include planner_metadata');
		assertEquals(
			job.planner_metadata?.recipe_step_id,
			'recipe-step-model-789',
			'planner_metadata.recipe_step_id should match the recipe step id',
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel inherits all fields from parent job payload including model_slug and user_jwt', () => {
	const parentWithAllFields: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	Object.defineProperty(parentWithAllFields.payload, 'model_slug', {
		value: 'parent-model-slug',
		configurable: true,
		enumerable: true,
		writable: true,
	});
	Object.defineProperty(parentWithAllFields.payload, 'user_jwt', {
		value: 'parent-jwt-token',
		configurable: true,
		enumerable: true,
		writable: true,
	});

	const childJobs = planPerModel(MOCK_SOURCE_DOCS, parentWithAllFields, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertEquals(
		job.model_slug,
		'parent-model-slug',
		'Child payload must inherit model_slug from parent payload',
	);
	assertEquals(
		job.user_jwt,
		'parent-jwt-token',
		'Child payload must inherit user_jwt from parent payload',
	);
});

Deno.test('planPerModel sets document_key in payload when recipeStep.outputs_required.documents[0].document_key is present', () => {
	const recipeStepWithDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
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

	const childJobs = planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithDocumentKey, MOCK_PARENT_JOB.payload.user_jwt);
	
	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	if (isDialecticExecuteJobPayload(job)) {
		assertEquals(
			job.document_key,
			'synthesis',
			'document_key should be extracted from recipeStep.outputs_required.documents[0].document_key',
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel throws error when outputs_required.documents array is empty for EXECUTE job', async () => {
	const recipeStepWithEmptyDocuments: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.Synthesis,
				template_filename: 'synthesis.md',
			}],
		},
	} as unknown as DialecticStageRecipeStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocuments, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerModel requires recipeStep.outputs_required.documents (array) OR recipeStep.outputs_required.header_context_artifact (object) for EXECUTE jobs, but both are missing/empty',
		'Should throw error when documents array is empty for EXECUTE job',
	);
});

Deno.test('planPerModel throws error when outputs_required.documents[0] is missing document_key property', async () => {
	const recipeStepWithoutDocumentKey = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				template_filename: 'synthesis.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.Synthesis,
				template_filename: 'synthesis.md',
			}],
		},
	} as unknown as DialecticStageRecipeStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentKey, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerModel failed to resolve document_key for EXECUTE job',
		'Should throw error when documents[0] is missing document_key property',
	);
});

Deno.test('planPerModel throws error when outputs_required.documents[0].document_key is null', async () => {
	const recipeStepWithNullDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: null as unknown as FileType,
				template_filename: 'synthesis.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.Synthesis,
				template_filename: 'synthesis.md',
			}],
		},
	};

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithNullDocumentKey, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerModel failed to resolve document_key for EXECUTE job',
		'Should throw error when document_key is null',
	);
});

Deno.test('planPerModel throws error when outputs_required.documents[0].document_key is empty string', async () => {
	const recipeStepWithEmptyDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: '' as unknown as FileType,
				template_filename: 'synthesis.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.Synthesis,
				template_filename: 'synthesis.md',
			}],
		},
	};

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocumentKey, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerModel failed to resolve document_key for EXECUTE job',
		'Should throw error when document_key is empty string',
	);
});

Deno.test('planPerModel throws error when outputs_required is missing documents property for EXECUTE job', async () => {
	const recipeStepWithoutDocumentsProperty: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			// Removed header_context_artifact to ensure failure
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.Synthesis,
				template_filename: 'synthesis.md',
			}],
		} as unknown as DialecticStageRecipeStep['outputs_required'],
	};

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentsProperty, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerModel requires recipeStep.outputs_required.documents (array) OR recipeStep.outputs_required.header_context_artifact (object) for EXECUTE jobs',
		'Should throw error when documents property is missing for EXECUTE job',
	);
});

Deno.test('planPerModel includes context_for_documents in payload for PLAN jobs with valid context_for_documents', () => {
	const planRecipeStep: DialecticRecipeTemplateStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			context_for_documents: [
				{
					document_key: FileType.business_case,
					content_to_include: {
						field1: '',
						field2: [],
					},
				},
			],
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
		step_number: 1,
		template_id: 'template-id-123',
	};

	const childJobs = planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
	
	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	const planPayload = job;
	assertExists(planPayload.context_for_documents, 'PLAN job payload should include context_for_documents');
	assertEquals(planPayload.context_for_documents.length, 1, 'context_for_documents should have one entry');
	assertEquals(planPayload.context_for_documents[0].document_key, FileType.business_case, 'document_key should match');
});

Deno.test('planPerModel throws error for PLAN job when context_for_documents is missing', async () => {
	const planRecipeStepWithoutContext: DialecticRecipeTemplateStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
		step_number: 1,
		template_id: 'template-id-123',
	} as unknown as DialecticRecipeTemplateStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContext, 'user-jwt-123');
		},
		Error,
		'planPerModel requires',
		'Should throw error when context_for_documents is missing for PLAN job',
	);
});

Deno.test('planPerModel throws error for PLAN job when context_for_documents entry is missing document_key', async () => {
	const planRecipeStepWithoutDocumentKey: DialecticRecipeTemplateStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			context_for_documents: [
				{
					content_to_include: {
						field1: '',
					},
				} as unknown as ContextForDocument,
			],
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
		step_number: 1,
		template_id: 'template-id-123',
	} as unknown as DialecticRecipeTemplateStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutDocumentKey, 'user-jwt-123');
		},
		Error,
		'planPerModel requires',
		'Should throw error when context_for_documents entry is missing document_key',
	);
});

Deno.test('planPerModel throws error for PLAN job when context_for_documents entry is missing content_to_include', async () => {
	const planRecipeStepWithoutContentToInclude: DialecticRecipeTemplateStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			context_for_documents: [
				{
					document_key: FileType.business_case,
				} as unknown as ContextForDocument,
			],
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
		step_number: 1,
		template_id: 'template-id-123',
	} as unknown as DialecticRecipeTemplateStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContentToInclude, 'user-jwt-123');
		},
		Error,
		'planPerModel requires',
		'Should throw error when context_for_documents entry is missing content_to_include',
	);
});

Deno.test('planPerModel successfully creates payload for EXECUTE job with valid files_to_generate', () => {
	const executeRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case,
				template_filename: 'thesis_business_case.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.business_case,
					template_filename: 'thesis_business_case.md',
				},
			],
		},
	};

	const childJobs = planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
	
	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	if (isDialecticExecuteJobPayload(job)) {
		assertEquals(executeRecipeStep.job_type, 'EXECUTE', 'Job type should be execute');
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel throws error for EXECUTE job when files_to_generate is missing', async () => {
	const executeRecipeStepWithoutFiles: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case,
				template_filename: 'thesis_business_case.md',
			}],
			assembled_json: [],
		},
	} as unknown as DialecticStageRecipeStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFiles, 'user-jwt-123');
		},
		Error,
		'planPerModel requires',
		'Should throw error when files_to_generate is missing for EXECUTE job',
	);
});

Deno.test('planPerModel throws error for EXECUTE job when files_to_generate entry is missing from_document_key', async () => {
	const executeRecipeStepWithoutFromDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case,
				template_filename: 'thesis_business_case.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					template_filename: 'thesis_business_case.md',
				} as unknown as { from_document_key: FileType; template_filename: string },
			],
		},
	} as unknown as DialecticStageRecipeStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFromDocumentKey, 'user-jwt-123');
		},
		Error,
		'planPerModel requires',
		'Should throw error when files_to_generate entry is missing from_document_key',
	);
});

Deno.test('planPerModel throws error for EXECUTE job when files_to_generate entry is missing template_filename', async () => {
	const executeRecipeStepWithoutTemplateFilename: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case,
				template_filename: 'thesis_business_case.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.business_case,
				} as unknown as { from_document_key: FileType; template_filename: string },
			],
		},
	} as unknown as DialecticStageRecipeStep;

	await assertRejects(
		async () => {
			planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutTemplateFilename, 'user-jwt-123');
		},
		Error,
		'planPerModel requires',
		'Should throw error when files_to_generate entry is missing template_filename',
	);
});

Deno.test('planPerModel sets document_relationships.source_group to null for per_model EXECUTE jobs (consolidation creates new lineage)', () => {
	// MOCK_RECIPE_STEP has granularity_strategy: 'per_model' and job_type: 'EXECUTE'
	// selectAnchorSourceDocument returns 'no_anchor_required' for this configuration
	// Therefore source_group should be null (new lineage root)
	const childPayloads = planPerModel(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		MOCK_RECIPE_STEP,
		'user-jwt-123'
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly one child job');
	const jobPayload = childPayloads[0];
	assertExists(jobPayload, 'Child job payload should exist');

	if (isDialecticExecuteJobPayload(jobPayload)) {
		const executePayload: DialecticExecuteJobPayload = jobPayload;
		assertExists(executePayload.document_relationships, 'document_relationships should exist');

		// Assert source_group is null for per_model consolidation (new lineage root)
		assertEquals(
			executePayload.document_relationships.source_group,
			null,
			'document_relationships.source_group should be null for per_model EXECUTE jobs (consolidation creates new lineage root)'
		);

		// Assert synthesis_group is NOT present (removed, not preserved)
		assert(
			!('synthesis_group' in executePayload.document_relationships),
			'document_relationships.synthesis_group should NOT be present (removed, not preserved)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel per_model jobs have null source_group (extractSourceDocumentIdentifier not applicable)', () => {
	// per_model EXECUTE jobs return no_anchor_required, so source_group is null
	// extractSourceDocumentIdentifier is designed for jobs that DO have source_group
	// This test verifies the expected behavior for per_model consolidation jobs
	const childPayloads = planPerModel(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		MOCK_RECIPE_STEP,
		MOCK_PARENT_JOB.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly one child job');
	const jobPayload = childPayloads[0];
	assertExists(jobPayload, 'Child job payload should exist');

	if (isDialecticExecuteJobPayload(jobPayload)) {
		// per_model EXECUTE jobs have null source_group (new lineage root)
		assertEquals(
			jobPayload.document_relationships?.source_group,
			null,
			'per_model EXECUTE jobs should have null source_group (consolidation creates new lineage)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel EXECUTE branch must not set document_relationships[stageSlug] for root jobs', () => {
	// per_model EXECUTE jobs return no_anchor_required, so source_group is null (new lineage root)
	// This test verifies stageSlug is NOT added to document_relationships
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithStageSlug: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'thesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
		},
	};

	const executeRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case,
				template_filename: 'thesis_business_case.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.business_case,
					template_filename: 'thesis_business_case.md',
				},
			],
		},
	};

	const childPayloads = planPerModel(
		MOCK_SOURCE_DOCS,
		parentJobWithStageSlug,
		executeRecipeStep,
		parentJobWithStageSlug.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly one child job');
	const payload = childPayloads[0];
	assertExists(payload, 'Child job should exist');

	if (isDialecticExecuteJobPayload(payload)) {
		const executePayload: DialecticExecuteJobPayload = payload;
		assertExists(executePayload.document_relationships, 'EXECUTE job payload should include document_relationships');

		// per_model EXECUTE jobs have null source_group (consolidation creates new lineage root)
		assertEquals(
			executePayload.document_relationships.source_group,
			null,
			'source_group should be null for per_model EXECUTE jobs (consolidation creates new lineage root)',
		);

		// Assert that the stageSlug key is NOT present
		assert(
			!('thesis' in executePayload.document_relationships),
			'document_relationships[stageSlug] must be absent/undefined for root jobs (not set to anchorDoc.id)',
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel per_model EXECUTE jobs have null source_group and pass null anchor to createCanonicalPathParams', () => {
	// per_model EXECUTE jobs return no_anchor_required from selectAnchorSourceDocument
	// This means: source_group = null AND anchor passed to createCanonicalPathParams = null
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithThesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		stage_slug: 'synthesis',
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'synthesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
			job_type: 'PLAN' as const,
			is_test_job: false,
		},
	};

	// Seed prompt document is first
	const seedPromptDoc: SourceDocument = {
		id: 'seed-prompt-first',
		contribution_type: 'seed_prompt',
		content: '',
		citations: [],
		error: null,
		mime_type: 'text/markdown',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'first-doc-model_0_seed_prompt.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-first-doc',
		model_name: null,
		prompt_template_id_used: null,
		document_key: undefined,
	};

	// Business case document (second)
	const businessCaseDoc: SourceDocument = {
		id: 'business-case-high-rel',
		contribution_type: 'thesis',
		content: '',
		citations: [],
		error: null,
		mime_type: 'text/markdown',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'highest-relevance-model_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-highest-rel',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case,
	};

	const sourceDocs: SourceDocument[] = [seedPromptDoc, businessCaseDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-per-model',
		instance_id: 'instance-id-456',
		template_step_id: 'template-step-id-789',
		step_key: 'synthesis_generate_per_model',
		step_slug: 'generate-per-model',
		step_name: 'Generate Per Model',
		step_description: 'Generate synthesis per model',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		output_type: FileType.ReducedSynthesis,
		granularity_strategy: 'per_model',
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
			system_materials: {
				agent_internal_summary: '',
				input_artifacts_summary: '',
				stage_rationale: '',
			},
			documents: [
				{
					artifact_class: 'rendered_document',
					file_type: 'markdown',
					document_key: FileType.ReducedSynthesis,
					template_filename: 'reduced_synthesis.md',
				},
			],
			files_to_generate: [
				{
					from_document_key: FileType.ReducedSynthesis,
					template_filename: 'reduced_synthesis.md',
				},
			],
		},
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		config_override: {},
		is_skipped: false,
		object_filter: {},
		output_overrides: {},
		branch_key: null,
		execution_order: 1,
		parallel_group: null,
	};

	const childJobs = planPerModel(sourceDocs, parentJobWithThesisStage, executeRecipeStep, parentJobWithThesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');

	if (isDialecticExecuteJobPayload(job)) {
		const executePayload: DialecticExecuteJobPayload = job;
		assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');

		// per_model EXECUTE jobs have null source_group (consolidation creates new lineage root)
		assertExists(executePayload.document_relationships, 'EXECUTE job should include document_relationships');
		assertEquals(
			executePayload.document_relationships.source_group,
			null,
			'source_group should be null for per_model EXECUTE jobs (consolidation creates new lineage root)'
		);

		// sourceAnchorModelSlug is undefined when anchor is null (no_anchor_required)
		assertEquals(
			executePayload.canonicalPathParams.sourceAnchorModelSlug,
			undefined,
			'sourceAnchorModelSlug should be undefined when anchor is null (per_model no_anchor_required)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel handles no_document_inputs_required by passing null anchor to createCanonicalPathParams', () => {
	// THESIS execute step with only header_context input (no document inputs) - valid configuration
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithThesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		stage_slug: 'thesis',
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'thesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
		},
	};

	// Source document (header context document, not a document-type input)
	const headerContextDoc: SourceDocument = {
		id: 'header-context-doc-id',
		contribution_type: 'header_context',
		content: '',
		citations: [],
		error: null,
		mime_type: 'text/plain',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: null,
		storage_bucket: 'dialectic-contributions',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis',
		model_id: parentPayload.model_id,
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.HeaderContext,
	};

	const sourceDocs: SourceDocument[] = [headerContextDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-no-doc-inputs',
		instance_id: 'instance-id-123',
		template_step_id: 'template-step-id-456',
		step_key: 'thesis_generate_business_case',
		step_slug: 'generate-business-case',
		step_name: 'Generate Business Case',
		step_description: 'Generate business case using header context',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		output_type: FileType.business_case,
		granularity_strategy: 'per_model',
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
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.business_case,
				template_filename: 'business_case.md',
			}],
		},
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		config_override: {},
		is_skipped: false,
		object_filter: {},
		output_overrides: {},
		branch_key: null,
		execution_order: 1,
		parallel_group: null,
	};

	const childJobs = planPerModel(sourceDocs, parentJobWithThesisStage, executeRecipeStep, parentJobWithThesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
	if (isDialecticExecuteJobPayload(job)) {
		assertExists(job.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
		// This test will initially FAIL because planner doesn't handle SelectAnchorResult
		// After implementation, sourceAnchorModelSlug should be undefined because no anchor is passed (no_document_inputs_required)
		assertEquals(
			job.canonicalPathParams.sourceAnchorModelSlug,
			undefined,
			'sourceAnchorModelSlug should be undefined when recipe step has no document inputs'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel per_model EXECUTE with document inputs still returns no_anchor_required', () => {
	// per_model EXECUTE jobs always return no_anchor_required regardless of document inputs
	// This is the consolidation scenario - bundling all inputs into one job
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithThesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		stage_slug: 'thesis',
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'thesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
		},
	};

	// Lower relevance document
	const lowerRelevanceDoc: SourceDocument = {
		id: 'lower-relevance-doc-id',
		contribution_type: 'thesis',
		content: '',
		citations: [],
		error: null,
		mime_type: 'text/markdown',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'lower-relevance-model_0_feature_spec.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-456',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.feature_spec,
	};

	// Highest relevance document
	const businessCaseDoc: SourceDocument = {
		id: 'business-case-anchor-found',
		contribution_type: 'thesis',
		content: '',
		citations: [],
		error: null,
		mime_type: 'text/markdown',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'anchor-model-slug_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-123',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case,
	};

	const sourceDocs: SourceDocument[] = [lowerRelevanceDoc, businessCaseDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-anchor-found',
		instance_id: 'instance-id-123',
		template_step_id: 'template-step-id-456',
		step_key: 'thesis_generate_business_case',
		step_slug: 'generate-business-case',
		step_name: 'Generate Business Case',
		prompt_template_id: 'template-executor-id',
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
				relevance: 0.8,
			},
		],
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
		granularity_strategy: 'per_model',
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

	const childJobs = planPerModel(sourceDocs, parentJobWithThesisStage, executeRecipeStep, parentJobWithThesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
	if (isDialecticExecuteJobPayload(job)) {
		const executePayload: DialecticExecuteJobPayload = job;
		assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');

		// per_model EXECUTE jobs always return no_anchor_required, so source_group is null
		assertExists(executePayload.document_relationships, 'EXECUTE job should include document_relationships');
		assertEquals(
			executePayload.document_relationships.source_group,
			null,
			'source_group should be null for per_model EXECUTE jobs (consolidation creates new lineage root)'
		);

		// sourceAnchorModelSlug is undefined when anchor is null (no_anchor_required)
		assertEquals(
			executePayload.canonicalPathParams.sourceAnchorModelSlug,
			undefined,
			'sourceAnchorModelSlug should be undefined for per_model (no_anchor_required)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel per_model does not throw even when document_key mismatch (no_anchor_required)', () => {
	// per_model EXECUTE jobs return no_anchor_required BEFORE checking document inputs
	// So even if document_key doesn't match, it won't throw - it creates job with null source_group
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithThesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		stage_slug: 'thesis',
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'thesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
		},
	};

	// Document with wrong document_key, not matching recipe requirement
	const wrongDocumentDoc: SourceDocument = {
		id: 'wrong-document-id',
		contribution_type: 'thesis',
		content: '',
		citations: [],
		error: null,
		mime_type: 'text/markdown',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'model_0_feature_spec.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-123',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.feature_spec,
	};

	const sourceDocs: SourceDocument[] = [wrongDocumentDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-anchor-not-found',
		instance_id: 'instance-id-123',
		template_step_id: 'template-step-id-456',
		step_key: 'thesis_generate_business_case',
		step_slug: 'generate-business-case',
		step_name: 'Generate Business Case',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
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
		granularity_strategy: 'per_model',
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

	// per_model returns no_anchor_required, so this does NOT throw
	const childJobs = planPerModel(sourceDocs, parentJobWithThesisStage, executeRecipeStep, parentJobWithThesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');

	if (isDialecticExecuteJobPayload(job)) {
		// per_model always returns no_anchor_required, so source_group is null
		assertEquals(
			job.document_relationships?.source_group,
			null,
			'source_group should be null for per_model (no_anchor_required)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

// ==============================================
// Step 96.c: Input bundling and lineage handling tests
// ==============================================

Deno.test('96.c.i: Given n² pairwise outputs, planPerModel creates 1 job per model with all outputs bundled', () => {
	// Given: 9 pairwise comparison documents (3 models × 3 comparisons each)
	// When: planPerModel is called with parent job model_id = 'model-A'
	// Then: Creates exactly 1 job containing all 9 documents bundled

	const pairwiseDocs: SourceDocument[] = [];
	const models = ['model-A', 'model-B', 'model-C'];

	// Create 9 pairwise comparison documents (n² for n=3 models)
	for (let i = 0; i < 9; i++) {
		pairwiseDocs.push({
			id: `pairwise-doc-${i}`,
			content: `Pairwise comparison ${i}`,
			contribution_type: 'antithesis',
			model_name: models[i % 3],
			model_id: models[i % 3],
			document_key: FileType.comparison_vector,
			session_id: 'session-abc',
			user_id: 'user-def',
			stage: 'antithesis',
			iteration_number: 1,
			edit_version: 1,
			is_latest_edit: true,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			file_name: `${models[i % 3]}_${i}_comparison_vector.json`,
			storage_bucket: 'test-bucket',
			storage_path: 'project-123/session_abc/iteration_1/2_antithesis/documents',
			prompt_template_id_used: 'template-123',
			target_contribution_id: null,
			seed_prompt_url: null,
			original_model_contribution_id: null,
			raw_response_storage_path: null,
			tokens_used_input: 100,
			tokens_used_output: 200,
			processing_time_ms: 1000,
			error: null,
			citations: null,
			size_bytes: 100,
			mime_type: 'application/json',
			document_relationships: null,
			is_header: false,
			source_prompt_resource_id: null,
			attempt_count: 0,
		});
	}

	const parentJobForConsolidation: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		stage_slug: 'synthesis',
		payload: {
			projectId: MOCK_PAYLOAD.projectId,
			sessionId: MOCK_PAYLOAD.sessionId,
			stageSlug: 'synthesis',
			iterationNumber: MOCK_PAYLOAD.iterationNumber,
			model_id: 'model-A',
			walletId: MOCK_PAYLOAD.walletId,
			user_jwt: MOCK_PAYLOAD.user_jwt,
		},
	};

	const consolidationRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		id: 'consolidation-step-id',
		job_type: 'EXECUTE',
		granularity_strategy: 'per_model',
		output_type: FileType.ReducedSynthesis,
		inputs_required: [
			{ type: 'document', slug: 'antithesis', document_key: FileType.comparison_vector, required: true, multiple: true },
		],
		inputs_relevance: [{ document_key: FileType.comparison_vector, relevance: 1.0 }],
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
		},
	};

	const childPayloads = planPerModel(
		pairwiseDocs,
		parentJobForConsolidation,
		consolidationRecipeStep,
		parentJobForConsolidation.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly 1 job for consolidation (bundles all inputs)');
});

Deno.test('96.c.ii: Job payload inputs contains array of all bundled document IDs', () => {
	// Given: Multiple source documents
	// When: planPerModel bundles them
	// Then: payload.inputs contains array with all document IDs

	const sourceDocs: SourceDocument[] = [
		{
			...MOCK_SOURCE_DOCS[0],
			id: 'bundled-doc-1',
			contribution_type: 'antithesis',
			document_key: FileType.comparison_vector,
		},
		{
			...MOCK_SOURCE_DOCS[1],
			id: 'bundled-doc-2',
			contribution_type: 'antithesis',
			document_key: FileType.comparison_vector,
		},
		{
			...MOCK_SOURCE_DOCS[0],
			id: 'bundled-doc-3',
			contribution_type: 'antithesis',
			document_key: FileType.comparison_vector,
		},
	];

	const consolidationRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		id: 'bundling-step-id',
		job_type: 'EXECUTE',
		granularity_strategy: 'per_model',
		output_type: FileType.ReducedSynthesis,
		inputs_required: [
			{ type: 'document', slug: 'antithesis', document_key: FileType.comparison_vector, required: true, multiple: true },
		],
		inputs_relevance: [{ document_key: FileType.comparison_vector, relevance: 1.0 }],
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
		},
	};

	const childPayloads = planPerModel(
		sourceDocs,
		MOCK_PARENT_JOB,
		consolidationRecipeStep,
		MOCK_PARENT_JOB.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly 1 job');
	const payload = childPayloads[0];
	assertExists(payload, 'Payload should exist');

	if (isDialecticExecuteJobPayload(payload)) {
		// Check that inputs contains an array of all document IDs
		const antithesisIds = payload.inputs.antithesis_ids;
		assert(Array.isArray(antithesisIds), 'inputs.antithesis_ids should be an array');
		assertEquals(antithesisIds.length, 3, 'Should contain all 3 bundled document IDs');
		assert(antithesisIds.includes('bundled-doc-1'), 'Should include bundled-doc-1');
		assert(antithesisIds.includes('bundled-doc-2'), 'Should include bundled-doc-2');
		assert(antithesisIds.includes('bundled-doc-3'), 'Should include bundled-doc-3');
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('96.c.iii: When selectAnchorSourceDocument returns no_anchor_required, planner sets document_relationships.source_group = null', () => {
	// Given: A consolidation step where selectAnchorSourceDocument returns 'no_anchor_required'
	// When: planPerModel creates the job
	// Then: document_relationships.source_group is explicitly set to null

	const consolidationDocs: SourceDocument[] = [
		{
			...MOCK_SOURCE_DOCS[0],
			id: 'consolidation-input-1',
			contribution_type: 'antithesis',
			document_key: FileType.comparison_vector,
		},
	];

	// Recipe step with no document inputs in inputs_relevance (triggers no_anchor_required)
	const noAnchorRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		id: 'no-anchor-step-id',
		job_type: 'EXECUTE',
		granularity_strategy: 'per_model',
		output_type: FileType.ReducedSynthesis,
		inputs_required: [],
		inputs_relevance: [],
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
		},
	};

	const childPayloads = planPerModel(
		consolidationDocs,
		MOCK_PARENT_JOB,
		noAnchorRecipeStep,
		MOCK_PARENT_JOB.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly 1 job');
	const payload = childPayloads[0];
	assertExists(payload, 'Payload should exist');

	if (isDialecticExecuteJobPayload(payload)) {
		assertExists(payload.document_relationships, 'document_relationships should exist');
		assertEquals(
			payload.document_relationships.source_group,
			null,
			'source_group should be explicitly null when no_anchor_required (consolidation creates new lineage)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('96.c.iv: Consolidation job creates new lineage root (source_group = null signals producer to set self.id)', () => {
	// Given: A consolidation step
	// When: planPerModel creates the job
	// Then: source_group = null indicates producer should set source_group = self.id after save

	const consolidationDocs: SourceDocument[] = [
		{
			...MOCK_SOURCE_DOCS[0],
			id: 'lineage-input-1',
			contribution_type: 'antithesis',
			document_key: FileType.comparison_vector,
		},
		{
			...MOCK_SOURCE_DOCS[1],
			id: 'lineage-input-2',
			contribution_type: 'antithesis',
			document_key: FileType.comparison_vector,
		},
	];

	// Consolidation recipe step - bundles inputs into new lineage root
	const consolidationRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		id: 'lineage-root-step-id',
		job_type: 'EXECUTE',
		granularity_strategy: 'per_model',
		output_type: FileType.ReducedSynthesis,
		inputs_required: [],
		inputs_relevance: [],
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.ReducedSynthesis,
				template_filename: 'reduced_synthesis.md',
			}],
		},
	};

	const childPayloads = planPerModel(
		consolidationDocs,
		MOCK_PARENT_JOB,
		consolidationRecipeStep,
		MOCK_PARENT_JOB.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly 1 consolidation job');
	const payload = childPayloads[0];
	assertExists(payload, 'Payload should exist');

	if (isDialecticExecuteJobPayload(payload)) {
		assertExists(payload.document_relationships, 'document_relationships should exist for consolidation job');
		assertEquals(
			payload.document_relationships.source_group,
			null,
			'source_group must be null to signal producer should create new lineage root (set source_group = self.id after save)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('96.c.v: Job is assigned to correct model based on parent job model_id', () => {
	// Given: Parent job has model_id = 'target-model-xyz'
	// When: planPerModel creates a job
	// Then: Child job model_id = 'target-model-xyz'

	const targetModelId = 'target-model-xyz';

	const parentJobWithTargetModel: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		payload: {
			projectId: MOCK_PAYLOAD.projectId,
			sessionId: MOCK_PAYLOAD.sessionId,
			stageSlug: MOCK_PAYLOAD.stageSlug,
			iterationNumber: MOCK_PAYLOAD.iterationNumber,
			model_id: targetModelId,
			walletId: MOCK_PAYLOAD.walletId,
			user_jwt: MOCK_PAYLOAD.user_jwt,
		},
	};

	const childPayloads = planPerModel(
		MOCK_SOURCE_DOCS,
		parentJobWithTargetModel,
		MOCK_RECIPE_STEP,
		parentJobWithTargetModel.payload.user_jwt
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly 1 job');
	const payload = childPayloads[0];
	assertExists(payload, 'Payload should exist');
	assertEquals(payload.model_id, targetModelId, 'Child job model_id must match parent job model_id');
});

Deno.test('planPerModel sets document_key from header_context_artifact for EXECUTE job when documents array is empty', () => {
	const executeRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		output_type: FileType.HeaderContext,
		outputs_required: {
			header_context_artifact: {
				type: 'header_context',
				document_key: FileType.HeaderContext,
				artifact_class: 'header_context',
				file_type: 'json',
			},
			documents: [], // Empty, triggering the need for header_context_artifact fallback logic
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.HeaderContext,
					template_filename: 'synthesis_header.md', // Dummy
				},
			],
		} as unknown as DialecticStageRecipeStep['outputs_required'],
	};

	const childJobs = planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	if (isDialecticExecuteJobPayload(job)) {
		assertEquals(
			job.document_key,
			FileType.HeaderContext,
			'document_key should be extracted from recipeStep.outputs_required.header_context_artifact.document_key',
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerModel adds header_context_id to inputs when recipe step requires header_context', () => {
	const headerContextDoc: SourceDocument = {
		id: 'header-context-id-123',
		contribution_type: 'header_context',
		content: '',
		citations: null,
		error: null,
		mime_type: 'application/json',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'parenthesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'model-parent_0_header_context.json',
		storage_bucket: 'dialectic-contributions',
		storage_path: 'project-xyz/session_abc/iteration_1/4_parenthesis',
		model_id: 'model-parent',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.HeaderContext,
	};

	const documentDoc: SourceDocument = {
		id: 'document-doc-1',
		contribution_type: 'synthesis',
		content: 'Document content',
		citations: null,
		error: null,
		mime_type: 'text/markdown',
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		size_bytes: 0,
		target_contribution_id: null,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: null,
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'synthesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'model-parent_0_system_architecture.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-xyz/session_abc/iteration_1/3_synthesis/documents',
		model_id: 'model-parent',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.system_architecture,
	};

	const sourceDocsWithHeaderContext: SourceDocument[] = [headerContextDoc, documentDoc];

	const recipeStepRequiringHeaderContext: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		inputs_required: [
			{
				type: 'header_context',
				slug: 'parenthesis',
				document_key: FileType.HeaderContext,
				required: true,
			},
			{
				type: 'document',
				slug: 'synthesis',
				document_key: FileType.system_architecture,
				required: true,
			},
		],
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.technical_requirements,
				template_filename: 'technical_requirements.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.technical_requirements,
				template_filename: 'technical_requirements.md',
			}],
		},
	};

	const childJobs = planPerModel(
		sourceDocsWithHeaderContext,
		MOCK_PARENT_JOB,
		recipeStepRequiringHeaderContext,
		MOCK_PARENT_JOB.payload.user_jwt
	);

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	if (isDialecticExecuteJobPayload(job)) {
		const executePayload: DialecticExecuteJobPayload = job;
		assertExists(executePayload.inputs, 'EXECUTE job payload should include inputs');
		assertExists(
			executePayload.inputs.header_context_id,
			'inputs should include header_context_id when recipe step requires header_context'
		);
		assertEquals(
			executePayload.inputs.header_context_id,
			'header-context-id-123',
			'header_context_id should match the header_context document id with matching model_id'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});
