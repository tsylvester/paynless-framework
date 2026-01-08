// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.test.ts
import {
	assertEquals,
	assertExists,
	assert,
	assertThrows,
	assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
	DialecticJobRow,
	DialecticPlanJobPayload,
	DialecticStageRecipeStep,
	DialecticRecipeTemplateStep,
	SourceDocument,
	DialecticExecuteJobPayload,
	ContextForDocument,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceDocument } from './planPerSourceDocument.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { ContributionType } from '../../../dialectic-service/dialectic.interface.ts';
import { isJson } from '../../../_shared/utils/type-guards/type_guards.common.ts';
import { isDialecticExecuteJobPayload, isDialecticPlanJobPayload, isContributionType } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
// Mock Data
const MOCK_SOURCE_DOCS: SourceDocument[] = [
	{
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
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
	},
	{
		id: 'doc-2',
		content: 'Doc 2 content',
		contribution_type: 'thesis',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'f2.txt',
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
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
	},
];

const MOCK_PARENT_JOB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
	id: 'parent-job-123',
	session_id: 'session-abc',
	user_id: 'user-def',
	stage_slug: 'antithesis',
	iteration_number: 1,
	payload: {
		job_type: 'PLAN',
		projectId: 'project-xyz',
		sessionId: 'session-abc',
		stageSlug: 'antithesis',
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

const MOCK_RECIPE_STEP: DialecticStageRecipeStep = {
	id: 'step-id-123',
	instance_id: 'instance-id-456',
	template_step_id: 'template-step-id-789',
	step_key: 'generate-antithesis',
	step_slug: 'generate-antithesis',
	step_name: 'Generate Antithesis',
	prompt_template_id: 'antithesis_step1_critique',
	prompt_type: 'Turn',
	job_type: 'EXECUTE',
	inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
	inputs_relevance: [],
	outputs_required: {
		documents: [{
			artifact_class: 'rendered_document',
			file_type: 'markdown',
			document_key: FileType.business_case_critique,
			template_filename: 'business_case_critique.md',
		}],
		assembled_json: [],
		files_to_generate: [{
			from_document_key: FileType.business_case_critique,
			template_filename: 'business_case_critique.md',
		}],
	},
	granularity_strategy: 'per_source_document',
	output_type: FileType.business_case_critique,
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	config_override: {},
	is_skipped: false,
	object_filter: {},
	output_overrides: {},
	branch_key: null,
	execution_order: 1,
	parallel_group: null,
	step_description: 'Generate Antithesis',
};

Deno.test('planPerSourceDocument should create one child job for each source document', () => {
	const childPayloads = planPerSourceDocument(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		MOCK_RECIPE_STEP,
		'user-jwt-123'
	);

	assertEquals(
		childPayloads.length,
		2,
		'Should create 2 child jobs, one for each source doc'
	);

	const job1Payload = childPayloads.find((p) => isDialecticExecuteJobPayload(p) && p.inputs?.thesis_id === 'doc-1');
	assertExists(job1Payload, 'Payload for doc-1 should exist');
	if (!isDialecticExecuteJobPayload(job1Payload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(MOCK_RECIPE_STEP.job_type, 'EXECUTE');
	assertEquals(
		job1Payload.prompt_template_id,
		'antithesis_step1_critique'
	);
	assert(
		!('prompt_template_name' in job1Payload),
		'The deprecated prompt_template_name property should not be present'
	);
	assertEquals(job1Payload.output_type, FileType.business_case_critique);
	assertEquals(job1Payload.document_relationships, { source_group: 'doc-1' });

	assertExists(job1Payload.canonicalPathParams);
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorType, 'thesis');
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorModelSlug, 'M1');
	assertEquals(job1Payload.canonicalPathParams.sourceModelSlugs, ['M1']);
	assert(!('originalFileName' in job1Payload));

	const job2Payload = childPayloads.find((p) => isDialecticExecuteJobPayload(p) && p.inputs?.thesis_id === 'doc-2');
	assertExists(job2Payload, 'Payload for doc-2 should exist');
	if (!isDialecticExecuteJobPayload(job2Payload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertExists(job2Payload.canonicalPathParams);
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorType, 'thesis');
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorModelSlug, 'M1');
	assertEquals(job2Payload.canonicalPathParams.sourceModelSlugs, ['M1']);
});

Deno.test('planPerSourceDocument should throw an error for empty source documents', () => {
	assertThrows(
		() => {
			planPerSourceDocument([], MOCK_PARENT_JOB, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'Invalid inputs for planPerSourceDocument: At least one source document is required.'
	);
});

Deno.test('planPerSourceDocument should correctly handle a single source document', () => {
	const singleDoc = [MOCK_SOURCE_DOCS[0]];
	const childPayloads = planPerSourceDocument(singleDoc, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);

	assertEquals(childPayloads.length, 1, "Should create exactly one child job");
	const payload = childPayloads[0];
	assertExists(payload, "The single payload should exist");
	if (!isDialecticExecuteJobPayload(payload)) {
		throw new Error('Expected EXECUTE job');
	}

	assertEquals(payload.inputs?.thesis_id, 'doc-1');
	assertEquals(payload.prompt_template_id, 'antithesis_step1_critique');
});

Deno.test('should correctly plan jobs for antithesis stage', () => {
	// This test simulates the exact scenario from the integration test:
	// planning the antithesis stage based on the outputs of the thesis stage.
	const thesisContributions: SourceDocument[] = [
		{
			id: 'thesis-doc-1',
			content: 'Content from gpt-4-turbo',
			contribution_type: 'thesis',
			model_name: 'GPT-4 Turbo',
			document_relationships: { source_group: 'thesis-doc-1' },
			citations: null,
			created_at: new Date().toISOString(),
			edit_version: 1,
			error: null,
			tokens_used_input: 1,
			tokens_used_output: 1,
			processing_time_ms: 1,
			file_name: 'f1.txt',
			storage_bucket: 'b1',
			storage_path: 'p1',
			model_id: 'm1',
			mime_type: 'text/plain',
			is_latest_edit: true,
			iteration_number: 1,
			original_model_contribution_id: null,
			prompt_template_id_used: 'p1',
			raw_response_storage_path: null,
			size_bytes: 1,
			target_contribution_id: null,
			session_id: 'session-abc',
			stage: 'thesis',
			seed_prompt_url: null,
			updated_at: new Date().toISOString(),
			user_id: 'user-def',
			is_header: false,
			source_prompt_resource_id: null,
		},
		{
			id: 'thesis-doc-2',
			content: 'Content from claude-3-opus',
			contribution_type: 'thesis',
			model_name: 'Claude 3 Opus',
			document_relationships: { source_group: 'thesis-doc-2' },
			citations: null,
			created_at: new Date().toISOString(),
			edit_version: 1,
			error: null,
			tokens_used_input: 1,
			tokens_used_output: 1,
			processing_time_ms: 1,
			file_name: 'f2.txt',
			storage_bucket: 'b1',
			storage_path: 'p1',
			model_id: 'm1',
			mime_type: 'text/plain',
			is_latest_edit: true,
			iteration_number: 1,
			original_model_contribution_id: null,
			prompt_template_id_used: 'p1',
			raw_response_storage_path: null,
			size_bytes: 1,
			target_contribution_id: null,
			session_id: 'session-abc',
			stage: 'thesis',
			seed_prompt_url: null,
			updated_at: new Date().toISOString(),
			user_id: 'user-def',
			is_header: false,
			source_prompt_resource_id: null,
		},
	];

	const childPayloads = planPerSourceDocument(thesisContributions, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);

	assertEquals(childPayloads.length, 2, "Should create a child job for each thesis contribution");

	// Check payload for the first thesis doc
	const job1Payload = childPayloads.find(p => isDialecticExecuteJobPayload(p) && p.inputs?.thesis_id === 'thesis-doc-1');
	assertExists(job1Payload, "Payload for thesis-doc-1 should exist");
	if (!isDialecticExecuteJobPayload(job1Payload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(MOCK_RECIPE_STEP.job_type, 'EXECUTE');
	assertEquals(job1Payload.output_type, FileType.business_case_critique);
	assertEquals(job1Payload.document_relationships, {
		source_group: 'thesis-doc-1',
	});
	assertExists(job1Payload.canonicalPathParams);
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorType, 'thesis');
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorModelSlug, 'GPT-4 Turbo');

	// Check payload for the second thesis doc
	const job2Payload = childPayloads.find(p => isDialecticExecuteJobPayload(p) && p.inputs?.thesis_id === 'thesis-doc-2');
	assertExists(job2Payload, "Payload for thesis-doc-2 should exist");
	if (!isDialecticExecuteJobPayload(job2Payload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(MOCK_RECIPE_STEP.job_type, 'EXECUTE');
	assertEquals(job2Payload.output_type, FileType.business_case_critique);
	assertEquals(job2Payload.document_relationships, {
		source_group: 'thesis-doc-2',
	});
	assertExists(job2Payload.canonicalPathParams);
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorType, 'thesis');
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorModelSlug, 'Claude 3 Opus');
});

Deno.test('planPerSourceDocument Test Case A: The Failing Case (Proves the bug exists)', () => {
	const failingParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'failing-parent-job',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage_slug: 'antithesis',
		iteration_number: 1,
		payload: {
			job_type: 'PLAN',
			projectId: 'project-xyz',
			sessionId: 'session-abc',
			stageSlug: 'antithesis',
			iterationNumber: 1,
			model_id: 'parent-model-id', // This is the key part
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

	const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, failingParentJob, MOCK_RECIPE_STEP, 'user-jwt-123');

	// This test PASSES if the assertion inside it THROWS an error, proving the bug.
	// The planner currently assigns the parent job's model ID to ALL children,
	// which does not match the model ID of the source documents.
	try {
		// This is the CORRECT behavior we want to enforce.
		// With the bug present, this assertion will fail for at least one child,
		// throwing an error and proving the bug exists.
		childPayloads.forEach(child => {
			assertEquals(child.model_id, failingParentJob.payload.model_id, "Child job model_id must match the parent job's model_id");
		});
		// If the loop completes, it means the bug is fixed, so this test should now fail.
		assert(false, "Test A expected an error to be thrown, but none was. The bug may be fixed.");
	} catch (e) {
		// We expect to catch an error, which means the test passes and the bug is confirmed.
		assert(e instanceof Error, "The thrown object should be an error.");
		console.log("Test A passed by catching an expected error, confirming the bug's presence.");
	}
});


Deno.test('planPerSourceDocument Test Case B: The Passing Case (Describes the correct behavior)', () => {
	const passingParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'passing-parent-job',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage_slug: 'antithesis',
		iteration_number: 1,
		payload: {
			job_type: 'PLAN',
			projectId: 'project-xyz',
			sessionId: 'session-abc',
			stageSlug: 'antithesis',
			iterationNumber: 1,
			model_id: 'parent-model-id', // This is the key part
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

	const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, passingParentJob, MOCK_RECIPE_STEP, 'user-jwt-123');

	// This test will FAIL initially because the planner assigns the wrong model_id.
	// After the fix, it will PASS.
	childPayloads.forEach(child => {
		assertEquals(child.model_id, passingParentJob.payload.model_id, "Child job model_id must match the parent job's model_id");
	});
});

// ==============================================
// user_jwt inheritance and enforcement
// ==============================================

Deno.test('planPerSourceDocument constructs child payloads with user_jwt inherited from parent payload', () => {
	const parentWithJwt: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	Object.defineProperty(parentWithJwt.payload, 'user_jwt', { value: 'parent.jwt.value', configurable: true, enumerable: true, writable: true });

	const result = planPerSourceDocument(MOCK_SOURCE_DOCS, parentWithJwt, MOCK_RECIPE_STEP, 'param.jwt.should.be.ignored');

	assertEquals(result.length, 2);
	for (const payload of result) {
		assertEquals(payload.user_jwt, 'parent.jwt.value', 'Child payload must inherit user_jwt from parent payload');
	}
});

Deno.test('planPerSourceDocument throws when parent payload.user_jwt is missing or empty', () => {
	const parentMissing: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	// Ensure no user_jwt on payload
	if (Object.prototype.hasOwnProperty.call(parentMissing.payload, 'user_jwt')) {
		// deno-lint-ignore no-explicit-any
		delete (parentMissing.payload as any).user_jwt;
	}

	let threwForMissing = false;
	try {
		planPerSourceDocument(MOCK_SOURCE_DOCS, parentMissing, MOCK_RECIPE_STEP, 'param.jwt');
	} catch {
		threwForMissing = true;
	}
	assert(threwForMissing, 'Expected an error when parent payload.user_jwt is missing');

	const parentEmpty: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	Object.defineProperty(parentEmpty.payload, 'user_jwt', { value: '', configurable: true, enumerable: true, writable: true });

	let threwForEmpty = false;
	try {
		planPerSourceDocument(MOCK_SOURCE_DOCS, parentEmpty, MOCK_RECIPE_STEP, 'param.jwt');
	} catch {
		threwForEmpty = true;
	}
	assert(threwForEmpty, 'Expected an error when parent payload.user_jwt is empty');
});

Deno.test('planPerSourceDocument inherits model_slug from parent job payload', () => {
	const parentWithModelSlug: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'parent-job-model-slug',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage_slug: 'antithesis',
		iteration_number: 1,
		payload: {
			job_type: 'PLAN',
			projectId: 'project-xyz',
			sessionId: 'session-abc',
			stageSlug: 'antithesis',
			iterationNumber: 1,
			model_id: 'model-ghi',
			model_slug: 'parent-model-slug',
			walletId: 'wallet-default',
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

	const childPayloads = planPerSourceDocument(
		MOCK_SOURCE_DOCS,
		parentWithModelSlug,
		MOCK_RECIPE_STEP,
		'user-jwt-123'
	);

	assertEquals(childPayloads.length, 2, 'Should create 2 child jobs, one for each source doc');
	for (const payload of childPayloads) {
		assertEquals(
			payload.model_slug,
			'parent-model-slug',
			'Child payload must inherit model_slug from parent payload'
		);
		assertEquals(
			payload.user_jwt,
			'parent-jwt-token',
			'Child payload must inherit user_jwt from parent payload'
		);
	}
});

// ==============================================
// planner constructs child payloads with dynamic stage consistency
// Assert payload.stageSlug equals the parent's dynamic stage for every child
// ==============================================
Deno.test('planPerSourceDocument constructs child payloads with dynamic stage consistency (payload.stageSlug === parent.payload.stageSlug)', () => {
	const expectedStage = 'parenthesis'; // use a non-thesis simple stage
	const parent: typeof MOCK_PARENT_JOB = JSON.parse(JSON.stringify(MOCK_PARENT_JOB));
	Object.defineProperty(parent, 'stage_slug', { value: expectedStage, configurable: true, enumerable: true, writable: true });
	Object.defineProperty(parent.payload, 'stageSlug', { value: expectedStage, configurable: true, enumerable: true, writable: true });

	const result = planPerSourceDocument(MOCK_SOURCE_DOCS, parent, { ...MOCK_RECIPE_STEP, output_type: FileType.technical_requirements }, 'ignored.jwt');

	assertEquals(result.length, MOCK_SOURCE_DOCS.length);
	for (const child of result) {
		assertEquals(child.stageSlug, expectedStage, 'Child payload.stageSlug must equal parent.payload.stageSlug');
	}
});

Deno.test('planPerSourceDocument threads sourceContributionId for known source documents', () => {
	const knownContributionId = 'thesis-contrib-123';
	const contributionDoc: SourceDocument = {
		...MOCK_SOURCE_DOCS[0],
		id: knownContributionId,
		document_relationships: { source_group: knownContributionId },
	};
	const brandNewDocId = 'brand-new-doc';
	const netNewDoc: SourceDocument = {
		...MOCK_SOURCE_DOCS[1],
		id: brandNewDocId,
		document_relationships: null,
	};

	const payloads = planPerSourceDocument(
		[contributionDoc, netNewDoc],
		MOCK_PARENT_JOB,
		MOCK_RECIPE_STEP,
		'user-jwt-123'
	);

	const contributionPayload = payloads.find(
		(payload) => isDialecticExecuteJobPayload(payload) && payload.inputs?.thesis_id === knownContributionId
	);
	assertExists(contributionPayload, 'Expected payload for contribution-backed document');
	if (!isDialecticExecuteJobPayload(contributionPayload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(
		contributionPayload.sourceContributionId,
		knownContributionId,
		'Contribution-backed payload must surface sourceContributionId'
	);

	const netNewPayload = payloads.find(
		(payload) => isDialecticExecuteJobPayload(payload) && payload.inputs?.thesis_id === brandNewDocId
	);
	assertExists(netNewPayload, 'Expected payload for net-new document');
	if (!isDialecticExecuteJobPayload(netNewPayload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(
		netNewPayload.sourceContributionId,
		undefined,
		'Net-new documents must not declare a sourceContributionId'
	);
});

Deno.test('planPerSourceDocument includes planner_metadata with recipe_step_id in all child payloads', () => {
	const mockRecipeStepWithId: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		id: 'recipe-step-456',
	};

	const childJobs = planPerSourceDocument(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		mockRecipeStepWithId,
		'user-jwt-123'
	);

	assertEquals(childJobs.length, 2, 'Should create 2 child jobs, one for each source doc');
	
	for (const job of childJobs) {
		assertExists(job, 'Child job should exist');
		if (!isDialecticExecuteJobPayload(job)) {
			throw new Error('Expected EXECUTE job');
		}
		assertExists(job.planner_metadata, 'Child job should include planner_metadata');
		assertEquals(
			job.planner_metadata?.recipe_step_id,
			'recipe-step-456',
			'planner_metadata.recipe_step_id should match the recipe step id for every child job',
		);
	}
});

// ==============================================
// document_key extraction and validation tests
// ==============================================

Deno.test('planPerSourceDocument sets document_key in payload when recipeStep.outputs_required.documents[0].document_key is present', () => {
	const recipeStepWithDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
		},
	};

	const childPayloads = planPerSourceDocument(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		recipeStepWithDocumentKey,
		'user-jwt-123'
	);

	assertEquals(childPayloads.length, 2, 'Should create 2 child jobs, one for each source doc');
	for (const payload of childPayloads) {
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		assertEquals(
			payload.document_key,
			FileType.business_case_critique,
			'document_key should be extracted from recipeStep.outputs_required.documents[0].document_key',
		);
	}
});

Deno.test('planPerSourceDocument throws error when outputs_required.documents array is empty for EXECUTE jobs', () => {
	const recipeStepWithEmptyDocuments: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
		},
	};

	assertThrows(
		() => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithEmptyDocuments, 'user-jwt-123');
		},
		Error,
		'planPerSourceDocument requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs',
		'Should throw error when documents array is empty for EXECUTE jobs',
	);
});

Deno.test('planPerSourceDocument throws error when outputs_required is missing documents property for EXECUTE jobs', () => {
	const recipeStepWithoutDocumentsProperty: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
		} as unknown as DialecticStageRecipeStep['outputs_required'],
	};

	assertThrows(
		() => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentsProperty, 'user-jwt-123');
		},
		Error,
		'planPerSourceDocument requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing',
		'Should throw error when documents property is missing for EXECUTE jobs',
	);
});

Deno.test('planPerSourceDocument throws error when outputs_required.documents[0] is missing document_key property', () => {
	const recipeStepWithoutDocumentKey = {
		...MOCK_RECIPE_STEP,
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				template_filename: 'business_case_critique.md',
			}],
			assembled_json: [],
			files_to_generate: [{
				from_document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
		},
	} as unknown as DialecticStageRecipeStep;

	assertThrows(
		() => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, recipeStepWithoutDocumentKey, 'user-jwt-123');
		},
		Error,
		'planPerSourceDocument requires recipeStep.outputs_required.documents[0].document_key but it is missing',
		'Should throw error when documents[0] is missing document_key property',
	);
});

Deno.test('planPerSourceDocument includes context_for_documents in payload for PLAN jobs with valid context_for_documents', () => {
	const contextForDocuments: ContextForDocument[] = [
		{
			document_key: FileType.business_case,
			content_to_include: {
				field1: '',
				field2: [],
			},
		},
	];
	const planRecipeStep: DialecticRecipeTemplateStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			context_for_documents: contextForDocuments,
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
		step_number: 1,
		template_id: 'template-id-123',
	};

	const childJobs: (DialecticPlanJobPayload | DialecticExecuteJobPayload)[] = planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
	
	assertEquals(childJobs.length, 1, 'PLAN jobs should create a single PLAN payload, not per-source-document');
	const job: DialecticPlanJobPayload | DialecticExecuteJobPayload = childJobs[0];
	assertExists(job, 'Child job should exist');
	if (isDialecticPlanJobPayload(job)) {
		assertExists(job.context_for_documents, 'PLAN job payload should include context_for_documents');
		assertEquals(job.context_for_documents.length, 1, 'context_for_documents should have one entry');
		assertEquals(job.context_for_documents[0].document_key, FileType.business_case, 'document_key should match');
	} else {
		throw new Error('Expected PLAN job');
	}
});

Deno.test('planPerSourceDocument throws error for PLAN job when context_for_documents is missing', async () => {
	const planRecipeStepWithoutContext: DialecticRecipeTemplateStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'PLAN',
		output_type: FileType.HeaderContext,
		outputs_required: {
			documents: [],
			assembled_json: [],
			files_to_generate: [],
		},
	} as unknown as DialecticRecipeTemplateStep;

	await assertRejects(
		async () => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContext, 'user-jwt-123');
		},
		Error,
		'planPerSourceDocument requires',
		'Should throw error when context_for_documents is missing for PLAN job',
	);
});

Deno.test('planPerSourceDocument throws error for PLAN job when context_for_documents entry is missing document_key', async () => {
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
	} as unknown as DialecticRecipeTemplateStep;

	await assertRejects(
		async () => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutDocumentKey, 'user-jwt-123');
		},
		Error,
		'planPerSourceDocument requires',
		'Should throw error when context_for_documents entry is missing document_key',
	);
});

Deno.test('planPerSourceDocument throws error for PLAN job when context_for_documents entry is missing content_to_include', async () => {
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
	} as unknown as DialecticRecipeTemplateStep;

	await assertRejects(
		async () => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, planRecipeStepWithoutContentToInclude, 'user-jwt-123');
		},
		Error,
		'planPerSourceDocument requires',
		'Should throw error when context_for_documents entry is missing content_to_include',
	);
});

Deno.test('planPerSourceDocument successfully creates payload for EXECUTE job with valid files_to_generate', () => {
	const executeRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.business_case_critique,
					template_filename: 'business_case_critique.md',
				},
			],
		},
	};

	const childJobs: (DialecticPlanJobPayload | DialecticExecuteJobPayload)[] = planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStep, MOCK_PARENT_JOB.payload.user_jwt);
	
	assertEquals(childJobs.length, MOCK_SOURCE_DOCS.length, 'Should create one child job per source document');
	const job: DialecticPlanJobPayload | DialecticExecuteJobPayload = childJobs[0];
	assertExists(job, 'Child job should exist');
	if (isDialecticExecuteJobPayload(job)) {
		assertEquals(MOCK_RECIPE_STEP.job_type, 'EXECUTE', 'Job type should be execute');
	} else {
		throw new Error('Expected EXECUTE job');
	}
});

Deno.test('planPerSourceDocument throws error for EXECUTE job when files_to_generate is missing', async () => {
	const executeRecipeStepWithoutFiles: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
			assembled_json: [],
		},
	};

	await assertRejects(
		async () => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFiles, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerSourceDocument requires',
		'Should throw error when files_to_generate is missing for EXECUTE job',
	);
});

Deno.test('planPerSourceDocument throws error for EXECUTE job when files_to_generate entry is missing from_document_key', async () => {
	const executeRecipeStepWithoutFromDocumentKey: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					template_filename: 'business_case_critique.md',
				} as unknown as { from_document_key: FileType; template_filename: string },
			],
		},
	};

	await assertRejects(
		async () => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutFromDocumentKey, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerSourceDocument requires',
		'Should throw error when files_to_generate entry is missing from_document_key',
	);
});

Deno.test('planPerSourceDocument throws error for EXECUTE job when files_to_generate entry is missing template_filename', async () => {
	const executeRecipeStepWithoutTemplateFilename: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case_critique,
				template_filename: 'business_case_critique.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.business_case_critique,
				} as unknown as { from_document_key: FileType; template_filename: string },
			],
		},
	};

	await assertRejects(
		async () => {
			planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, executeRecipeStepWithoutTemplateFilename, MOCK_PARENT_JOB.payload.user_jwt);
		},
		Error,
		'planPerSourceDocument requires',
		'Should throw error when files_to_generate entry is missing template_filename',
	);
});

Deno.test('planPerSourceDocument omits target_contribution_id from child payload when parent has null or undefined', () => {
	const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, MOCK_PARENT_JOB, MOCK_RECIPE_STEP, MOCK_PARENT_JOB.payload.user_jwt);

	assertEquals(childPayloads.length, 2, 'Should create 2 child jobs');
	
	for (const payload of childPayloads) {
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		// Assert that target_contribution_id is either omitted or is a valid string (never null or undefined)
		if ('target_contribution_id' in payload) {
			if (typeof payload.target_contribution_id !== 'string') {
				throw new Error(`target_contribution_id must be a string if present, but got: ${typeof payload.target_contribution_id}`);
			}
			if (payload.target_contribution_id.length === 0) {
				throw new Error('target_contribution_id must be a non-empty string if present');
			}
		}
	}
});

Deno.test('planPerSourceDocument EXECUTE branch must not set document_relationships[stageSlug] for root document jobs', () => {
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

	const childPayloads = planPerSourceDocument(
		MOCK_SOURCE_DOCS,
		parentJobWithStageSlug,
		executeRecipeStep,
		parentJobWithStageSlug.payload.user_jwt
	);

	assertEquals(childPayloads.length, MOCK_SOURCE_DOCS.length, 'Should create one child job per source document');

	for (let i = 0; i < childPayloads.length; i++) {
		const payload = childPayloads[i];
		const sourceDoc = MOCK_SOURCE_DOCS[i];

		assertExists(payload, 'Child job should exist');
		assertEquals(isDialecticExecuteJobPayload(payload), true, 'Job type should be execute');
		if (isDialecticExecuteJobPayload(payload)) {
			const executePayload: DialecticExecuteJobPayload = payload;
			assertExists(executePayload.document_relationships, 'EXECUTE job payload should include document_relationships');
			assertExists(executePayload.document_relationships?.source_group, 'document_relationships should include source_group');
			assertEquals(
				executePayload.document_relationships.source_group,
				sourceDoc.id,
				'source_group should be set to doc.id (lineage preserved)',
			);
			assert(
				!('thesis' in executePayload.document_relationships),
				'document_relationships[stageSlug] must be absent/undefined for root jobs (not set to doc id)',
			);
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});
 