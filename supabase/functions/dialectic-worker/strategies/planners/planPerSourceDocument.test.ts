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
		file_name: 'gpt-4_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis/documents',
		model_id: 'gpt-4',
		model_name: 'gpt-4',
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
		mime_type: 'text/markdown',
		target_contribution_id: null,
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case,
		attempt_count: 0,
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
		file_name: 'gpt-4_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis/documents',
		model_id: 'gpt-4',
		model_name: 'gpt-4',
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
		mime_type: 'text/markdown',
		target_contribution_id: null,
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case,
		attempt_count: 0,
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
		model_id: 'gpt-4',
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
	inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
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
	assertEquals(job1Payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');

	assertExists(job1Payload.canonicalPathParams);
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorType, 'thesis');
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorModelSlug, 'gpt-4');
	assertEquals(job1Payload.canonicalPathParams.sourceModelSlugs, ['gpt-4']);
	assert(!('originalFileName' in job1Payload));

	const job2Payload = childPayloads.find((p) => isDialecticExecuteJobPayload(p) && p.inputs?.thesis_id === 'doc-2');
	assertExists(job2Payload, 'Payload for doc-2 should exist');
	if (!isDialecticExecuteJobPayload(job2Payload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(job2Payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
	assertExists(job2Payload.canonicalPathParams);
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorType, 'thesis');
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorModelSlug, 'gpt-4');
	assertEquals(job2Payload.canonicalPathParams.sourceModelSlugs, ['gpt-4']);
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
	assertEquals(payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
});

Deno.test('should correctly plan jobs for antithesis stage', () => {
	// This test simulates the exact scenario from the integration test:
	// planning the antithesis stage based on the outputs of the thesis stage.
	const thesisContributions: SourceDocument[] = [
		{
			id: 'thesis-doc-1',
			content: 'Content from gpt-4-turbo',
			contribution_type: 'thesis',
			model_name: 'gpt-4-turbo',
			document_relationships: { source_group: 'thesis-doc-1' },
			citations: null,
			created_at: new Date().toISOString(),
			edit_version: 1,
			error: null,
			tokens_used_input: 1,
			tokens_used_output: 1,
			processing_time_ms: 1,
			file_name: 'gpt-4-turbo_0_business_case.md',
			storage_bucket: 'dialectic-project-resources',
			storage_path: 'project-xyz/session_abc/iteration_1/1_thesis/documents',
			model_id: 'gpt-4',
			mime_type: 'text/markdown',
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
			document_key: FileType.business_case,
			attempt_count: 0,
		},
		{
			id: 'thesis-doc-2',
			content: 'Content from claude-3-opus',
			contribution_type: 'thesis',
			model_name: 'claude-3-opus',
			document_relationships: { source_group: 'thesis-doc-2' },
			citations: null,
			created_at: new Date().toISOString(),
			edit_version: 1,
			error: null,
			tokens_used_input: 1,
			tokens_used_output: 1,
			processing_time_ms: 1,
			file_name: 'claude-3-opus_0_business_case.md',
			storage_bucket: 'dialectic-project-resources',
			storage_path: 'project-xyz/session_abc/iteration_1/1_thesis/documents',
			model_id: 'gpt-4',
			mime_type: 'text/markdown',
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
			document_key: FileType.business_case,
			attempt_count: 0,
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
	// sourceAnchorModelSlug is extracted from anchor document's filename, not model_id
	// The anchor is selected once for all jobs (first matching doc: thesis-doc-1 with filename 'gpt-4-turbo_0_business_case.md')
	assertEquals(job1Payload.canonicalPathParams.sourceAnchorModelSlug, 'gpt-4-turbo');
	assertEquals(job1Payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');

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
	// Both jobs use the same anchor document (thesis-doc-1), so sourceAnchorModelSlug is the same
	assertEquals(job2Payload.canonicalPathParams.sourceAnchorModelSlug, 'gpt-4-turbo');
	assertEquals(job2Payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
});

Deno.test('planPerSourceDocument Test Case A: EXECUTE jobs inherit model_id from source document, not parent job', () => {
	const parentJobWithDifferentModel: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'parent-job-different-model',
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
			model_id: 'parent-model-id', // Parent has different model_id than source docs
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

	// MOCK_SOURCE_DOCS have model_id: 'gpt-4', which differs from parent's 'parent-model-id'
	// After filtering, if parent model_id doesn't match source docs, should return empty array
	// OR if we're testing with matching model_id, child jobs should inherit from source docs
	const sourceDocsWithMatchingModel: SourceDocument[] = MOCK_SOURCE_DOCS.map(doc => ({
		...doc,
		model_id: 'parent-model-id', // Match parent model_id for this test
	}));

	const childPayloads = planPerSourceDocument(sourceDocsWithMatchingModel, parentJobWithDifferentModel, MOCK_RECIPE_STEP, 'user-jwt-123');

	// After fix: EXECUTE jobs should inherit model_id from source document, not parent
	assertEquals(childPayloads.length, 2, 'Should create 2 child jobs');
	for (const child of childPayloads) {
		if (!isDialecticExecuteJobPayload(child)) {
			throw new Error('Expected EXECUTE job');
		}
		// Child job model_id should match source document's model_id, not parent's
		assertEquals(child.model_id, 'parent-model-id', "EXECUTE job model_id must match source document's model_id, not parent job's model_id");
	}
});


Deno.test('planPerSourceDocument Test Case B: EXECUTE jobs inherit model_id from source document when parent model_id matches', () => {
	const parentJobWithMatchingModel: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: 'parent-job-matching-model',
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
			model_id: 'gpt-4', // Matches MOCK_SOURCE_DOCS model_id
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

	const childPayloads = planPerSourceDocument(MOCK_SOURCE_DOCS, parentJobWithMatchingModel, MOCK_RECIPE_STEP, 'user-jwt-123');

	// After fix: EXECUTE jobs should inherit model_id from source document
	assertEquals(childPayloads.length, 2, 'Should create 2 child jobs');
	for (const child of childPayloads) {
		if (!isDialecticExecuteJobPayload(child)) {
			throw new Error('Expected EXECUTE job');
		}
		// Child job model_id should match source document's model_id ('gpt-4'), not necessarily parent's
		assertEquals(child.model_id, 'gpt-4', "EXECUTE job model_id must match source document's model_id");
	}
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
			model_id: 'gpt-4',
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
		if (isDialecticExecuteJobPayload(payload)) {
			assertEquals(payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
		}
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
		assertEquals(contributionPayload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
		assertEquals(netNewPayload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
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
		assertEquals(payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
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
		assertEquals(payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
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
			assertEquals(executePayload.model_id, sourceDoc.model_id, 'EXECUTE job model_id must match source document model_id');
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});

Deno.test('planPerSourceDocument uses recipeStep.output_type when it is a valid ModelContributionFileType', () => {
	// When recipeStep.output_type is a valid ModelContributionFileType (like assembled_document_json),
	// the planner uses it directly rather than falling back to document_key.
	// The document_key (comparison_vector) is still used for the payload.document_key field.
	const executeRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		output_type: FileType.AssembledDocumentJson,
		outputs_required: {
			documents: [{
				artifact_class: 'assembled_document_json',
				file_type: 'json',
				document_key: FileType.comparison_vector,
				template_filename: 'antithesis_comparison_vector.json',
				content_to_include: {
					proposal: {
						lineage_key: '',
						source_model_slug: '',
					},
					dimensions: {
						feasibility: { score: 0, rationale: '' },
						complexity: { score: 0, rationale: '' },
						security: { score: 0, rationale: '' },
						performance: { score: 0, rationale: '' },
						maintainability: { score: 0, rationale: '' },
						scalability: { score: 0, rationale: '' },
						cost: { score: 0, rationale: '' },
						time_to_market: { score: 0, rationale: '' },
						compliance_risk: { score: 0, rationale: '' },
						alignment_with_constraints: { score: 0, rationale: '' },
					},
				},
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.comparison_vector,
					template_filename: 'antithesis_comparison_vector.json',
				},
			],
		},
	};

	const childPayloads = planPerSourceDocument(
		MOCK_SOURCE_DOCS,
		MOCK_PARENT_JOB,
		executeRecipeStep,
		MOCK_PARENT_JOB.payload.user_jwt,
	);

	assertEquals(childPayloads.length, MOCK_SOURCE_DOCS.length, 'Should create one child job per source document');
	for (const payload of childPayloads) {
		assertExists(payload, 'Child job should exist');
		assertEquals(isDialecticExecuteJobPayload(payload), true, 'Child job should be an EXECUTE payload');
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		// output_type comes from recipeStep.output_type when it's a valid ModelContributionFileType
		assertEquals(payload.output_type, FileType.AssembledDocumentJson);
		// document_key comes from outputs_required.documents[0].document_key
		assertEquals(payload.document_key, FileType.comparison_vector);
		assertEquals(payload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
	}
});

Deno.test('planPerSourceDocument includes inputs.header_context_id when recipeStep.inputs_required includes header_context', () => {
	const headerContextDoc: SourceDocument = {
		...MOCK_SOURCE_DOCS[0],
		id: 'hc-1',
		contribution_type: 'header_context',
		stage: 'antithesis',
		file_name: 'mock-model_0_header_context.json',
		storage_bucket: 'b1',
		storage_path: 'p1',
		model_name: 'M1',
	};

	const thesisDoc: SourceDocument = {
		...MOCK_SOURCE_DOCS[1],
		id: 'thesis-1',
		contribution_type: 'thesis',
		stage: 'thesis',
		model_name: 'M1',
	};

	const executeRecipeStep: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		inputs_required: [
			{ type: 'header_context', slug: 'antithesis', required: true },
			{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
		],
		inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
		output_type: FileType.business_case_critique,
	};

	const childPayloads = planPerSourceDocument(
		[headerContextDoc, thesisDoc],
		MOCK_PARENT_JOB,
		executeRecipeStep,
		MOCK_PARENT_JOB.payload.user_jwt,
	);

	const thesisPayload = childPayloads.find(
		(p) => isDialecticExecuteJobPayload(p) && p.inputs?.thesis_id === thesisDoc.id,
	);
	assertExists(thesisPayload);
	if (!isDialecticExecuteJobPayload(thesisPayload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(thesisPayload.inputs?.header_context_id, headerContextDoc.id);
	assertEquals(thesisPayload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
});

Deno.test('planPerSourceDocument uses relevance-selected anchor for canonical path params in each child job', () => {
	// Test proves planner should use universal selector for canonical params,
	// selecting highest-relevance document (business_case) once for ALL child jobs,
	// NOT using each iteration doc as anchor (which would vary per job).
	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	const parentJobWithAntithesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		stage_slug: 'antithesis',
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'antithesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
			job_type: 'PLAN' as const,
			is_test_job: false,
		},
	};

	// Business case document (highest relevance)
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
		model_id: 'gpt-4',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case,
	};

	// Feature spec document (lower relevance)
	const featureSpecDoc: SourceDocument = {
		id: 'feature-spec-lower-rel',
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
		model_id: 'gpt-4',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.feature_spec,
	};

	const sourceDocs: SourceDocument[] = [businessCaseDoc, featureSpecDoc];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-per-source-doc',
		instance_id: 'instance-id-456',
		template_step_id: 'template-step-id-789',
		step_key: 'antithesis_critique_per_doc',
		step_slug: 'critique-per-doc',
		step_name: 'Critique Per Document',
		step_description: 'Generate critique per source document',
		prompt_template_id: 'template-executor-id',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		output_type: FileType.business_case_critique,
		granularity_strategy: 'per_source_document',
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
			system_materials: {
				agent_internal_summary: '',
				input_artifacts_summary: '',
				stage_rationale: '',
			},
			documents: [
				{
					artifact_class: 'rendered_document',
					file_type: 'markdown',
					document_key: FileType.business_case_critique,
					template_filename: 'business_case_critique.md',
				},
			],
			files_to_generate: [
				{
					from_document_key: FileType.business_case_critique,
					template_filename: 'business_case_critique.md',
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

	const childJobs = planPerSourceDocument(sourceDocs, parentJobWithAntithesisStage, executeRecipeStep, parentJobWithAntithesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 2, 'Should create one child job per source document');
	
	// planPerSourceDocument currently uses each iteration doc for canonical params.
	// After fix, must use selectAnchorSourceDocument to select highest-relevance document once for ALL jobs.
	// Should select business_case (relevance 1.0) for canonical params in BOTH jobs, NOT varying per iteration.
	for (const job of childJobs) {
		assertExists(job, 'Child job should exist');
		assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
		
		if (isDialecticExecuteJobPayload(job)) {
			const executePayload: DialecticExecuteJobPayload = job;
			assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
			
			// All child jobs should use the same highest-relevance anchor (business_case)
			assertExists(
				executePayload.canonicalPathParams.sourceAnchorModelSlug,
				'canonicalPathParams should include sourceAnchorModelSlug from highest-relevance document'
			);
			// sourceAnchorModelSlug is extracted from anchor document's filename (businessCaseDoc with filename 'highest-relevance-model_0_business_case.md')
			assertEquals(
				executePayload.canonicalPathParams.sourceAnchorModelSlug,
				'highest-relevance-model',
				'sourceAnchorModelSlug should match business_case document (highest relevance 1.0) for ALL child jobs, not vary per iteration'
			);
			assertEquals(executePayload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});

Deno.test('planPerSourceDocument handles no_document_inputs_required by passing null anchor to createCanonicalPathParams', () => {
	// THESIS EXECUTE step with only header_context input (no document inputs) - valid configuration
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

	const headerContextDoc: SourceDocument = {
		id: 'header-context-doc-id',
		contribution_type: 'header_context',
		content: '',
		citations: [],
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
		model_id: 'gpt-4',
		model_name: null,
		prompt_template_id_used: null,
		document_key: undefined,
	};

	const sourceDoc1: SourceDocument = {
		id: 'source-doc-1',
		contribution_type: 'thesis',
		content: 'Content 1',
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
		model_id: 'gpt-4',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.feature_spec,
	};

	const sourceDocs: SourceDocument[] = [headerContextDoc, sourceDoc1];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-no-doc-inputs',
		instance_id: 'instance-id-123',
		template_step_id: 'template-step-id-456',
		step_key: 'thesis_generate_business_case',
		step_slug: 'generate-business-case',
		step_name: 'Generate Business Case',
		step_description: 'Generate Business Case',
		prompt_template_id: 'template-executor-id',
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
	};

	const childJobs = planPerSourceDocument(sourceDocs, parentJobWithThesisStage, executeRecipeStep, parentJobWithThesisStage.payload.user_jwt);

	assertEquals(childJobs.length, 2, 'Should create one child job per source document');
	for (const job of childJobs) {
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
			assertEquals(executePayload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});

Deno.test('planPerSourceDocument handles anchor_found by using result.document', () => {
	// Recipe step with document inputs and relevance - should use highest-relevance document
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

	const businessCaseDoc: SourceDocument = {
		id: 'business-case-anchor-found-id',
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
		model_id: 'gpt-4',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.business_case,
	};

	const featureSpecDoc: SourceDocument = {
		id: 'feature-spec-lower-rel-id',
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
		model_id: 'gpt-4',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.feature_spec,
	};

	const sourceDoc1: SourceDocument = {
		id: 'source-doc-1',
		contribution_type: 'thesis',
		content: 'Content 1',
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
		file_name: 'model_0_technical_approach.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-789',
		model_name: null,
		prompt_template_id_used: null,
		document_key: FileType.technical_approach,
	};

	const sourceDocs: SourceDocument[] = [featureSpecDoc, businessCaseDoc, sourceDoc1];

	const executeRecipeStep: DialecticStageRecipeStep = {
		id: 'execute-step-anchor-found',
		instance_id: 'instance-id-123',
		template_step_id: 'template-step-id-456',
		step_key: 'thesis_generate_business_case',
		step_slug: 'generate-business-case',
		step_name: 'Generate Business Case',
		step_description: 'Generate Business Case',
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
	};

	const childJobs = planPerSourceDocument(sourceDocs, parentJobWithThesisStage, executeRecipeStep, parentJobWithThesisStage.payload.user_jwt);

	// Only documents with model_id matching parent (gpt-4) pass the filter
	// sourceDoc1 has model_id: 'model-789', so it's filtered out
	assertEquals(childJobs.length, 2, 'Should create one child job per source document with matching model_id');
	for (const job of childJobs) {
		assertExists(job, 'Child job should exist');
		assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
		if (isDialecticExecuteJobPayload(job)) {
			const executePayload: DialecticExecuteJobPayload = job;
			assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
			assertExists(
				executePayload.canonicalPathParams.sourceAnchorModelSlug,
				'canonicalPathParams should include sourceAnchorModelSlug from highest-relevance document'
			);
			// sourceAnchorModelSlug is extracted from anchor document's filename (businessCaseDoc with filename 'anchor-model-slug_0_business_case.md')
			assertEquals(
				executePayload.canonicalPathParams.sourceAnchorModelSlug,
				'anchor-model-slug',
				'sourceAnchorModelSlug should match business_case document (highest relevance 1.0) for ALL child jobs'
			);
			assertEquals(executePayload.model_id, 'gpt-4', 'EXECUTE job model_id must match source document model_id');
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});

Deno.test('planPerSourceDocument throws on anchor_not_found', async () => {
	// Recipe step requiring document that doesn't exist in sourceDocs - should throw error
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
		model_id: 'gpt-4',
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
		step_description: 'Generate Business Case',
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
	};

	await assertRejects(
		async () => {
			planPerSourceDocument(sourceDocs, parentJobWithThesisStage, executeRecipeStep, parentJobWithThesisStage.payload.user_jwt);
		},
		Error,
		'Anchor document not found for stage \'thesis\' document_key \'business_case\'',
		'Should throw error when anchor document not found in sourceDocs'
	);
});

// ==============================================
// Step 95.c: Model-filtering behavior tests
// ==============================================

Deno.test('planPerSourceDocument 95.c.i: Given 3 header_contexts from 3 different models, planner called with model_id=A only creates jobs for model A\'s header_context', async (t) => {
	const headerContextModelA: SourceDocument = {
		id: 'hc-model-a',
		contribution_type: 'header_context',
		content: 'Header context from model A',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'model-a_0_header_context.json',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis',
		model_id: 'model-a',
		model_name: 'Model A',
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
		mime_type: 'application/json',
		target_contribution_id: null,
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_key: undefined,
		attempt_count: 0,
	};

	const headerContextModelB: SourceDocument = {
		...headerContextModelA,
		id: 'hc-model-b',
		content: 'Header context from model B',
		file_name: 'model-b_0_header_context.json',
		model_id: 'model-b',
		model_name: 'Model B',
	};

	const headerContextModelC: SourceDocument = {
		...headerContextModelA,
		id: 'hc-model-c',
		content: 'Header context from model C',
		file_name: 'model-c_0_header_context.json',
		model_id: 'model-c',
		model_name: 'Model C',
	};

	const parentJobForModelA: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-a',
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	const parentJobForModelB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-b',
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	const parentJobForModelC: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-c',
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	const executeRecipeStepWithHeaderContext: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		inputs_required: [
			{ type: 'header_context', slug: 'thesis', required: true },
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
	};

	const sourceDocs = [headerContextModelA, headerContextModelB, headerContextModelC];
	
	const allChildPayloads: DialecticExecuteJobPayload[] = [];

	await t.step('Model A: planner filters to model A\'s header_context and creates 1 job', () => {
		const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelA, executeRecipeStepWithHeaderContext, parentJobForModelA.payload.user_jwt);
		assertEquals(childPayloads.length, 1, 'Should create only 1 job for model A');
		const payload = childPayloads[0];
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		assertEquals(payload.inputs?.header_context_id, 'hc-model-a', 'Should use model A\'s header_context');
		assertEquals(payload.model_id, 'model-a', 'Child job should have model A\'s model_id');
		allChildPayloads.push(payload);
	});

	await t.step('Model B: planner filters to model B\'s header_context and creates 1 job', () => {
		const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelB, executeRecipeStepWithHeaderContext, parentJobForModelB.payload.user_jwt);
		assertEquals(childPayloads.length, 1, 'Should create only 1 job for model B');
		const payload = childPayloads[0];
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		assertEquals(payload.inputs?.header_context_id, 'hc-model-b', 'Should use model B\'s header_context');
		assertEquals(payload.model_id, 'model-b', 'Child job should have model B\'s model_id');
		allChildPayloads.push(payload);
	});

	await t.step('Model C: planner filters to model C\'s header_context and creates 1 job', () => {
		const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelC, executeRecipeStepWithHeaderContext, parentJobForModelC.payload.user_jwt);
		assertEquals(childPayloads.length, 1, 'Should create only 1 job for model C');
		const payload = childPayloads[0];
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		assertEquals(payload.inputs?.header_context_id, 'hc-model-c', 'Should use model C\'s header_context');
		assertEquals(payload.model_id, 'model-c', 'Child job should have model C\'s model_id');
		allChildPayloads.push(payload);
	});

	assertEquals(allChildPayloads.length, 3, 'Should have 3 jobs total, one for each model');
	
	const headerContextIds = allChildPayloads.map(p => p.inputs?.header_context_id).filter((id): id is string => typeof id === 'string');
	assertEquals(new Set(headerContextIds).size, 3, 'Should have 3 distinct header_context_ids');
	assertEquals(headerContextIds.includes('hc-model-a'), true, 'Should include model A\'s header_context_id');
	assertEquals(headerContextIds.includes('hc-model-b'), true, 'Should include model B\'s header_context_id');
	assertEquals(headerContextIds.includes('hc-model-c'), true, 'Should include model C\'s header_context_id');
	
	const modelIds = allChildPayloads.map(p => p.model_id).filter((id): id is string => typeof id === 'string');
	assertEquals(new Set(modelIds).size, 3, 'Should have 3 distinct model_ids');
	assertEquals(modelIds.includes('model-a'), true, 'Should include model A');
	assertEquals(modelIds.includes('model-b'), true, 'Should include model B');
	assertEquals(modelIds.includes('model-c'), true, 'Should include model C');
	
	for (const payload of allChildPayloads) {
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		const expectedHeaderContextId = payload.model_id === 'model-a' ? 'hc-model-a' : payload.model_id === 'model-b' ? 'hc-model-b' : 'hc-model-c';
		assertEquals(payload.inputs?.header_context_id, expectedHeaderContextId, `Job for ${payload.model_id} should use matching header_context`);
	}
});

Deno.test('planPerSourceDocument 95.c.ii: Given header_context from model A and parent job for model B, no jobs created (empty result)', () => {
	const headerContextModelA: SourceDocument = {
		id: 'hc-model-a',
		contribution_type: 'header_context',
		content: 'Header context from model A',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'model-a_0_header_context.json',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis',
		model_id: 'model-a',
		model_name: 'Model A',
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
		mime_type: 'application/json',
		target_contribution_id: null,
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_key: undefined,
		attempt_count: 0,
	};

	const parentJobForModelB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-b', // Parent is for model B, but source doc is from model A
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	const executeRecipeStepWithHeaderContext: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		inputs_required: [
			{ type: 'header_context', slug: 'thesis', required: true },
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
	};

	const sourceDocs = [headerContextModelA];
	const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelB, executeRecipeStepWithHeaderContext, parentJobForModelB.payload.user_jwt);

	// Should return empty array when no source docs match parent model_id
	assertEquals(childPayloads.length, 0, 'Should return empty array when header_context from model A but parent job is for model B');
});

Deno.test('planPerSourceDocument 95.c.iii: Given multiple docs from same model, creates job for each doc from that model', () => {
	const doc1ModelA: SourceDocument = {
		...MOCK_SOURCE_DOCS[0],
		id: 'doc-1-model-a',
		model_id: 'model-a',
		model_name: 'Model A',
	};

	const doc2ModelA: SourceDocument = {
		...MOCK_SOURCE_DOCS[1],
		id: 'doc-2-model-a',
		model_id: 'model-a',
		model_name: 'Model A',
	};

	const doc3ModelA: SourceDocument = {
		...MOCK_SOURCE_DOCS[0],
		id: 'doc-3-model-a',
		model_id: 'model-a',
		model_name: 'Model A',
	};

	const parentJobForModelA: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-a',
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	const sourceDocs = [doc1ModelA, doc2ModelA, doc3ModelA];
	const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelA, MOCK_RECIPE_STEP, parentJobForModelA.payload.user_jwt);

	// Should create one job for each document from model A
	assertEquals(childPayloads.length, 3, 'Should create 3 jobs, one for each document from model A');
	for (let i = 0; i < childPayloads.length; i++) {
		const payload = childPayloads[i];
		if (!isDialecticExecuteJobPayload(payload)) {
			throw new Error('Expected EXECUTE job');
		}
		assertEquals(payload.model_id, 'model-a', `Child job ${i} should have model A's model_id`);
		const expectedDocId = sourceDocs[i].id;
		const contributionType = sourceDocs[i].contribution_type;
		if (contributionType) {
			assertEquals(payload.inputs?.[`${contributionType}_id`], expectedDocId, `Child job ${i} should reference source document ${i}`);
		}
	}
});

Deno.test('planPerSourceDocument 95.c.iv: Model filtering applies only when source docs have model identification; docs without model_id are filtered out', () => {
	const docWithoutModelId: SourceDocument = {
		...MOCK_SOURCE_DOCS[0],
		id: 'doc-no-model-id',
		model_id: null, // No model_id - will be filtered out
		model_name: null,
	};

	const docWithModelId: SourceDocument = {
		...MOCK_SOURCE_DOCS[1],
		id: 'doc-with-model-id',
		model_id: 'model-a',
		model_name: 'Model A',
	};

	const parentJobForModelA: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-a',
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	const sourceDocs = [docWithoutModelId, docWithModelId];
	const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelA, MOCK_RECIPE_STEP, parentJobForModelA.payload.user_jwt);

	// Doc without model_id is filtered out (null !== 'model-a'), only doc with matching model_id is included
	assertEquals(childPayloads.length, 1, 'Should create job only for doc with matching model_id; doc without model_id is filtered out');
	
	const payloadWithModelId = childPayloads.find(p => isDialecticExecuteJobPayload(p) && p.inputs?.thesis_id === 'doc-with-model-id');
	assertExists(payloadWithModelId, 'Should create job for doc with matching model_id');
	if (!isDialecticExecuteJobPayload(payloadWithModelId)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(payloadWithModelId.model_id, 'model-a', 'Child job for doc with model_id should use source doc model_id');
});

Deno.test('planPerSourceDocument 95.c.v: EXECUTE jobs inherit model_id from the source document, not parent job', () => {
	const docModelA: SourceDocument = {
		...MOCK_SOURCE_DOCS[0],
		id: 'doc-model-a',
		model_id: 'model-a',
		model_name: 'Model A',
	};

	const docModelB: SourceDocument = {
		...MOCK_SOURCE_DOCS[1],
		id: 'doc-model-b',
		model_id: 'model-b',
		model_name: 'Model B',
	};

	const parentJobForModelA: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-a', // Parent is for model A
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	// Only docModelA should pass filtering (matches parent model_id)
	const sourceDocs = [docModelA, docModelB];
	const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelA, MOCK_RECIPE_STEP, parentJobForModelA.payload.user_jwt);

	// Should only create job for docModelA (matches parent model_id)
	assertEquals(childPayloads.length, 1, 'Should create only 1 job for doc matching parent model_id');
	const payload = childPayloads[0];
	if (!isDialecticExecuteJobPayload(payload)) {
		throw new Error('Expected EXECUTE job');
	}
	// EXECUTE job should inherit model_id from source document, not parent
	assertEquals(payload.model_id, 'model-a', 'EXECUTE job model_id must match source document\'s model_id, not parent job\'s model_id');
	assertEquals(payload.inputs?.thesis_id, 'doc-model-a', 'Should reference the correct source document');
});

Deno.test('planPerSourceDocument: When ONLY header_contexts exist (matching parent model), creates one job per header_context', () => {
	// Per documentation: "Document generation from header | per_source_document | One job per header_context"
	// When findSourceDocuments returns only header_contexts (no other documents), we should iterate over them
	// and create one job per header_context, using each header_context as an input to its own job
	
	const headerContextModelA: SourceDocument = {
		id: 'hc-model-a-only',
		contribution_type: 'header_context',
		content: 'Header context from model A',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'model-a_0_header_context.json',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis',
		model_id: 'model-a',
		model_name: 'Model A',
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
		mime_type: 'application/json',
		target_contribution_id: null,
		document_relationships: null,
		is_header: false,
		source_prompt_resource_id: null,
		document_key: undefined,
		attempt_count: 0,
	};

	const parentJobForModelA: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		id: MOCK_PARENT_JOB.id,
		session_id: MOCK_PARENT_JOB.session_id,
		user_id: MOCK_PARENT_JOB.user_id,
		stage_slug: MOCK_PARENT_JOB.stage_slug,
		iteration_number: MOCK_PARENT_JOB.iteration_number,
		payload: {
			projectId: MOCK_PARENT_JOB.payload.projectId,
			sessionId: MOCK_PARENT_JOB.payload.sessionId,
			stageSlug: MOCK_PARENT_JOB.payload.stageSlug,
			iterationNumber: MOCK_PARENT_JOB.payload.iterationNumber,
			model_id: 'model-a',
			walletId: MOCK_PARENT_JOB.payload.walletId,
			user_jwt: MOCK_PARENT_JOB.payload.user_jwt,
		},
		attempt_count: MOCK_PARENT_JOB.attempt_count,
		completed_at: MOCK_PARENT_JOB.completed_at,
		created_at: MOCK_PARENT_JOB.created_at,
		error_details: MOCK_PARENT_JOB.error_details,
		max_retries: MOCK_PARENT_JOB.max_retries,
		parent_job_id: MOCK_PARENT_JOB.parent_job_id,
		prerequisite_job_id: MOCK_PARENT_JOB.prerequisite_job_id,
		results: MOCK_PARENT_JOB.results,
		started_at: MOCK_PARENT_JOB.started_at,
		status: MOCK_PARENT_JOB.status,
		target_contribution_id: MOCK_PARENT_JOB.target_contribution_id,
		is_test_job: MOCK_PARENT_JOB.is_test_job,
		job_type: MOCK_PARENT_JOB.job_type,
	};

	const executeRecipeStepWithHeaderContext: DialecticStageRecipeStep = {
		...MOCK_RECIPE_STEP,
		job_type: 'EXECUTE',
		inputs_required: [
			{ type: 'header_context', slug: 'thesis', required: true },
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
	};

	// ONLY header_context exists (no other documents) - this simulates what findSourceDocuments returns
	// when the EXECUTE step only requires header_context input
	const sourceDocs = [headerContextModelA];
	const childPayloads = planPerSourceDocument(sourceDocs, parentJobForModelA, executeRecipeStepWithHeaderContext, parentJobForModelA.payload.user_jwt);

	// Per documentation line 186: "Document generation from header | per_source_document | One job per header_context"
	// When ONLY header_contexts exist, we should create one job per header_context
	assertEquals(childPayloads.length, 1, 'Should create 1 job for the header_context when only header_contexts exist');
	const payload = childPayloads[0];
	if (!isDialecticExecuteJobPayload(payload)) {
		throw new Error('Expected EXECUTE job');
	}
	assertEquals(payload.inputs?.header_context_id, 'hc-model-a-only', 'Job should use the header_context as input');
	assertEquals(payload.model_id, 'model-a', 'Child job should have the header_context\'s model_id');
});

Deno.test('planPerSourceDocument selects anchor from ALL source documents, not just filtered ones', () => {
	// RED test: Proves that selectAnchorSourceDocument is incorrectly passed only filteredSourceDocs
	// (documents matching parent model_id) instead of ALL sourceDocs.
	//
	// Scenario (Antithesis stage):
	// - Parent job has model_id='model-b' (the critiquing model)
	// - sourceDocs contains:
	//   - header_context from model-b (stage: antithesis) <- filtered in
	//   - thesis documents from model-a, model-b, model-c (stage: thesis) <- model-a and model-c filtered OUT
	// - inputs_required asks for 'document' from 'thesis' stage with document_key 'business_case'
	// - inputs_relevance says business_case has highest relevance (1.0)
	//
	// Current bug: filteredSourceDocs only has model-b's header_context (stage: antithesis),
	// so selectAnchorSourceDocument cannot find the thesis business_case anchor and throws.
	//
	// Expected: selectAnchorSourceDocument should receive ALL sourceDocs to find the anchor,
	// then the planner filters for job creation separately.

	const parentPayload = MOCK_PARENT_JOB.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: MOCK_PARENT_JOB.payload cannot be null');
	}

	// Parent job is for model-b (the critiquing model) in antithesis stage
	const parentJobForModelB: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...MOCK_PARENT_JOB,
		stage_slug: 'antithesis',
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'antithesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: 'model-b', // The critiquing model
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
		},
	};

	// Header context from model-b (antithesis stage) - this will be in filteredSourceDocs
	const headerContextModelB: SourceDocument = {
		id: 'hc-model-b-antithesis',
		contribution_type: 'header_context',
		content: '',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'antithesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'model-b_critiquing_model-a_0_header_context.json',
		storage_bucket: 'dialectic-contributions',
		storage_path: 'project-xyz/session_abc/iteration_1/2_antithesis/_work/context',
		model_id: 'model-b',
		model_name: 'Model B',
		prompt_template_id_used: null,
		seed_prompt_url: null,
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		error: null,
		citations: null,
		size_bytes: 100,
		mime_type: 'application/json',
		target_contribution_id: null,
		document_relationships: { source_group: 'lineage-a' },
		is_header: true,
		source_prompt_resource_id: null,
		attempt_count: 0,
	};

	// Thesis business_case from model-a - this will be FILTERED OUT (model-a !== model-b)
	const thesisBusinessCaseModelA: SourceDocument = {
		id: 'thesis-bc-model-a',
		contribution_type: 'document',
		content: '',
		session_id: 'session-abc',
		user_id: 'user-def',
		stage: 'thesis',
		iteration_number: 1,
		edit_version: 1,
		is_latest_edit: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		file_name: 'model-a_0_business_case.md',
		storage_bucket: 'dialectic-project-resources',
		storage_path: 'project-xyz/session_abc/iteration_1/1_thesis/documents',
		model_id: 'model-a', // Different from parent model_id!
		model_name: 'Model A',
		prompt_template_id_used: null,
		seed_prompt_url: null,
		original_model_contribution_id: null,
		raw_response_storage_path: null,
		tokens_used_input: 0,
		tokens_used_output: 0,
		processing_time_ms: 0,
		error: null,
		citations: null,
		size_bytes: 1000,
		mime_type: 'text/markdown',
		target_contribution_id: null,
		document_relationships: { source_group: 'lineage-a', thesis: 'thesis-bc-model-a' },
		is_header: false,
		source_prompt_resource_id: null,
		document_key: FileType.business_case,
		attempt_count: 0,
	};

	// All source documents from findSourceDocuments
	const sourceDocs: SourceDocument[] = [headerContextModelB, thesisBusinessCaseModelA];

	// Antithesis recipe step that requires thesis documents as input
	const antithesisRecipeStep: DialecticStageRecipeStep = {
		id: 'antithesis-critique-step',
		instance_id: 'instance-id-123',
		template_step_id: 'template-step-id-456',
		step_key: 'antithesis_generate_critique',
		step_slug: 'generate-critique',
		step_name: 'Generate Critique',
		step_description: 'Critique the thesis documents',
		prompt_template_id: 'antithesis-critique-template',
		prompt_type: 'Turn',
		job_type: 'EXECUTE',
		inputs_required: [
			{ type: 'header_context', slug: 'antithesis', required: true },
			{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true },
		],
		inputs_relevance: [
			{ document_key: FileType.business_case, relevance: 1.0 },
		],
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
	};

	// This should NOT throw - the anchor (thesis business_case) exists in sourceDocs
	// But current implementation throws because it only passes filteredSourceDocs to selectAnchorSourceDocument,
	// and thesisBusinessCaseModelA is filtered out (model-a !== model-b)
	const childPayloads = planPerSourceDocument(
		sourceDocs,
		parentJobForModelB,
		antithesisRecipeStep,
		parentJobForModelB.payload.user_jwt
	);

	// Should create 1 job for model-b's header_context
	assertEquals(childPayloads.length, 1, 'Should create 1 child job for model-b header_context');

	const payload = childPayloads[0];
	if (!isDialecticExecuteJobPayload(payload)) {
		throw new Error('Expected EXECUTE job');
	}

	// The anchor should be found from the thesis business_case (model-a), even though
	// the parent job is for model-b
	assertExists(
		payload.canonicalPathParams?.sourceAnchorModelSlug,
		'canonicalPathParams.sourceAnchorModelSlug should be set from thesis anchor document'
	);
	assertEquals(
		payload.canonicalPathParams.sourceAnchorModelSlug,
		'model-a',
		'sourceAnchorModelSlug should be model-a (from thesis business_case anchor), not model-b'
	);
});
 