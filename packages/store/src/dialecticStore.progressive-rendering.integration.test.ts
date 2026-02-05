import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createClient } from '@supabase/supabase-js';
import { initializeApiClient, _resetApiClient } from '@paynless/api';
import { server } from '../../api/src/setupTests';
import { useNotificationStore } from './notificationStore';
import { useDialecticStore } from './dialecticStore';
import { getStageDocumentKey, getStageRunDocumentKey } from './dialecticStore.documents';
import type {
  Notification,
  DialecticStageRecipe,
  DialecticStageRecipeStep,
  StageRunDocumentDescriptor,
  StageRenderedDocumentDescriptor,
  StageDocumentCompositeKey,
  StageDocumentContentState,
  StageRenderedDocumentChecklistEntry,
} from '@paynless/types';
import { mockLogger, resetMockLogger } from '../../api/src/mocks/logger.mock';

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

vi.mock('@supabase/supabase-js', () => {
  const mockSubscription = {
    id: 'mock-subscription-id',
    unsubscribe: vi.fn(),
    callback: vi.fn(),
  };
  const mockClient = {
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: mockSubscription } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(), unsubscribe: vi.fn() })),
    from: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    removeChannel: vi.fn().mockReturnValue('ok'),
    removeAllChannels: vi.fn().mockReturnValue([]),
    storage: { from: vi.fn().mockReturnThis() },
  };
  return {
    createClient: vi.fn(() => mockClient),
    SupabaseClient: vi.fn(),
  };
});

const MOCK_SUPABASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';
const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;
const MOCK_ACCESS_TOKEN = 'mock-test-access-token-local';

function isObjectWithKey(obj: unknown, key: string): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

describe('Store integration test for progressive document rendering lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockLogger();
    _resetApiClient();
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
    const mockSupabaseClient = vi.mocked(createClient).mock.results[0].value;
    vi.mocked(mockSupabaseClient.auth.getSession).mockResolvedValue({
      data: { session: { access_token: MOCK_ACCESS_TOKEN } },
      error: null,
    });
    useDialecticStore.getState()._resetForTesting?.();
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  afterEach(() => {
    useDialecticStore.getState()._resetForTesting?.();
    _resetApiClient();
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  describe('multiple render_completed events progressively update latestRenderedResourceId', () => {
    it('multiple render_completed events progressively update latestRenderedResourceId', () => {
      const sessionId = 'session-prog-render';
      const stageSlug = 'thesis';
      const iterationNumber = 1;
      const jobId = 'job-prog-render';
      const modelId = 'model-prog-render';
      const documentKey = 'business_case';
      const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

      const executeStep: DialecticStageRecipeStep = {
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
          { document_key: documentKey, artifact_class: 'rendered_document', file_type: 'markdown' },
        ],
      };

      const recipe: DialecticStageRecipe = {
        stageSlug,
        instanceId: 'instance-prog-render',
        steps: [executeStep],
      };

      useDialecticStore.setState((state) => {
        state.recipesByStageSlug[stageSlug] = recipe;
        state.stageRunProgress[progressKey] = { documents: {}, stepStatuses: {} };
      });

      const documentStartedNotification: Notification = {
        id: 'notification-doc-started-prog',
        user_id: 'user-prog-test',
        type: 'document_started',
        data: {
          sessionId,
          stageSlug,
          iterationNumber,
          job_id: jobId,
          document_key: documentKey,
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
        useNotificationStore.getState().handleIncomingNotification(documentStartedNotification);
      });

      let updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
      let descriptor = updatedProgress?.documents[getStageRunDocumentKey(documentKey, modelId)];
      expect(descriptor).toBeDefined();
      expect(isRenderedDescriptor(descriptor)).toBe(true);
      if (isRenderedDescriptor(descriptor)) {
        expect(descriptor.status).toBe('generating');
      }

      const renderCompletedV1: Notification = {
        id: 'notification-render-v1',
        user_id: 'user-prog-test',
        type: 'render_completed',
        data: {
          sessionId,
          stageSlug,
          iterationNumber,
          job_id: jobId,
          document_key: documentKey,
          modelId,
          latestRenderedResourceId: 'resource-v1',
        },
        read: false,
        created_at: new Date().toISOString(),
        is_internal_event: true,
        title: null,
        message: null,
        link_path: null,
      };

      act(() => {
        useNotificationStore.getState().handleIncomingNotification(renderCompletedV1);
      });

      updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
      descriptor = updatedProgress?.documents[getStageRunDocumentKey(documentKey, modelId)];
      expect(descriptor).toBeDefined();
      expect(isRenderedDescriptor(descriptor)).toBe(true);
      if (isRenderedDescriptor(descriptor)) {
        expect(descriptor.latestRenderedResourceId).toBe('resource-v1');
        expect(descriptor.status).toBe('generating');
      }

      const renderCompletedV2: Notification = {
        id: 'notification-render-v2',
        user_id: 'user-prog-test',
        type: 'render_completed',
        data: {
          sessionId,
          stageSlug,
          iterationNumber,
          job_id: jobId,
          document_key: documentKey,
          modelId,
          latestRenderedResourceId: 'resource-v2',
        },
        read: false,
        created_at: new Date().toISOString(),
        is_internal_event: true,
        title: null,
        message: null,
        link_path: null,
      };

      act(() => {
        useNotificationStore.getState().handleIncomingNotification(renderCompletedV2);
      });

      updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
      descriptor = updatedProgress?.documents[getStageRunDocumentKey(documentKey, modelId)];
      expect(descriptor).toBeDefined();
      expect(isRenderedDescriptor(descriptor)).toBe(true);
      if (isRenderedDescriptor(descriptor)) {
        expect(descriptor.latestRenderedResourceId).toBe('resource-v2');
        expect(descriptor.status).toBe('generating');
      }
    });
  });

  describe('setFocusedStageDocument fetches content when status=generating and latestRenderedResourceId exists', () => {
    it('setFocusedStageDocument fetches content when status=generating and latestRenderedResourceId exists', async () => {
      const sessionId = 'session-focus-fetch';
      const stageSlug = 'thesis';
      const iterationNumber = 1;
      const modelId = 'model-focus-fetch';
      const documentKey = 'business_case';
      const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
      const resourceId = 'resource-v1';
      const stepKey = 'execute_step';

      const descriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'generating',
        job_id: 'job-focus-fetch',
        latestRenderedResourceId: resourceId,
        modelId,
        versionHash: 'hash-v1',
        lastRenderedResourceId: resourceId,
        lastRenderAtIso: new Date().toISOString(),
        stepKey,
      };

      useDialecticStore.setState((state) => {
        state.stageRunProgress[progressKey] = {
          documents: { [getStageRunDocumentKey(documentKey, modelId)]: descriptor },
          stepStatuses: {},
        };
      });

      server.use(
        http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
          const raw = await request.json();
          if (!isObjectWithKey(raw, 'action') || raw.action !== 'getProjectResourceContent') {
            return HttpResponse.json({}, { status: 400 });
          }
          if (!isObjectWithKey(raw, 'payload')) {
            return HttpResponse.json({}, { status: 400 });
          }
          const payload = raw.payload;
          if (!isObjectWithKey(payload, 'resourceId') || payload.resourceId !== resourceId) {
            return HttpResponse.json({}, { status: 400 });
          }
          return HttpResponse.json(
            {
              fileName: 'doc.md',
              mimeType: 'text/markdown',
              content: '# Content v1',
              sourceContributionId: null,
            },
            { status: 200 },
          );
        }),
      );

      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey,
        iterationNumber,
      });

      const compositeKey: StageDocumentCompositeKey = {
        sessionId,
        stageSlug,
        iterationNumber,
        modelId,
        documentKey,
      };
      const serializedKey = getStageDocumentKey(compositeKey);

      await vi.waitFor(() => {
        const entry = useDialecticStore.getState().stageDocumentContent[serializedKey];
        expect(entry).toBeDefined();
        expect(entry?.isLoading).toBe(false);
        expect(entry?.baselineMarkdown).toBe('# Content v1');
      });

      const finalEntry = useDialecticStore.getState().stageDocumentContent[serializedKey];
      expect(finalEntry?.baselineMarkdown).toBe('# Content v1');
      expect(finalEntry?.isLoading).toBe(false);
    });
  });

  describe('document_completed sets status=completed and preserves latestRenderedResourceId', () => {
    it('document_completed sets status=completed and preserves latestRenderedResourceId', () => {
      const sessionId = 'session-doc-completed';
      const stageSlug = 'thesis';
      const iterationNumber = 1;
      const jobId = 'job-doc-completed';
      const modelId = 'model-doc-completed';
      const documentKey = 'business_case';
      const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
      const latestRenderedResourceId = 'resource-v2';
      const stepKey = 'execute_step';

      const executeStep: DialecticStageRecipeStep = {
        id: 'execute-step-id',
        step_key: stepKey,
        step_slug: 'execute-step',
        step_name: 'Execute Step',
        execution_order: 1,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        output_type: 'rendered_document',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        outputs_required: [
          { document_key: documentKey, artifact_class: 'rendered_document', file_type: 'markdown' },
        ],
      };

      const recipe: DialecticStageRecipe = {
        stageSlug,
        instanceId: 'instance-doc-completed',
        steps: [executeStep],
      };

      const descriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'generating',
        job_id: jobId,
        latestRenderedResourceId,
        modelId,
        versionHash: 'hash-v2',
        lastRenderedResourceId: latestRenderedResourceId,
        lastRenderAtIso: new Date().toISOString(),
        stepKey,
      };

      useDialecticStore.setState((state) => {
        state.recipesByStageSlug[stageSlug] = recipe;
        state.stageRunProgress[progressKey] = {
          documents: { [getStageRunDocumentKey(documentKey, modelId)]: descriptor },
          stepStatuses: {},
        };
      });

      const documentCompletedNotification: Notification = {
        id: 'notification-doc-completed',
        user_id: 'user-doc-completed-test',
        type: 'document_completed',
        data: {
          sessionId,
          stageSlug,
          iterationNumber,
          job_id: jobId,
          document_key: documentKey,
          modelId,
          step_key: stepKey,
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
        useNotificationStore.getState().handleIncomingNotification(documentCompletedNotification);
      });

      const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
      const updatedDescriptor = updatedProgress?.documents[getStageRunDocumentKey(documentKey, modelId)];
      expect(updatedDescriptor).toBeDefined();
      expect(isRenderedDescriptor(updatedDescriptor)).toBe(true);
      if (isRenderedDescriptor(updatedDescriptor)) {
        expect(updatedDescriptor.status).toBe('completed');
        expect(updatedDescriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
      }
      expect(updatedProgress?.stepStatuses[stepKey]).toBe('completed');
    });
  });

  describe('hydrateStageProgress loads content for completed documents (simulates user return)', () => {
    it('hydrateStageProgress loads content for completed documents (simulates user return)', async () => {
      const sessionId = 'session-hydrate';
      const stageSlug = 'thesis';
      const iterationNumber = 1;
      const userId = 'user-hydrate';
      const projectId = 'project-hydrate';
      const modelId = 'model-hydrate';
      const documentKey = 'business_case';
      const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
      const latestRenderedResourceId = 'resource-hydrate';
      const stepKey = 'execute_step';

      const checklistEntry: StageRenderedDocumentChecklistEntry = {
        descriptorType: 'rendered',
        documentKey,
        status: 'completed',
        jobId: 'job-hydrate',
        latestRenderedResourceId,
        modelId,
        stepKey,
      };

      server.use(
        http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
          const raw = await request.json();
          if (!isObjectWithKey(raw, 'action')) {
            return HttpResponse.json({}, { status: 404 });
          }
          if (raw.action === 'listStageDocuments') {
            return HttpResponse.json([checklistEntry], { status: 200 });
          }
          if (raw.action === 'getProjectResourceContent' && isObjectWithKey(raw, 'payload')) {
            const payload = raw.payload;
            if (isObjectWithKey(payload, 'resourceId') && payload.resourceId === latestRenderedResourceId) {
              return HttpResponse.json(
                {
                  fileName: 'doc.md',
                  mimeType: 'text/markdown',
                  content: '# Hydrated content',
                  sourceContributionId: null,
                },
                { status: 200 },
              );
            }
          }
          return HttpResponse.json({}, { status: 404 });
        }),
      );

      await useDialecticStore.getState().hydrateStageProgress({
        sessionId,
        stageSlug,
        iterationNumber,
        userId,
        projectId,
      });

      const progress = useDialecticStore.getState().stageRunProgress[progressKey];
      expect(progress).toBeDefined();
      expect(progress?.documents[getStageRunDocumentKey(documentKey, modelId)]).toBeDefined();
      const descriptor = progress?.documents[getStageRunDocumentKey(documentKey, modelId)];
      expect(isRenderedDescriptor(descriptor)).toBe(true);
      if (isRenderedDescriptor(descriptor)) {
        expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
      }

      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey,
        iterationNumber,
      });

      const compositeKey: StageDocumentCompositeKey = {
        sessionId,
        stageSlug,
        iterationNumber,
        modelId,
        documentKey,
      };
      const serializedKey = getStageDocumentKey(compositeKey);

      await vi.waitFor(() => {
        const entry = useDialecticStore.getState().stageDocumentContent[serializedKey];
        expect(entry).toBeDefined();
        expect(entry?.isLoading).toBe(false);
        expect(entry?.baselineMarkdown).toBe('# Hydrated content');
      });
    });
  });

  describe('no duplicate fetch when latestRenderedResourceId unchanged', () => {
    it('no duplicate fetch when latestRenderedResourceId unchanged', async () => {
      const sessionId = 'session-no-dup';
      const stageSlug = 'thesis';
      const iterationNumber = 1;
      const modelId = 'model-no-dup';
      const documentKey = 'business_case';
      const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
      const resourceId = 'resource-v1';
      const stepKey = 'execute_step';

      const descriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'job-no-dup',
        latestRenderedResourceId: resourceId,
        modelId,
        versionHash: 'hash-v1',
        lastRenderedResourceId: resourceId,
        lastRenderAtIso: new Date().toISOString(),
        stepKey,
      };

      const compositeKey: StageDocumentCompositeKey = {
        sessionId,
        stageSlug,
        iterationNumber,
        modelId,
        documentKey,
      };
      const serializedKey = getStageDocumentKey(compositeKey);

      const cachedContent: StageDocumentContentState = {
        baselineMarkdown: '# Cached',
        currentDraftMarkdown: '# Cached',
        isDirty: false,
        isLoading: false,
        error: null,
        lastBaselineVersion: {
          resourceId,
          versionHash: 'hash-v1',
          updatedAt: new Date().toISOString(),
        },
        pendingDiff: null,
        lastAppliedVersionHash: 'hash-v1',
        sourceContributionId: null,
        feedbackDraftMarkdown: '',
        feedbackIsDirty: false,
      };

      let getProjectResourceContentCallCount = 0;

      server.use(
        http.post(`${MOCK_FUNCTIONS_URL}/dialectic-service`, async ({ request }) => {
          const raw = await request.json();
          if (isObjectWithKey(raw, 'action') && raw.action === 'getProjectResourceContent') {
            getProjectResourceContentCallCount += 1;
            return HttpResponse.json(
              {
                fileName: 'doc.md',
                mimeType: 'text/markdown',
                content: '# Content v1',
                sourceContributionId: null,
              },
              { status: 200 },
            );
          }
          return HttpResponse.json({}, { status: 404 });
        }),
      );

      useDialecticStore.setState((state) => {
        state.stageRunProgress[progressKey] = {
          documents: { [getStageRunDocumentKey(documentKey, modelId)]: descriptor },
          stepStatuses: {},
        };
        state.stageDocumentContent[serializedKey] = cachedContent;
      });

      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey,
        iterationNumber,
      });

      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey,
        iterationNumber,
      });

      expect(getProjectResourceContentCallCount).toBe(0);
    });
  });
});
