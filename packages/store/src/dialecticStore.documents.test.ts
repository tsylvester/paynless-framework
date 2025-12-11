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
} from '@paynless/types';
import {
	handleRenderCompletedLogic,
	getStageDocumentKey,
} from './dialecticStore.documents';
import {
	api,
	resetApiMock,
	getMockDialecticClient,
} from '@paynless/api/mocks';
import { logger } from '@paynless/utils';

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

		await useDialecticStore.getState().hydrateStageProgress({
			sessionId,
			stageSlug,
			iterationNumber,
		});

		expect(listStageDocumentsSpy).toHaveBeenCalledWith({
			sessionId,
			stageSlug,
			iterationNumber,
		});

		const state = useDialecticStore.getState();
		const progress = state.stageRunProgress[progressKey];
		expect(progress).toBeDefined();
		expect(Object.keys(progress.documents).length).toBe(2);
		expect(progress.documents['doc_a']).toEqual(
			expect.objectContaining({
				status: 'completed',
				modelId: 'model-a',
			}),
		);
		expect(progress.documents['doc_b']).toEqual(
			expect.objectContaining({
				status: 'generating',
				modelId: 'model-b',
			}),
		);
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
		const documentKey = compositeKey.documentKey;
		expect(
			state.stageRunProgress[progressKey].documents[documentKey].status,
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
						[compositeKey.documentKey]: {
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
				compositeKey.documentKey
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
			feedback: feedbackContent,
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
				},
			},
			focusedStageDocument: {
				[firstFocusKey]: { modelId: 'model-1', documentKey: 'doc_a' },
				[secondFocusKey]: { modelId: 'model-2', documentKey: 'doc_b' },
			},
			stageRunProgress: {
				's1:thesis:1': {
					documents: {
						doc_a: {
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
	it('should call the API with the correct payload and optimistically update the store', async () => {
		const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: 'test-session-id',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			modelId: 'model-a',
			documentKey: 'document_1',
			feedback: 'This is a test feedback.',
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
	});

	it('should log an error if the API call fails', async () => {
		const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: 'test-session-id',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			modelId: 'model-a',
			documentKey: 'document_1',
			feedback: 'This is a test feedback.',
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
			feedback: 'This is test feedback.',
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

		expect(spy).toHaveBeenCalledWith({
			...feedbackPayload,
			sourceContributionId: 'contrib-doc-123',
		});
	});

	it('should pass null for sourceContributionId when resource has no linkage', async () => {
		const feedbackPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: 'test-session-id',
			stageSlug: 'synthesis',
			iterationNumber: 1,
			modelId: 'model-a',
			documentKey: 'document_2',
			feedback: 'This is test feedback.',
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

		expect(spy).toHaveBeenCalledWith({
			...feedbackPayload,
			sourceContributionId: null,
		});
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
					HeaderContext: {
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
		expect(updatedProgress?.documents['HeaderContext']?.status).toBe('failed');
		expect(updatedProgress?.stepStatuses['planner_step']).toBe('failed');
		const descriptor = updatedProgress?.documents['HeaderContext'];
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
					HeaderContext: {
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
		const descriptor = updatedProgress?.documents['HeaderContext'];
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
		const descriptor = updatedProgress?.documents['header_context'];
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
					[documentKey]: {
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
		const descriptor = updatedProgress?.documents[documentKey];
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
					[documentKey]: {
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
		const descriptor = updatedProgress?.documents[documentKey];
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
					[documentKey]: {
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
		const descriptor = updatedProgress?.documents[documentKey];
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
		const descriptor = updatedProgress?.documents[documentKey];
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
		const descriptor = updatedProgress?.documents[documentKey];
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
		const descriptor = updatedProgress?.documents[documentKey];
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
		const descriptor = updatedProgress?.documents[documentKey];
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