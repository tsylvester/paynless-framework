import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	useDialecticStore,
	initialDialecticStateValues,
} from './dialecticStore';
import type {
	DialecticStateValues,
	StageDocumentCompositeKey,
	StageDocumentContentState,
	ApiError,
	RenderCompletedPayload,
	DocumentCompletedPayload,
	DialecticStageRecipe,
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
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import {
	handleRenderCompletedLogic,
	getStageDocumentKey,
	ensureStageDocumentContentLogic,
	recordStageDocumentFeedbackDraftLogic,
	flushStageDocumentFeedbackDraftLogic,
	hydrateAllStageProgressLogic,
} from './dialecticStore.documents';
import {
	api,
	resetApiMock,
	getMockDialecticClient,
} from '@paynless/api/mocks';
import { logger } from '@paynless/utils';
import { produce } from 'immer';

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
		const mockResponse: GetAllStageProgressResponse = [
			{
				stageSlug: 'thesis',
				documents: [
					{
						documentKey: 'doc_thesis_a',
						modelId: 'model-a',
						status: 'completed',
						jobId: 'job-thesis-a',
						latestRenderedResourceId: 'res-thesis-a',
					},
				],
				stepStatuses: {},
				stageStatus: 'completed',
			},
			{
				stageSlug: 'antithesis',
				documents: [
					{
						documentKey: 'doc_antithesis_b',
						modelId: 'model-b',
						status: 'generating',
						jobId: 'job-antithesis-b',
						latestRenderedResourceId: 'res-antithesis-b',
					},
				],
				stepStatuses: {},
				stageStatus: 'in_progress',
			},
		];

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
		const mockResponse: GetAllStageProgressResponse = [
			{
				stageSlug: 'thesis',
				documents: [
					{
						documentKey: 'success_metrics',
						modelId: 'model-x',
						status: 'completed',
						jobId: 'job-1',
						latestRenderedResourceId: 'res-1',
					},
				],
				stepStatuses: {},
				stageStatus: 'completed',
			},
		];

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

	it('handles empty response gracefully', async () => {
		vi.spyOn(mockDialecticClient, 'getAllStageProgress').mockResolvedValue({
			data: [],
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

		expect(Object.keys(state.stageRunProgress).length).toBe(0);
	});

	it('handles API error gracefully', async () => {
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

		await hydrateAllStageProgressLogic(set, payload);

		expect(Object.keys(state.stageRunProgress).length).toBe(0);
	});

	it('adds documents without latestRenderedResourceId to progress', async () => {
		const progressKey = `${sessionId}:thesis:${iterationNumber}`;
		const mockResponse: GetAllStageProgressResponse = [
			{
				stageSlug: 'thesis',
				documents: [
					{
						documentKey: 'x',
						modelId: 'y',
						status: 'generating',
						jobId: 'j1',
						latestRenderedResourceId: '',
					},
				],
				stepStatuses: {},
				stageStatus: 'in_progress',
			},
		];

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
		const mockResponse: GetAllStageProgressResponse = [
			{
				stageSlug: 'thesis',
				documents: [
					{
						documentKey: 'doc_a',
						modelId: 'model-1',
						status: 'completed',
						jobId: 'job-1',
						latestRenderedResourceId: 'res-1',
					},
				],
				stepStatuses: { step_a: 'completed', step_b: 'in_progress' },
				stageStatus: 'completed',
			},
		];

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
});

describe('Dialectic store document refresh behaviour', () => {
	const compositeKey: StageDocumentCompositeKey = {
		sessionId: 'session-1',
		stageSlug: 'thesis',
		iterationNumber: 1,
		modelId: 'model-1',
		documentKey: 'business_case',
	};
	const serializedKey = getStageDocumentKey(compositeKey);
	const progressKey = `${compositeKey.sessionId}:${compositeKey.stageSlug}:${compositeKey.iterationNumber}`;

	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('records render metadata and requests document content on first completion', async () => {
		const getProjectResourceContentSpy = vi
			.spyOn(mockDialecticClient, 'getProjectResourceContent')
			.mockResolvedValue({
				data: {
					content: 'Test content',
					fileName: 'test.md',
					mimeType: 'text/markdown',
					sourceContributionId: null,
				},
				status: 200,
			});

		const mockRecipe: DialecticStageRecipe = {
			stageSlug: 'thesis',
			instanceId: 'test-instance',
			steps: [
				{
					id: '1',
					step_key: 'render_step',
					step_slug: 'render',
					step_name: 'Render Document',
					execution_order: 1,
					job_type: 'RENDER',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
				},
			],
		};

		useDialecticStore.setState({
			stageRunProgress: {
				[progressKey]: {
					documents: {},
					stepStatuses: {},
				},
			},
			recipesByStageSlug: {
				[compositeKey.stageSlug]: mockRecipe,
			},
		});

		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId: compositeKey.sessionId,
			stageSlug: compositeKey.stageSlug,
			iterationNumber: compositeKey.iterationNumber,
			job_id: 'job-render',
			document_key: compositeKey.documentKey,
			modelId: compositeKey.modelId,
			latestRenderedResourceId: 'resource/new',
			step_key: 'render_step',
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(renderEvent);

		const state = useDialecticStore.getState();
		expect(
			state.stageRunProgress[progressKey].documents[
				stageRunDocKey(compositeKey.documentKey, compositeKey.modelId)
			].status,
		).toBe('completed');
		const versionInfo = state.stageDocumentVersions[serializedKey];
		expect(versionInfo).toBeDefined();
		expect(state.stageDocumentVersions[serializedKey]?.versionHash).toBe(
			versionInfo.versionHash,
		);
		expect(getProjectResourceContentSpy).toHaveBeenCalledWith({
			resourceId: renderEvent.latestRenderedResourceId,
		});
	});

	it('promotes planned document descriptors to rendered descriptors on first render event', async () => {
		const mockRecipe: DialecticStageRecipe = {
			stageSlug: 'thesis',
			instanceId: 'test-instance',
			steps: [
				{
					id: '1',
					step_key: 'render_step',
					step_slug: 'render',
					step_name: 'Render Document',
					execution_order: 1,
					job_type: 'RENDER',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
				},
			],
		};

		useDialecticStore.setState({
			stageRunProgress: {
				[progressKey]: {
					documents: {
						[stageRunDocKey(compositeKey.documentKey, compositeKey.modelId)]: {
							descriptorType: 'planned',
							status: 'not_started',
							stepKey: 'render_step',
							modelId: compositeKey.modelId,
						},
					},
					stepStatuses: {},
				},
			},
			recipesByStageSlug: {
				[compositeKey.stageSlug]: mockRecipe,
			},
		});

		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId: compositeKey.sessionId,
			stageSlug: compositeKey.stageSlug,
			iterationNumber: compositeKey.iterationNumber,
			job_id: 'job-render',
			document_key: compositeKey.documentKey,
			modelId: compositeKey.modelId,
			latestRenderedResourceId: 'resource/rendered',
			step_key: 'render_step',
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(renderEvent);

		const documentDescriptor =
			useDialecticStore.getState().stageRunProgress[progressKey].documents[
				stageRunDocKey(compositeKey.documentKey, compositeKey.modelId)
			];

		expect(documentDescriptor).toBeDefined();
		expect(documentDescriptor.descriptorType).toBe('rendered');
		if (documentDescriptor.descriptorType !== 'rendered') {
			throw new Error('render completion must produce a rendered descriptor');
		}
		expect(documentDescriptor.job_id).toBe(renderEvent.job_id);
		expect(documentDescriptor.latestRenderedResourceId).toBe(
			renderEvent.latestRenderedResourceId,
		);
		expect(documentDescriptor.versionHash).toBeDefined();
		expect(documentDescriptor.lastRenderedResourceId).toBe(
			renderEvent.latestRenderedResourceId,
		);
		expect(documentDescriptor.lastRenderAtIso).toBeDefined();
	});

	it('reapplies user edits after refreshed baseline content is fetched', async () => {
		const oldBaseline = 'Old baseline';
		const userEdits = 'User edits';
		const newBaseline = 'New baseline';
		const newResourceId = 'resource/new';

		const getProjectResourceContentSpy = vi.spyOn(
			mockDialecticClient,
			'getProjectResourceContent',
		);

		// Seed the store with a dirty document
		useDialecticStore.setState((state: DialecticStateValues) => {
			state.stageDocumentContent[serializedKey] = {
				baselineMarkdown: oldBaseline,
				currentDraftMarkdown: `${oldBaseline}\n${userEdits}`,
				isDirty: true,
				isLoading: false,
				error: null,
				lastBaselineVersion: {
					resourceId: 'resource/old',
					versionHash: 'old-hash',
					updatedAt: new Date().toISOString(),
				},
				pendingDiff: userEdits,
				lastAppliedVersionHash: 'old-hash',
				sourceContributionId: null,
				feedbackDraftMarkdown: '',
				feedbackIsDirty: false,
			};
			state.stageRunProgress[progressKey] = {
				documents: {},
				stepStatuses: {},
			};
		});

		getProjectResourceContentSpy.mockResolvedValue({
			data: {
				content: newBaseline,
				fileName: 'test.md',
				mimeType: 'text/markdown',
				sourceContributionId: null,
			},
			status: 200,
		});

		await useDialecticStore
			.getState()
			.fetchStageDocumentContent(compositeKey, newResourceId);

		const state = useDialecticStore.getState();
		const content = state.stageDocumentContent[serializedKey];
		expect(content).toBeDefined();
		expect(content.baselineMarkdown).toBe(newBaseline);
		expect(content.currentDraftMarkdown).toBe(`${newBaseline}\n${userEdits}`);
		expect(content.isDirty).toBe(true);
		expect(content.pendingDiff).toBe('User edits');
	});

	it('does not refetch when the render event repeats the same resource', async () => {
		const seededContent: StageDocumentContentState = {
			baselineMarkdown: 'Seeded baseline',
			currentDraftMarkdown: 'Seeded baseline\nUser edits',
			isDirty: true,
			isLoading: false,
			error: null,
			lastBaselineVersion: {
				resourceId: 'resource/unchanged',
				versionHash: 'some-hash',
				updatedAt: new Date().toISOString(),
			},
			pendingDiff: 'User edits',
			lastAppliedVersionHash: 'some-hash',
			sourceContributionId: null,
			feedbackDraftMarkdown: '',
			feedbackIsDirty: false,
		};

		const mockRecipe: DialecticStageRecipe = {
			stageSlug: 'thesis',
			instanceId: 'test-instance',
			steps: [
				{
					id: '1',
					step_key: 'render_step',
					step_slug: 'render',
					step_name: 'Render Document',
					execution_order: 1,
					job_type: 'RENDER',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state: DialecticStateValues) => {
			state.stageDocumentContent[serializedKey] = seededContent;
			state.stageDocumentVersions[serializedKey] = {
				resourceId: 'resource/unchanged',
				versionHash: 'some-hash',
				updatedAt: new Date().toISOString(),
			};
			state.stageRunProgress[progressKey] = {
				documents: {},
				stepStatuses: {},
			};
			state.recipesByStageSlug[compositeKey.stageSlug] = mockRecipe;
		});

		const getProjectResourceContentSpy = vi.spyOn(
			mockDialecticClient,
			'getProjectResourceContent',
		);

		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId: compositeKey.sessionId,
			stageSlug: compositeKey.stageSlug,
			iterationNumber: compositeKey.iterationNumber,
			job_id: 'job-render-1',
			document_key: compositeKey.documentKey,
			modelId: compositeKey.modelId,
			latestRenderedResourceId: 'resource/unchanged',
			step_key: 'render_step',
		};

		const store = useDialecticStore.getState();
		await store._handleDialecticLifecycleEvent?.(renderEvent);

		const versionAfterFirst =
			useDialecticStore.getState().stageDocumentVersions[serializedKey];
		const contentAfterFirst =
			useDialecticStore.getState().stageDocumentContent[serializedKey];
		expect(versionAfterFirst).toBeDefined();
		expect(contentAfterFirst.currentDraftMarkdown).toBe(
			seededContent.currentDraftMarkdown,
		);
		expect(contentAfterFirst.isDirty).toBe(true);
		expect(getProjectResourceContentSpy).not.toHaveBeenCalled();

		await store._handleDialecticLifecycleEvent?.(renderEvent);
		expect(getProjectResourceContentSpy).not.toHaveBeenCalled();
	});

	it('flushes only the targeted document draft when requested', () => {
		const firstKey: StageDocumentCompositeKey = {
			sessionId: 's1',
			stageSlug: 'thesis',
			iterationNumber: 1,
			modelId: 'm1',
			documentKey: 'doc_a',
		};
		const secondKey: StageDocumentCompositeKey = {
			sessionId: 's1',
			stageSlug: 'thesis',
			iterationNumber: 1,
			modelId: 'm2',
			documentKey: 'doc_b',
		};
		const firstSerialized = getStageDocumentKey(firstKey);
		const secondSerialized = getStageDocumentKey(secondKey);

		useDialecticStore.setState({
			stageDocumentContent: {
				[firstSerialized]: {
					baselineMarkdown: 'Doc A baseline',
					currentDraftMarkdown: 'Doc A baseline\nSome edits for A',
					isDirty: true,
					isLoading: false,
					error: null,
					lastBaselineVersion: {
						resourceId: 'res-a',
						versionHash: 'a1',
						updatedAt: new Date().toISOString(),
					},
					pendingDiff: 'Some edits for A',
					lastAppliedVersionHash: 'a1',
					sourceContributionId: null,
					feedbackDraftMarkdown: '',
					feedbackIsDirty: false,
				},
				[secondSerialized]: {
					baselineMarkdown: 'Doc B baseline',
					currentDraftMarkdown: 'Doc B baseline\nSome edits for B',
					isDirty: true,
					isLoading: false,
					error: null,
					lastBaselineVersion: {
						resourceId: 'res-b',
						versionHash: 'b1',
						updatedAt: new Date().toISOString(),
					},
					pendingDiff: 'Some edits for B',
					lastAppliedVersionHash: 'b1',
					sourceContributionId: null,
					feedbackDraftMarkdown: '',
					feedbackIsDirty: false,
				},
			},
		});

		useDialecticStore.getState().flushStageDocumentDraft(firstKey);

		const state = useDialecticStore.getState();
		const firstContent = state.stageDocumentContent[firstSerialized];
		const secondContent = state.stageDocumentContent[secondSerialized];

		expect(firstContent.currentDraftMarkdown).toBe('Doc A baseline');
		expect(firstContent.isDirty).toBe(false);
		expect(firstContent.pendingDiff).toBeNull();
		expect(secondContent.currentDraftMarkdown).toBe(
			'Doc B baseline\nSome edits for B',
		);
		expect(secondContent.isDirty).toBe(true);
	});
});

describe('Surface document content & feedback accessors', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const compositeKey: StageDocumentCompositeKey = {
		sessionId: 'session-1',
		stageSlug: 'thesis',
		iterationNumber: 1,
		modelId: 'model-1',
		documentKey: 'business_case',
	};

	it('fetches and stores feedback for a document', async () => {
		const mockFeedback = [{
			id: 'feedback-1',
			content: 'This is feedback content.',
			fileName: 'feedback.md',
			createdAt: new Date().toISOString(),
		}];
		mockDialecticClient.getStageDocumentFeedback.mockResolvedValue({
			data: mockFeedback,
			error: undefined,
			status: 200,
		});

		await useDialecticStore.getState().fetchStageDocumentFeedback(compositeKey);

		const state = useDialecticStore.getState();
		const serializedKey = getStageDocumentKey(compositeKey);
		const feedback = state.stageDocumentFeedback[serializedKey];

		expect(feedback).toEqual(mockFeedback);
		expect(state.isLoadingStageDocumentFeedback).toBe(false);
		expect(state.stageDocumentFeedbackError).toBeNull();
	});

	it('handles errors when fetching feedback', async () => {
		const apiError: ApiError = {
			message: 'Not found',
			code: '404',
		};
		mockDialecticClient.getStageDocumentFeedback.mockResolvedValue({
			data: undefined,
			error: apiError,
			status: 404,
		});

		await useDialecticStore.getState().fetchStageDocumentFeedback(compositeKey);

		const state = useDialecticStore.getState();

		expect(state.isLoadingStageDocumentFeedback).toBe(false);
		expect(state.stageDocumentFeedbackError).toEqual(apiError);
	});

	it('submits feedback for a document and updates state', async () => {
		const feedbackContent = 'This is new feedback to submit.';
		mockDialecticClient.submitStageDocumentFeedback.mockResolvedValue({
			data: { success: true },
			error: undefined,
			status: 200,
		});

		await useDialecticStore.getState().submitStageDocumentFeedback({
			...compositeKey,
			feedbackContent: feedbackContent,
			userId: 'user-test-123',
			projectId: 'proj-test-456',
			feedbackType: 'user_feedback',
		});

		const state = useDialecticStore.getState();

		expect(state.isSubmittingStageDocumentFeedback).toBe(false);
		expect(state.submitStageDocumentFeedbackError).toBeNull();
	});

	it('selects document feedback from the store', () => {
		const feedbackContent = [{
			id: 'feedback-2',
			content: 'Existing feedback',
			fileName: 'feedback.md',
			createdAt: new Date().toISOString(),
		}];
		const serializedKey = getStageDocumentKey(compositeKey);
		useDialecticStore.setState({
			stageDocumentFeedback: {
				[serializedKey]: feedbackContent,
			},
		});

		const selectedFeedback = useDialecticStore
			.getState()
			.stageDocumentFeedback[serializedKey];

		expect(selectedFeedback).toEqual(feedbackContent);
	});
});

describe('Dialectic store document clear focused stage document', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('clears only the targeted document draft when focus is lost', () => {
		const firstKey: StageDocumentCompositeKey = {
			sessionId: 's1',
			stageSlug: 'thesis',
			iterationNumber: 1,
			modelId: 'model-1',
			documentKey: 'doc_a',
		};
		const secondKey: StageDocumentCompositeKey = {
			sessionId: 's1',
			stageSlug: 'thesis',
			iterationNumber: 1,
			modelId: 'model-2',
			documentKey: 'doc_b',
		};
		const firstSerialized = getStageDocumentKey(firstKey);
		const secondSerialized = getStageDocumentKey(secondKey);
		const firstFocusKey = 's1:thesis:model-1';
		const secondFocusKey = 's1:thesis:model-2';

		useDialecticStore.setState({
			stageDocumentContent: {
				[firstSerialized]: {
					baselineMarkdown: 'Doc A baseline',
					currentDraftMarkdown: 'Doc A baseline\nSome edits for A',
					isDirty: true,
					isLoading: false,
					error: null,
					lastBaselineVersion: {
						resourceId: 'res-a',
						versionHash: 'a1',
						updatedAt: new Date().toISOString(),
					},
					pendingDiff: 'Some edits for A',
					lastAppliedVersionHash: 'a1',
					sourceContributionId: null,
					feedbackDraftMarkdown: '',
					feedbackIsDirty: false,
				},
				[secondSerialized]: {
					baselineMarkdown: 'Doc B baseline',
					currentDraftMarkdown: 'Doc B baseline\nSome edits for B',
					isDirty: true,
					isLoading: false,
					error: null,
					lastBaselineVersion: {
						resourceId: 'res-b',
						versionHash: 'b1',
						updatedAt: new Date().toISOString(),
					},
					pendingDiff: 'Some edits for B',
					lastAppliedVersionHash: 'b1',
					sourceContributionId: null,
					feedbackDraftMarkdown: '',
					feedbackIsDirty: false,
				},
			},
			focusedStageDocument: {
				[firstFocusKey]: { modelId: 'model-1', documentKey: 'doc_a' },
				[secondFocusKey]: { modelId: 'model-2', documentKey: 'doc_b' },
			},
			stageRunProgress: {
				's1:thesis:1': {
					documents: {
						[stageRunDocKey('doc_a', 'model-1')]: {
							status: 'completed',
							job_id: 'job-a',
							latestRenderedResourceId: 'res-a',
							modelId: 'model-1',
							versionHash: 'a1',
							lastRenderedResourceId: 'res-a',
							lastRenderAtIso: new Date().toISOString(),
						},
					},
					stepStatuses: {},
				},
			},
		});

		useDialecticStore.getState().clearFocusedStageDocument({
			sessionId: 's1',
			stageSlug: 'thesis',
			modelId: 'model-1',
		});

		const state = useDialecticStore.getState();
		expect(state.focusedStageDocument[firstFocusKey]).toBeNull();
		expect(state.stageDocumentContent[firstSerialized]).toBeUndefined();
		expect(state.focusedStageDocument[secondFocusKey]).toBeDefined();
		expect(state.stageDocumentContent[secondSerialized]).toBeDefined();
	});
});

describe('submitStageDocumentFeedback', () => {
	const backendContractFields = [
		'feedbackContent',
		'userId',
		'projectId',
		'feedbackType',
	];

	it('should call the API with the correct payload and optimistically update the store', async () => {
		const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: 'test-session-id',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			modelId: 'model-a',
			documentKey: 'document_1',
			feedbackContent: 'This is a test feedback.',
			userId: 'user-test-123',
			projectId: 'proj-test-456',
			feedbackType: 'user_feedback',
			sourceContributionId: null,
		};

		const spy = vi
			.spyOn(mockDialecticClient, 'submitStageDocumentFeedback')
			.mockResolvedValue({
				data: { success: true },
				error: undefined,
				status: 200,
			});

		await useDialecticStore.getState().submitStageDocumentFeedback(
			feedbackPayload,
		);

		expect(spy).toHaveBeenCalledWith(feedbackPayload);
		const sentPayload = spy.mock.calls[0][0];
		for (const field of backendContractFields) {
			expect(sentPayload).toHaveProperty(field);
			expect(typeof sentPayload[field]).toBe('string');
		}
	});

	it('should log an error if the API call fails', async () => {
		const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: 'test-session-id',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			modelId: 'model-a',
			documentKey: 'document_1',
			feedbackContent: 'This is a test feedback.',
			userId: 'user-test-123',
			projectId: 'proj-test-456',
			feedbackType: 'user_feedback',
		};

		const apiError: ApiError = {
			message: 'Failed to submit feedback',
			details: 'Server error',
			code: '500',
		};

		vi.spyOn(
			mockDialecticClient,
			'submitStageDocumentFeedback',
		).mockResolvedValue({
			data: undefined,
			error: apiError,
			status: 500,
		});
		const loggerSpy = vi.spyOn(logger, 'error');

		await useDialecticStore.getState().submitStageDocumentFeedback(
			feedbackPayload,
		);

		expect(loggerSpy).toHaveBeenCalledWith(
			'[submitStageDocumentFeedback] Failed to submit document feedback',
			{
				error: apiError,
				key: 'test-session-id:synthesis:1:model-a:document_1',
			},
		);
	});

	it('should enrich payload with sourceContributionId when resource metadata exists', async () => {
		const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: 'test-session-id',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			modelId: 'model-a',
			documentKey: 'document_1',
			feedbackContent: 'This is test feedback.',
			userId: 'user-test-123',
			projectId: 'proj-test-456',
			feedbackType: 'user_feedback',
		};

		const compositeKey: StageDocumentCompositeKey = {
			sessionId: feedbackPayload.sessionId,
			stageSlug: feedbackPayload.stageSlug,
			iterationNumber: feedbackPayload.iterationNumber,
			modelId: feedbackPayload.modelId,
			documentKey: feedbackPayload.documentKey,
		};
		const serializedKey = getStageDocumentKey(compositeKey);
		const mockResource: EditedDocumentResource = {
			id: 'resource-123',
			resource_type: 'rendered_document',
			project_id: 'proj-1',
			session_id: feedbackPayload.sessionId,
			stage_slug: feedbackPayload.stageSlug,
			iteration_number: feedbackPayload.iterationNumber,
			document_key: feedbackPayload.documentKey,
			source_contribution_id: 'contrib-doc-123',
			storage_bucket: 'bucket',
			storage_path: 'path',
			file_name: 'file.md',
			mime_type: 'text/markdown',
			size_bytes: 100,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};

		useDialecticStore.setState({
			stageDocumentResources: {
				[serializedKey]: mockResource,
			},
		});

		const spy = vi
			.spyOn(mockDialecticClient, 'submitStageDocumentFeedback')
			.mockResolvedValue({
				data: { success: true },
				error: undefined,
				status: 200,
			});

		await useDialecticStore.getState().submitStageDocumentFeedback(
			feedbackPayload,
		);

		const expectedPayload = {
			...feedbackPayload,
			sourceContributionId: 'contrib-doc-123',
		};
		expect(spy).toHaveBeenCalledWith(expectedPayload);
		for (const field of backendContractFields) {
			expect(expectedPayload).toHaveProperty(field);
		}
	});

	it('should pass null for sourceContributionId when resource has no linkage', async () => {
		const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: 'test-session-id',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			modelId: 'model-a',
			documentKey: 'document_2',
			feedbackContent: 'This is test feedback.',
			userId: 'user-test-123',
			projectId: 'proj-test-456',
			feedbackType: 'user_feedback',
		};

		const compositeKey: StageDocumentCompositeKey = {
			sessionId: feedbackPayload.sessionId,
			stageSlug: feedbackPayload.stageSlug,
			iterationNumber: feedbackPayload.iterationNumber,
			modelId: feedbackPayload.modelId,
			documentKey: feedbackPayload.documentKey,
		};
		const serializedKey = getStageDocumentKey(compositeKey);
		const mockResource: EditedDocumentResource = {
			id: 'resource-456',
			resource_type: 'rendered_document',
			project_id: 'proj-1',
			session_id: feedbackPayload.sessionId,
			stage_slug: feedbackPayload.stageSlug,
			iteration_number: feedbackPayload.iterationNumber,
			document_key: feedbackPayload.documentKey,
			source_contribution_id: null,
			storage_bucket: 'bucket',
			storage_path: 'path',
			file_name: 'file.md',
			mime_type: 'text/markdown',
			size_bytes: 100,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};

		useDialecticStore.setState({
			stageDocumentResources: {
				[serializedKey]: mockResource,
			},
		});

		const spy = vi
			.spyOn(mockDialecticClient, 'submitStageDocumentFeedback')
			.mockResolvedValue({
				data: { success: true },
				error: undefined,
				status: 200,
			});

		await useDialecticStore.getState().submitStageDocumentFeedback(
			feedbackPayload,
		);

		const expectedPayload = {
			...feedbackPayload,
			sourceContributionId: null,
		};
		expect(spy).toHaveBeenCalledWith(expectedPayload);
		for (const field of backendContractFields) {
			expect(expectedPayload).toHaveProperty(field);
		}
	});
});

describe('handleJobFailedLogic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('marks planner documents as failed when a job_failed notification arrives', () => {
		const sessionId = 'session-job-failed';
		const stageSlug = 'planner-stage';
		const iterationNumber = 1;
		const jobId = 'job-planner';
		const modelId = 'model-planner';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const plannerRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-planner',
			steps: [
				{
					id: 'planner-step-id',
					step_key: 'planner_step',
					step_slug: 'planner-step',
					step_name: 'Planner Step',
					execution_order: 1,
					job_type: 'PLAN',
					prompt_type: 'Planner',
					output_type: 'header_context',
					granularity_strategy: 'all_to_one',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = plannerRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey('HeaderContext', modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: jobId,
						latestRenderedResourceId: 'resource-placeholder',
						modelId,
						versionHash: 'version-placeholder',
						lastRenderedResourceId: 'resource-placeholder',
						lastRenderAtIso: new Date().toISOString(),
					},
				},
				stepStatuses: {
					planner_step: 'in_progress',
				},
			};
		});

		const failureError: ApiError = {
			code: 'PLANNER_ERROR',
			message: 'Planner failed before producing output',
		};
		const latestRenderedResourceId = 'resource-planner-final';

		const jobFailedEvent: JobFailedPayload = {
			type: 'job_failed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: 'HeaderContext',
			modelId,
			error: failureError,
			step_key: 'planner_step',
			latestRenderedResourceId,
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(jobFailedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		expect(updatedProgress?.documents[stageRunDocKey('HeaderContext', modelId)]?.status).toBe('failed');
		expect(updatedProgress?.stepStatuses['planner_step']).toBe('failed');
		const descriptor = updatedProgress?.documents[stageRunDocKey('HeaderContext', modelId)];
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
			expect(descriptor.error).toEqual(failureError);
		}

		const contentEntry = useDialecticStore.getState().stageDocumentContent[getStageDocumentKey({
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			documentKey: 'HeaderContext',
		})];
		expect(contentEntry?.error).toEqual(failureError);
	});

	it('still processes job_failed notifications that omit latestRenderedResourceId', () => {
		const sessionId = 'session-missing-resource';
		const stageSlug = 'planner-stage';
		const iterationNumber = 1;
		const jobId = 'job-planner-missing-resource';
		const modelId = 'model-planner';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const plannerRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-planner',
			steps: [
				{
					id: 'planner-step-id',
					step_key: 'planner_step',
					step_slug: 'planner-step',
					step_name: 'Planner Step',
					execution_order: 1,
					job_type: 'PLAN',
					prompt_type: 'Planner',
					output_type: 'header_context',
					granularity_strategy: 'all_to_one',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		const existingResourceId = 'resource-placeholder';

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = plannerRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey('HeaderContext', modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: jobId,
						latestRenderedResourceId: existingResourceId,
						modelId,
						versionHash: 'version-placeholder',
						lastRenderedResourceId: existingResourceId,
						lastRenderAtIso: new Date().toISOString(),
					},
				},
				stepStatuses: {
					planner_step: 'in_progress',
				},
			};
		});

		const failureError: ApiError = {
			code: 'PLANNER_ERROR',
			message: 'Planner failed before producing output',
		};

		const jobFailedEvent: JobFailedPayload = {
			type: 'job_failed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: 'HeaderContext',
			modelId,
			error: failureError,
			step_key: 'planner_step',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(jobFailedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey('HeaderContext', modelId)];
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('failed');
			expect(descriptor.latestRenderedResourceId).toBe(existingResourceId);
			expect(descriptor.error).toEqual(failureError);
		}
		expect(updatedProgress?.stepStatuses['planner_step']).toBe('failed');

		const contentEntry = useDialecticStore.getState().stageDocumentContent[getStageDocumentKey({
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			documentKey: 'HeaderContext',
		})];
		expect(contentEntry?.error).toEqual(failureError);
	});
});

describe('handleDocumentStartedLogic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should handle document_started for header_context without latestRenderedResourceId', () => {
		const sessionId = 'session-header-context';
		const stageSlug = 'planner-stage';
		const iterationNumber = 1;
		const jobId = 'job-planner-header';
		const modelId = 'model-planner';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const plannerRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-planner',
			steps: [
				{
					id: 'planner-step-id',
					step_key: 'planner_step',
					step_slug: 'planner-step',
					step_name: 'Planner Step',
					execution_order: 1,
					job_type: 'PLAN',
					prompt_type: 'Planner',
					output_type: 'header_context',
					granularity_strategy: 'all_to_one',
					inputs_required: [],
					outputs_required: [
						{
							document_key: 'header_context',
							artifact_class: 'header_context',
							file_type: 'json',
						},
					],
				},
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 2,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = plannerRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {},
				stepStatuses: {},
			};
		});

		const documentStartedEvent: DocumentStartedPayload = {
			type: 'document_started',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: 'header_context',
			modelId,
			step_key: 'planner_step',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentStartedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey('header_context', modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('generating');
			expect(descriptor.job_id).toBe(jobId);
			expect(descriptor.modelId).toBe(modelId);
		}
		expect(updatedProgress?.stepStatuses['planner_step']).toBe('in_progress');
	});
});

describe('handleDocumentCompletedLogic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should update document status to completed when document_completed event received', () => {
		const sessionId = 'session-doc-completed';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const jobId = 'job-execute-1';
		const modelId = 'model-execute';
		const documentKey = 'business_case';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-thesis',
			steps: [
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: jobId,
						latestRenderedResourceId: 'resource-existing',
						modelId,
						versionHash: 'existing-hash',
						lastRenderedResourceId: 'resource-existing',
						lastRenderAtIso: new Date().toISOString(),
					},
				},
				stepStatuses: {
					execute_step: 'in_progress',
				},
			};
		});

		const documentCompletedEvent: DocumentCompletedPayload = {
			type: 'document_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'execute_step',
			latestRenderedResourceId: 'resource-completed',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentCompletedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('completed');
			expect(descriptor.job_id).toBe(jobId);
			expect(descriptor.modelId).toBe(modelId);
		}
		expect(updatedProgress?.stepStatuses['execute_step']).toBe('completed');
	});

	it('should handle document_completed for planner outputs without latestRenderedResourceId', () => {
		const sessionId = 'session-planner-completed';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const jobId = 'job-planner-1';
		const modelId = 'model-planner';
		const documentKey = 'HeaderContext';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const plannerRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-planner',
			steps: [
				{
					id: 'planner-step-id',
					step_key: 'planner_step',
					step_slug: 'planner-step',
					step_name: 'Planner Step',
					execution_order: 1,
					job_type: 'PLAN',
					prompt_type: 'Planner',
					output_type: 'header_context',
					granularity_strategy: 'all_to_one',
					inputs_required: [],
					outputs_required: [
						{
							document_key: 'HeaderContext',
							artifact_class: 'header_context',
							file_type: 'json',
						},
					],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = plannerRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'planned',
						status: 'not_started',
						stepKey: 'planner_step',
						modelId: null,
					},
				},
				stepStatuses: {
					planner_step: 'in_progress',
				},
			};
		});

		const documentCompletedEvent: DocumentCompletedPayload = {
			type: 'document_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'planner_step',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentCompletedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('completed');
			expect(descriptor.job_id).toBe(jobId);
			expect(descriptor.modelId).toBe(modelId);
			expect(descriptor.versionHash).toBe('');
			expect(descriptor.latestRenderedResourceId).toBe(jobId);
		}
		expect(updatedProgress?.stepStatuses['planner_step']).toBe('completed');
	});

	it('should update version info when latestRenderedResourceId is provided', () => {
		const sessionId = 'session-version-update';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const jobId = 'job-execute-2';
		const modelId = 'model-execute';
		const documentKey = 'business_case';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
		const latestRenderedResourceId = 'resource-completed-new';
		const serializedKey = getStageDocumentKey({
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			documentKey,
		});

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-thesis',
			steps: [
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		const getProjectResourceContentSpy = vi
			.spyOn(mockDialecticClient, 'getProjectResourceContent')
			.mockResolvedValue({
				data: {
					content: 'test content',
					fileName: 'test.md',
					mimeType: 'text/markdown',
					sourceContributionId: null,
				},
				status: 200,
			});

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: jobId,
						latestRenderedResourceId: 'resource-old',
						modelId,
						versionHash: 'old-hash',
						lastRenderedResourceId: 'resource-old',
						lastRenderAtIso: new Date().toISOString(),
					},
				},
				stepStatuses: {
					execute_step: 'in_progress',
				},
			};
		});

		const documentCompletedEvent: DocumentCompletedPayload = {
			type: 'document_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'execute_step',
			latestRenderedResourceId,
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentCompletedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('completed');
			expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
			expect(descriptor.versionHash).toBeDefined();
			expect(descriptor.versionHash).not.toBe('old-hash');
			expect(descriptor.lastRenderedResourceId).toBe(latestRenderedResourceId);
			expect(descriptor.lastRenderAtIso).toBeDefined();
		}

		const versionInfo = useDialecticStore.getState().stageDocumentVersions[serializedKey];
		expect(versionInfo).toBeDefined();
		expect(versionInfo?.resourceId).toBe(latestRenderedResourceId);
		expect(versionInfo?.versionHash).toBeDefined();

		const contentState = useDialecticStore.getState().stageDocumentContent[serializedKey];
		expect(contentState).toBeDefined();
		expect(contentState?.lastBaselineVersion).toBeDefined();
		expect(contentState?.lastBaselineVersion?.resourceId).toBe(latestRenderedResourceId);

		expect(getProjectResourceContentSpy).not.toHaveBeenCalled();
	});
});

describe('Step 51.b: document_started and document_completed tracking issues', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('51.b.i: document_started WITHOUT latestRenderedResourceId for rendering-required document should track document', () => {
		const sessionId = 'session-doc-started-no-resource';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const jobId = 'job-execute-no-resource';
		const modelId = 'model-execute';
		const documentKey = 'business_case';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-thesis',
			steps: [
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [
						{
							document_key: 'business_case',
							artifact_class: 'rendered_document',
							file_type: 'markdown',
						},
					],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {},
				stepStatuses: {},
			};
		});

		const documentStartedEvent: DocumentStartedPayload = {
			type: 'document_started',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'execute_step',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentStartedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('generating');
			expect(descriptor.job_id).toBe(jobId);
			expect(descriptor.modelId).toBe(modelId);
		}
		expect(updatedProgress?.stepStatuses['execute_step']).toBe('in_progress');
	});

	it('51.b.ii: document_started WITHOUT latestRenderedResourceId followed by render_completed WITH latestRenderedResourceId should update document', async () => {
		const sessionId = 'session-doc-started-render-completed';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const jobId = 'job-execute-render';
		const modelId = 'model-execute';
		const documentKey = 'business_case';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
		const latestRenderedResourceId = 'resource-rendered';
		const serializedKey = getStageDocumentKey({
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			documentKey,
		});

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-thesis',
			steps: [
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [
						{
							document_key: 'business_case',
							artifact_class: 'rendered_document',
							file_type: 'markdown',
						},
					],
				},
				{
					id: 'render-step-id',
					step_key: 'render_step',
					step_slug: 'render-step',
					step_name: 'Render Step',
					execution_order: 2,
					job_type: 'RENDER',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		const getProjectResourceContentSpy = vi
			.spyOn(mockDialecticClient, 'getProjectResourceContent')
			.mockResolvedValue({
				data: {
					content: 'test content',
					fileName: 'test.md',
					mimeType: 'text/markdown',
					sourceContributionId: null,
				},
				status: 200,
			});

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {},
				stepStatuses: {},
			};
		});

		const documentStartedEvent: DocumentStartedPayload = {
			type: 'document_started',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'execute_step',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentStartedEvent);

		const renderCompletedEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId,
			step_key: 'render_step',
		};

		await useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(renderCompletedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('completed');
			expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
			expect(descriptor.versionHash).toBeDefined();
			expect(descriptor.lastRenderedResourceId).toBe(latestRenderedResourceId);
		}

		const versionInfo = useDialecticStore.getState().stageDocumentVersions[serializedKey];
		expect(versionInfo).toBeDefined();
		expect(versionInfo?.resourceId).toBe(latestRenderedResourceId);

		expect(getProjectResourceContentSpy).toHaveBeenCalledWith({
			resourceId: latestRenderedResourceId,
		});
	});

	it('51.b.iii: document_started WITHOUT latestRenderedResourceId followed by document_completed should find and update document', () => {
		const sessionId = 'session-doc-started-completed';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const jobId = 'job-execute-completed';
		const modelId = 'model-execute';
		const documentKey = 'business_case';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-thesis',
			steps: [
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [
						{
							document_key: 'business_case',
							artifact_class: 'rendered_document',
							file_type: 'markdown',
						},
					],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {},
				stepStatuses: {},
			};
		});

		const documentStartedEvent: DocumentStartedPayload = {
			type: 'document_started',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'execute_step',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentStartedEvent);

		const documentCompletedEvent: DocumentCompletedPayload = {
			type: 'document_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'execute_step',
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentCompletedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('completed');
			expect(descriptor.job_id).toBe(jobId);
			expect(descriptor.modelId).toBe(modelId);
		}
		expect(updatedProgress?.stepStatuses['execute_step']).toBe('completed');
	});

	it('51.b.iv: document_started WITH latestRenderedResourceId should use provided value', () => {
		const sessionId = 'session-doc-started-with-resource';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const jobId = 'job-execute-with-resource';
		const modelId = 'model-execute';
		const documentKey = 'business_case';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
		const latestRenderedResourceId = 'resource-provided';
		const serializedKey = getStageDocumentKey({
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			documentKey,
		});

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-thesis',
			steps: [
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [
						{
							document_key: 'business_case',
							artifact_class: 'rendered_document',
							file_type: 'markdown',
						},
					],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {},
				stepStatuses: {},
			};
		});

		const documentStartedEvent: DocumentStartedPayload = {
			type: 'document_started',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: jobId,
			document_key: documentKey,
			modelId,
			step_key: 'execute_step',
			latestRenderedResourceId,
		};

		useDialecticStore
			.getState()
			._handleDialecticLifecycleEvent?.(documentStartedEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(updatedProgress).toBeDefined();
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('generating');
			expect(descriptor.job_id).toBe(jobId);
			expect(descriptor.modelId).toBe(modelId);
			expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
			expect(descriptor.versionHash).toBeDefined();
			expect(descriptor.lastRenderedResourceId).toBe(latestRenderedResourceId);
		}

		const versionInfo = useDialecticStore.getState().stageDocumentVersions[serializedKey];
		expect(versionInfo).toBeDefined();
		expect(versionInfo?.resourceId).toBe(latestRenderedResourceId);

		const contentState = useDialecticStore.getState().stageDocumentContent[serializedKey];
		expect(contentState).toBeDefined();
		expect(contentState?.lastBaselineVersion).toBeDefined();
		expect(contentState?.lastBaselineVersion?.resourceId).toBe(latestRenderedResourceId);
	});
});

describe('handleRenderCompletedLogic without stepKey', () => {
	const sessionId = 'session-render-no-step';
	const stageSlug = 'thesis';
	const iterationNumber = 1;
	const modelId = 'model-render';
	const documentKey = 'business_case';
	const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
	const compositeKey: StageDocumentCompositeKey = {
		sessionId,
		stageSlug,
		iterationNumber,
		modelId,
		documentKey,
	};
	const serializedKey = getStageDocumentKey(compositeKey);

	// Recipe WITHOUT a RENDER step - simulates RENDER being a post-processing job type
	const mockRecipeNoRenderStep: DialecticStageRecipe = {
		stageSlug,
		instanceId: 'instance-no-render',
		steps: [
			{
				id: 'execute-step-id',
				step_key: 'execute_step',
				step_slug: 'execute-step',
				step_name: 'Execute Step',
				execution_order: 1,
				job_type: 'EXECUTE',
				prompt_type: 'Turn',
				output_type: 'rendered_document',
				granularity_strategy: 'per_source_document',
				inputs_required: [],
				outputs_required: [],
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('1.c.i: should update latestRenderedResourceId when render_completed has no step_key', () => {
		const latestRenderedResourceId = 'resource-render-no-step';

		// Seed with existing document descriptor in 'generating' state
		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipeNoRenderStep;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-execute',
						latestRenderedResourceId: 'resource-old',
						modelId,
						versionHash: 'old-hash',
						lastRenderedResourceId: 'resource-old',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: 'execute_step',
					},
				},
				stepStatuses: {
					execute_step: 'in_progress',
				},
			};
		});

		// render_completed WITHOUT step_key (simulating RENDER as post-processing)
		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId,
			// step_key intentionally omitted
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(renderEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];

		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
		}
	});

	it('1.c.ii: should NOT change status to completed when render_completed without stepKey', () => {
		const latestRenderedResourceId = 'resource-render-status';

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipeNoRenderStep;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-execute',
						latestRenderedResourceId: 'resource-old',
						modelId,
						versionHash: 'old-hash',
						lastRenderedResourceId: 'resource-old',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: 'execute_step',
					},
				},
				stepStatuses: {
					execute_step: 'in_progress',
				},
			};
		});

		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId,
			// step_key intentionally omitted
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(renderEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];

		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			// Status should remain 'generating', NOT changed to 'completed'
			expect(descriptor.status).toBe('generating');
		}
	});

	it('1.c.iii: should NOT update stepStatuses when stepKey is undefined in render_completed', () => {
		const latestRenderedResourceId = 'resource-render-step-status';

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipeNoRenderStep;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-execute',
						latestRenderedResourceId: 'resource-old',
						modelId,
						versionHash: 'old-hash',
						lastRenderedResourceId: 'resource-old',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: 'execute_step',
					},
				},
				stepStatuses: {
					execute_step: 'in_progress',
				},
			};
		});

		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId,
			// step_key intentionally omitted
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(renderEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];

		// stepStatuses should NOT be modified - execute_step should remain in_progress
		expect(updatedProgress?.stepStatuses['execute_step']).toBe('in_progress');
		// No new step status should be created for undefined step
		expect(Object.keys(updatedProgress?.stepStatuses || {}).length).toBe(1);
	});

	it('1.c.iv: should update latestRenderedResourceId to latest value on multiple render_completed events', () => {
		const firstResourceId = 'resource-render-first';
		const secondResourceId = 'resource-render-second';
		const thirdResourceId = 'resource-render-third';

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipeNoRenderStep;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-execute',
						latestRenderedResourceId: 'resource-initial',
						modelId,
						versionHash: 'initial-hash',
						lastRenderedResourceId: 'resource-initial',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: 'execute_step',
					},
				},
				stepStatuses: {
					execute_step: 'in_progress',
				},
			};
		});

		// First render_completed
		useDialecticStore.getState()._handleDialecticLifecycleEvent?.({
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render-1',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId: firstResourceId,
		});

		let descriptor = useDialecticStore.getState().stageRunProgress[progressKey]?.documents[stageRunDocKey(documentKey, modelId)];
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.latestRenderedResourceId).toBe(firstResourceId);
		}

		// Second render_completed
		useDialecticStore.getState()._handleDialecticLifecycleEvent?.({
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render-2',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId: secondResourceId,
		});

		descriptor = useDialecticStore.getState().stageRunProgress[progressKey]?.documents[stageRunDocKey(documentKey, modelId)];
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.latestRenderedResourceId).toBe(secondResourceId);
		}

		// Third render_completed
		useDialecticStore.getState()._handleDialecticLifecycleEvent?.({
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render-3',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId: thirdResourceId,
		});

		descriptor = useDialecticStore.getState().stageRunProgress[progressKey]?.documents[stageRunDocKey(documentKey, modelId)];
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.latestRenderedResourceId).toBe(thirdResourceId);
		}
	});

	it('1.c.v: should preserve existing behavior when valid stepKey IS provided', () => {
		const latestRenderedResourceId = 'resource-with-step';

		// Recipe WITH a RENDER step
		const mockRecipeWithRenderStep: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-with-render',
			steps: [
				{
					id: 'execute-step-id',
					step_key: 'execute_step',
					step_slug: 'execute-step',
					step_name: 'Execute Step',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
				{
					id: 'render-step-id',
					step_key: 'render_step',
					step_slug: 'render-step',
					step_name: 'Render Step',
					execution_order: 2,
					job_type: 'RENDER',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipeWithRenderStep;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-execute',
						latestRenderedResourceId: 'resource-old',
						modelId,
						versionHash: 'old-hash',
						lastRenderedResourceId: 'resource-old',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: 'execute_step',
					},
				},
				stepStatuses: {
					execute_step: 'completed',
					render_step: 'in_progress',
				},
			};
		});

		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId,
			step_key: 'render_step', // Valid stepKey provided
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(renderEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];

		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
			// With valid stepKey, status SHOULD be set to 'completed'
			expect(descriptor.status).toBe('completed');
		}
		// stepStatuses SHOULD be updated when valid stepKey is provided
		expect(updatedProgress?.stepStatuses['render_step']).toBe('completed');
	});

	it('1.c.vi: should preserve existing stepKey on descriptor when render_completed arrives', () => {
		const latestRenderedResourceId = 'resource-preserve-step';
		const existingStepKey = 'execute_step';

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipeNoRenderStep;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(documentKey, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-execute',
						latestRenderedResourceId: 'resource-old',
						modelId,
						versionHash: 'old-hash',
						lastRenderedResourceId: 'resource-old',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: existingStepKey, // Existing stepKey should be preserved
					},
				},
				stepStatuses: {
					execute_step: 'in_progress',
				},
			};
		});

		const renderEvent: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render',
			document_key: documentKey,
			modelId,
			latestRenderedResourceId,
			// step_key intentionally omitted
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(renderEvent);

		const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
		const descriptor = updatedProgress?.documents[stageRunDocKey(documentKey, modelId)];

		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			// Existing stepKey should be preserved, not overwritten or cleared
			expect(descriptor.stepKey).toBe(existingStepKey);
		}
	});
});

describe('fetchStageDocumentContentLogic stores sourceContributionId', () => {
	const compositeKey: StageDocumentCompositeKey = {
		sessionId: 'session-source-contrib',
		stageSlug: 'thesis',
		iterationNumber: 1,
		modelId: 'model-1',
		documentKey: 'business_case',
	};
	const serializedKey = getStageDocumentKey(compositeKey);

	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('9.c.i: stores sourceContributionId when API response includes sourceContributionId', async () => {
		const resourceId = 'resource-with-contrib';
		const testContent = 'Test document content';
		const sourceContributionId = 'contrib-123';

		const getProjectResourceContentSpy = vi.spyOn(
			mockDialecticClient,
			'getProjectResourceContent',
		);

		getProjectResourceContentSpy.mockResolvedValue({
			data: {
				content: testContent,
				fileName: 'test.md',
				mimeType: 'text/markdown',
				sourceContributionId: sourceContributionId,
			},
			status: 200,
		});

		await useDialecticStore
			.getState()
			.fetchStageDocumentContent(compositeKey, resourceId);

		const state = useDialecticStore.getState();
		const content = state.stageDocumentContent[serializedKey];
		expect(content).toBeDefined();
		expect(content?.sourceContributionId).toBe(sourceContributionId);
	});

	it('9.c.ii: stores sourceContributionId as null when API response has null sourceContributionId', async () => {
		const resourceId = 'resource-null-contrib';
		const testContent = 'Test document content';

		const getProjectResourceContentSpy = vi.spyOn(
			mockDialecticClient,
			'getProjectResourceContent',
		);

		getProjectResourceContentSpy.mockResolvedValue({
			data: {
				content: testContent,
				fileName: 'test.md',
				mimeType: 'text/markdown',
				sourceContributionId: null,
			},
			status: 200,
		});

		await useDialecticStore
			.getState()
			.fetchStageDocumentContent(compositeKey, resourceId);

		const state = useDialecticStore.getState();
		const content = state.stageDocumentContent[serializedKey];
		expect(content).toBeDefined();
		expect(content?.sourceContributionId).toBe(null);
	});
});

describe('Feedback draft logic (15.c)', () => {
	const key: StageDocumentCompositeKey = {
		sessionId: 's1',
		stageSlug: 'thesis',
		iterationNumber: 1,
		modelId: 'm1',
		documentKey: 'doc_a',
	};

	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('15.c.i: recordStageDocumentFeedbackDraftLogic updates only feedbackDraftMarkdown and feedbackIsDirty and does not change currentDraftMarkdown or isDirty', () => {
		const serializedKey = getStageDocumentKey(key);
		const initialContent: StageDocumentContentState = {
			baselineMarkdown: 'Baseline',
			currentDraftMarkdown: 'Baseline\nContent edit',
			isDirty: true,
			isLoading: false,
			error: null,
			lastBaselineVersion: null,
			pendingDiff: 'Content edit',
			lastAppliedVersionHash: null,
			sourceContributionId: null,
			feedbackDraftMarkdown: '',
			feedbackIsDirty: false,
		};

		useDialecticStore.setState((state) => {
			state.stageDocumentContent[serializedKey] = initialContent;
			recordStageDocumentFeedbackDraftLogic(state, key, 'User feedback text');
		});

		const state = useDialecticStore.getState();
		const entry = state.stageDocumentContent[serializedKey];
		expect(entry).toBeDefined();
		expect(entry?.feedbackDraftMarkdown).toBe('User feedback text');
		expect(entry?.feedbackIsDirty).toBe(true);
		expect(entry?.currentDraftMarkdown).toBe('Baseline\nContent edit');
		expect(entry?.isDirty).toBe(true);
	});

	it('15.c.ii: flushStageDocumentFeedbackDraftLogic clears feedback draft and does not change content draft', () => {
		const serializedKey = getStageDocumentKey(key);
		useDialecticStore.setState((state) => {
			state.stageDocumentContent[serializedKey] = {
				baselineMarkdown: 'Baseline',
				currentDraftMarkdown: 'Baseline\nContent edit',
				isDirty: true,
				isLoading: false,
				error: null,
				lastBaselineVersion: null,
				pendingDiff: 'Content edit',
				lastAppliedVersionHash: null,
				sourceContributionId: null,
				feedbackDraftMarkdown: 'Draft feedback',
				feedbackIsDirty: true,
			};
		});

		useDialecticStore.setState((state) => {
			flushStageDocumentFeedbackDraftLogic(state, key);
		});

		const state = useDialecticStore.getState();
		const entry = state.stageDocumentContent[serializedKey];
		expect(entry).toBeDefined();
		expect(entry?.feedbackDraftMarkdown).toBe('');
		expect(entry?.feedbackIsDirty).toBe(false);
		expect(entry?.currentDraftMarkdown).toBe('Baseline\nContent edit');
		expect(entry?.isDirty).toBe(true);
	});

	it('15.c.iii: new entries from ensureStageDocumentContentLogic include feedbackDraftMarkdown and feedbackIsDirty', () => {
		const serializedKey = getStageDocumentKey(key);
		expect(useDialecticStore.getState().stageDocumentContent[serializedKey]).toBeUndefined();

		useDialecticStore.setState((state) => {
			ensureStageDocumentContentLogic(state, key, { baselineMarkdown: '' });
		});

		const state = useDialecticStore.getState();
		const entry = state.stageDocumentContent[serializedKey];
		expect(entry).toBeDefined();
		expect(entry?.feedbackDraftMarkdown).toBe('');
		expect(entry?.feedbackIsDirty).toBe(false);
	});
});

describe('progress.documents composite key (documentKey:modelId)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('handleDocumentStartedLogic keys progress.documents by (document_key, modelId)', () => {
		const sessionId = 'session-composite';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'business_case';
		const modelId = 'model-a';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-composite',
			steps: [
				{
					id: 'step-1',
					step_key: 'execute_step',
					step_slug: 'execute',
					step_name: 'Execute',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [{ document_key, artifact_class: 'rendered_document', file_type: 'markdown' }],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = { documents: {}, stepStatuses: {} };
		});

		const event: DocumentStartedPayload = {
			type: 'document_started',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-1',
			document_key,
			modelId,
			step_key: 'execute_step',
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(progress?.documents[stageRunDocKey(document_key, modelId)]).toBeDefined();
		expect(progress?.documents[document_key]).toBeUndefined();
	});

	it('handleDocumentCompletedLogic keys progress.documents by (document_key, modelId)', () => {
		const sessionId = 'session-composite';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'business_case';
		const modelId = 'model-b';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-composite',
			steps: [
				{
					id: 'step-1',
					step_key: 'execute_step',
					step_slug: 'execute',
					step_name: 'Execute',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(document_key, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-1',
						latestRenderedResourceId: 'res-1',
						modelId,
						versionHash: 'h1',
						lastRenderedResourceId: 'res-1',
						lastRenderAtIso: new Date().toISOString(),
					},
				},
				stepStatuses: { execute_step: 'in_progress' },
			};
		});

		const event: DocumentCompletedPayload = {
			type: 'document_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-1',
			document_key,
			modelId,
			step_key: 'execute_step',
			latestRenderedResourceId: 'res-completed',
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(progress?.documents[stageRunDocKey(document_key, modelId)]).toBeDefined();
		expect(progress?.documents[document_key]).toBeUndefined();
	});

	it('handleRenderCompletedLogic keys progress.documents by (document_key, modelId)', () => {
		const sessionId = 'session-composite';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'business_case';
		const modelId = 'model-c';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-composite',
			steps: [
				{
					id: 'step-1',
					step_key: 'execute_step',
					step_slug: 'execute',
					step_name: 'Execute',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(document_key, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-1',
						latestRenderedResourceId: '',
						modelId,
						versionHash: '',
						lastRenderedResourceId: '',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: 'execute_step',
					},
				},
				stepStatuses: { execute_step: 'in_progress' },
			};
		});

		const event: RenderCompletedPayload = {
			type: 'render_completed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-render',
			document_key,
			modelId,
			latestRenderedResourceId: 'resource-rendered',
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(progress?.documents[stageRunDocKey(document_key, modelId)]).toBeDefined();
		expect(progress?.documents[document_key]).toBeUndefined();
	});

	it('handleJobFailedLogic keys progress.documents by (document_key, modelId)', () => {
		const sessionId = 'session-composite';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'scope';
		const modelId = 'model-d';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const mockRecipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-composite',
			steps: [
				{
					id: 'step-1',
					step_key: 'execute_step',
					step_slug: 'execute',
					step_name: 'Execute',
					execution_order: 1,
					job_type: 'EXECUTE',
					prompt_type: 'Turn',
					output_type: 'rendered_document',
					granularity_strategy: 'per_source_document',
					inputs_required: [],
					outputs_required: [],
				},
			],
		};

		useDialecticStore.setState((state) => {
			state.recipesByStageSlug[stageSlug] = mockRecipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[stageRunDocKey(document_key, modelId)]: {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: 'job-1',
						latestRenderedResourceId: 'res-1',
						modelId,
						versionHash: 'h1',
						lastRenderedResourceId: 'res-1',
						lastRenderAtIso: new Date().toISOString(),
						stepKey: 'execute_step',
					},
				},
				stepStatuses: { execute_step: 'in_progress' },
			};
		});

		const event: JobFailedPayload = {
			type: 'job_failed',
			sessionId,
			stageSlug,
			iterationNumber,
			job_id: 'job-1',
			document_key,
			modelId,
			step_key: 'execute_step',
			error: { code: 'EXECUTE_FAILED', message: 'Failed' },
			latestRenderedResourceId: 'res-1',
		};

		useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(progress?.documents[stageRunDocKey(document_key, modelId)]).toBeDefined();
		expect(progress?.documents[document_key]).toBeUndefined();
	});
});