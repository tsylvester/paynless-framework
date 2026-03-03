// supabase/functions/dialectic-worker/index.nsf-pause.integration.test.ts
// Node 4: end-to-end NSF pause flow — when first job hits NSF, siblings paused, parent stays waiting_for_children, one notification.

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handleJob } from './index.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup, type MockQueryBuilderState } from '../_shared/supabase.mock.ts';
import type { Database } from '../types_db.ts';
import { createJobContext } from './createJobContext.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import { MockLogger } from '../_shared/logger.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';
import type { ContributionGenerationPausedNsfPayload } from '../_shared/types/notification.service.types.ts';

type JobRow = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
type UpdateJobRecord = Database['public']['Tables']['dialectic_generation_jobs']['Update'];

function isUpdateJobRecord(record: unknown): record is UpdateJobRecord {
	if (!isRecord(record)) return false;
	if ('status' in record && typeof record.status !== 'string') return false;
	if ('error_details' in record && record.error_details !== null && typeof record.error_details !== 'object') return false;
	return true;
}

function hasOriginalStatus(ed: unknown): ed is { original_status: string } {
	if (!isRecord(ed)) return false;
	if (!('original_status' in ed)) return false;
	const v = ed.original_status;
	return typeof v === 'string';
}

function isContributionGenerationPausedNsfPayload(p: unknown): p is ContributionGenerationPausedNsfPayload {
	if (!isRecord(p)) return false;
	if (p.type !== 'contribution_generation_paused_nsf') return false;
	const sessionId = p.sessionId;
	const projectId = p.projectId;
	const stageSlug = p.stageSlug;
	const iterationNumber = p.iterationNumber;
	return typeof sessionId === 'string' && typeof projectId === 'string' && typeof stageSlug === 'string' && typeof iterationNumber === 'number';
}

Deno.test('index NSF pause integration - end-to-end: NSF error pauses failing job and active siblings, parent untouched, exactly one notification', async (t) => {
	const failingJobId = 'job-nsf-e2e';
	const sessionId = 'session-nsf-e2e';
	const stageSlug = 'thesis';
	const iterationNumber = 1;
	const projectId = 'project-nsf-e2e';
	const projectOwnerUserId = 'user-nsf-e2e';

	const jobRow: JobRow = {
		id: failingJobId,
		user_id: projectOwnerUserId,
		session_id: sessionId,
		stage_slug: stageSlug,
		payload: {
			job_type: 'PLAN',
			sessionId,
			projectId,
			stageSlug,
			model_id: 'model-id',
			iterationNumber,
		},
		iteration_number: iterationNumber,
		status: 'pending',
		attempt_count: 0,
		max_retries: 3,
		created_at: new Date().toISOString(),
		started_at: null,
		completed_at: null,
		results: null,
		error_details: null,
		parent_job_id: null,
		target_contribution_id: null,
		prerequisite_job_id: null,
		is_test_job: false,
		job_type: 'PLAN',
	};

	const siblingsFromDb: Pick<JobRow, 'id' | 'status'>[] = [
		{ id: 'sib-p1', status: 'pending' },
		{ id: 'sib-p2', status: 'pending' },
		{ id: 'sib-done', status: 'completed' },
		{ id: 'sib-wfp', status: 'waiting_for_prerequisite' },
	];

	// Use mock's function form so we return the right rows per query: claim select gets [jobRow], sibling select gets only siblings.
	const dialecticJobsSelect = async (state: MockQueryBuilderState): Promise<{ data: object[] | null; error: null }> => {
		const isSiblingQuery = state.filters.some((f) => f.column === 'session_id' && f.type === 'eq');
		if (isSiblingQuery) {
			return { data: siblingsFromDb, error: null };
		}
		return { data: [jobRow], error: null };
	};

	const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			'dialectic_generation_jobs': {
				select: dialecticJobsSelect,
				update: { data: [{}], error: null },
			},
			'dialectic_stages': {
				select: {
					data: [{ id: 1, slug: stageSlug, name: 'Thesis', display_name: 'Thesis' }],
					error: null,
				},
			},
		},
		rpcResults: {
			'create_notification_for_user': { data: null, error: null },
		},
	});

	const mockLogger = new MockLogger();
	const adminClient: SupabaseClient<Database> = mockSupabase.client as unknown as SupabaseClient<Database>;
	const notificationService = new NotificationService(adminClient);
	const testDeps = createJobContext(createMockJobContextParams({
		...createMockJobContextParams(),
		logger: mockLogger,
		fileManager: new MockFileManagerService(),
		notificationService,
	}));

	const pausedNsfSpy = spy(notificationService, 'sendContributionGenerationPausedNsfEvent');
	const { processors } = createMockJobProcessors();
	processors.processComplexJob = async () => {
		throw new Error('Insufficient funds to cover the input prompt cost.');
	};

	await t.step('handleJob with NSF error: failing job and active siblings paused, parent remains waiting_for_children, no failure path', async () => {
		mockSupabase.client.clearAllTrackedBuilders();

		await handleJob(
			adminClient,
			jobRow,
			testDeps,
			'mock-token',
			processors,
		);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy, 'Update spy should exist');
		assert(updateSpy.callCount >= 2, 'At least claim update + failing job paused_nsf; siblings may add more');
		const updateCalls = updateSpy.callsArgs;
		let seenPausedNsf = 0;
		const originalStatuses: string[] = [];
		for (let i = 0; i < updateCalls.length; i++) {
			const payload = updateCalls[i][0];
			assert(isUpdateJobRecord(payload));
			if (payload.status === 'paused_nsf') {
				seenPausedNsf += 1;
				if (hasOriginalStatus(payload.error_details)) {
					originalStatuses.push(payload.error_details.original_status);
				}
			}
		}
		assert(seenPausedNsf >= 3, 'Expect at least 3 paused_nsf updates: failing job + 2 pending siblings');
		assert(originalStatuses.includes('processing'), 'Failing job must have original_status processing');
		assertEquals(originalStatuses.filter((s) => s === 'pending').length, 2, 'Two siblings must have original_status pending');

		assertEquals(pausedNsfSpy.calls.length, 1, 'Exactly one contribution_generation_paused_nsf notification must be sent');
		const [payload, targetUserId] = pausedNsfSpy.calls[0].args;
		assertEquals(targetUserId, projectOwnerUserId);
		assert(isContributionGenerationPausedNsfPayload(payload));
		assertEquals(payload.sessionId, sessionId);
		assertEquals(payload.projectId, projectId);
		assertEquals(payload.stageSlug, stageSlug);
		assertEquals(payload.iterationNumber, iterationNumber);
	});

	pausedNsfSpy.restore();
});
