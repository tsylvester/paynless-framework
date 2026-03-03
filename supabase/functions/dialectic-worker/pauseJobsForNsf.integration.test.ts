// supabase/functions/dialectic-worker/pauseJobsForNsf.integration.test.ts

import { pauseJobsForNsf } from './pauseJobsForNsf.ts';
import type { PauseJobsForNsfDeps, PauseJobsForNsfParams } from '../dialectic-service/dialectic.interface.ts';
import type { ContributionGenerationPausedNsfPayload } from '../_shared/types/notification.service.types.ts';
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

Deno.test('pauseJobsForNsf integration', async (t) => {
	const failingJobId = 'job-processing';
	const sessionId = 'session-int-1';
	const stageSlug = 'thesis';
	const iterationNumber = 1;
	const projectId = 'project-int-1';
	const projectOwnerUserId = 'user-int-1';

	const params: PauseJobsForNsfParams = {
		failingJobId,
		sessionId,
		stageSlug,
		iterationNumber,
		projectId,
		projectOwnerUserId,
	};

	const siblingsFromDb = [
		{ id: 'sib-p1', status: 'pending' },
		{ id: 'sib-p2', status: 'pending' },
		{ id: 'sib-done', status: 'completed' },
		{ id: 'sib-wfp', status: 'waiting_for_prerequisite' },
	];

	let mockSupabase: MockSupabaseClientSetup;
	let deps: PauseJobsForNsfDeps;

	await t.step('parent PLAN (waiting_for_children) with 5 EXECUTE children: 1 processing (failing), 2 pending, 1 completed, 1 waiting_for_prerequisite — only failing + 2 pending paused; completed and waiting_for_prerequisite untouched; parent untouched', async () => {
		resetMockNotificationService();
		mockSupabase = createMockSupabaseClient(undefined, {
			genericMockResults: {
				'dialectic_generation_jobs': {
					update: { data: [{}], error: null },
					select: { data: siblingsFromDb, error: null },
				},
			},
		});
		const mockLogger = new MockLogger();
		deps = {
			adminClient: mockSupabase.client as unknown as SupabaseClient<Database>,
			notificationService: mockNotificationService,
			logger: mockLogger,
		};

		await pauseJobsForNsf(deps, params);

		const updateSpy = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
		assertExists(updateSpy);
		assertEquals(updateSpy.callCount, 3, 'expect 3 updates: failing job + 2 active siblings (pending); completed and waiting_for_prerequisite must not be paused');

		const originalStatuses: string[] = [];
		for (const call of updateSpy.callsArgs) {
			const payload = call[0];
			assert(isUpdateJobRecord(payload));
			assertObjectMatch(payload, { status: 'paused_nsf' });
			if (hasOriginalStatus(payload.error_details)) {
				originalStatuses.push(payload.error_details.original_status);
			}
		}
		assert(originalStatuses.includes('processing'), 'failing job must have original_status processing');
		assertEquals(originalStatuses.filter((s) => s === 'pending').length, 2, 'two siblings must have original_status pending');
		assertEquals(originalStatuses.length, 3);
	});

	await t.step('exactly one notification is sent', async () => {
		const notifySpy = mockNotificationService.sendContributionGenerationPausedNsfEvent;
		assertEquals(notifySpy.calls.length, 1);
		const [payload, targetUserId] = notifySpy.calls[0].args;
		assertEquals(targetUserId, projectOwnerUserId);
		assert(isContributionGenerationPausedNsfPayload(payload));
		assertEquals(payload.sessionId, sessionId);
		assertEquals(payload.projectId, projectId);
		assertEquals(payload.stageSlug, stageSlug);
		assertEquals(payload.iterationNumber, iterationNumber);
	});
});
