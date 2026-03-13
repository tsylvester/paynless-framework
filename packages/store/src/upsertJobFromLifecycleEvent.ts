import type {
	UpsertJobFromLifecycleEventDeps,
	UpsertJobFromLifecycleEventParams,
	UpsertJobFromLifecycleEventPayload,
	UpsertJobFromLifecycleEventReturn,
	JobProgressDto,
} from '@paynless/types';

export function upsertJobFromLifecycleEvent(
	_deps: UpsertJobFromLifecycleEventDeps,
	payload: UpsertJobFromLifecycleEventPayload,
	params: UpsertJobFromLifecycleEventParams,
): UpsertJobFromLifecycleEventReturn {
	if (!payload.jobs) {
		payload.jobs = [];
	}
	const existing: JobProgressDto | undefined = payload.jobs.find(
		(j: JobProgressDto) => j.id === params.jobId,
	);
	if (existing) {
		existing.id = params.jobId;
		existing.status = params.status;
		existing.jobType = params.jobType ?? null;
		existing.stepKey = params.stepKey ?? null;
		existing.modelId = params.modelId ?? null;
		existing.documentKey = params.documentKey ?? null;
		existing.parentJobId = params.parentJobId ?? null;
		existing.startedAt = params.startedAt ?? null;
		existing.completedAt = params.completedAt ?? null;
		existing.modelName = params.modelName ?? null;
		return;
	}
	const now: string = new Date().toISOString();
	const newJob: JobProgressDto = {
		id: params.jobId,
		status: params.status,
		jobType: params.jobType ?? null,
		stepKey: params.stepKey ?? null,
		modelId: params.modelId ?? null,
		documentKey: params.documentKey ?? null,
		parentJobId: params.parentJobId ?? null,
		createdAt: params.createdAt ?? now,
		startedAt: params.startedAt ?? null,
		completedAt: params.completedAt ?? null,
		modelName: params.modelName ?? null,
	};
	payload.jobs.push(newJob);
}
