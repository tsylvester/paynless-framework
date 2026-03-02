// supabase/functions/dialectic-worker/type-guards/pauseJobsForNsf.type_guards.ts

import type { PauseJobsForNsfParams } from '../../dialectic-service/dialectic.interface.ts';
import { isRecord } from '../../_shared/utils/type-guards/type_guards.common.ts';

export function isPauseJobsForNsfParams(value: unknown): value is PauseJobsForNsfParams {
	if (!isRecord(value)) {
		return false;
	}
	if (
		!('failingJobId' in value) ||
		!('sessionId' in value) ||
		!('stageSlug' in value) ||
		!('iterationNumber' in value) ||
		!('projectId' in value) ||
		!('projectOwnerUserId' in value)
	) {
		return false;
	}
	const failingJobId = value.failingJobId;
	const sessionId = value.sessionId;
	const stageSlug = value.stageSlug;
	const iterationNumber = value.iterationNumber;
	const projectId = value.projectId;
	const projectOwnerUserId = value.projectOwnerUserId;
	if (typeof failingJobId !== 'string' || failingJobId === '') {
		return false;
	}
	if (typeof sessionId !== 'string' || sessionId === '') {
		return false;
	}
	if (typeof stageSlug !== 'string' || stageSlug === '') {
		return false;
	}
	if (typeof iterationNumber !== 'number' || !Number.isInteger(iterationNumber) || iterationNumber < 0) {
		return false;
	}
	if (typeof projectId !== 'string' || projectId === '') {
		return false;
	}
	if (typeof projectOwnerUserId !== 'string' || projectOwnerUserId === '') {
		return false;
	}
	return true;
}
