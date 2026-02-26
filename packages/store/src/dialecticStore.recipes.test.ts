import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
    ApiResponse, 
    DialecticStageRecipe, 
    DialecticStageRecipeStep,
    StageDocumentCompositeKey,
    StageRenderedDocumentDescriptor,
    StageDocumentContentState,
} from '@paynless/types';
import { getStageDocumentKey, getStageRunDocumentKey } from './dialecticStore.documents';

vi.mock('@paynless/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@paynless/api')>();
  const { api } = await import('@paynless/api/mocks');
  return {
    ...original,
    api,
    initializeApiClient: vi.fn(),
    getMockDialecticClient: vi.fn(),
  };
});

import { useDialecticStore } from './dialecticStore';
import { api, resetApiMock } from '@paynless/api/mocks';

describe('DialecticStore - Recipes and Stage Run Progress', () => {
  const stageSlug = 'synthesis';
  const sessionId = 'sess-xyz';
  const iterationNumber = 1;
  const modelId = 'model-123';
  const focusKey = `${sessionId}:${stageSlug}:${modelId}`;

  const stepA: DialecticStageRecipeStep = {
    id: 'step-a',
    step_key: 'a_key',
    step_slug: 'a-slug',
    step_name: 'A',
    execution_order: 1,
    parallel_group: 1,
    branch_key: 'branch_a',
    job_type: 'PLAN',
    prompt_type: 'Planner',
    prompt_template_id: 'pt-a',
    output_type: 'header_context',
    granularity_strategy: 'all_to_one',
    inputs_required: [{ type: 'seed_prompt', document_key: 'seed_prompt', required: true, slug: 'seed_prompt' }],
    inputs_relevance: [],
    outputs_required: [{ document_key: 'header_ctx_a', artifact_class: 'header_context', file_type: 'json' }],
  };
  const stepB: DialecticStageRecipeStep = {
    id: 'step-b',
    step_key: 'b_key',
    step_slug: 'b-slug',
    step_name: 'B',
    execution_order: 2,
    parallel_group: 2,
    branch_key: 'branch_b',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    prompt_template_id: 'pt-b',
    output_type: 'assembled_document_json',
    granularity_strategy: 'per_source_document',
    inputs_required: [{ type: 'document', document_key: 'feature_spec', required: true, slug: 'feature_spec' }],
    inputs_relevance: [{ document_key: 'feature_spec', relevance: 1, type: 'feedback', slug: 'feature_spec' }],
    outputs_required: [{ document_key: 'header_ctx_b', artifact_class: 'header_context', file_type: 'json' }],
  };

  const recipeResponse: ApiResponse<DialecticStageRecipe> = {
    status: 200,
    data: {
      stageSlug,
      instanceId: 'instance-123',
      steps: [stepA, stepB],
    }
  };

  beforeEach(() => {
    resetApiMock();
    useDialecticStore.getState()._resetForTesting?.();
    vi.clearAllMocks();
  });

  describe('fetchStageRecipe', () => {
    it('calls API and stores recipe under recipesByStageSlug', async () => {
      api.dialectic().fetchStageRecipe.mockResolvedValue(recipeResponse);
      await useDialecticStore.getState().fetchStageRecipe(stageSlug);

      const state = useDialecticStore.getState();
      expect(state.recipesByStageSlug[stageSlug]).toBeDefined();
      expect(state.recipesByStageSlug[stageSlug]?.stageSlug).toBe(stageSlug);
      expect(state.recipesByStageSlug[stageSlug]?.steps.length).toBe(2);
    });
  });

  describe('ensureRecipeForActiveStage', () => {
    it('initializes stageRunProgress with stepStatuses=not_started for each recipe step', async () => {
      // hydrate recipe first
      api.dialectic().fetchStageRecipe.mockResolvedValue(recipeResponse);
      await useDialecticStore.getState().fetchStageRecipe(stageSlug);

      // initialize progress for session+stage+iteration
      await useDialecticStore.getState().ensureRecipeForActiveStage(sessionId, stageSlug, iterationNumber);

      const state = useDialecticStore.getState();
      const keyPrefix = `${sessionId}:${stageSlug}:`;
      const progressKey = Object.keys(state.stageRunProgress).find(k => k.startsWith(keyPrefix));
      expect(progressKey).toBeDefined();
      if (!progressKey) throw new Error('progressKey should be defined');
      const progress = state.stageRunProgress[progressKey];
      expect(progress).toBeDefined();
      expect(progress?.documents).toEqual({});
      expect(progress?.stepStatuses['a_key']).toBe('not_started');
      expect(progress?.stepStatuses['b_key']).toBe('not_started');
    });

    it('is idempotent: repeated calls do not reset completed statuses', async () => {
      // hydrate
      api.dialectic().fetchStageRecipe.mockResolvedValue(recipeResponse);
      await useDialecticStore.getState().fetchStageRecipe(stageSlug);
      // initialize
      await useDialecticStore.getState().ensureRecipeForActiveStage(sessionId, stageSlug, iterationNumber);

      // Simulate one step completed
      useDialecticStore.setState((state) => {
        const key = Object.keys(state.stageRunProgress).find((k: string) => k.startsWith(`${sessionId}:${stageSlug}:`));
        if (key) {
          state.stageRunProgress[key].stepStatuses['a_key'] = 'completed';
        }
      });

      // call again
      await useDialecticStore.getState().ensureRecipeForActiveStage(sessionId, stageSlug, iterationNumber);

      const state = useDialecticStore.getState();
      const key = Object.keys(state.stageRunProgress).find((k: string) => k.startsWith(`${sessionId}:${stageSlug}:`));
      expect(key).toBeDefined();
      if (!key) throw new Error('progressKey should be defined');
      expect(state.stageRunProgress[key].stepStatuses['a_key']).toBe('completed');
      expect(state.stageRunProgress[key].stepStatuses['b_key']).toBe('not_started');
    });
  });

  describe('focused stage document state', () => {
    it('defaults to no focused document for a stage/model combination', () => {
      const state = useDialecticStore.getState();
      expect(state.focusedStageDocument?.[focusKey] ?? null).toBeNull();
    });

    it('stores and retrieves the focused document', () => {
      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey: 'doc-alpha',
        stepKey: 'a_key',
        iterationNumber,
      });

      const state = useDialecticStore.getState();
      expect(state.focusedStageDocument?.[focusKey]).toEqual({
        modelId,
        documentKey: 'doc-alpha',
      });
    });

    it('updates the focus when a different document is selected', () => {
      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey: 'doc-alpha',
        stepKey: 'a_key',
        iterationNumber,
      });

      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey: 'doc-beta',
        stepKey: 'b_key',
        iterationNumber,
      });

      const state = useDialecticStore.getState();
      expect(state.focusedStageDocument?.[focusKey]).toEqual({
        modelId,
        documentKey: 'doc-beta',
      });
    });

    it('clears the focus when documents reset for the model', () => {
      useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey: 'doc-alpha',
        stepKey: 'a_key',
        iterationNumber,
      });

      useDialecticStore.getState().clearFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
      });

      const state = useDialecticStore.getState();
      expect(state.focusedStageDocument?.[focusKey] ?? null).toBeNull();
    });
  });

  describe('setFocusedStageDocument content fetch', () => {
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

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('2.c.i: fetches content when latestRenderedResourceId exists and content not cached', async () => {
      const latestRenderedResourceId = 'resource-to-fetch';

      // Seed with document descriptor that has latestRenderedResourceId
      const documentDescriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'job-1',
        latestRenderedResourceId,
        modelId,
        versionHash: 'hash-1',
        lastRenderedResourceId: latestRenderedResourceId,
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'execute_step',
      };

      useDialecticStore.setState((state) => {
        state.stageRunProgress[progressKey] = {
          jobProgress: {},
          documents: {
            [getStageRunDocumentKey(documentKey, modelId)]: documentDescriptor,
          },
          stepStatuses: {},
        };
        // No cached content - stageDocumentContent is empty
      });

      const fetchSpy = vi.spyOn(useDialecticStore.getState(), 'fetchStageDocumentContent');

      await useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey: 'execute_step',
        iterationNumber,
      });

      expect(fetchSpy).toHaveBeenCalledWith(compositeKey, latestRenderedResourceId);
    });

    it('2.c.ii: fetches content even when document status is generating (progressive rendering)', async () => {
      const latestRenderedResourceId = 'resource-generating';

      const documentDescriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'generating', // Still generating but has rendered content
        job_id: 'job-1',
        latestRenderedResourceId,
        modelId,
        versionHash: 'hash-1',
        lastRenderedResourceId: latestRenderedResourceId,
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'execute_step',
      };

      useDialecticStore.setState((state) => {
        state.stageRunProgress[progressKey] = {
          jobProgress: {},
          documents: {
            [getStageRunDocumentKey(documentKey, modelId)]: documentDescriptor,
          },
          stepStatuses: {},
        };
      });

      const fetchSpy = vi.spyOn(useDialecticStore.getState(), 'fetchStageDocumentContent');

      await useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey: 'execute_step',
        iterationNumber,
      });

      expect(fetchSpy).toHaveBeenCalledWith(compositeKey, latestRenderedResourceId);
    });

    it('2.c.iii: does NOT fetch when content already cached with same latestRenderedResourceId', async () => {
      const latestRenderedResourceId = 'resource-cached';

      const documentDescriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'completed',
        job_id: 'job-1',
        latestRenderedResourceId,
        modelId,
        versionHash: 'hash-cached',
        lastRenderedResourceId: latestRenderedResourceId,
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'execute_step',
      };

      useDialecticStore.setState((state) => {
        state.stageRunProgress[progressKey] = {
          jobProgress: {},
          documents: {
            [getStageRunDocumentKey(documentKey, modelId)]: documentDescriptor,
          },
          stepStatuses: {},
        };
        // Content IS cached with matching version
        const cachedContent: StageDocumentContentState = {
          baselineMarkdown: 'Cached content',
          currentDraftMarkdown: 'Cached content',
          isDirty: false,
          isLoading: false,
          error: null,
          lastBaselineVersion: {
            resourceId: latestRenderedResourceId,
            versionHash: 'hash-cached',
            updatedAt: new Date().toISOString(),
          },
          pendingDiff: null,
          lastAppliedVersionHash: 'hash-cached',
          sourceContributionId: null,
          feedbackDraftMarkdown: undefined,
          feedbackIsDirty: false,
          resourceType: null,
        };
        state.stageDocumentContent[serializedKey] = cachedContent;
      });

      const fetchSpy = vi.spyOn(useDialecticStore.getState(), 'fetchStageDocumentContent');

      await useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey: 'execute_step',
        iterationNumber,
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('2.c.iv: re-fetches when latestRenderedResourceId changed (new chunk rendered)', async () => {
      const oldResourceId = 'resource-old';
      const newResourceId = 'resource-new';

      const documentDescriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'generating',
        job_id: 'job-1',
        latestRenderedResourceId: newResourceId, // New resource ID
        modelId,
        versionHash: 'hash-new',
        lastRenderedResourceId: newResourceId,
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'execute_step',
      };

      useDialecticStore.setState((state) => {
        state.stageRunProgress[progressKey] = {
          jobProgress: {},
          documents: {
            [getStageRunDocumentKey(documentKey, modelId)]: documentDescriptor,
          },
          stepStatuses: {},
        };
        // Content cached but with OLD resource ID (stale)
        const staleContent: StageDocumentContentState = {
          baselineMarkdown: 'Old content',
          currentDraftMarkdown: 'Old content',
          isDirty: false,
          isLoading: false,
          error: null,
          lastBaselineVersion: {
            resourceId: oldResourceId, // Stale - different from descriptor
            versionHash: 'hash-old',
            updatedAt: new Date().toISOString(),
          },
          pendingDiff: null,
          lastAppliedVersionHash: 'hash-old',
          sourceContributionId: null,
          feedbackDraftMarkdown: undefined,
          feedbackIsDirty: false,
          resourceType: null,
        };
        state.stageDocumentContent[serializedKey] = staleContent;
      });

      const fetchSpy = vi.spyOn(useDialecticStore.getState(), 'fetchStageDocumentContent');

      await useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey: 'execute_step',
        iterationNumber,
      });

      expect(fetchSpy).toHaveBeenCalledWith(compositeKey, newResourceId);
    });

    it('2.c.v: does NOT fetch when document has no latestRenderedResourceId', async () => {
      const documentDescriptor: StageRenderedDocumentDescriptor = {
        descriptorType: 'rendered',
        status: 'generating',
        job_id: 'job-1',
        latestRenderedResourceId: '', // Empty - no rendered content yet
        modelId,
        versionHash: '',
        lastRenderedResourceId: '',
        lastRenderAtIso: new Date().toISOString(),
        stepKey: 'execute_step',
      };

      useDialecticStore.setState((state) => {
        state.stageRunProgress[progressKey] = {
          jobProgress: {},
          documents: {
            [getStageRunDocumentKey(documentKey, modelId)]: documentDescriptor,
          },
          stepStatuses: {},
        };
      });

      const fetchSpy = vi.spyOn(useDialecticStore.getState(), 'fetchStageDocumentContent');

      await useDialecticStore.getState().setFocusedStageDocument({
        sessionId,
        stageSlug,
        modelId,
        documentKey,
        stepKey: 'execute_step',
        iterationNumber,
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
