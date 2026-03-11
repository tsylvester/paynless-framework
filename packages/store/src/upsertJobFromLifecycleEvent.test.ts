import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
	upsertJobFromLifecycleEvent,
	updateJobStatusById,
} from './upsertJobFromLifecycleEvent.ts';
import type {
	StageRunProgressSnapshot,
	JobProgressDto,
	UpsertJobFromLifecycleEventParams,
	UpdateJobStatusByIdParams,
} from '@paynless/types';

function createEmptyProgress(): StageRunProgressSnapshot {
	return {
		stepStatuses: {},
		documents: {},
		jobProgress: {},
		progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
		jobs: [],
	};
}

function createJob(overrides: Partial<JobProgressDto>): JobProgressDto {
	return {
		id: '',
		status: '',
		jobType: null,
		stepKey: null,
		modelId: null,
		documentKey: null,
		parentJobId: null,
		createdAt: '',
		startedAt: null,
		completedAt: null,
		modelName: null,
		...overrides,
	};
}

describe('upsertJobFromLifecycleEvent', () => {
	it('upserts new job when no matching job_id exists in progress.jobs', () => {
		const base = createEmptyProgress();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-1',
			documentKey: 'doc_a',
			modelId: 'model-x',
			stepKey: 'execute_step',
			jobType: 'EXECUTE',
			status: 'processing',
		};
		const result = produce(base, (draft) => {
			upsertJobFromLifecycleEvent(draft, params);
		});
		expect(result.jobs).toHaveLength(1);
		expect(result.jobs[0].id).toBe('job-1');
		expect(result.jobs[0].status).toBe('processing');
		expect(result.jobs[0].documentKey).toBe('doc_a');
		expect(result.jobs[0].modelId).toBe('model-x');
		expect(result.jobs[0].stepKey).toBe('execute_step');
		expect(result.jobs[0].jobType).toBe('EXECUTE');
	});

	it('updates status in-place when job_id already exists (retry scenario)', () => {
		const existingJob = createJob({
			id: 'job-retry',
			status: 'processing',
			documentKey: 'd1',
			modelId: 'm1',
			stepKey: 's1',
			jobType: 'EXECUTE',
		});
		const base: StageRunProgressSnapshot = {
			...createEmptyProgress(),
			jobs: [existingJob],
		};
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-retry',
			documentKey: 'd1',
			modelId: 'm1',
			stepKey: 's1',
			jobType: 'EXECUTE',
			status: 'retrying',
		};
		const result = produce(base, (draft) => {
			upsertJobFromLifecycleEvent(draft, params);
		});
		expect(result.jobs).toHaveLength(1);
		expect(result.jobs[0].id).toBe('job-retry');
		expect(result.jobs[0].status).toBe('retrying');
	});

	it('sets jobType, stepKey, modelId, documentKey correctly on new entry', () => {
		const base = createEmptyProgress();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-render',
			documentKey: 'out.md',
			modelId: 'model-render',
			stepKey: 'render_step',
			jobType: 'RENDER',
			status: 'processing',
		};
		const result = produce(base, (draft) => {
			upsertJobFromLifecycleEvent(draft, params);
		});
		expect(result.jobs[0].jobType).toBe('RENDER');
		expect(result.jobs[0].stepKey).toBe('render_step');
		expect(result.jobs[0].modelId).toBe('model-render');
		expect(result.jobs[0].documentKey).toBe('out.md');
	});

	it('does not duplicate jobs on repeated calls with same job_id', () => {
		const base = createEmptyProgress();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-same',
			documentKey: 'doc',
			modelId: 'm',
			stepKey: 's',
			jobType: 'EXECUTE',
			status: 'processing',
		};
		const result = produce(base, (draft) => {
			upsertJobFromLifecycleEvent(draft, params);
			upsertJobFromLifecycleEvent(draft, params);
			upsertJobFromLifecycleEvent(draft, { ...params, status: 'completed' });
		});
		expect(result.jobs).toHaveLength(1);
		expect(result.jobs[0].status).toBe('completed');
	});

	it('handles empty progress.jobs array', () => {
		const base = createEmptyProgress();
		expect(base.jobs).toHaveLength(0);
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-first',
			documentKey: 'x',
			modelId: 'y',
			stepKey: 'z',
			jobType: 'EXECUTE',
			status: 'processing',
		};
		const result = produce(base, (draft) => {
			upsertJobFromLifecycleEvent(draft, params);
		});
		expect(result.jobs).toHaveLength(1);
		expect(result.jobs[0].id).toBe('job-first');
	});

	it('upserts with null documentKey/modelId for planner jobs', () => {
		const base = createEmptyProgress();
		const params: UpsertJobFromLifecycleEventParams = {
			jobId: 'job-planner',
			documentKey: null,
			modelId: null,
			stepKey: 'planner_step',
			jobType: 'PLAN',
			status: 'processing',
		};
		const result = produce(base, (draft) => {
			upsertJobFromLifecycleEvent(draft, params);
		});
		expect(result.jobs).toHaveLength(1);
		expect(result.jobs[0].id).toBe('job-planner');
		expect(result.jobs[0].documentKey).toBeNull();
		expect(result.jobs[0].modelId).toBeNull();
		expect(result.jobs[0].jobType).toBe('PLAN');
	});
});

describe('updateJobStatusById', () => {
	it('updates status of existing job found by job_id', () => {
		const existingJob = createJob({
			id: 'job-update-me',
			status: 'processing',
			documentKey: 'd',
			modelId: 'm',
			stepKey: 's',
			jobType: 'EXECUTE',
		});
		const base: StageRunProgressSnapshot = {
			...createEmptyProgress(),
			jobs: [existingJob],
		};
		const params: UpdateJobStatusByIdParams = {
			jobId: 'job-update-me',
			status: 'completed',
		};
		const result = produce(base, (draft) => {
			updateJobStatusById(draft, params);
		});
		expect(result.jobs).toHaveLength(1);
		expect(result.jobs[0].status).toBe('completed');
		expect(result.jobs[0].id).toBe('job-update-me');
	});

	it('is a no-op when job_id is not found (no insert)', () => {
		const base = createEmptyProgress();
		const params: UpdateJobStatusByIdParams = {
			jobId: 'job-nonexistent',
			status: 'completed',
		};
		const result = produce(base, (draft) => {
			updateJobStatusById(draft, params);
		});
		expect(result.jobs).toHaveLength(0);
	});
});
