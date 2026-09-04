// supabase/functions/dialectic-worker/pauseJobsForNsf.test.ts

import { pauseJobsForNsf } from './pauseJobsForNsf.ts';
import type { PauseJobsForNsfDeps, PauseJobsForNsfParams } from '../dialectic-service/dialectic.interface.ts';
import { assert, assertEquals, assertExists, assertObjectMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockLogger } from '../_shared/logger.mock.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import type { Database } from '../types_db.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';

type UpdateJobRecord = Database['public']['Tables']['dialectic_generation_jobs']['Update'];

function isUpdateJobRecord(record: unknown): record is UpdateJobRecord {
	if (!isRecord(record)) return false;
	if ('status' in record && typeof record.status !== 'string') return false;
	if ('error_details' in record && record.error_details !== null && typeof record.error_details !== 'object') return false;
	return true;
}

const baseParams: PauseJobsForNsfParams = {
	failingJobId: 'failing-job-id',
	sessionId: 'session-1',
	stageSlug: 'thesis',
	iterationNumber: 1,
	projectId: 'project-1',
	projectOwnerUserId: 'user-1',
};

Deno.test('pauseJobsForNsf', async (t) => {
	let mockSupabase: MockSupabaseClientSetup;
	let mockLogger: MockLogger;
	let deps: PauseJobsForNsfDeps;

	const setup = (mockOverrides?: Parameters<typeof createMockSupabaseClient>[1]) => {
		resetMockNotificationService();
		mockSupabase = createMockSupabaseClient(undefined, mockOverrides);
		mockLogger = new MockLogger();
		deps = {
			adminClient: mockSupabase.client as unknown as SupabaseClient<Database>,
			notificationService: mockNotificationService,
			logger: mockLogger,
		};
	};

	await t.step('sets failing job to paused_nsf with original_status processing and nsf_paused true', async () => {
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: [], error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy);
		assert(updateSpy.callCount >= 1);
		const firstUpdateArgs = updateSpy.callsArgs[0][0];
		assert(isUpdateJobRecord(firstUpdateArgs));
		assertObjectMatch(firstUpdateArgs, {
			status: 'paused_nsf',
		});
		if (firstUpdateArgs.error_details && typeof firstUpdateArgs.error_details === 'object') {
			assertObjectMatch(firstUpdateArgs.error_details as Record<string, unknown>, {
				original_status: 'processing',
				nsf_paused: true,
			});
		} else {
			throw new Error('error_details missing or not object');
		}
	});

	await t.step('given active sibling jobs (pending, pending_continuation, retrying), all set to paused_nsf with respective original_status', async () => {
		const siblings = [
			{ id: 'sib-1', status: 'pending' },
			{ id: 'sib-2', status: 'pending_continuation' },
			{ id: 'sib-3', status: 'retrying' },
		];
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: siblings, error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy);
		assertEquals(updateSpy.callCount, 1 + siblings.length);
		const updateCalls = updateSpy.callsArgs;
		const originalStatuses: string[] = [];
		for (const call of updateCalls) {
			const payload = call[0] as UpdateJobRecord;
			const ed = payload.error_details;
			if (ed !== null && ed !== undefined && typeof ed === 'object' && !Array.isArray(ed) && 'original_status' in ed) {
				originalStatuses.push(String((ed as Record<string, unknown>).original_status));
			}
		}
		assert(originalStatuses.includes('processing'));
		assert(originalStatuses.includes('pending'));
		assert(originalStatuses.includes('pending_continuation'));
		assert(originalStatuses.includes('retrying'));
	});

	await t.step('jobs in passive wait states (waiting_for_children, waiting_for_prerequisite) are NOT paused', async () => {
		const siblings = [
			{ id: 'sib-wfc', status: 'waiting_for_children' },
			{ id: 'sib-wfp', status: 'waiting_for_prerequisite' },
		];
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: siblings, error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy);
		assertEquals(updateSpy.callCount, 1);
	});

	await t.step('jobs already in terminal states (completed, failed, retry_loop_failed) are NOT paused', async () => {
		const siblings = [
			{ id: 'sib-done', status: 'completed' },
			{ id: 'sib-fail', status: 'failed' },
			{ id: 'sib-rlf', status: 'retry_loop_failed' },
		];
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: siblings, error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy);
		assertEquals(updateSpy.callCount, 1);
	});

	await t.step('jobs already in paused_nsf are NOT re-paused (idempotency)', async () => {
		const siblings = [
			{ id: 'sib-paused', status: 'paused_nsf' },
		];
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: siblings, error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy);
		assertEquals(updateSpy.callCount, 1);
	});

	await t.step('exactly ONE notification is sent regardless of how many jobs are paused', async () => {
		const siblings = [
			{ id: 'sib-1', status: 'pending' },
			{ id: 'sib-2', status: 'pending_continuation' },
		];
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: siblings, error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const notifySpy = mockNotificationService.sendContributionGenerationPausedNsfEvent;
		assertEquals(notifySpy.calls.length, 1);
	});

	await t.step('notification is called with ContributionGenerationPausedNsfPayload and targetUserId matching projectOwnerUserId', async () => {
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: [], error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const notifySpy = mockNotificationService.sendContributionGenerationPausedNsfEvent;
		assertEquals(notifySpy.calls.length, 1);
		const [payload, targetUserId] = notifySpy.calls[0].args;
		assertEquals(targetUserId, baseParams.projectOwnerUserId);
		assertObjectMatch(payload as Record<string, unknown>, {
			type: 'contribution_generation_paused_nsf',
			sessionId: baseParams.sessionId,
			projectId: baseParams.projectId,
			stageSlug: baseParams.stageSlug,
			iterationNumber: baseParams.iterationNumber,
		});
	});

	await t.step('if no siblings exist (solo EXECUTE job), still pauses failing job and sends one notification', async () => {
		setup({
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: [], error: null },
				},
			},
		});

		await pauseJobsForNsf(deps, baseParams);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy);
		assertEquals(updateSpy.callCount, 1);
		const notifySpy = mockNotificationService.sendContributionGenerationPausedNsfEvent;
		assertEquals(notifySpy.calls.length, 1);
	});
});
