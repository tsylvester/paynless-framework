// supabase/functions/dialectic-worker/pauseJobsForNsf.ts

import type {
	ContributionGenerationPausedNsfPayload,
	DialecticJobRow,
} from '../_shared/types/notification.service.types.ts';
import type { PauseJobsForNsfDeps, PauseJobsForNsfParams } from '../dialectic-service/dialectic.interface.ts';
import { isRecord } from '../_shared/utils/type-guards/type_guards.common.ts';

const ACTIVE_SIBLING_EXCLUDED_STATUSES: readonly string[] = [
	'completed',
	'failed',
	'retry_loop_failed',
	'paused_nsf',
	'waiting_for_children',
	'waiting_for_prerequisite',
];

function validateSiblingRow(row: unknown): row is Pick<DialecticJobRow, 'id' | 'status'> {
	if (!isRecord(row)) {
		return false;
	}
	if (!('id' in row) || !('status' in row)) {
		return false;
	}
	const id = row.id;
	const status = row.status;
	if (typeof id !== 'string' || typeof status !== 'string') {
		return false;
	}
	return true;
}

export async function pauseJobsForNsf(
	deps: PauseJobsForNsfDeps,
	params: PauseJobsForNsfParams,
): Promise<void> {
	const { adminClient, notificationService, logger } = deps;

	const { error: updateFailingError } = await adminClient
		.from('dialectic_generation_jobs')
		.update({
			status: 'paused_nsf',
			error_details: { original_status: 'processing', nsf_paused: true },
		})
		.eq('id', params.failingJobId);

	if (updateFailingError) {
		throw new Error(
			`pauseJobsForNsf: failed to pause failing job ${params.failingJobId}: ${updateFailingError.message}`,
		);
	}

	const { data: siblingRows, error: selectError } = await adminClient
		.from('dialectic_generation_jobs')
		.select('id, status')
		.eq('session_id', params.sessionId)
		.eq('stage_slug', params.stageSlug)
		.eq('iteration_number', params.iterationNumber)
		.neq('id', params.failingJobId);

	if (selectError) {
		throw new Error(
			`pauseJobsForNsf: failed to query siblings for job ${params.failingJobId}: ${selectError.message}`,
		);
	}

	if (siblingRows === null || siblingRows === undefined) {
		throw new Error(
			`pauseJobsForNsf: sibling query returned null/undefined for job ${params.failingJobId}`,
		);
	}

	const typedSiblings: Pick<DialecticJobRow, 'id' | 'status'>[] = [];
	for (const row of siblingRows) {
		if (!validateSiblingRow(row)) {
			throw new Error(
				`pauseJobsForNsf: invalid sibling row shape from DB for job ${params.failingJobId}: expected { id: string, status: string }, got ${JSON.stringify(row)}`,
			);
		}
		typedSiblings.push(row);
	}

	const activeSiblings = typedSiblings.filter(
		(s) => !ACTIVE_SIBLING_EXCLUDED_STATUSES.includes(s.status),
	);

	for (const sibling of activeSiblings) {
		const { error: siblingUpdateError } = await adminClient
			.from('dialectic_generation_jobs')
			.update({
				status: 'paused_nsf',
				error_details: { original_status: sibling.status, nsf_paused: true },
			})
			.eq('id', sibling.id);

		if (siblingUpdateError) {
			throw new Error(
				`pauseJobsForNsf: failed to pause sibling job ${sibling.id}: ${siblingUpdateError.message}`,
			);
		}
	}

	const pausedCount = 1 + activeSiblings.length;
	logger.info('[pauseJobsForNsf] paused jobs for NSF', {
		failingJobId: params.failingJobId,
		sessionId: params.sessionId,
		stageSlug: params.stageSlug,
		iterationNumber: params.iterationNumber,
		pausedCount,
	});

	const payload: ContributionGenerationPausedNsfPayload = {
		type: 'contribution_generation_paused_nsf',
		sessionId: params.sessionId,
		projectId: params.projectId,
		stageSlug: params.stageSlug,
		iterationNumber: params.iterationNumber,
	};
	await notificationService.sendContributionGenerationPausedNsfEvent(payload, params.projectOwnerUserId);
}
