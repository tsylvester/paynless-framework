// supabase/functions/dialectic-worker/strategies/planners/planPerModel.test.ts
import {
	assertEquals,
	assertExists,
	assert,
	assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
	DialecticJobRow,
	SourceDocument,
	DialecticPlanJobPayload,
	DialecticStageRecipeStep,
	DialecticExecuteJobPayload,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planPerModel } from './planPerModel.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
	{
		id: 'doc-1',
		content: 'Source document 1',
		contribution_type: 'synthesis',
		model_name: 'Model A',
	},
	{
		id: 'doc-2',
		content: 'Source document 2',
		contribution_type: 'synthesis',
		model_name: 'Model B',
	},
].map((d) => ({
	...d,
	session_id: 'session-abc',
	user_id: 'user-def',
	stage: 'synthesis',
	iteration_number: 1,
	edit_version: 1,
	is_latest_edit: true,
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	file_name: `${d.id}.md`,
	storage_bucket: 'test-bucket',
	storage_path: `test/${d.id}.md`,
	model_id: d.model_name.split(' ')[1],
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
}));

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
	id: 'parent-job-123',
	session_id: 'session-abc',
	user_id: 'user-def',
	stage_slug: 'parenthesis',
	iteration_number: 1,
	payload: {
		job_type: 'PLAN',
		projectId: 'project-xyz',
		sessionId: 'session-abc',
		stageSlug: 'parenthesis',
		iterationNumber: 1,
		model_id: 'model-parent',
		walletId: 'wallet-default',
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
	inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.product_requirements, required: true }],
	inputs_relevance: [],
	outputs_required: { documents: [], assembled_json: [], files_to_generate: [] },
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
		'user-jwt-123'
	);

	assertEquals(childPayloads.length, 1, 'Should create exactly one child job');

	const jobPayload = childPayloads[0];
	assertExists(jobPayload);

	// This assertion will fail because the source uses `prompt_template_name`
	assertEquals(jobPayload.prompt_template_id, MOCK_RECIPE_STEP.prompt_template_id);
	assert(!('prompt_template_name' in jobPayload), 'The deprecated prompt_template_name property should not be present');

	assertEquals(jobPayload.output_type, MOCK_RECIPE_STEP.output_type);
	assertEquals(jobPayload.model_id, MOCK_PARENT_JOB.payload.model_id, "Child job's model_id should match the parent job's model_id");
	assertEquals(jobPayload.job_type, 'execute');
	assertEquals(
		jobPayload.sourceContributionId,
		MOCK_SOURCE_DOCS[0].id,
		'sourceContributionId should match the anchor document id when provided'
	);
});

Deno.test('planPerModel should throw an error if sourceDocs are empty', () => {
	assertThrows(
		() => {
			planPerModel([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
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
				'user-jwt-123'
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
			'user-jwt-123'
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

	const childJobs = planPerModel(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, mockRecipeStepWithId, 'user-jwt-123');

	assertEquals(childJobs.length, 1, 'Should create exactly one child job');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertExists(job.planner_metadata, 'Child job should include planner_metadata');
	assertEquals(
		job.planner_metadata?.recipe_step_id,
		'recipe-step-model-789',
		'planner_metadata.recipe_step_id should match the recipe step id',
	);
});