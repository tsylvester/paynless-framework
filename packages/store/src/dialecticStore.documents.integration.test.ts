import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useNotificationStore } from './notificationStore';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import { getStageRunDocumentKey } from './dialecticStore.documents';
import { selectDocumentsForStageRun } from './dialecticStore.selectors';
import type {
	Notification,
	DialecticStageRecipe,
	DialecticStageRecipeStep,
	StageRunDocumentDescriptor,
	StageRenderedDocumentDescriptor,
} from '@paynless/types';
import { mockLogger, resetMockLogger } from '../../api/src/mocks/logger.mock';
import { resetApiMock } from '@paynless/api/mocks';

const isRenderedDescriptor = (
	descriptor: StageRunDocumentDescriptor | undefined,
): descriptor is StageRenderedDocumentDescriptor =>
	Boolean(descriptor && descriptor.descriptorType !== 'planned');

vi.mock('@paynless/utils', async (importOriginal) => {
	const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
	const { mockLogger: loggerMock, resetMockLogger: resetLoggerMock } = await import(
		'../../api/src/mocks/logger.mock'
	);
	return {
		...actualUtils,
		logger: loggerMock,
		resetMockLogger: resetLoggerMock,
	};
});

describe('document lifecycle handlers write composite key and consumer reads correctly', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetApiMock();
		resetMockLogger();
		useNotificationStore.setState({ notifications: [], unreadCount: 0 });
		useDialecticStore.setState(initialDialecticStateValues);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('document_started writes progress.documents with composite key; no entry at bare document_key', () => {
		const sessionId = 'session-doc-int';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'business_case';
		const modelId = 'model-a';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const recipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-doc-int',
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
			state.recipesByStageSlug[stageSlug] = recipe;
			state.stageRunProgress[progressKey] = { documents: {}, stepStatuses: {}, jobProgress: {} };
		});

		const notification: Notification = {
			id: 'notif-doc-started-int',
			user_id: 'user-int',
			type: 'document_started',
			data: {
				sessionId,
				stageSlug,
				iterationNumber,
				job_id: 'job-1',
				document_key,
				modelId,
				step_key: 'execute_step',
			},
			read: false,
			created_at: new Date().toISOString(),
			is_internal_event: true,
			title: null,
			message: null,
			link_path: null,
		};

		act(() => {
			useNotificationStore.getState().handleIncomingNotification(notification);
		});

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		expect(progress?.documents[getStageRunDocumentKey(document_key, modelId)]).toBeDefined();
		expect(progress?.documents[document_key]).toBeUndefined();

		const documents = selectDocumentsForStageRun(useDialecticStore.getState(), progressKey);
		expect(documents[getStageRunDocumentKey(document_key, modelId)]).toBeDefined();
		expect(documents[document_key]).toBeUndefined();
	});

	it('document_completed updates progress.documents at composite key; consumer reads correctly', () => {
		const sessionId = 'session-doc-int';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'business_case';
		const modelId = 'model-b';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const recipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-doc-int',
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
			state.recipesByStageSlug[stageSlug] = recipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[getStageRunDocumentKey(document_key, modelId)]: {
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
				jobProgress: {},
			};
		});

		const notification: Notification = {
			id: 'notif-doc-completed-int',
			user_id: 'user-int',
			type: 'document_completed',
			data: {
				sessionId,
				stageSlug,
				iterationNumber,
				job_id: 'job-1',
				document_key,
				modelId,
				step_key: 'execute_step',
				latestRenderedResourceId: 'res-completed',
			},
			read: false,
			created_at: new Date().toISOString(),
			is_internal_event: true,
			title: null,
			message: null,
			link_path: null,
		};

		act(() => {
			useNotificationStore.getState().handleIncomingNotification(notification);
		});

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		const descriptor = progress?.documents[getStageRunDocumentKey(document_key, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('completed');
		}
		expect(progress?.documents[document_key]).toBeUndefined();

		const documents = selectDocumentsForStageRun(useDialecticStore.getState(), progressKey);
		expect(documents[getStageRunDocumentKey(document_key, modelId)]).toBeDefined();
		expect(documents[document_key]).toBeUndefined();
	});

	it('render_completed updates progress.documents at composite key; consumer reads correctly', () => {
		const sessionId = 'session-doc-int';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'business_case';
		const modelId = 'model-c';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
		const latestRenderedResourceId = 'resource-rendered';

		const recipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-doc-int',
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
			state.recipesByStageSlug[stageSlug] = recipe;
			state.stageRunProgress[progressKey] = {
				jobProgress: {},
				documents: {
					[getStageRunDocumentKey(document_key, modelId)]: {
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

		const notification: Notification = {
			id: 'notif-render-completed-int',
			user_id: 'user-int',
			type: 'render_completed',
			data: {
				sessionId,
				stageSlug,
				iterationNumber,
				job_id: 'job-render',
				document_key,
				modelId,
				latestRenderedResourceId,
			},
			read: false,
			created_at: new Date().toISOString(),
			is_internal_event: true,
			title: null,
			message: null,
			link_path: null,
		};

		act(() => {
			useNotificationStore.getState().handleIncomingNotification(notification);
		});

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		const descriptor = progress?.documents[getStageRunDocumentKey(document_key, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
		}
		expect(progress?.documents[document_key]).toBeUndefined();

		const documents = selectDocumentsForStageRun(useDialecticStore.getState(), progressKey);
		expect(documents[getStageRunDocumentKey(document_key, modelId)]).toBeDefined();
		expect(documents[document_key]).toBeUndefined();
	});

	it('job_failed updates progress.documents at composite key; consumer reads correctly', () => {
		const sessionId = 'session-doc-int';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'scope';
		const modelId = 'model-d';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const recipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-doc-int',
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
			state.recipesByStageSlug[stageSlug] = recipe;
			state.stageRunProgress[progressKey] = {
				documents: {
					[getStageRunDocumentKey(document_key, modelId)]: {
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
				jobProgress: {},
			};
		});

		const notification: Notification = {
			id: 'notif-job-failed-int',
			user_id: 'user-int',
			type: 'job_failed',
			data: {
				sessionId,
				stageSlug,
				iterationNumber,
				job_id: 'job-1',
				document_key,
				modelId,
				step_key: 'execute_step',
				error: { code: 'EXECUTE_FAILED', message: 'Failed' },
				latestRenderedResourceId: 'res-1',
			},
			read: false,
			created_at: new Date().toISOString(),
			is_internal_event: true,
			title: null,
			message: null,
			link_path: null,
		};

		act(() => {
			useNotificationStore.getState().handleIncomingNotification(notification);
		});

		const progress = useDialecticStore.getState().stageRunProgress[progressKey];
		const descriptor = progress?.documents[getStageRunDocumentKey(document_key, modelId)];
		expect(descriptor).toBeDefined();
		expect(isRenderedDescriptor(descriptor)).toBe(true);
		if (isRenderedDescriptor(descriptor)) {
			expect(descriptor.status).toBe('failed');
		}
		expect(progress?.documents[document_key]).toBeUndefined();

		const documents = selectDocumentsForStageRun(useDialecticStore.getState(), progressKey);
		expect(documents[getStageRunDocumentKey(document_key, modelId)]).toBeDefined();
		expect(documents[document_key]).toBeUndefined();
	});

	it('full lifecycle writes only composite keys; selectDocumentsForStageRun returns documents keyed by composite key', () => {
		const sessionId = 'session-doc-int';
		const stageSlug = 'thesis';
		const iterationNumber = 1;
		const document_key = 'business_case';
		const modelId1 = 'model-1';
		const modelId2 = 'model-2';
		const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

		const recipe: DialecticStageRecipe = {
			stageSlug,
			instanceId: 'instance-doc-int',
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
			state.recipesByStageSlug[stageSlug] = recipe;
			state.stageRunProgress[progressKey] = { documents: {}, stepStatuses: {}, jobProgress: {} };
		});

		const docStarted1: Notification = {
			id: 'notif-doc-started-1',
			user_id: 'user-int',
			type: 'document_started',
			data: {
				sessionId,
				stageSlug,
				iterationNumber,
				job_id: 'job-1',
				document_key,
				modelId: modelId1,
				step_key: 'execute_step',
			},
			read: false,
			created_at: new Date().toISOString(),
			is_internal_event: true,
			title: null,
			message: null,
			link_path: null,
		};

		act(() => {
			useNotificationStore.getState().handleIncomingNotification(docStarted1);
		});

		const docStarted2: Notification = {
			id: 'notif-doc-started-2',
			user_id: 'user-int',
			type: 'document_started',
			data: {
				sessionId,
				stageSlug,
				iterationNumber,
				job_id: 'job-2',
				document_key,
				modelId: modelId2,
				step_key: 'execute_step',
			},
			read: false,
			created_at: new Date().toISOString(),
			is_internal_event: true,
			title: null,
			message: null,
			link_path: null,
		};

		act(() => {
			useNotificationStore.getState().handleIncomingNotification(docStarted2);
		});

		const state = useDialecticStore.getState();
		const documents = selectDocumentsForStageRun(state, progressKey);
		expect(documents[getStageRunDocumentKey(document_key, modelId1)]).toBeDefined();
		expect(documents[getStageRunDocumentKey(document_key, modelId2)]).toBeDefined();
		expect(documents[document_key]).toBeUndefined();
		expect(Object.keys(documents)).toHaveLength(2);
		expect(Object.keys(documents)).toContain(getStageRunDocumentKey(document_key, modelId1));
		expect(Object.keys(documents)).toContain(getStageRunDocumentKey(document_key, modelId2));
	});
});
