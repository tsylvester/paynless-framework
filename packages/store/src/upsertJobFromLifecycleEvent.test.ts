import { describe, it, expect } from 'vitest';
import type {
	UpsertJobFromLifecycleEventDeps,
	UpsertJobFromLifecycleEventParams,
	UpsertJobFromLifecycleEventPayload,
	JobProgressDto,
} from '@paynless/types';
import { upsertJobFromLifecycleEvent } from './upsertJobFromLifecycleEvent';

const deps: UpsertJobFromLifecycleEventDeps = {};

function createPayload(initialJobs: JobProgressDto[] = []): UpsertJobFromLifecycleEventPayload {
	const payload: UpsertJobFromLifecycleEventPayload = {
		stepStatuses: {},
		documents: {},
		jobProgress: {},
		progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
		jobs: initialJobs.length > 0 ? initialJobs : [],
	};
	return payload;
}

describe('upsertJobFromLifecycleEvent', () => {
	it('upserts new job when no matching job_id exists in progress.jobs', () => {
		const payload = createPayload();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-1',
			documentKey: 'doc-a',
			modelId: 'model-x',
			stepKey: 'execute_step',
			jobType: 'EXECUTE',
			status: 'processing',
		};

		upsertJobFromLifecycleEvent(deps, payload, params);

		expect(payload.jobs).toHaveLength(1);
		expect(payload.jobs[0].id).toBe('job-1');
		expect(payload.jobs[0].status).toBe('processing');
	});

	it('overwrites existing job when job_id already exists (retry scenario)', () => {
		const existingJob: JobProgressDto = {
			id: 'job-retry',
			status: 'processing',
			jobType: 'EXECUTE',
			stepKey: 'execute_step',
			modelId: 'model-1',
			documentKey: 'doc-1',
			parentJobId: null,
			createdAt: '2020-01-01T00:00:00.000Z',
			startedAt: null,
			completedAt: null,
			modelName: null,
		};
		const payload = createPayload([existingJob]);
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-retry',
			documentKey: 'doc-1',
			modelId: 'model-1',
			stepKey: 'execute_step',
			jobType: 'EXECUTE',
			status: 'completed',
		};

		upsertJobFromLifecycleEvent(deps, payload, params);

		expect(payload.jobs).toHaveLength(1);
		expect(payload.jobs[0].id).toBe('job-retry');
		expect(payload.jobs[0].status).toBe('completed');
	});

	it('sets jobType, stepKey, modelId, documentKey correctly on new entry', () => {
		const payload = createPayload();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-render',
			documentKey: 'doc-b',
			modelId: 'model-y',
			stepKey: 'render_step',
			jobType: 'RENDER',
			status: 'processing',
		};

		upsertJobFromLifecycleEvent(deps, payload, params);

		expect(payload.jobs).toHaveLength(1);
		expect(payload.jobs[0].jobType).toBe('RENDER');
		expect(payload.jobs[0].stepKey).toBe('render_step');
		expect(payload.jobs[0].modelId).toBe('model-y');
		expect(payload.jobs[0].documentKey).toBe('doc-b');
	});

	it('does not duplicate jobs on repeated calls with same job_id', () => {
		const payload = createPayload();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-same',
			documentKey: 'doc-c',
			modelId: 'model-z',
			stepKey: 'execute_step',
			jobType: 'EXECUTE',
			status: 'processing',
		};

		upsertJobFromLifecycleEvent(deps, payload, params);
		upsertJobFromLifecycleEvent(deps, payload, params);
		const completedParams: UpsertJobFromLifecycleEventParams = {
			jobId: params.jobId,
			documentKey: params.documentKey,
			modelId: params.modelId,
			stepKey: params.stepKey,
			jobType: params.jobType,
			status: 'completed',
		};
		upsertJobFromLifecycleEvent(deps, payload, completedParams);

		expect(payload.jobs).toHaveLength(1);
		expect(payload.jobs[0].id).toBe('job-same');
		expect(payload.jobs[0].status).toBe('completed');
	});

	it('handles empty progress.jobs array', () => {
		const payload = createPayload();
		expect(payload.jobs).toHaveLength(0);

		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-first',
			documentKey: null,
			modelId: null,
			stepKey: 'plan_step',
			jobType: 'PLAN',
			status: 'processing',
		};

		upsertJobFromLifecycleEvent(deps, payload, params);

		expect(payload.jobs).toHaveLength(1);
		expect(payload.jobs[0].id).toBe('job-first');
	});

	it('upserts with null documentKey/modelId for planner jobs', () => {
		const payload = createPayload();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-planner',
			documentKey: null,
			modelId: null,
			stepKey: 'plan_step',
			jobType: 'PLAN',
			status: 'completed',
		};

		upsertJobFromLifecycleEvent(deps, payload, params);

		expect(payload.jobs).toHaveLength(1);
		expect(payload.jobs[0].id).toBe('job-planner');
		expect(payload.jobs[0].documentKey).toBeNull();
		expect(payload.jobs[0].modelId).toBeNull();
		expect(payload.jobs[0].jobType).toBe('PLAN');
	});

	it('overwrites existing entry with new notification (null params replace prior values)', () => {
		const existingJob: JobProgressDto = {
			id: 'job-overwrite',
			status: 'processing',
			jobType: 'EXECUTE',
			stepKey: 'execute_step',
			modelId: 'model-1',
			documentKey: 'doc-1',
			parentJobId: null,
			createdAt: '2020-01-01T00:00:00.000Z',
			startedAt: null,
			completedAt: null,
			modelName: null,
		};
		const payload = createPayload([existingJob]);
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-overwrite',
			documentKey: null,
			modelId: null,
			stepKey: null,
			jobType: null,
			status: 'completed',
		};

		upsertJobFromLifecycleEvent(deps, payload, params);

		expect(payload.jobs).toHaveLength(1);
		expect(payload.jobs[0].id).toBe('job-overwrite');
		expect(payload.jobs[0].status).toBe('completed');
		expect(payload.jobs[0].documentKey).toBeNull();
		expect(payload.jobs[0].modelId).toBeNull();
		expect(payload.jobs[0].stepKey).toBeNull();
		expect(payload.jobs[0].jobType).toBeNull();
	});
});
