import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	useDialecticStore,
	initialDialecticStateValues,
} from './dialecticStore';
import type {
	DialecticStateValues,
	StageDocumentCompositeKey,
	StageDocumentContentState,
	StageDocumentVersionInfo,
	ApiError,
	RenderCompletedPayload,
	RenderStartedPayload,
	DocumentCompletedPayload,
	DocumentChunkCompletedPayload,
	DialecticStageRecipe,
	ListStageDocumentsPayload,
	ListStageDocumentsResponse,
	StageDocumentChecklistEntry,
	SubmitStageDocumentFeedbackPayload,
	JobFailedPayload,
	DocumentStartedPayload,
	StageRenderedDocumentDescriptor,
	StageRunDocumentDescriptor,
	EditedDocumentResource,
	GetAllStageProgressPayload,
	GetAllStageProgressResponse,
	JobProgressDto,
	PlannerStartedPayload,
	PlannerCompletedPayload,
	ExecuteStartedPayload,
	IKeyValueStorage,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import {
	handleRenderCompletedLogic,
	getStageDocumentKey,
	ensureStageDocumentContentLogic,
	reapplyDraftToNewBaselineLogic,
	recordStageDocumentDraftLogic,
	recordStageDocumentFeedbackDraftLogic,
	flushStageDocumentFeedbackDraftLogic,
	hydrateStageProgressLogic,
	hydrateAllStageProgressLogic,
	upsertStageDocumentVersionLogic,
	fetchStageDocumentContentLogic,
	fetchStageDocumentFeedbackLogic,
	initializeFeedbackDraftLogic,
	buildFeedbackLocalStorageKey,
	type EnsureStageDocumentContentSeed,
} from './dialecticStore.documents';
import {
	api,
	resetApiMock,
	getMockDialecticClient,
} from '@paynless/api/mocks';
import { logger } from '@paynless/utils';
import { produce, type Draft } from 'immer';
import {
	mockDomainProcessAssociationRow,
	mockGetAllStageProgressResponse,
	mockStageProgressEntry,
} from '../../../apps/web/src/mocks/dialecticStore.mock';

const mockDialecticClient = getMockDialecticClient();
vi.mock('@paynless/api', async () => {
	const actualApi = await vi.importActual<typeof import('@paynless/api')>(
		'@paynless/api',
	);
	return {
		...actualApi,
		api: {
			...actualApi.api,
			dialectic: () => mockDialecticClient,
		},
	};
});

vi.mock('./authStore', () => ({
	useAuthStore: {
		getState: vi.fn(() => ({
			user: { id: 'user-store-test' },
		})),
	},
}));

const isRenderedDescriptor = (
	descriptor: StageRunDocumentDescriptor | undefined,
): descriptor is StageRenderedDocumentDescriptor =>
	Boolean(descriptor && descriptor.descriptorType !== 'planned');

/** Build composite key for stageRunProgress.documents (documentKey + separator + modelId). */
const stageRunDocKey = (documentKey: string, modelId: string): string =>
	`${documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`;

describe('Stage Progress Hydration', () => {
	const sessionId = 'session-1';
	const stageSlug = 'synthesis';
	const iterationNumber = 1;
	const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('hydrateStageProgress should call the API and populate the stageRunProgress map', async () => {
		const mockApiResponse: ListStageDocumentsResponse = [
			{
				documentKey: 'doc_a',
				modelId: 'model-a',
				status: 'completed',
				jobId: 'job-a',
				latestRenderedResourceId: 'res-a',
			},
			{
				documentKey: 'doc_b',
				modelId: 'model-b',
				status: 'generating',
				jobId: 'job-b',
				latestRenderedResourceId: 'res-b',
			},
		];

		const listStageDocumentsSpy = vi
			.spyOn(mockDialecticClient, 'listStageDocuments')
			.mockResolvedValue({
				data: mockApiResponse,
				status: 200,
			});

		expect(useDialecticStore.getState().stageRunProgress[progressKey]).toBeUndefined();

		const userId = 'user-1';
		const projectId = 'project-1';
		await useDialecticStore.getState().hydrateStageProgress({
			sessionId,
			stageSlug,
			iterationNumber,
			userId,
			projectId,
		});

		expect(listStageDocumentsSpy).toHaveBeenCalledWith({
			sessionId,
			stageSlug,
			iterationNumber,
			userId,
			projectId,
		});

		const state = useDialecticStore.getState();
		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(Object.keys(progress.documents).length).toBe(2);
		expect(progress.documents[stageRunDocKey('doc_a', 'model-a')]).toEqual(
			expect.objectContaining({
				status: 'completed',
				modelId: 'model-a',
			}),
		);
		expect(progress.documents[stageRunDocKey('doc_b', 'model-b')]).toEqual(
			expect.objectContaining({
				status: 'generating',
				modelId: 'model-b',
			}),
		);
	});
});

describe('hydrateStageProgressLogic', () => {
	const sessionId = 'session-1';
	const stageSlug = 'synthesis';
	const iterationNumber = 1;
	const userId = 'user-1';
	const projectId = 'project-1';
	const payload: ListStageDocumentsPayload = {
		sessionId,
		stageSlug,
		iterationNumber,
		userId,
		projectId,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('throws when API returns error response', async () => {
		vi.spyOn(mockDialecticClient, 'listStageDocuments').mockResolvedValue({
			data: undefined,
			error: { message: 'Server error', code: 'INTERNAL_ERROR' },
			status: 500,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateStageProgressLogic(set, payload)).rejects.toThrow(
			/[hydrateStageProgress]/,
		);
	});

	it('throws when API returns null data', async () => {
		vi.spyOn(mockDialecticClient, 'listStageDocuments').mockResolvedValue({
			data: undefined,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateStageProgressLogic(set, payload)).rejects.toThrow(
			/[hydrateStageProgress]/,
		);
	});

	it('throws when document validation fails (invalid entries)', async () => {
		const invalidResponse: ListStageDocumentsResponse = [
			{
				documentKey: '',
				modelId: 'model-a',
				status: 'completed',
				jobId: 'job-a',
				latestRenderedResourceId: 'res-a',
			},
		];

		vi.spyOn(mockDialecticClient, 'listStageDocuments').mockResolvedValue({
			data: invalidResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateStageProgressLogic(set, payload)).rejects.toThrow(
			/[hydrateStageProgress].*validation/,
		);
	});

	it('populates jobs array with one JobProgressDto per document entry returned by listStageDocuments', async () => {
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
		const validResponse: ListStageDocumentsResponse = [
			{
				documentKey: 'doc_a',
				modelId: 'model-a',
				status: 'completed',
				jobId: 'job-a',
				latestRenderedResourceId: 'res-a',
				stepKey: 'step-1',
			},
			{
				documentKey: 'doc_b',
				modelId: 'model-b',
				status: 'generating',
				jobId: 'job-b',
				latestRenderedResourceId: 'res-b',
				stepKey: 'step-1',
			},
		];

		vi.spyOn(mockDialecticClient, 'listStageDocuments').mockResolvedValue({
			data: validResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobs).toHaveLength(2);
	});

	it('each constructed JobProgressDto has correct id, status (mapped from doc status), modelId, documentKey, stepKey, jobType RENDER', async () => {
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
		const validResponse: ListStageDocumentsResponse = [
			{
				documentKey: 'doc_a',
				modelId: 'model-a',
				status: 'completed',
				jobId: 'job-a',
				latestRenderedResourceId: 'res-a',
				stepKey: 'step-1',
			},
			{
				documentKey: 'doc_b',
				modelId: 'model-b',
				status: 'generating',
				jobId: 'job-b',
				latestRenderedResourceId: 'res-b',
				stepKey: 'step-2',
			},
		];

		vi.spyOn(mockDialecticClient, 'listStageDocuments').mockResolvedValue({
			data: validResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobs).toHaveLength(2);

		const jobA: JobProgressDto = progress.jobs[0];
		expect(jobA.id).toBe('job-a');
		expect(jobA.status).toBe('completed');
		expect(jobA.modelId).toBe('model-a');
		expect(jobA.documentKey).toBe('doc_a');
		expect(jobA.stepKey).toBe('step-1');
		expect(jobA.jobType).toBe('RENDER');

		const jobB: JobProgressDto = progress.jobs[1];
		expect(jobB.id).toBe('job-b');
		expect(jobB.status).toBe('processing');
		expect(jobB.modelId).toBe('model-b');
		expect(jobB.documentKey).toBe('doc_b');
		expect(jobB.stepKey).toBe('step-2');
		expect(jobB.jobType).toBe('RENDER');
	});

	it('jobProgress map is populated per stepKey with correct totalJobs completedJobs failedJobs inProgressJobs counts', async () => {
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
		const validResponse: ListStageDocumentsResponse = [
			{
				documentKey: 'doc_a',
				modelId: 'model-a',
				status: 'completed',
				jobId: 'job-a',
				latestRenderedResourceId: 'res-a',
				stepKey: 's1',
			},
			{
				documentKey: 'doc_b',
				modelId: 'model-b',
				status: 'generating',
				jobId: 'job-b',
				latestRenderedResourceId: 'res-b',
				stepKey: 's1',
			},
			{
				documentKey: 'doc_c',
				modelId: 'model-c',
				status: 'failed',
				jobId: 'job-c',
				latestRenderedResourceId: 'res-c',
				stepKey: 's2',
			},
		];

		vi.spyOn(mockDialecticClient, 'listStageDocuments').mockResolvedValue({
			data: validResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobs).toHaveLength(3);

		expect(progress.jobProgress['s1']).toBeDefined();
		expect(progress.jobProgress['s1'].totalJobs).toBe(2);
		expect(progress.jobProgress['s1'].completedJobs).toBe(1);
		expect(progress.jobProgress['s1'].inProgressJobs).toBe(1);
		expect(progress.jobProgress['s1'].failedJobs).toBe(0);

		expect(progress.jobProgress['s2']).toBeDefined();
		expect(progress.jobProgress['s2'].totalJobs).toBe(1);
		expect(progress.jobProgress['s2'].completedJobs).toBe(0);
		expect(progress.jobProgress['s2'].inProgressJobs).toBe(0);
		expect(progress.jobProgress['s2'].failedJobs).toBe(1);
	});
});

describe('hydrateAllStageProgressLogic', () => {
	const sessionId = 'session-1';
	const iterationNumber = 1;
	const userId = 'user-1';
	const projectId = 'project-1';
	const payload: GetAllStageProgressPayload = {
		sessionId,
		iterationNumber,
		userId,
		projectId,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('populates stageRunProgress for multiple stages from single API response', async () => {
		const thesisProgressKey = `${sessionId}:thesis:${iterationNumber}`;
		const antithesisProgressKey = `${sessionId}:antithesis:${iterationNumber}`;
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 0, totalStages: 2 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'completed',
					modelCount: 1,
					progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
					documents: [
						{
							documentKey: 'doc_thesis_a',
							modelId: 'model-a',
							status: 'completed',
							jobId: 'job-thesis-a',
							latestRenderedResourceId: 'res-thesis-a',
						},
					],
				}),
				mockStageProgressEntry({
					stageSlug: 'antithesis',
					status: 'in_progress',
					modelCount: 1,
					progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
					documents: [
						{
							documentKey: 'doc_antithesis_b',
							modelId: 'model-b',
							status: 'generating',
							jobId: 'job-antithesis-b',
							latestRenderedResourceId: 'res-antithesis-b',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		expect(state.stageRunProgress[thesisProgressKey]).toBeDefined();
		expect(state.stageRunProgress[antithesisProgressKey]).toBeDefined();
	});

	it('keys each stage documents by (documentKey, modelId)', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 1, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'completed',
					modelCount: 1,
					progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
					documents: [
						{
							documentKey: 'success_metrics',
							modelId: 'model-x',
							status: 'completed',
							jobId: 'job-1',
							latestRenderedResourceId: 'res-1',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.documents[stageRunDocKey('success_metrics', 'model-x')]).toEqual(
			expect.objectContaining({
				status: 'completed',
				modelId: 'model-x',
			}),
		);
	});

	it('populates multiple models producing the same documentKey without collisions', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 1, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'completed',
					modelCount: 2,
					progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
					steps: [{ stepKey: 'a_key', status: 'completed' }],
					documents: [
						{
							documentKey: 'business_case',
							modelId: 'model-a',
							status: 'completed',
							jobId: 'job-a',
							latestRenderedResourceId: 'res-a',
						},
						{
							documentKey: 'business_case',
							modelId: 'model-b',
							status: 'completed',
							jobId: 'job-b',
							latestRenderedResourceId: 'res-b',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.stepStatuses.a_key).toBe('completed');
		expect(progress.progress).toEqual({ completedSteps: 1, totalSteps: 1, failedSteps: 0 });
		expect(progress.jobProgress).toEqual({});

		const keyA = stageRunDocKey('business_case', 'model-a');
		const keyB = stageRunDocKey('business_case', 'model-b');
		expect(progress.documents[keyA]).toBeDefined();
		expect(progress.documents[keyB]).toBeDefined();
		expect(keyA).not.toEqual(keyB);

		expect(progress.documents[keyA]).toEqual(
			expect.objectContaining({
				descriptorType: 'rendered',
				modelId: 'model-a',
				latestRenderedResourceId: 'res-a',
				job_id: 'job-a',
			}),
		);
		expect(progress.documents[keyB]).toEqual(
			expect.objectContaining({
				descriptorType: 'rendered',
				modelId: 'model-b',
				latestRenderedResourceId: 'res-b',
				job_id: 'job-b',
			}),
		);
	});

	it('throws when stages array is empty', async () => {
		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: { dagProgress: { completedStages: 0, totalStages: 0 }, stages: [] },
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateAllStageProgressLogic(set, payload)).rejects.toThrow(
			/[hydrateAllStageProgress].*stages array is empty/,
		);
	});

	it('throws when API returns error response', async () => {
		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: undefined,
			error: { message: 'Server error', code: 'INTERNAL_ERROR' },
			status: 500,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateAllStageProgressLogic(set, payload)).rejects.toThrow(
			/[hydrateAllStageProgress]/,
		);
	});

	it('throws when API returns undefined data', async () => {
		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: undefined,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateAllStageProgressLogic(set, payload)).rejects.toThrow(
			/[hydrateAllStageProgress]/,
		);
	});

	it('throws when document validation fails (invalid entries)', async () => {
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 0, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'in_progress',
					modelCount: null,
					progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
					documents: [
						{
							documentKey: '',
							modelId: 'model-a',
							status: 'completed',
							jobId: 'job-a',
							latestRenderedResourceId: 'res-a',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateAllStageProgressLogic(set, payload)).rejects.toThrow(
			/[hydrateAllStageProgress].*validation/,
		);
	});

	it('adds valid documents to progress', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 0, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'in_progress',
					modelCount: null,
					progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
					documents: [
						{
							documentKey: 'x',
							modelId: 'y',
							status: 'generating',
							jobId: 'j1',
							latestRenderedResourceId: 'res-1',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		const docKey = stageRunDocKey('x', 'y');
		expect(progress.documents[docKey]).toBeDefined();
		expect(progress.documents[docKey].status).toBe('generating');
		expect(progress.documents[docKey].modelId).toBe('y');
	});

	it('copies stepStatuses from API response to progress state', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 1, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'completed',
					modelCount: 1,
					progress: { completedSteps: 2, totalSteps: 2, failedSteps: 0 },
					steps: [
						{ stepKey: 'step_a', status: 'completed' },
						{ stepKey: 'step_b', status: 'in_progress' },
					],
					documents: [
						{
							documentKey: 'doc_a',
							modelId: 'model-1',
							status: 'completed',
							jobId: 'job-1',
							latestRenderedResourceId: 'res-1',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.stepStatuses).toEqual({
			step_a: 'completed',
			step_b: 'in_progress',
		});
	});

	it('stores jobs array from response in stageRunProgress[progressKey].jobs with all fields correct', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const job1: JobProgressDto = {
			id: 'job-1',
			status: 'completed',
			jobType: 'PLAN',
			stepKey: 'plan_step',
			modelId: null,
			documentKey: null,
			parentJobId: null,
			createdAt: '2025-01-01T00:00:00Z',
			startedAt: '2025-01-01T00:00:01Z',
			completedAt: '2025-01-01T00:00:02Z',
			modelName: 'model-1',
		};
		const job2: JobProgressDto = {
			id: 'job-2',
			status: 'processing',
			jobType: 'EXECUTE',
			stepKey: 'execute_step',
			modelId: 'model-a',
			documentKey: 'business_case',
			parentJobId: 'job-1',
			createdAt: '2025-01-01T00:00:03Z',
			startedAt: '2025-01-01T00:00:04Z',
			completedAt: null,
			modelName: 'model-a',
		};
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 0, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'in_progress',
					modelCount: 1,
					progress: { completedSteps: 0, totalSteps: 2, failedSteps: 0 },
					jobs: [job1, job2],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobs).toHaveLength(2);
		expect(progress.jobs[0]).toEqual(job1);
		expect(progress.jobs[1]).toEqual(job2);
	});

	it('stores ALL job types (PLAN, EXECUTE, RENDER) in progress.jobs', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const planJob: JobProgressDto = {
			id: 'plan-1',
			status: 'completed',
			jobType: 'PLAN',
			stepKey: 'plan_step',
			modelId: null,
			documentKey: null,
			parentJobId: null,
			createdAt: '',
			startedAt: null,
			completedAt: null,
			modelName: null,
		};
		const executeJob: JobProgressDto = {
			id: 'exec-1',
			status: 'completed',
			jobType: 'EXECUTE',
			stepKey: 'execute_step',
			modelId: 'model-1',
			documentKey: 'doc-key',
			parentJobId: null,
			createdAt: '',
			startedAt: null,
			completedAt: null,
			modelName: null,
		};
		const renderJob: JobProgressDto = {
			id: 'render-1',
			status: 'completed',
			jobType: 'RENDER',
			stepKey: 'render_step',
			modelId: 'model-1',
			documentKey: 'doc-key',
			parentJobId: null,
			createdAt: '',
			startedAt: null,
			completedAt: null,
			modelName: null,
		};
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 1, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'completed',
					modelCount: 1,
					progress: { completedSteps: 3, totalSteps: 3, failedSteps: 0 },
					jobs: [planJob, executeJob, renderJob],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobs).toHaveLength(3);
		const jobTypes = progress.jobs.map((j: JobProgressDto) => j.jobType);
		expect(jobTypes).toContain('PLAN');
		expect(jobTypes).toContain('EXECUTE');
		expect(jobTypes).toContain('RENDER');
	});

	it('populates jobProgress[stepKey] totalJobs, completedJobs, inProgressJobs, failedJobs from hydrated jobs', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const jobs: JobProgressDto[] = [
			{
				id: 'j1',
				status: 'completed',
				jobType: 'EXECUTE',
				stepKey: 'step_a',
				modelId: 'm1',
				documentKey: null,
				parentJobId: null,
				createdAt: '',
				startedAt: null,
				completedAt: null,
				modelName: null,
			},
			{
				id: 'j2',
				status: 'processing',
				jobType: 'EXECUTE',
				stepKey: 'step_a',
				modelId: 'm2',
				documentKey: null,
				parentJobId: null,
				createdAt: '',
				startedAt: null,
				completedAt: null,
				modelName: null,
			},
			{
				id: 'j3',
				status: 'failed',
				jobType: 'EXECUTE',
				stepKey: 'step_a',
				modelId: 'm3',
				documentKey: null,
				parentJobId: null,
				createdAt: '',
				startedAt: null,
				completedAt: null,
				modelName: null,
			},
		];
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 0, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'in_progress',
					modelCount: 3,
					progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
					jobs,
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobProgress['step_a']).toBeDefined();
		expect(progress.jobProgress['step_a'].totalJobs).toBe(3);
		expect(progress.jobProgress['step_a'].completedJobs).toBe(1);
		expect(progress.jobProgress['step_a'].inProgressJobs).toBe(1);
		expect(progress.jobProgress['step_a'].failedJobs).toBe(1);
	});

	it('populates jobProgress[stepKey].modelJobStatuses[modelId] from hydrated jobs', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const jobs: JobProgressDto[] = [
			{
				id: 'j1',
				status: 'completed',
				jobType: 'RENDER',
				stepKey: 'render_step',
				modelId: 'model-completed',
				documentKey: 'doc1',
				parentJobId: null,
				createdAt: '',
				startedAt: null,
				completedAt: null,	
				modelName: null,
			},
			{
				id: 'j2',
				status: 'failed',
				jobType: 'RENDER',
				stepKey: 'render_step',
				modelId: 'model-failed',
				documentKey: 'doc2',
				parentJobId: null,
				createdAt: '',
				startedAt: null,
				completedAt: null,
				modelName: null,
			},
		];
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 0, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'in_progress',
					modelCount: 2,
					progress: { completedSteps: 0, totalSteps: 1, failedSteps: 0 },
					jobs,
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobProgress['render_step'].modelJobStatuses?.['model-completed']).toBe('completed');
		expect(progress.jobProgress['render_step'].modelJobStatuses?.['model-failed']).toBe('failed');
	});

	it('populates stageRunProgress[progressKey].jobs from hydration so data survives simulated page reload', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const jobs: JobProgressDto[] = [
			{
				id: 'reload-job-1',
				status: 'completed',
				jobType: 'EXECUTE',
				stepKey: 'step_x',
				modelId: 'model-1',
				documentKey: 'doc-x',
				parentJobId: null,
				createdAt: '',
				startedAt: null,
				completedAt: null,
				modelName: null,
			},
		];
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 1, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'completed',
					modelCount: 1,
					progress: { completedSteps: 1, totalSteps: 1, failedSteps: 0 },
					jobs,
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.jobs).toHaveLength(1);
		expect(progress.jobs[0].id).toBe('reload-job-1');
	});

	it('leaves stepStatuses and documents hydration unchanged when jobs are present', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 1, totalStages: 1 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					status: 'completed',
					modelCount: 1,
					progress: { completedSteps: 2, totalSteps: 2, failedSteps: 0 },
					steps: [
						{ stepKey: 's1', status: 'completed' },
						{ stepKey: 's2', status: 'completed' },
					],
					documents: [
						{
							documentKey: 'doc_key',
							modelId: 'model_id',
							status: 'completed',
							jobId: 'job-1',
							latestRenderedResourceId: 'res-1',
						},
					],
					jobs: [
						{
							id: 'job-1',
							status: 'completed',
							jobType: 'RENDER',
							stepKey: 's2',
							modelId: 'model_id',
							documentKey: 'doc_key',
							parentJobId: null,
							createdAt: '',
							startedAt: null,
							completedAt: null,
							modelName: null,
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(progress.stepStatuses).toEqual({ s1: 'completed', s2: 'completed' });
		expect(progress.progress).toEqual({ completedSteps: 2, totalSteps: 2, failedSteps: 0 });
		expect(progress.documents[stageRunDocKey('doc_key', 'model_id')]).toEqual(
			expect.objectContaining({
				modelId: 'model_id',
				latestRenderedResourceId: 'res-1',
				job_id: 'job-1',
			}),
		);
		expect(progress.jobs).toHaveLength(1);
	});

	it('populates stageExpectedCountsByRun for a single stage from expectedCount', async () => {
		const runKey = `${sessionId}:${iterationNumber}`;
		const expectedCount = 7;
		const mockResponse = mockGetAllStageProgressResponse({
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					expectedCount,
					documents: [
						{
							documentKey: 'doc_a',
							modelId: 'model-1',
							status: 'completed',
							jobId: 'job-1',
							latestRenderedResourceId: 'res-1',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
			stageExpectedCountsByRun: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		expect(state.stageExpectedCountsByRun[runKey]).toBeDefined();
		expect(state.stageExpectedCountsByRun[runKey]['thesis']).toBe(expectedCount);
	});

	it('populates stageExpectedCountsByRun with each stage keyed to its own expectedCount', async () => {
		const runKey = `${sessionId}:${iterationNumber}`;
		const thesisExpectedCount = 3;
		const antithesisExpectedCount = 5;
		const mockResponse = mockGetAllStageProgressResponse({
			dagProgress: { completedStages: 0, totalStages: 2 },
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					expectedCount: thesisExpectedCount,
					documents: [
						{
							documentKey: 'doc_thesis',
							modelId: 'model-a',
							status: 'completed',
							jobId: 'job-thesis',
							latestRenderedResourceId: 'res-thesis',
						},
					],
				}),
				mockStageProgressEntry({
					stageSlug: 'antithesis',
					status: 'in_progress',
					expectedCount: antithesisExpectedCount,
					documents: [
						{
							documentKey: 'doc_antithesis',
							modelId: 'model-b',
							status: 'generating',
							jobId: 'job-antithesis',
							latestRenderedResourceId: 'res-antithesis',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
			stageExpectedCountsByRun: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		expect(state.stageExpectedCountsByRun[runKey]['thesis']).toBe(thesisExpectedCount);
		expect(state.stageExpectedCountsByRun[runKey]['antithesis']).toBe(antithesisExpectedCount);
	});

	it('throws when expectedCount is negative and leaves stageExpectedCountsByRun unchanged', async () => {
		const runKey = `${sessionId}:${iterationNumber}`;
		const seededCounts: Record<string, Record<string, number>> = {
			[runKey]: { thesis: 99 },
		};
		const mockResponse = mockGetAllStageProgressResponse({
			stages: [mockStageProgressEntry({ expectedCount: -1 })],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
			stageExpectedCountsByRun: seededCounts,
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateAllStageProgressLogic(set, payload)).rejects.toThrow(
			/\[hydrateAllStageProgress\].*expectedCount/,
		);
		expect(state.stageExpectedCountsByRun).toEqual(seededCounts);
	});

	it('throws when expectedCount is non-integer and leaves stageExpectedCountsByRun unchanged', async () => {
		const runKey = `${sessionId}:${iterationNumber}`;
		const seededCounts: Record<string, Record<string, number>> = {
			[runKey]: { thesis: 99 },
		};
		const mockResponse = mockGetAllStageProgressResponse({
			stages: [mockStageProgressEntry({ expectedCount: 1.5 })],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
			stageExpectedCountsByRun: seededCounts,
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateAllStageProgressLogic(set, payload)).rejects.toThrow(
			/\[hydrateAllStageProgress\].*expectedCount/,
		);
		expect(state.stageExpectedCountsByRun).toEqual(seededCounts);
	});

	it('throws when expectedCount is non-number and leaves stageExpectedCountsByRun unchanged', async () => {
		const runKey = `${sessionId}:${iterationNumber}`;
		const seededCounts: Record<string, Record<string, number>> = {
			[runKey]: { thesis: 99 },
		};
		const stageWithNonNumberExpectedCount = mockStageProgressEntry();
		Reflect.set(stageWithNonNumberExpectedCount, 'expectedCount', 'not-a-number');
		const mockResponse = mockGetAllStageProgressResponse({
			stages: [stageWithNonNumberExpectedCount],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
			stageExpectedCountsByRun: seededCounts,
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await expect(hydrateAllStageProgressLogic(set, payload)).rejects.toThrow(
			/\[hydrateAllStageProgress\].*expectedCount/,
		);
		expect(state.stageExpectedCountsByRun).toEqual(seededCounts);
	});

	it('does not alter stageExpectedCountsByRun when hydrateStageProgressLogic runs after authoritative hydrate', async () => {
		const runKey = `${sessionId}:${iterationNumber}`;
		const expectedCount = 4;
		const listStagePayload: ListStageDocumentsPayload = {
			sessionId,
			stageSlug: 'thesis',
			iterationNumber,
			userId,
			projectId,
		};
		const mockResponse = mockGetAllStageProgressResponse({
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					expectedCount,
					documents: [
						{
							documentKey: 'doc_a',
							modelId: 'model-1',
							status: 'completed',
							jobId: 'job-1',
							latestRenderedResourceId: 'res-1',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
			stageExpectedCountsByRun: {},
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);
		expect(state.stageExpectedCountsByRun[runKey]['thesis']).toBe(expectedCount);

		vi.spyOn(mockDialecticClient, 'listStageDocuments').mockResolvedValue({
			data: [
				{
					documentKey: 'doc_b',
					modelId: 'model-2',
					status: 'generating',
					jobId: 'job-2',
					latestRenderedResourceId: 'res-2',
					stepKey: 'step-1',
				},
			],
			status: 200,
		});

		await hydrateStageProgressLogic(set, listStagePayload);

		expect(state.stageExpectedCountsByRun[runKey]['thesis']).toBe(expectedCount);
	});

	it('does not mutate selectedDomainProcessAssociation or preProjectStageExpectedCounts during authoritative hydrate', async () => {
		const seededAssociation = mockDomainProcessAssociationRow();
		const seededPreProjectCounts = [{ stageSlug: 'thesis', expectedCount: 2 }];
		const mockResponse = mockGetAllStageProgressResponse({
			stages: [
				mockStageProgressEntry({
					stageSlug: 'thesis',
					expectedCount: 6,
					documents: [
						{
							documentKey: 'doc_a',
							modelId: 'model-1',
							status: 'completed',
							jobId: 'job-1',
							latestRenderedResourceId: 'res-1',
						},
					],
				}),
			],
		});

		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: mockResponse,
			status: 200,
		});

		let state: DialecticStateValues = {
			...initialDialecticStateValues,
			stageRunProgress: {},
			stageExpectedCountsByRun: {},
			selectedDomainProcessAssociation: seededAssociation,
			preProjectStageExpectedCounts: seededPreProjectCounts,
		};
		const set = (fn: (draft: DialecticStateValues) => void) => {
			state = produce<DialecticStateValues>(state, fn);
		};

		await hydrateAllStageProgressLogic(set, payload);

		expect(state.selectedDomainProcessAssociation).toEqual(seededAssociation);
		expect(state.preProjectStageExpectedCounts).toEqual(seededPreProjectCounts);
	});
});
