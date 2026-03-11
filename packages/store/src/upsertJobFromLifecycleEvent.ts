import type {
	JobProgressDto,
	UpsertJobFromLifecycleEventParams,
	UpsertJobFromLifecycleEventPayload,
	UpsertJobFromLifecycleEventReturn,
	UpdateJobStatusByIdParams,
	UpdateJobStatusByIdPayload,
	UpdateJobStatusByIdReturn,
} from '@paynless/types';

export function upsertJobFromLifecycleEvent(
	payload: UpsertJobFromLifecycleEventPayload,
	params: UpsertJobFromLifecycleEventParams,
): UpsertJobFromLifecycleEventReturn {
	if (!payload.jobs) {
		payload.jobs = [];
	}
	const existing = payload.jobs.find((j: JobProgressDto) => j.id === params.jobId);
	if (existing) {
		existing.status = params.status;
		return;
	}
	const now: string = new Date().toISOString();
	const newJob: JobProgressDto = {
		id: params.jobId,
		status: params.status,
		jobType: params.jobType,
		stepKey: params.stepKey,
		modelId: params.modelId,
		documentKey: params.documentKey,
		parentJobId: null,
		createdAt: now,
		startedAt: null,
		completedAt: null,
		modelName: null,
	};
	payload.jobs.push(newJob);
}

export function updateJobStatusById(
	payload: UpdateJobStatusByIdPayload,
	params: UpdateJobStatusByIdParams,
): UpdateJobStatusByIdReturn {
	if (!payload.jobs) {
		return;
	}
	const existing = payload.jobs.find((j: JobProgressDto) => j.id === params.jobId);
	if (existing) {
		existing.status = params.status;
	}
}
