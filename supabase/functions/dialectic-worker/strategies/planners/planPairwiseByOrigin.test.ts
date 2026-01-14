// supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.test.ts
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
	DialecticExecuteJobPayload,
	DialecticStageRecipeStep,
	DialecticRecipeTemplateStep,
	ContextForDocument,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planPairwiseByOrigin } from './planPairwiseByOrigin.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { isDialecticExecuteJobPayload, isDialecticPlanJobPayload } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';

// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
	{
		id: 'thesis-1',
		target_contribution_id: null,
		content: 'Thesis 1 content',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'gpt-4_0_business_case.md',
		storage_bucket: 'test-bucket',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis/documents',
		model_id: 'gpt-4',
		model_name: 'gpt-4',
		prompt_template_id_used: 'template-123',
		seed_prompt_url: null,
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 100,
		tokens_used_output: 200,
		processing_time_ms: 1000,
		error: null,
		citations: null,
		contribution_type: 'thesis',
		size_bytes: 1000,
		mime_type: 'text/markdown',
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case,
		attempt_count: 0,
	},
	{
		id: 'thesis-2',
		target_contribution_id: null,
		content: 'Thesis 2 content',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'claude-3-opus_0_business_case.md',
		storage_bucket: 'test-bucket',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis/documents',
		model_id: 'claude-3-opus',
		model_name: 'claude-3-opus',
		prompt_template_id_used: 'template-456',
		seed_prompt_url: null,
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 150,
		tokens_used_output: 250,
		processing_time_ms: 1500,
		error: null,
		citations: null,
		contribution_type: 'thesis',
		size_bytes: 1500,
		mime_type: 'text/markdown',
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case,
		attempt_count: 0,
	},
	{
		id: 'antithesis-1a',
		target_contribution_id: 'thesis-1',
		content: 'Antithesis 1a content',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'gpt-4-turbo_0_business_case_critique.md',
		storage_bucket: 'test-bucket',
		storage_path: 'project-xyz/session_abc/iteration_1/2_antithesis/documents',
		model_id: 'gpt-4-turbo',
		model_name: 'gpt-4-turbo',
		prompt_template_id_used: 'template-789',
		seed_prompt_url: null,
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 200,
		tokens_used_output: 300,
		processing_time_ms: 2000,
		error: null,
		citations: null,
		contribution_type: 'antithesis',
		size_bytes: 2000,
		mime_type: 'text/markdown',
		document_relationships: { source_group: 'thesis-1' },
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case_critique,
		attempt_count: 0,
	},
	{
		id: 'antithesis-1b',
		target_contribution_id: 'thesis-1',
		content: 'Antithesis 1b content',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'claude-3-5-sonnet_0_business_case_critique.md',
		storage_bucket: 'test-bucket',
		storage_path: 'project-xyz/session_abc/iteration_1/2_antithesis/documents',
		model_id: 'claude-3-5-sonnet',
		model_name: 'claude-3-5-sonnet',
		prompt_template_id_used: 'template-101',
		seed_prompt_url: null,
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 250,
		tokens_used_output: 350,
		processing_time_ms: 2500,
		error: null,
		citations: null,
		contribution_type: 'antithesis',
		size_bytes: 2500,
		mime_type: 'text/markdown',
		document_relationships: { source_group: 'thesis-1' },
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case_critique,
		attempt_count: 0,
	},
	{
		id: 'antithesis-2a',
		target_contribution_id: 'thesis-2',
		content: 'Antithesis 2a content',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'gpt-4o_0_business_case_critique.md',
		storage_bucket: 'test-bucket',
		storage_path: 'project-xyz/session_abc/iteration_1/2_antithesis/documents',
		model_id: 'gpt-4o',
		model_name: 'gpt-4o',
		prompt_template_id_used: 'template-112',
		seed_prompt_url: null,
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 300,
		tokens_used_output: 400,
		processing_time_ms: 3000,
		error: null,
		citations: null,
		contribution_type: 'antithesis',
		size_bytes: 3000,
		mime_type: 'text/markdown',
		document_relationships: { source_group: 'thesis-2' },
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case_critique,
		attempt_count: 0,
	},
];

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
	id: 'parent-job-123',
	session_id: 'session-abc',
	user_id: 'user-def',
	stage_slug: 'synthesis',
	iteration_number: 1,
	payload: {
		job_type: 'PLAN',
		projectId: 'project-xyz',
		sessionId: 'session-abc',
		stageSlug: 'synthesis',
		iterationNumber: 1,
		model_id: 'model-ghi',
		walletId: 'wallet-default',
		target_contribution_id: 'test-target-id',
		user_jwt: 'user-jwt-123',
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
	step_key: 'synthesis-pairwise',
	step_slug: 'pairwise-by-origin',
	step_name: 'Generate Pairwise Syntheses',
	prompt_template_id: 'synthesis_step1_pairwise',
	prompt_type: 'Turn',
	job_type: 'EXECUTE',
	inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }, {
		type: 'document',
		slug: 'antithesis',
		document_key: FileType.business_case_critique,
		required: true,
	}],
	inputs_relevance: [
		{ document_key: FileType.business_case, relevance: 0.9 },
		{ document_key: FileType.business_case_critique, relevance: 1.0 },
	],
	outputs_required: {
		documents: [{
			artifact_class: 'rendered_document',
			file_type: 'markdown',
			document_key: FileType.PairwiseSynthesisChunk,
			template_filename: 'pairwise_synthesis_chunk.md',
		}],
		assembled_json: [],
		files_to_generate: [
			{
				from_document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			},
		],
	},
	granularity_strategy: 'pairwise_by_origin',
	output_type: FileType.PairwiseSynthesisChunk,
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	config_override: {},
	is_skipped: false,
	object_filter: {},
	output_overrides: {},
	branch_key: null,
	execution_order: 1,
	parallel_group: null,
	step_description: 'Generate Pairwise Syntheses',
};

Deno.test('planPairwiseByOrigin should create one child job for each thesis-antithesis pair', () => {
	const childPayloads = planPairwiseByOrigin(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		MOCK_RECIPE_STEP,
		'user-jwt-123'
	);

	assertEquals(
		childPayloads.length,
		3,
		'Should create 3 child jobs for the 3 pairs'
	);

	// Helper to find docs
	const findDoc = (id: string) => MOCK_SOURCE_DOCS.find((d) => d.id === id)!;

	// --- Check Job 1 (thesis-1 vs antithesis-1a) ---
	const job1Payload = childPayloads.find(
		(p) => {
			if (isDialecticExecuteJobPayload(p)) {
				return p.inputs?.antithesis_id === 'antithesis-1a';
			}
			return false;
		}
	);
	assertExists(job1Payload, 'Payload for antithesis-1a should exist');

	if (!isDialecticExecuteJobPayload(job1Payload)) {
		throw new Error('Expected EXECUTE job');
	}

	assertEquals(MOCK_RECIPE_STEP.job_type, 'EXECUTE');
	assertEquals(job1Payload.prompt_template_id, 'synthesis_step1_pairwise');
	assertEquals(job1Payload.output_type, FileType.PairwiseSynthesisChunk);
	assertEquals(job1Payload.isIntermediate, true);

	// Check inputs and relationships
	assertEquals(job1Payload.inputs, {
		thesis_id: 'thesis-1',
		antithesis_id: 'antithesis-1a',
	});
	assertEquals(job1Payload.sourceContributionId, 'antithesis-1a');
	assertEquals(job1Payload.document_relationships, {
		thesis: 'thesis-1',
		antithesis: 'antithesis-1a',
		source_group: 'thesis-1',
	});

	// Check canonical params
	assertExists(job1Payload.canonicalPathParams);
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorType, 'antithesis');
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorModelSlug, 'gpt-4-turbo');
	assertEquals(job1Payload.canonicalPathParams.pairedModelSlug, 'gpt-4');
	assertEquals(job1Payload.canonicalPathParams.sourceModelSlugs?.sort(), ['gpt-4', 'gpt-4-turbo'].sort());
	assert(!('originalFileName' in job1Payload));
	
	// Check document_key is set
	assertEquals(job1Payload.document_key, FileType.PairwiseSynthesisChunk, 'document_key should be set from outputs_required.documents[0].document_key');


	// --- Check Job 2 (thesis-1 vs antithesis-1b) ---
	const job2Payload = childPayloads.find(
		(p) => {
			if (isDialecticExecuteJobPayload(p)) {
				return p.inputs?.antithesis_id === 'antithesis-1b';
			}
			return false;
		}
	);
	assertExists(job2Payload, 'Payload for antithesis-1b should exist');
	
	if (!isDialecticExecuteJobPayload(job2Payload)) {
		throw new Error('Expected EXECUTE job');
	}
	
	assertEquals(job2Payload.inputs, {
		thesis_id: 'thesis-1',
		antithesis_id: 'antithesis-1b',
	});
	assertEquals(job2Payload.sourceContributionId, 'antithesis-1b');
	assertExists(job2Payload.canonicalPathParams);
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorType, 'antithesis');
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorModelSlug, 'claude-3-5-sonnet');
	assertEquals(job2Payload.canonicalPathParams.pairedModelSlug, 'gpt-4');
	assertEquals(job2Payload.canonicalPathParams.sourceModelSlugs?.sort(), ['claude-3-5-sonnet', 'gpt-4'].sort());


	// --- Check Job 3 (thesis-2 vs antithesis-2a) ---
	const job3Payload = childPayloads.find(
		(p) => {
			if (isDialecticExecuteJobPayload(p)) {
				return p.inputs?.antithesis_id === 'antithesis-2a';
			}
			return false;
		}
	);
	assertExists(job3Payload, 'Payload for antithesis-2a should exist');
	
	if (!isDialecticExecuteJobPayload(job3Payload)) {
		throw new Error('Expected EXECUTE job');
	}
	
	assertEquals(job3Payload.inputs, {
		thesis_id: 'thesis-2',
		antithesis_id: 'antithesis-2a',
	});
	assertEquals(job3Payload.sourceContributionId, 'antithesis-2a');
	assertExists(job3Payload.canonicalPathParams);
	assertEquals(job3Payload.canonicalPathParams.sourceAnchorType, 'antithesis');
	assertEquals(job3Payload.canonicalPathParams.sourceAnchorModelSlug, 'gpt-4o');
	assertEquals(job3Payload.canonicalPathParams.pairedModelSlug, 'claude-3-opus');
	assertEquals(job3Payload.canonicalPathParams.sourceModelSlugs?.sort(), ['claude-3-opus', 'gpt-4o'].sort());
});

Deno.test('planPairwiseByOrigin should throw an error if there are no theses', () => {
	const noTheses = MOCK_SOURCE_DOCS.filter((d) => d.contribution_type !== 'thesis');
	assertThrows(
		() => {
			planPairwiseByOrigin(noTheses, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
		},
		Error,
		`planPairwiseByOrigin requires at least two different contribution types to create pairs`
	);
});

Deno.test('planPairwiseByOrigin should throw an error if there are no antitheses', () => {
	const noAntitheses = MOCK_SOURCE_DOCS.filter((d) => d.contribution_type !== 'antithesis');
	assertThrows(
		() => {
			planPairwiseByOrigin(
				noAntitheses,
				MOCK_PARENT_JOB,
				MOCK_RECIPE_STEP,
				'user-jwt-123'
			);
		},
		Error,
		`planPairwiseByOrigin requires at least two different contribution types to create pairs`
	);
});

Deno.test('planPairwiseByOrigin should throw an error for empty source documents', () => {
	assertThrows(
		() => {
			planPairwiseByOrigin([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, 'user-jwt-123');
		},
		Error,
		`planPairwiseByOrigin requires at least two different contribution types to create pairs`
	);
});

Deno.test('planPairwiseByOrigin constructs child payloads with dynamic stage consistency (payload.stageSlug === parent.payload.stageSlug)', () => {
	const expectedStage = 'parenthesis';
	const parent: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	Object.defineProperty(parent, 'stage_slug', { value: expectedStage, configurable: true, enumerable: true, writable: true });
	Object.defineProperty(parent.payload, 'stageSlug', { value: expectedStage, configurable: true, enumerable: true, writable: true });

	const childPayloads = planPairwiseByOrigin(MOCK_SOURCE_DOCS, parent, MOCK_RECIPE_STEP, 'ignored.jwt');

	assertEquals(childPayloads.length, 3);
	for (const child of childPayloads) {
		assertEquals(child.stageSlug, expectedStage);
		if (isDialecticExecuteJobPayload(child)) {
			assertEquals(child.sourceContributionId, child.inputs?.antithesis_id);
			assertEquals(child.document_key, FileType.PairwiseSynthesisChunk, 'document_key should be set from outputs_required.documents[0].document_key');
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});

Deno.test('should throw an error if theses exist but no antitheses are related', () => {
	const unrelatedAntitheses = [
		{
			...MOCK_SOURCE_DOCS[2],
			id: 'antithesis-unrelated',
			target_contribution_id: 'some-other-thesis',
			document_relationships: {
				source_group: 'some-other-thesis',
			},
		},
	];
	const thesesOnly = MOCK_SOURCE_DOCS.filter((d) => d.contribution_type === 'thesis');

	assertThrows(
		() => {
			planPairwiseByOrigin(
				[...thesesOnly, ...unrelatedAntitheses],
				MOCK_PARENT_JOB,
				MOCK_RECIPE_STEP,
				'user-jwt-123'
			);
		},
		Error,
		`planPairwiseByOrigin requires documents with pairwise relationships (source_group references), but none were found`
	);
});

Deno.test('should throw an error if antitheses exist but no matching theses are found', () => {
	const antithesesOnly = MOCK_SOURCE_DOCS.filter((d) =>
		d.contribution_type === 'antithesis'
	);
	assertThrows(
		() => {
			planPairwiseByOrigin(
				antithesesOnly,
				MOCK_PARENT_JOB,
				MOCK_RECIPE_STEP,
				'user-jwt-123'
			);
		},
		Error,
		`planPairwiseByOrigin requires at least two different contribution types to create pairs`
	);
});

Deno.test('planPairwiseByOrigin Test Case A: The Failing Case (Proves the bug exists)', () => {
	// This test proves the bug by showing that the planner is not "self-aware".
	// It creates jobs for models that are not its own.
	const failingParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'failing-parent-job',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage_slug: 'synthesis',
		iteration_number: 1,
		payload: {
			job_type: 'PLAN',
			projectId: 'project-xyz',
			sessionId: 'session-abc',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			model_id: 'parent-model-id', // The parent planner belongs to this model
			walletId: 'wallet-default',
			user_jwt: 'user-jwt-123',
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

	const childPayloads = planPairwiseByOrigin(MOCK_SOURCE_DOCS, failingParentJob, MOCK_RECIPE_STEP, 'user-jwt-123');

	// With the bug present, this will throw an error because the child's model_id will be
	// based on the source docs, not the parent job.
	try {
		childPayloads.forEach(child => {
			assertEquals(child.model_id, failingParentJob.payload.model_id, "Child job model_id must match the parent job's model_id");
			if (isDialecticExecuteJobPayload(child)) {
				assertEquals(child.sourceContributionId, child.inputs?.antithesis_id);
			}
		});
		assert(false, "Test A expected an error to be thrown, but none was. The bug may be fixed.");
	} catch (e) {
		assert(e instanceof Error);
		console.log("Test A passed by catching an expected error, confirming the bug's presence.");
	}
});

Deno.test('planPairwiseByOrigin Test Case B: The Passing Case (Describes the correct behavior)', () => {
	// This test describes the correct "self-aware" behavior. It will FAIL until the bug is fixed.
	const passingParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'passing-parent-job',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage_slug: 'synthesis',
		iteration_number: 1,
		payload: {
			job_type: 'PLAN',
			projectId: 'project-xyz',
			sessionId: 'session-abc',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			model_id: 'parent-model-id', // The parent planner belongs to this model
			walletId: 'wallet-default',
			user_jwt: 'user-jwt-123',
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

	const childPayloads = planPairwiseByOrigin(MOCK_SOURCE_DOCS, passingParentJob, MOCK_RECIPE_STEP, 'user-jwt-123');

	// This test will FAIL initially because the planner is not self-aware.
	// After the fix, it will PASS.
	childPayloads.forEach(child => {
		assertEquals(child.model_id, passingParentJob.payload.model_id, "Child job model_id must match the parent job's model_id");
		if (isDialecticExecuteJobPayload(child)) {
			assertEquals(child.sourceContributionId, child.inputs?.antithesis_id);
		}
	});
});

Deno.test('planPairwiseByOrigin includes planner_metadata with recipe_step_id in child payloads', () => {
	const mockRecipeStepWithId: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		id: 'recipe-step-pairwise-456',
	};

	const childJobs = planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, mockRecipeStepWithId, MOCK_PARENT_JOB.payload.user_jwt);
	
	assertEquals(childJobs.length, 3, 'Should create 3 child jobs for the 3 pairs');
	
	// Assert that every job in the returned payload array includes planner_metadata with recipe_step_id
	childJobs.forEach(job => {
		assertExists(job, 'Child job should exist');
		if (isDialecticExecuteJobPayload(job)) {
			assertExists(job.planner_metadata, 'Child job should include planner_metadata');
			assertEquals(
				job.planner_metadata?.recipe_step_id,
				'recipe-step-pairwise-456',
				'planner_metadata.recipe_step_id should match the recipe step id',
			);
			assertEquals(job.document_key, FileType.PairwiseSynthesisChunk, 'document_key should be set from outputs_required.documents[0].document_key');
		} else {
			throw new Error('Expected EXECUTE job');
		}
	});
});

Deno.test('planPairwiseByOrigin should inherit all fields from parent job payload', () => {
	const parentJobWithAllFields: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'parent-job-123',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage_slug: 'synthesis',
		iteration_number: 1,
		payload: {
			job_type: 'PLAN',
			projectId: 'project-xyz',
			sessionId: 'session-abc',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			model_id: 'model-ghi',
			walletId: 'wallet-default',
			model_slug: 'parent-model-slug',
			user_jwt: 'parent-jwt-token',
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

	const childPayloads = planPairwiseByOrigin(
		MOCK_SOURCE_DOCS,
		parentJobWithAllFields,
		MOCK_RECIPE_STEP,
		'user-jwt-123'
	);

	assertEquals(childPayloads.length, 3, 'Should create 3 child jobs for the 3 pairs');

	// Assert that every job in the returned payload array includes model_slug and user_jwt
	childPayloads.forEach((job, index) => {
		assertExists(job, `Child job ${index} should exist`);
		assertEquals(
			job.model_slug,
			'parent-model-slug',
			`Child job ${index} should inherit model_slug from parent job`
		);
		assertEquals(
			job.user_jwt,
			'parent-jwt-token',
			`Child job ${index} should inherit user_jwt from parent job`
		);
		if (isDialecticExecuteJobPayload(job)) {
			assertEquals(job.document_key, FileType.PairwiseSynthesisChunk, `Child job ${index} should have document_key set from outputs_required.documents[0].document_key`);
		}
	});
});

Deno.test('planPairwiseByOrigin should set document_key in payload when outputs_required.documents[0].document_key is valid', () => {
	const mockRecipeStepWithDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.PairwiseSynthesisChunk,
					template_filename: 'pairwise_synthesis_chunk.md',
				},
			],
		},
	};

	const childPayloads = planPairwiseByOrigin(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		mockRecipeStepWithDocumentKey,
		MOCK_PARENT_JOB.payload.user_jwt
	);

	assertEquals(childPayloads.length, 3, 'Should create 3 child jobs for the 3 pairs');

	// Assert that every payload has document_key set correctly
	childPayloads.forEach((payload, index) => {
		assertExists(
			payload,
			`Child payload ${index} should exist`
		);
		if (isDialecticExecuteJobPayload(payload)) {
			assertEquals(
				payload.document_key,
				FileType.PairwiseSynthesisChunk,
				`Child payload ${index} should have document_key set to FileType.PairwiseSynthesisChunk`
			);
		} else {
			throw new Error(`Expected EXECUTE job at index ${index}`);
		}
	});
});

Deno.test('planPairwiseByOrigin throws error when outputs_required.documents array is empty', () => {
	const mockRecipeStepWithEmptyDocuments: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.PairwiseSynthesisChunk,
					template_filename: 'pairwise_synthesis_chunk.md',
				},
			],
		},
	};

	assertThrows(
		() => {
			planPairwiseByOrigin(
				MOCK_SOURCE_DOCS,
				MOCK_PARENT_JOB,
				mockRecipeStepWithEmptyDocuments,
				MOCK_PARENT_JOB.payload.user_jwt
			);
		},
		Error,
		'planPairwiseByOrigin requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs'
	);
});

Deno.test('planPairwiseByOrigin throws error when outputs_required is missing documents property', () => {
	const mockRecipeStepWithoutDocumentsProperty: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.PairwiseSynthesisChunk,
					template_filename: 'pairwise_synthesis_chunk.md',
				},
			],
		},
	};

	assertThrows(
		() => {
			planPairwiseByOrigin(
				MOCK_SOURCE_DOCS,
				MOCK_PARENT_JOB,
				mockRecipeStepWithoutDocumentsProperty,
				MOCK_PARENT_JOB.payload.user_jwt
			);
		},
		Error,
		'planPairwiseByOrigin requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing'
	);
});

Deno.test('planPairwiseByOrigin should throw an error when outputs_required.documents[0] is missing document_key property', () => {
	const mockRecipeStepWithoutDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.PairwiseSynthesisChunk,
					template_filename: 'pairwise_synthesis_chunk.md',
				},
			],
		},
	};
	// Remove document_key property to test validation
	if (mockRecipeStepWithoutDocumentKey.outputs_required?.documents?.[0] && 'document_key' in mockRecipeStepWithoutDocumentKey.outputs_required.documents[0]) {
		delete (mockRecipeStepWithoutDocumentKey.outputs_required.documents[0] as { document_key?: FileType }).document_key;
	}

	assertThrows(
		() => {
			planPairwiseByOrigin(
				MOCK_SOURCE_DOCS,
				MOCK_PARENT_JOB,
				mockRecipeStepWithoutDocumentKey,
				'user-jwt-123'
			);
		},
		Error,
		'planPairwiseByOrigin requires recipeStep.outputs_required.documents[0].document_key but it is missing'
	);
});

Deno.test('planPairwiseByOrigin includes context_for_documents in payload for PLAN jobs with valid context_for_documents', () => {
	const planRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			context_for_documents: [
				{
					document_key: FileType.PairwiseSynthesisChunk,
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
	};

	const validParentJob = {
		...MOCK_PARENT_JOB,
		payload: Object.assign({}, MOCK_PARENT_JOB.payload, {
			target_contribution_id: 'test-target-id',
			model_slug: 'test-model-slug',
			continueUntilComplete: false,
			maxRetries: 3,
			continuation_count: 0,
			is_test_job: false,
		}),
	};

	const childJobs = planPairwiseByOrigin(MOCK_SOURCE_DOCS, validParentJob, planRecipeStep, 'user-jwt-123');
	
	assertEquals(childJobs.length, 3, 'Should create 3 child jobs for the 3 pairs');
	const jobCandidate = childJobs[0];
	if (!isDialecticPlanJobPayload(jobCandidate)) {
		throw new Error('Expected PLAN job');
	}
	const job: DialecticPlanJobPayload = jobCandidate;
	assertExists(job, 'Child job should exist');
	assertExists(job.context_for_documents, 'PLAN job payload should include context_for_documents');
	assertEquals(job.context_for_documents.length, 1, 'context_for_documents should have one entry');
	assertEquals(job.context_for_documents[0].document_key, FileType.PairwiseSynthesisChunk, 'document_key should match');
});

Deno.test('planPairwiseByOrigin throws error for PLAN job when context_for_documents is missing', async () => {
	const planRecipeStepWithoutContext: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
	};

	await assertRejects(
		async () => {
			planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContext, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPairwiseByOrigin requires',
		'Should throw error when context_for_documents is missing for PLAN job',
	);
});

Deno.test('planPairwiseByOrigin throws error for PLAN job when context_for_documents entry is missing document_key', async () => {
	const planRecipeStepWithoutDocumentKey: DialecticStageRecipeStep = {
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
	};

	await assertRejects(
		async () => {
			planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutDocumentKey, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPairwiseByOrigin requires',
		'Should throw error when context_for_documents entry is missing document_key',
	);
});

Deno.test('planPairwiseByOrigin throws error for PLAN job when context_for_documents entry is missing content_to_include', async () => {
	const planRecipeStepWithoutContentToInclude: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			context_for_documents: [
				{
					document_key: FileType.PairwiseSynthesisChunk,
				} as unknown as ContextForDocument,
			],
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
	};

	await assertRejects(
		async () => {
			planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContentToInclude, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPairwiseByOrigin requires',
		'Should throw error when context_for_documents entry is missing content_to_include',
	);
});

Deno.test('planPairwiseByOrigin successfully creates payload for EXECUTE job with valid files_to_generate', () => {
	const executeRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.PairwiseSynthesisChunk,
					template_filename: 'pairwise_synthesis_chunk.md',
				},
			],
		},
	};

	const childJobs = planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
	
	assertEquals(childJobs.length, 3, 'Should create 3 child jobs for the 3 pairs');
	const jobCandidate = childJobs[0];
	if (!isDialecticExecuteJobPayload(jobCandidate)) {
		throw new Error('Expected EXECUTE job');
	}
	const job: DialecticExecuteJobPayload = jobCandidate;
	assertExists(job, 'Child job should exist');
	assertEquals(isDialecticExecuteJobPayload(job), true, 'Job type should be execute');
});

Deno.test('planPairwiseByOrigin throws error for EXECUTE job when files_to_generate is missing', async () => {
	const executeRecipeStepWithoutFiles: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
		},
	};

	await assertRejects(
		async () => {
			planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFiles, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPairwiseByOrigin requires',
		'Should throw error when files_to_generate is missing for EXECUTE job',
	);
});

Deno.test('planPairwiseByOrigin throws error for EXECUTE job when files_to_generate entry is missing from_document_key', async () => {
	const executeRecipeStepWithoutFromDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					template_filename: 'pairwise_synthesis_chunk.md',
				} as unknown as { from_document_key: FileType; template_filename: string },
			],
		},
	};

	await assertRejects(
		async () => {
			planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFromDocumentKey, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPairwiseByOrigin requires',
		'Should throw error when files_to_generate entry is missing from_document_key',
	);
});

Deno.test('planPairwiseByOrigin throws error for EXECUTE job when files_to_generate entry is missing template_filename', async () => {
	const executeRecipeStepWithoutTemplateFilename: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.PairwiseSynthesisChunk,
				} as unknown as { from_document_key: FileType; template_filename: string },
			],
		},
	};

	await assertRejects(
		async () => {
			planPairwiseByOrigin(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutTemplateFilename, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPairwiseByOrigin requires',
		'Should throw error when files_to_generate entry is missing template_filename',
	);
});

Deno.test('planPairwiseByOrigin EXECUTE branch must not set document_relationships[stageSlug] for root jobs', () => {
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	// Use a stageSlug that doesn't match any contribution_type in the test data
	// This proves the planner doesn't set document_relationships[stageSlug] separately,
	// since the key would only exist if set by the planner (not by contribution_type assignment)
	const parentJobWithNonMatchingStageSlug: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'synthesis', // Doesn't match 'thesis' or 'antithesis' contribution_types in test data
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			target_contribution_id: parentPayload.target_contribution_id,
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

	const childPayloads = planPairwiseByOrigin(
		MOCK_SOURCE_DOCS,
		parentJobWithNonMatchingStageSlug,
		executeRecipeStep,
		parentJobWithNonMatchingStageSlug.payload.user_jwt
	);

	assertEquals(childPayloads.length, 3, 'Should create one child job per thesis-antithesis pair');

	for (const payload of childPayloads) {
		assertExists(payload, 'Child job should exist');
		if (isDialecticExecuteJobPayload(payload)) {
			const executePayload: DialecticExecuteJobPayload = payload;
			assertExists(executePayload.document_relationships, 'EXECUTE job payload should include document_relationships');
			assertExists(executePayload.document_relationships?.source_group, 'document_relationships should include source_group');
			
			// Find the anchor document (thesis) for this pair
			const thesisId = executePayload.inputs?.thesis_id;
			assertExists(thesisId, 'Payload should have thesis_id in inputs');
			assertEquals(
				executePayload.document_relationships.source_group,
				thesisId,
				'source_group should be set to anchorDoc.id (thesis id) for lineage tracking',
			);
			
			// Assert that the stageSlug key is NOT present when it doesn't match any contribution_type
			// This proves the planner does not set document_relationships[stageSlug] separately.
			// If the bug existed, it would set document_relationships['synthesis'] = anchorDoc.id,
			// but since 'synthesis' doesn't match any contribution_type, the key would only exist
			// if set by the planner's stageSlug assignment (which we've removed).
			assert(
				!('synthesis' in executePayload.document_relationships),
				'document_relationships[stageSlug] must be absent when stageSlug does not match any contribution_type. This proves the planner does not set it separately (the key would only exist if set by the removed stageSlug assignment).',
			);
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});

Deno.test('planPairwiseByOrigin uses relevance-selected anchor for canonical path params, not structural anchor', () => {
	// Test proves planner should use universal selector for canonical params,
	// selecting highest-relevance document (antithesis), NOT the structural anchorDoc (thesis).
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithSynthesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
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
			is_test_job: parentPayload.is_test_job,
		},
	};

	// Thesis document (structural anchorDoc, lower relevance)
	const thesisDoc: SourceDocument = {
		id: 'thesis-structural-anchor',
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
		file_name: 'structural-anchor-model_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-structural-anchor',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case,
	};

	// Antithesis document (pairedDoc, highest relevance, NOT the structural anchor)
	const antithesisDoc: SourceDocument = {
		id: 'antithesis-high-rel',
		contribution_type: 'antithesis',
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
		target_contribution_id: thesisDoc.id,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: { source_group: thesisDoc.id },
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'highest-relevance-model_0_business_case_critique.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/2_antithesis/documents',
		model_id: 'model-highest-rel',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case_critique,
	};

	const sourceDocs: SourceDocument[] = [thesisDoc, antithesisDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-pairwise',
		instance_id: 'instance-id-456',
		template_step_id: 'template-step-id-789',
		step_key: 'synthesis_pairwise',
		step_slug: 'pairwise-by-origin',
		step_name: 'Generate Pairwise Syntheses',
		step_description: 'Generate pairwise synthesis from thesis-antithesis pairs',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		output_type: FileType.PairwiseSynthesisChunk,
		granularity_strategy: 'pairwise_by_origin',
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
				relevance: 0.9,
			},
			{
				document_key: FileType.business_case_critique,
				relevance: 1.0,
			},
		],
		outputs_required: {
			system_materials: {
				executive_summary: '',
				input_artifacts_summary: '',
				stage_rationale: '',
			},
			documents: [
				{
					artifact_class: 'rendered_document',
					file_type: 'markdown',
					document_key: FileType.PairwiseSynthesisChunk,
					template_filename: 'pairwise_synthesis_chunk.md',
				},
			],
			files_to_generate: [
				{
					from_document_key: FileType.PairwiseSynthesisChunk,
					template_filename: 'pairwise_synthesis_chunk.md',
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

	const childJobs = planPairwiseByOrigin(sourceDocs, parentJobWithSynthesisStage, executeRecipeStep, parentJobWithSynthesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create one child job for the pair');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
	
	if (isDialecticExecuteJobPayload(job)) {
		const executePayload: DialecticExecuteJobPayload = job;
		assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
		
		// planPairwiseByOrigin currently uses structural anchorDoc (thesis) for canonical params.
		// After fix, must use selectAnchorSourceDocument to select highest-relevance document from pair.
		// Should select antithesis (relevance 1.0), NOT thesis (structural anchor with lower relevance 0.9).
		assertExists(
			executePayload.canonicalPathParams.sourceAnchorModelSlug,
			'canonicalPathParams should include sourceAnchorModelSlug from highest-relevance document'
		);
		assertEquals(
			executePayload.canonicalPathParams.sourceAnchorModelSlug,
			'highest-relevance-model',
			'sourceAnchorModelSlug should match antithesis document (highest relevance 1.0), not thesis (structural anchor with lower relevance 0.9)'
		);
		
		// Verify structural anchor is still used for lineage (source_group should be thesis id)
		assertExists(executePayload.document_relationships, 'EXECUTE job should include document_relationships');
		assertEquals(
			executePayload.document_relationships.source_group,
			thesisDoc.id,
			'source_group should still be set to structural anchorDoc.id (thesis id) for lineage tracking'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPairwiseByOrigin handles no_document_inputs_required by passing null anchor to createCanonicalPathParams', () => {
	// Recipe step with only header_context input (no document inputs) - valid configuration
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithSynthesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
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
			is_test_job: parentPayload.is_test_job,
		},
	};

	// Thesis document (anchor for pair)
	const thesisDoc: SourceDocument = {
		id: 'thesis-no-doc-inputs',
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
		file_name: 'model-a_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-a',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case,
	};

	// Antithesis document (paired with thesis)
	const antithesisDoc: SourceDocument = {
		id: 'antithesis-no-doc-inputs',
		contribution_type: 'antithesis',
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
		target_contribution_id: thesisDoc.id,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: { source_group: thesisDoc.id },
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'model-b_0_business_case_critique.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/2_antithesis/documents',
		model_id: 'model-b',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case_critique,
	};

	const sourceDocs: SourceDocument[] = [thesisDoc, antithesisDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-no-doc-inputs',
		instance_id: 'instance-id-123',
		template_step_id: 'template-step-id-456',
		step_key: 'synthesis_pairwise_no_doc_inputs',
		step_slug: 'pairwise-by-origin',
		step_name: 'Generate Pairwise Synthesis',
		step_description: 'Generate pairwise synthesis using header context',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		output_type: FileType.PairwiseSynthesisChunk,
		granularity_strategy: 'pairwise_by_origin',
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
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
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

	const childJobs = planPairwiseByOrigin(sourceDocs, parentJobWithSynthesisStage, executeRecipeStep, parentJobWithSynthesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create one child job for the pair');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
	if (isDialecticExecuteJobPayload(job)) {
		const executePayload: DialecticExecuteJobPayload = job;
		assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
		assertEquals(
			executePayload.canonicalPathParams.sourceAnchorModelSlug,
			undefined,
			'sourceAnchorModelSlug should be undefined when recipe step has no document inputs (no_document_inputs_required)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPairwiseByOrigin handles anchor_found by using result.document', () => {
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithSynthesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
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
			is_test_job: parentPayload.is_test_job,
		},
	};

	// Thesis document (lower relevance)
	const thesisDoc: SourceDocument = {
		id: 'thesis-anchor-found',
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
		file_name: 'lower-relevance-model_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'lower-relevance-model',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case,
	};

	// Antithesis document (higher relevance - should be selected as anchor)
	const antithesisDoc: SourceDocument = {
		id: 'antithesis-anchor-found',
		contribution_type: 'antithesis',
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
		target_contribution_id: thesisDoc.id,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: { source_group: thesisDoc.id },
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'highest-relevance-model_0_business_case_critique.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/2_antithesis/documents',
		model_id: 'highest-relevance-model',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case_critique,
	};

	const sourceDocs: SourceDocument[] = [thesisDoc, antithesisDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-anchor-found',
		instance_id: 'instance-id-456',
		template_step_id: 'template-step-id-789',
		step_key: 'synthesis_pairwise',
		step_slug: 'pairwise-by-origin',
		step_name: 'Generate Pairwise Syntheses',
		step_description: 'Generate pairwise synthesis from thesis-antithesis pairs',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		output_type: FileType.PairwiseSynthesisChunk,
		granularity_strategy: 'pairwise_by_origin',
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
				relevance: 0.9,
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
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
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

	const childJobs = planPairwiseByOrigin(sourceDocs, parentJobWithSynthesisStage, executeRecipeStep, parentJobWithSynthesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 1, 'Should create one child job for the pair');
	const job = childJobs[0];
	assertExists(job, 'Child job should exist');
	assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
	if (isDialecticExecuteJobPayload(job)) {
		const executePayload: DialecticExecuteJobPayload = job;
		assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
		assertExists(
			executePayload.canonicalPathParams.sourceAnchorModelSlug,
			'canonicalPathParams should include sourceAnchorModelSlug from highest-relevance document'
		);
		assertEquals(
			executePayload.canonicalPathParams.sourceAnchorModelSlug,
			'highest-relevance-model',
			'sourceAnchorModelSlug should match the highest-relevance document from pair (antithesis with relevance 1.0)'
		);
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPairwiseByOrigin throws on anchor_not_found', async () => {
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithSynthesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
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
			is_test_job: parentPayload.is_test_job,
		},
	};

	// Thesis document (anchor for pair)
	const thesisDoc: SourceDocument = {
		id: 'thesis-anchor-not-found',
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
		file_name: 'model-a_0_feature_spec.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-a',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.feature_spec,
	};

	// Antithesis document (paired with thesis, but wrong document_key)
	const antithesisDoc: SourceDocument = {
		id: 'antithesis-anchor-not-found',
		contribution_type: 'antithesis',
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
		target_contribution_id: thesisDoc.id,
		seed_prompt_url: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_relationships: { source_group: thesisDoc.id },
		attempt_count: 0,
		session_id: 'session-abc',
		user_id: 'user-123',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		file_name: 'model-b_0_feature_spec_critique.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/2_antithesis/documents',
		model_id: 'model-b',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.feature_spec,
	};

	const sourceDocs: SourceDocument[] = [thesisDoc, antithesisDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-anchor-not-found',
		instance_id: 'instance-id-789',
		template_step_id: 'template-step-id-101',
		step_key: 'synthesis_pairwise',
		step_slug: 'pairwise-by-origin',
		step_name: 'Generate Pairwise Syntheses',
		step_description: 'Generate pairwise synthesis from thesis-antithesis pairs',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		output_type: FileType.PairwiseSynthesisChunk,
		granularity_strategy: 'pairwise_by_origin',
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
				document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.PairwiseSynthesisChunk,
				template_filename: 'pairwise_synthesis_chunk.md',
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

	await assertRejects(
		async () => {
			planPairwiseByOrigin(sourceDocs, parentJobWithSynthesisStage, executeRecipeStep, parentJobWithSynthesisStage.payload.user_jwt);
		},
		Error,
		'Anchor document not found',
		'Should throw error when anchor document not found in pair'
	);
});
 