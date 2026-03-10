import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
	getMockDialecticClient,
	resetApiMock,
	createMockEditedDocumentResource,
} from '@paynless/api/mocks';
import type {
	DialecticStage,
	DialecticStageTransition,
	DialecticProcessTemplate,
	DialecticSession,
	DialecticProject,
	DialecticContribution,
	StageRenderedDocumentDescriptor,
	StageDocumentCompositeKey,
	EditedDocumentResource,
	SaveContributionEditSuccessResponse,
	SubmitStageResponsesResponse,
	GetProjectResourceContentResponse,
	StageDocumentFeedback,
	RecipeJobType,
	RecipePromptType,
	RecipeOutputType,
	RecipeGranularity,
	OutputRequirement,
	StageDocumentContentState,
} from '@paynless/types';
import { GeneratedContributionCard } from './GeneratedContributionCard';
import { SubmitResponsesButton } from './SubmitResponsesButton';
import { toast } from 'sonner';
import { mockedUseAuthStoreHookLogic } from '@/mocks/authStore.mock';

// ---------------------------------------------------------------------------
// Mock boundary: API
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock boundary: Auth store (peer store, not under test)
// ---------------------------------------------------------------------------
const userId = 'user-1';
vi.mock('@paynless/store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@paynless/store')>();
	// Dynamic import to avoid hoisting issues with vi.mock
	const { captureRealAuthStore, mockedUseAuthStoreHookLogic } = await import('@/mocks/authStore.mock');
	// Capture real auth store so mock state syncs to it (Fix B)
	captureRealAuthStore(actual.useAuthStore);
	return {
		...actual,
		useAuthStore: mockedUseAuthStoreHookLogic,
	};
});

// ---------------------------------------------------------------------------
// Mock boundary: Toast (notification verification)
// ---------------------------------------------------------------------------
vi.mock('sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

// ---------------------------------------------------------------------------
// Mock: TextInputArea (lightweight textarea for typing)
// ---------------------------------------------------------------------------
vi.mock('@/components/common/TextInputArea', () => ({
	TextInputArea: vi.fn(
		({ value, onChange, placeholder, disabled, label, id, dataTestId }: {
			value: string;
			onChange: (v: string) => void;
			placeholder: string;
			disabled: boolean;
			label: string;
			id: string;
			dataTestId: string;
		}) => (
			<div>
				{label && <label htmlFor={id}>{label}</label>}
				<textarea
					data-testid={
						dataTestId ||
						(placeholder?.startsWith('Enter feedback')
							? 'feedback-textarea'
							: 'content-textarea')
					}
					id={id}
					value={value || ''}
					onChange={(e) => onChange?.(e.target.value)}
					placeholder={placeholder}
					disabled={disabled}
				/>
			</div>
		),
	),
}));

// ---------------------------------------------------------------------------
// Mock: Resizable panels (removes react-resizable-panels event interception)
// ---------------------------------------------------------------------------
vi.mock('@/components/ui/resizable', () => ({
	ResizablePanelGroup: ({
		children,
	}: {
		children: React.ReactNode;
	}) => <div data-testid="resizable-panel-group">{children}</div>,
	ResizablePanel: ({
		children,
	}: {
		children: React.ReactNode;
	}) => <div data-testid="resizable-panel">{children}</div>,
	ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

// ---------------------------------------------------------------------------
// Mock: isDocumentHighlighted (reads from store state)
// ---------------------------------------------------------------------------
vi.mock('@paynless/utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@paynless/utils')>();
	return {
		...actual,
		isDocumentHighlighted: (
			_sessionId: string,
			_stageSlug: string,
			_modelId: string,
			_documentKey: string,
			focusedStageDocumentMap: Record<
				string,
				{ modelId: string; documentKey: string } | null
			> | null | undefined,
		): boolean => {
			if (!focusedStageDocumentMap) return false;
			const focusKey = `${_sessionId}:${_stageSlug}:${_modelId}`;
			const focused = focusedStageDocumentMap[focusKey];
			return focused?.documentKey === _documentKey;
		},
	};
});

// ---------------------------------------------------------------------------
// Import REAL store (after mocks are registered)
// ---------------------------------------------------------------------------
import {
	useDialecticStore,
	initialDialecticStateValues,
} from '@paynless/store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const projectId = 'proj-1';
const sessionId = 'sess-1';
const stageSlug = 'thesis';
const nextStageSlug = 'antithesis';
const iterationNumber = 1;
const modelIdA = 'model-a';
const modelIdB = 'model-b';
const docKey1 = 'success_metrics';
const docKey2 = 'risk_analysis';
const isoTimestamp = '2024-01-01T00:00:00.000Z';

const compositeKeyA1: StageDocumentCompositeKey = {
	sessionId,
	stageSlug,
	iterationNumber,
	modelId: modelIdA,
	documentKey: docKey1,
};
const compositeKeyA2: StageDocumentCompositeKey = {
	sessionId,
	stageSlug,
	iterationNumber,
	modelId: modelIdA,
	documentKey: docKey2,
};
const compositeKeyB1: StageDocumentCompositeKey = {
	sessionId,
	stageSlug,
	iterationNumber,
	modelId: modelIdB,
	documentKey: docKey1,
};

const serializedKeyA1 = `${sessionId}:${stageSlug}:${iterationNumber}:${modelIdA}:${docKey1}`;
const serializedKeyA2 = `${sessionId}:${stageSlug}:${iterationNumber}:${modelIdA}:${docKey2}`;
const serializedKeyB1 = `${sessionId}:${stageSlug}:${iterationNumber}:${modelIdB}:${docKey1}`;

const localStorageKeyA1 = `paynless:feedbackDraft:${userId}:${sessionId}:${stageSlug}:${iterationNumber}:${modelIdA}:${docKey1}`;
const localStorageKeyA2 = `paynless:feedbackDraft:${userId}:${sessionId}:${stageSlug}:${iterationNumber}:${modelIdA}:${docKey2}`;
const localStorageKeyB1 = `paynless:feedbackDraft:${userId}:${sessionId}:${stageSlug}:${iterationNumber}:${modelIdB}:${docKey1}`;

const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
const buildStage = (
	id: string,
	slug: string,
	displayName: string,
): DialecticStage => ({
	id,
	slug,
	display_name: displayName,
	description: '',
	default_system_prompt_id: null,
	expected_output_template_ids: [],
	recipe_template_id: null,
	active_recipe_instance_id: null,
	created_at: isoTimestamp,
});

const buildTransitions = (
	stages: DialecticStage[],
): DialecticStageTransition[] =>
	stages.length >= 2
		? [
			{
				id: 'trans-1',
				process_template_id: 'template-1',
				source_stage_id: stages[0].id,
				target_stage_id: stages[1].id,
				created_at: isoTimestamp,
				condition_description: null,
			},
		]
		: [];

const buildProcessTemplate = (
	stages: DialecticStage[],
): DialecticProcessTemplate => ({
	id: 'template-1',
	name: 'Template',
	description: '',
	starting_stage_id: stages[0].id,
	created_at: isoTimestamp,
	stages,
	transitions: buildTransitions(stages),
});

const buildContribution = (
	id: string,
	modelId: string,
	modelName: string,
): DialecticContribution => ({
	id,
	session_id: sessionId,
	user_id: null,
	stage: stageSlug,
	iteration_number: iterationNumber,
	model_id: modelId,
	model_name: modelName,
	prompt_template_id_used: null,
	seed_prompt_url: null,
	edit_version: 0,
	is_latest_edit: true,
	original_model_contribution_id: null,
	raw_response_storage_path: null,
	target_contribution_id: null,
	tokens_used_input: null,
	tokens_used_output: null,
	processing_time_ms: null,
	error: null,
	citations: null,
	created_at: isoTimestamp,
	updated_at: isoTimestamp,
	contribution_type: null,
	file_name: null,
	storage_bucket: null,
	storage_path: null,
	size_bytes: null,
	mime_type: null,
});

const buildSession = (
	contributions: DialecticContribution[],
): DialecticSession => ({
	id: sessionId,
	project_id: projectId,
	session_description: 'Session',
	user_input_reference_url: null,
	iteration_count: iterationNumber,
	selected_models: [],
	status: 'active',
	associated_chat_id: null,
	current_stage_id: 'stage-1',
	created_at: isoTimestamp,
	updated_at: isoTimestamp,
	dialectic_session_models: [],
	dialectic_contributions: contributions,
	feedback: [],
});

const buildProject = (
	session: DialecticSession,
	processTemplate: DialecticProcessTemplate,
): DialecticProject => ({
	id: projectId,
	user_id: userId,
	project_name: 'Project',
	initial_user_prompt: null,
	initial_prompt_resource_id: null,
	selected_domain_id: 'domain-1',
	dialectic_domains: { name: 'Software Development' },
	selected_domain_overlay_id: null,
	repo_url: null,
	status: 'active',
	created_at: isoTimestamp,
	updated_at: isoTimestamp,
	dialectic_sessions: [session],
	resources: [],
	process_template_id: processTemplate.id,
	dialectic_process_templates: processTemplate,
	isLoadingProcessTemplate: false,
	processTemplateError: null,
	contributionGenerationStatus: 'idle',
	generateContributionsError: null,
	isSubmittingStageResponses: false,
	submitStageResponsesError: null,
	isSavingContributionEdit: false,
	saveContributionEditError: null,
});

const buildRenderedDescriptor = (
	modelId: string,
	resourceId: string,
): StageRenderedDocumentDescriptor => ({
	descriptorType: 'rendered',
	modelId,
	status: 'completed',
	job_id: `job-${modelId}`,
	latestRenderedResourceId: resourceId,
	versionHash: `hash-${modelId}`,
	lastRenderedResourceId: resourceId,
	lastRenderAtIso: isoTimestamp,
});

const buildResourceContentResponse = (
	content: string,
	sourceContributionId: string,
): GetProjectResourceContentResponse => ({
	fileName: 'document.md',
	mimeType: 'text/markdown',
	content,
	sourceContributionId,
	resourceType: 'rendered_document',
});

const buildEditSuccessResponse = (
	contributionId: string,
	documentKey: string,
): SaveContributionEditSuccessResponse => {
	const resource: EditedDocumentResource = createMockEditedDocumentResource({
		session_id: sessionId,
		stage_slug: stageSlug,
		iteration_number: iterationNumber,
		document_key: documentKey,
		source_contribution_id: contributionId,
		project_id: projectId,
	});
	return {
		resource,
		sourceContributionId: contributionId,
	};
};

// ---------------------------------------------------------------------------
// Shared setup state
// ---------------------------------------------------------------------------
const stage1 = buildStage('stage-1', stageSlug, 'Thesis');
const stage2 = buildStage('stage-2', nextStageSlug, 'Antithesis');
const processTemplate = buildProcessTemplate([stage1, stage2]);

const contribA1 = buildContribution('contrib-a1', modelIdA, 'Model A');
const contribA2 = buildContribution('contrib-a2', modelIdA, 'Model A');
const contribB1 = buildContribution('contrib-b1', modelIdB, 'Model B');
const session = buildSession([contribA1, contribA2, contribB1]);
const project = buildProject(session, processTemplate);

const jobType: RecipeJobType = 'EXECUTE';
const promptType: RecipePromptType = 'Turn';
const outputType: RecipeOutputType = 'assembled_document_json';
const granularity: RecipeGranularity = 'per_source_document';

const outputReqA1: OutputRequirement = {
	document_key: docKey1,
	artifact_class: 'rendered_document',
	file_type: 'markdown',
};
const outputReqA2: OutputRequirement = {
	document_key: docKey2,
	artifact_class: 'rendered_document',
	file_type: 'markdown',
};

const recipesByStageSlug = {
	[stageSlug]: {
		stageSlug,
		instanceId: 'instance-1',
		steps: [
			{
				id: 'step-1',
				step_key: 'draft_document',
				step_slug: 'draft-document',
				step_name: 'Draft Document',
				execution_order: 1,
				parallel_group: 1,
				branch_key: 'document',
				job_type: jobType,
				prompt_type: promptType,
				inputs_required: [],
				outputs_required: [outputReqA1, outputReqA2],
				output_type: outputType,
				granularity_strategy: granularity,
			},
		],
	},
};

function resetStoreAndSeedState(): void {
	useDialecticStore.setState({
		...initialDialecticStateValues,
		activeContextProjectId: projectId,
		activeContextSessionId: sessionId,
		activeStageSlug: stageSlug,
		activeContextStage: stage1,
		activeSessionDetail: session,
		currentProjectDetail: project,
		currentProcessTemplate: processTemplate,
		recipesByStageSlug,
		stageRunProgress: {
			[progressKey]: {
				stepStatuses: {},
				documents: {
					[`${docKey1}:${modelIdA}`]: buildRenderedDescriptor(modelIdA, 'res-a1'),
					[`${docKey2}:${modelIdA}`]: buildRenderedDescriptor(modelIdA, 'res-a2'),
					[`${docKey1}:${modelIdB}`]: buildRenderedDescriptor(modelIdB, 'res-b1'),
				},
				jobProgress: {},
			},
		},
	});
}

function focusDocument(modelId: string, documentKey: string): void {
	const focusKey = `${sessionId}:${stageSlug}:${modelId}`;
	useDialecticStore.setState((state) => ({
		...state,
		focusedStageDocument: {
			...state.focusedStageDocument,
			[focusKey]: { modelId, documentKey },
		},
	}));
}

function seedDocumentContent(
	key: StageDocumentCompositeKey,
	serializedKey: string,
	contributionId: string,
): void {
	const contentState: StageDocumentContentState = {
		baselineMarkdown: `Original content for ${key.documentKey}`,
		currentDraftMarkdown: `Original content for ${key.documentKey}`,
		isDirty: false,
		isLoading: false,
		error: null,
		lastBaselineVersion: {
			resourceId: `res-${key.modelId.slice(-2)}`,
			versionHash: `hash-${key.modelId}`,
			updatedAt: isoTimestamp,
		},
		pendingDiff: null,
		lastAppliedVersionHash: `hash-${key.modelId}`,
		sourceContributionId: contributionId,
		feedbackDraftMarkdown: undefined,
		feedbackIsDirty: false,
		resourceType: 'rendered_document',
	};
	useDialecticStore.setState((state) => ({
		...state,
		stageDocumentContent: {
			...state.stageDocumentContent,
			[serializedKey]: contentState,
		},
	}));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Feedback Workflow Integration — Full User Story', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		window.localStorage.clear();
		resetStoreAndSeedState();

		// Set authenticated user in mock auth store (syncs to real store via Fix B)
		mockedUseAuthStoreHookLogic.setState({ user: { id: userId } });

		// Default API responses for document content loading
		mockDialecticClient.getProjectResourceContent.mockResolvedValue({
			data: buildResourceContentResponse(
				'Original content for success_metrics',
				'contrib-a1',
			),
			error: undefined,
			status: 200,
		});

		// Default: no saved feedback in DB
		mockDialecticClient.getStageDocumentFeedback.mockResolvedValue({
			data: [],
			error: undefined,
			status: 200,
		});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		// Clear auth mock state to prevent cross-test pollution
		mockedUseAuthStoreHookLogic.setState({ user: null });
	});

	describe('Phase 1: User edits document and provides feedback — local persistence', () => {
		it('preserves edits and feedback locally without explicit save', async () => {
			const user = userEvent.setup();

			// Seed content for model-a:success_metrics
			seedDocumentContent(compositeKeyA1, serializedKeyA1, 'contrib-a1');
			focusDocument(modelIdA, docKey1);

			render(<GeneratedContributionCard modelId={modelIdA} />);

			// Wait for document content to render
			await waitFor(() => {
				const textarea = screen.getByTestId(
					`stage-document-content-${modelIdA}-${docKey1}`,
				);
				expect(textarea).toHaveValue(`Original content for ${docKey1}`);
			});

			// ACT: Edit document content
			const contentTextarea = screen.getByTestId(
				`stage-document-content-${modelIdA}-${docKey1}`,
			);
			await user.clear(contentTextarea);
			await user.type(contentTextarea, 'Edited thesis content');

			// ACT: Provide feedback
			const feedbackTextarea = screen.getByTestId(
				`stage-document-feedback-${modelIdA}-${docKey1}`,
			);
			await user.type(feedbackTextarea, 'Needs more data');

			// ASSERT: Store state reflects edits
			await waitFor(() => {
				const state = useDialecticStore.getState();
				const entry = state.stageDocumentContent[serializedKeyA1];
				expect(entry).toBeDefined();
				expect(entry.isDirty).toBe(true);
				expect(entry.currentDraftMarkdown).toBe('Edited thesis content');
				expect(entry.feedbackIsDirty).toBe(true);
				expect(entry.feedbackDraftMarkdown).toBe('Needs more data');
			});

			// ASSERT: Feedback draft persisted to localStorage
			const stored = window.localStorage.getItem(localStorageKeyA1);
			expect(stored).toBe('Needs more data');
		});
	});

	describe('Phase 2: User navigates away and returns — localStorage restoration', () => {
		it('restores feedback from localStorage and edits from Zustand state on return', async () => {
			const user = userEvent.setup();

			// Seed, focus, render, edit, provide feedback (same as Phase 1)
			seedDocumentContent(compositeKeyA1, serializedKeyA1, 'contrib-a1');
			focusDocument(modelIdA, docKey1);

			const { unmount } = render(
				<GeneratedContributionCard modelId={modelIdA} />,
			);

			await waitFor(() => {
				expect(
					screen.getByTestId(
						`stage-document-content-${modelIdA}-${docKey1}`,
					),
				).toHaveValue(`Original content for ${docKey1}`);
			});

			const contentTextarea = screen.getByTestId(
				`stage-document-content-${modelIdA}-${docKey1}`,
			);
			await user.clear(contentTextarea);
			await user.type(contentTextarea, 'Edited thesis content');

			const feedbackTextarea = screen.getByTestId(
				`stage-document-feedback-${modelIdA}-${docKey1}`,
			);
			await user.type(feedbackTextarea, 'Needs more data');

			// Confirm localStorage was written
			await waitFor(() => {
				expect(window.localStorage.getItem(localStorageKeyA1)).toBe(
					'Needs more data',
				);
			});

			// ACT: Navigate away (unmount)
			unmount();

			// Clear the feedbackDraftMarkdown to undefined so initializeFeedbackDraft
			// triggers on re-mount (simulating a fresh document focus lifecycle)
			const currentState = useDialecticStore.getState();
			const currentEntry =
				currentState.stageDocumentContent[serializedKeyA1];
			const updatedEntry: StageDocumentContentState = {
				...currentEntry,
				feedbackDraftMarkdown: undefined,
				feedbackIsDirty: false,
			};
			useDialecticStore.setState({
				stageDocumentContent: {
					...currentState.stageDocumentContent,
					[serializedKeyA1]: updatedEntry,
				},
			});

			// ACT: Return (re-render)
			render(<GeneratedContributionCard modelId={modelIdA} />);

			// ASSERT: API was called to check for saved feedback
			await waitFor(() => {
				expect(
					mockDialecticClient.getStageDocumentFeedback,
				).toHaveBeenCalled();
			});

			// ASSERT: Feedback textarea shows localStorage draft (takes precedence over empty DB)
			await waitFor(() => {
				const fb = screen.getByTestId(
					`stage-document-feedback-${modelIdA}-${docKey1}`,
				);
				expect(fb).toHaveValue('Needs more data');
			});

			// ASSERT: Document content textarea shows edited content (Zustand state survived unmount)
			const contentArea = screen.getByTestId(
				`stage-document-content-${modelIdA}-${docKey1}`,
			);
			expect(contentArea).toHaveValue('Edited thesis content');

			// ASSERT: feedbackIsDirty is true (loaded from localStorage = dirty draft)
			const state = useDialecticStore.getState();
			const entry = state.stageDocumentContent[serializedKeyA1];
			expect(entry.feedbackIsDirty).toBe(true);
		});
	});

	describe('Phase 3: User clicks Save Edit and Save Feedback — DB write + localStorage flush', () => {
		it('saves to DB and flushes localStorage on explicit save', async () => {
			const user = userEvent.setup();

			// Seed, focus, render, edit, provide feedback
			seedDocumentContent(compositeKeyA1, serializedKeyA1, 'contrib-a1');
			focusDocument(modelIdA, docKey1);

			render(<GeneratedContributionCard modelId={modelIdA} />);

			await waitFor(() => {
				expect(
					screen.getByTestId(
						`stage-document-content-${modelIdA}-${docKey1}`,
					),
				).toHaveValue(`Original content for ${docKey1}`);
			});

			const contentTextarea = screen.getByTestId(
				`stage-document-content-${modelIdA}-${docKey1}`,
			);
			await user.clear(contentTextarea);
			await user.type(contentTextarea, 'Edited thesis content');

			const feedbackTextarea = screen.getByTestId(
				`stage-document-feedback-${modelIdA}-${docKey1}`,
			);
			await user.type(feedbackTextarea, 'Needs more data. Add graphs.');

			// Confirm dirty state
			await waitFor(() => {
				const state = useDialecticStore.getState();
				const entry = state.stageDocumentContent[serializedKeyA1];
				expect(entry.feedbackIsDirty).toBe(true);
				expect(entry.isDirty).toBe(true);
			});

			// Configure API mocks for save operations
			mockDialecticClient.submitStageDocumentFeedback.mockResolvedValue({
				data: { success: true },
				error: undefined,
				status: 200,
			});

			mockDialecticClient.saveContributionEdit.mockResolvedValue({
				data: buildEditSuccessResponse('contrib-a1', docKey1),
				error: undefined,
				status: 200,
			});

			// ACT: Click Save Feedback
			const saveFeedbackButtons = screen.getAllByRole('button', {
				name: /save feedback/i,
			});
			await user.click(saveFeedbackButtons[0]);

			// ASSERT: submitStageDocumentFeedback called with correct payload
			await waitFor(() => {
				expect(
					mockDialecticClient.submitStageDocumentFeedback,
				).toHaveBeenCalledWith(
					expect.objectContaining({
						sessionId,
						stageSlug,
						iterationNumber,
						modelId: modelIdA,
						documentKey: docKey1,
						feedbackContent: 'Needs more data. Add graphs.',
						userId,
						projectId,
						feedbackType: 'user_feedback',
					}),
				);
			});

			// ASSERT: localStorage flushed after save
			await waitFor(() => {
				expect(window.localStorage.getItem(localStorageKeyA1)).toBeNull();
			});

			// ASSERT: feedbackIsDirty cleared
			await waitFor(() => {
				const state = useDialecticStore.getState();
				const entry = state.stageDocumentContent[serializedKeyA1];
				expect(entry.feedbackIsDirty).toBe(false);
			});

			// ACT: Click Save Edit
			const saveEditButtons = screen.getAllByRole('button', {
				name: /save edit/i,
			});
			await user.click(saveEditButtons[0]);

			// ASSERT: saveContributionEdit called with correct payload
			await waitFor(() => {
				expect(
					mockDialecticClient.saveContributionEdit,
				).toHaveBeenCalledWith(
					expect.objectContaining({
						originalContributionIdToEdit: 'contrib-a1',
						editedContentText: 'Edited thesis content',
						projectId,
						sessionId,
						documentKey: docKey1,
						resourceType: 'rendered_document',
					}),
				);
			});

			// ASSERT: isDirty cleared after edit save
			await waitFor(() => {
				const state = useDialecticStore.getState();
				const entry = state.stageDocumentContent[serializedKeyA1];
				expect(entry.isDirty).toBe(false);
			});
		});
	});

	describe('Phase 4: User returns after save — DB prepopulation', () => {
		it('populates feedback from DB when no localStorage draft exists', async () => {
			// Seed content, focus, render
			seedDocumentContent(compositeKeyA1, serializedKeyA1, 'contrib-a1');
			focusDocument(modelIdA, docKey1);

			// Configure API: saved feedback exists in DB
			const savedFeedback: StageDocumentFeedback[] = [
				{
					id: 'fb-1',
					content: 'Previously saved feedback from DB',
					createdAt: isoTimestamp,
				},
			];
			mockDialecticClient.getStageDocumentFeedback.mockResolvedValue({
				data: savedFeedback,
				error: undefined,
				status: 200,
			});

			// Confirm no localStorage draft exists
			expect(window.localStorage.getItem(localStorageKeyA1)).toBeNull();

			render(<GeneratedContributionCard modelId={modelIdA} />);

			// ASSERT: initializeFeedbackDraft called the API
			await waitFor(() => {
				expect(
					mockDialecticClient.getStageDocumentFeedback,
				).toHaveBeenCalled();
			});

			// ASSERT: Feedback textarea shows DB-sourced content
			await waitFor(() => {
				const fb = screen.getByTestId(
					`stage-document-feedback-${modelIdA}-${docKey1}`,
				);
				expect(fb).toHaveValue('Previously saved feedback from DB');
			});

			// ASSERT: feedbackIsDirty is false (loaded from DB, not a dirty draft)
			const state = useDialecticStore.getState();
			const entry = state.stageDocumentContent[serializedKeyA1];
			expect(entry.feedbackIsDirty).toBe(false);
		});
	});

	describe('Phase 5: Multi-document editing + Submit Responses', () => {
		it('preserves all local edits per-document per-model and batch-saves on submit', async () => {
			const user = userEvent.setup();

			// Seed content for all 3 documents
			seedDocumentContent(compositeKeyA1, serializedKeyA1, 'contrib-a1');
			seedDocumentContent(compositeKeyA2, serializedKeyA2, 'contrib-a2');
			seedDocumentContent(compositeKeyB1, serializedKeyB1, 'contrib-b1');

			// Configure API mocks for save operations
			mockDialecticClient.submitStageDocumentFeedback.mockResolvedValue({
				data: { success: true },
				error: undefined,
				status: 200,
			});

			mockDialecticClient.saveContributionEdit
				.mockResolvedValueOnce({
					data: buildEditSuccessResponse('contrib-a1', docKey1),
					error: undefined,
					status: 200,
				})
				.mockResolvedValueOnce({
					data: buildEditSuccessResponse('contrib-a2', docKey2),
					error: undefined,
					status: 200,
				})
				.mockResolvedValueOnce({
					data: buildEditSuccessResponse('contrib-b1', docKey1),
					error: undefined,
					status: 200,
				});

			// --- Edit document 1: model-a:success_metrics ---
			focusDocument(modelIdA, docKey1);
			const { unmount: unmount1 } = render(
				<GeneratedContributionCard modelId={modelIdA} />,
			);

			await waitFor(() => {
				expect(
					screen.getByTestId(
						`stage-document-content-${modelIdA}-${docKey1}`,
					),
				).toHaveValue(`Original content for ${docKey1}`);
			});

			await user.clear(
				screen.getByTestId(
					`stage-document-content-${modelIdA}-${docKey1}`,
				),
			);
			await user.type(
				screen.getByTestId(
					`stage-document-content-${modelIdA}-${docKey1}`,
				),
				'Edited A1',
			);
			await user.type(
				screen.getByTestId(
					`stage-document-feedback-${modelIdA}-${docKey1}`,
				),
				'Feedback A1',
			);

			unmount1();

			// --- Edit document 2: model-a:risk_analysis ---
			focusDocument(modelIdA, docKey2);

			// Reconfigure getProjectResourceContent for docKey2
			mockDialecticClient.getProjectResourceContent.mockResolvedValue({
				data: buildResourceContentResponse(
					'Original content for risk_analysis',
					'contrib-a2',
				),
				error: undefined,
				status: 200,
			});

			const { unmount: unmount2 } = render(
				<GeneratedContributionCard modelId={modelIdA} />,
			);

			await waitFor(() => {
				expect(
					screen.getByTestId(
						`stage-document-content-${modelIdA}-${docKey2}`,
					),
				).toHaveValue(`Original content for ${docKey2}`);
			});

			await user.clear(
				screen.getByTestId(
					`stage-document-content-${modelIdA}-${docKey2}`,
				),
			);
			await user.type(
				screen.getByTestId(
					`stage-document-content-${modelIdA}-${docKey2}`,
				),
				'Edited A2',
			);
			await user.type(
				screen.getByTestId(
					`stage-document-feedback-${modelIdA}-${docKey2}`,
				),
				'Feedback A2',
			);

			unmount2();

			// --- Edit document 3: model-b:success_metrics ---
			focusDocument(modelIdB, docKey1);

			mockDialecticClient.getProjectResourceContent.mockResolvedValue({
				data: buildResourceContentResponse(
					'Original content for success_metrics',
					'contrib-b1',
				),
				error: undefined,
				status: 200,
			});

			const { unmount: unmount3 } = render(
				<GeneratedContributionCard modelId={modelIdB} />,
			);

			await waitFor(() => {
				expect(
					screen.getByTestId(
						`stage-document-content-${modelIdB}-${docKey1}`,
					),
				).toHaveValue(`Original content for ${docKey1}`);
			});

			await user.clear(
				screen.getByTestId(
					`stage-document-content-${modelIdB}-${docKey1}`,
				),
			);
			await user.type(
				screen.getByTestId(
					`stage-document-content-${modelIdB}-${docKey1}`,
				),
				'Edited B1',
			);
			await user.type(
				screen.getByTestId(
					`stage-document-feedback-${modelIdB}-${docKey1}`,
				),
				'Feedback B1',
			);

			unmount3();

			// ASSERT 5a: All local state preserved per-document per-model
			const stateBeforeSubmit = useDialecticStore.getState();

			const entryA1 =
				stateBeforeSubmit.stageDocumentContent[serializedKeyA1];
			expect(entryA1.isDirty).toBe(true);
			expect(entryA1.feedbackIsDirty).toBe(true);
			expect(entryA1.currentDraftMarkdown).toBe('Edited A1');
			expect(entryA1.feedbackDraftMarkdown).toBe('Feedback A1');

			const entryA2 =
				stateBeforeSubmit.stageDocumentContent[serializedKeyA2];
			expect(entryA2.isDirty).toBe(true);
			expect(entryA2.feedbackIsDirty).toBe(true);
			expect(entryA2.currentDraftMarkdown).toBe('Edited A2');
			expect(entryA2.feedbackDraftMarkdown).toBe('Feedback A2');

			const entryB1 =
				stateBeforeSubmit.stageDocumentContent[serializedKeyB1];
			expect(entryB1.isDirty).toBe(true);
			expect(entryB1.feedbackIsDirty).toBe(true);
			expect(entryB1.currentDraftMarkdown).toBe('Edited B1');
			expect(entryB1.feedbackDraftMarkdown).toBe('Feedback B1');

			// ASSERT: 3 distinct localStorage entries
			expect(window.localStorage.getItem(localStorageKeyA1)).toBe(
				'Feedback A1',
			);
			expect(window.localStorage.getItem(localStorageKeyA2)).toBe(
				'Feedback A2',
			);
			expect(window.localStorage.getItem(localStorageKeyB1)).toBe(
				'Feedback B1',
			);

			// ASSERT: No save API calls made yet (user never clicked individual save buttons)
			expect(
				mockDialecticClient.saveContributionEdit,
			).not.toHaveBeenCalled();
			expect(
				mockDialecticClient.submitStageDocumentFeedback,
			).not.toHaveBeenCalled();

			// Configure stage advancement API response
			const advancedSession: DialecticSession = {
				...session,
				current_stage_id: 'stage-2',
			};
			const submitResponse: SubmitStageResponsesResponse = {
				updatedSession: advancedSession,
				message: 'Stage advanced',
			};
			mockDialecticClient.submitStageResponses.mockResolvedValue({
				data: submitResponse,
				error: undefined,
				status: 200,
			});

			// Configure post-advancement project refetch
			mockDialecticClient.getProjectDetails.mockResolvedValue({
				data: {
					...project,
					dialectic_sessions: [advancedSession],
				},
				error: undefined,
				status: 200,
			});

			mockDialecticClient.fetchProcessTemplate.mockResolvedValue({
				data: processTemplate,
				error: undefined,
				status: 200,
			});

			// ACT: Render SubmitResponsesButton and click Submit
			render(<SubmitResponsesButton />);

			const submitButton = screen.getByRole('button', {
				name: /submit responses/i,
			});
			await user.click(submitButton);

			// Confirm in the AlertDialog
			const continueButton = await screen.findByRole('button', {
				name: /continue/i,
			});
			await user.click(continueButton);

			// ASSERT 5b: Batch save — all dirty documents saved via API
			await waitFor(() => {
				expect(
					mockDialecticClient.submitStageResponses,
				).toHaveBeenCalled();
			});

			// Verify saveContributionEdit was called for dirty docs
			await waitFor(() => {
				expect(
					mockDialecticClient.saveContributionEdit,
				).toHaveBeenCalled();
			});

			// Verify submitStageDocumentFeedback was called for dirty feedback
			await waitFor(() => {
				expect(
					mockDialecticClient.submitStageDocumentFeedback,
				).toHaveBeenCalled();
			});

			// ASSERT 5c: Stage advancement
			await waitFor(() => {
				expect(
					mockDialecticClient.submitStageResponses,
				).toHaveBeenCalledWith(
					expect.objectContaining({
						projectId,
						sessionId,
						stageSlug,
						currentIterationNumber: iterationNumber,
					}),
				);
			});

			// ASSERT: toast notification
			await waitFor(() => {
				expect(toast.success).toHaveBeenCalledWith('Stage advanced!');
			});

			// ASSERT: Store reflects stage advancement (setActiveStage called with 'antithesis')
			await waitFor(() => {
				const finalState = useDialecticStore.getState();
				expect(finalState.activeStageSlug).toBe(nextStageSlug);
			});
		});
	});
});
