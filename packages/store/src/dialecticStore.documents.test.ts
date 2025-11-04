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
	DialecticStageRecipe,
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

vi.mock('@paynless/api', async () => {
	const { api, resetApiMock, getMockDialecticClient } = await import(
		'@paynless/api/mocks'
	);
	return {
		api,
		resetApiMock,
		getMockDialecticClient,
	};
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
			.spyOn(getMockDialecticClient(), 'getProjectResourceContent')
			.mockResolvedValue({
				data: {
					content: 'Test content',
					fileName: 'test.md',
					mimeType: 'text/markdown',
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
					output_type: 'RenderedDocument',
					granularity_strategy: 'one_to_one',
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

	it('reapplies user edits after refreshed baseline content is fetched', async () => {
		const oldBaseline = 'Old baseline';
		const userEdits = 'User edits';
		const newBaseline = 'New baseline';
		const newResourceId = 'resource/new';

		const getProjectResourceContentSpy = vi.spyOn(
			getMockDialecticClient(),
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
					output_type: 'RenderedDocument',
					granularity_strategy: 'one_to_one',
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
			getMockDialecticClient(),
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
		getMockDialecticClient().getStageDocumentFeedback.mockResolvedValue({
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
		getMockDialecticClient().getStageDocumentFeedback.mockResolvedValue({
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
		getMockDialecticClient().submitStageDocumentFeedback.mockResolvedValue({
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

