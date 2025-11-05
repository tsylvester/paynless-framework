import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
    ApiResponse, 
    DialecticStageRecipe, 
    DialecticStageRecipeStep 
} from '@paynless/types';

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
    output_type: 'HeaderContext',
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
    output_type: 'AssembledDocumentJson',
    granularity_strategy: 'one_to_one',
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
});
