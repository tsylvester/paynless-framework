import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, type Spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isJson } from '../_shared/utils/type_guards.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import type {
    PrepareModelJobDeps,
    PrepareModelJobParams,
    PrepareModelJobPayload,
    PrepareModelJobSuccessReturn,
    PrepareModelJobReturn,
} from './prepareModelJob/prepareModelJob.interface.ts';
import { resetMockNotificationService, mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MOCK_ASSEMBLED_PROMPT, buildIPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { FileType, DialecticStageSlug } from '../_shared/types/file_manager.types.ts';
import type { AssembledPrompt, AssemblePromptOptions } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import type { Messages } from '../_shared/types.ts';
import type {
  GatherArtifactsErrorReturn,
  GatherArtifactsSuccessReturn,
  BoundGatherArtifactsFn,
} from './gatherArtifacts/gatherArtifacts.interface.ts';
import type {
  RetryJobFn,
  RetryJobReturn,
} from './retryJob/retryJob.interface.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { buildJobContextParams } from './createJobContext/JobContext.mock.ts';
import { createJobContext } from './createJobContext/createJobContext.ts';
import type { ResourceDocument } from '../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts';
import {
  buildDialecticJobRow,
  buildDialecticExecuteJobPayload,
  buildDialecticSessionRow,
  buildDialecticProjectRow,
  buildDialecticStage,
  buildDialecticStageRecipeStep,
  invalidateDialecticJobRow,
} from '../_shared/dialectic.mock.ts';
import { DialecticExecuteJobPayload } from '../dialectic-service/dialectic.interface.ts'
import { buildMockProvider } from '../_shared/ai_service/ai_provider.mock.ts';
import { Json } from "../dist/types_db.d.ts";

/**
 * Contract: given a valid EXECUTE job whose session and provider DB lookups
 *   succeed, processSimpleJob dispatches ctx.prepareModelJob exactly once with
 *   prepareParams carrying only dbClient and preparePayload carrying job,
 *   providerRow, promptConstructionPayload, inputsRelevance and inputsRequired,
 *   and no compressionStrategy, authToken or sessionData in either.
 * Arrange: a mock DB returning a distinct provider row and session row; a spy
 *   prepareModelJob; a valid EXECUTE job whose payload model_id and sessionId
 *   target those rows.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  prepareModelJob called once; prepareParams has dbClient and no
 *   authToken, job, projectOwnerUserId, providerRow or sessionData;
 *   preparePayload has job, providerRow, promptConstructionPayload,
 *   inputsRelevance and inputsRequired and no compressionStrategy, authToken
 *   or sessionData.
 */
Deno.test('should call the executor function with correct parameters', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-dispatch', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-dispatch' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-dispatch' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-dispatch', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-dispatch', sessionId: 'session-dispatch', planner_metadata: { recipe_step_id: 'step-dispatch' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-dispatch' }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const capturedParams = prepareSpy.calls[0].args[1];
  assertEquals('dbClient' in capturedParams, true);
  assertEquals('authToken' in capturedParams, false);
  assertEquals('job' in capturedParams, false);
  assertEquals('projectOwnerUserId' in capturedParams, false);
  assertEquals('providerRow' in capturedParams, false);
  assertEquals('sessionData' in capturedParams, false);
  const capturedPayload = prepareSpy.calls[0].args[2];
  assertEquals(capturedPayload.job.id, executeJob.id);
  assertEquals(capturedPayload.providerRow.id, 'provider-dispatch');
  if (!capturedPayload.promptConstructionPayload) throw new Error('expected promptConstructionPayload');
  assertEquals(capturedPayload.inputsRelevance, recipeStepRow.inputs_relevance);
  assertEquals(capturedPayload.inputsRequired, recipeStepRow.inputs_required);
  assertEquals('compressionStrategy' in capturedPayload, false);
  assertEquals('authToken' in capturedPayload, false);
  assertEquals('sessionData' in capturedPayload, false);
});

/**
 * Contract: given an EXECUTE job on its first attempt with a non-empty
 *   projectOwnerUserId, processSimpleJob emits execute_started via
 *   notificationService.sendJobNotificationEvent carrying modelId routed from
 *   the DB-looked-up provider row, iterationNumber routed from the DB-looked-up
 *   session row's iteration_count (not the payload's iterationNumber),
 *   document_key routed from the resolved recipe step's output_type, and
 *   step_key routed from the resolved recipe step's step_slug.
 * Arrange: a mock DB returning a session row with iteration_count 7 (distinct
 *   from the payload's iterationNumber 1), a provider row with a distinct id,
 *   and a recipe step with distinct output_type and step_slug; a spy
 *   prepareModelJob returning success so execute_completed also fires.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  sendJobNotificationEvent called with type execute_started;
 *   payload.modelId is the provider row id; payload.iterationNumber is 7;
 *   payload.document_key is the recipe step output_type; payload.step_key is
 *   the recipe step step_slug; payload.job_id is the job id.
 */
Deno.test('processSimpleJob - emits execute_started at EXECUTE job start', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-emit', job_type: 'EXECUTE', step_slug: 'emit-test-step', output_type: FileType.HeaderContext });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-emit', iteration_count: 7 })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-emit' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-emit', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-emit', sessionId: 'session-emit', iterationNumber: 1, planner_metadata: { recipe_step_id: 'step-emit' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-emit' }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  const executeStartedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
    (c) => c.args[0].type === 'execute_started',
  );
  if (!executeStartedCall) throw new Error('execute_started notification was not emitted');
  const event = executeStartedCall.args[0];
  if (event.type !== 'execute_started') throw new Error('expected execute_started event');
  assertEquals(event.job_id, 'job-emit');
  assertEquals(event.modelId, 'provider-emit');
  assertEquals(event.iterationNumber, 7);
  assertEquals(event.document_key, FileType.HeaderContext);
  assertEquals(event.step_key, 'emit-test-step');
});

/**
 * Contract: given an EXECUTE job on a retry attempt (attempt_count > 0),
 *   processSimpleJob does not emit execute_started.
 * Arrange: a valid EXECUTE job with attempt_count 1; mock DB returning valid
 *   rows; a spy prepareModelJob returning success.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  no sendJobNotificationEvent call has type execute_started.
 */
Deno.test('processSimpleJob - does not emit execute_started on a retry attempt', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-retry', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-retry' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-retry' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-retry', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-retry', sessionId: 'session-retry', planner_metadata: { recipe_step_id: 'step-retry' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-retry', attempt_count: 1 }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  const executeStartedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
    (c) => c.args[0].type === 'execute_started',
  );
  assertEquals(executeStartedCall, undefined);
});

/**
 * Contract: given a successful prepareModelJob return, processSimpleJob returns
 *   { dispatched: true } and emits execute_completed via sendJobNotificationEvent
 *   carrying iterationNumber from sessionData.iteration_count (not
 *   job.iteration_number), modelId from the looked-up provider row,
 *   document_key from the resolved recipe step's output_type, and step_key from
 *   the resolved recipe step's step_slug.
 * Arrange: a valid EXECUTE job with iteration_number 1 on the job row (distinct
 *   from the session row's iteration_count 7); a recipe step with distinct
 *   output_type and step_slug; a spy prepareModelJob returning { queued: true }.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is { dispatched: true }; sendJobNotificationEvent called with
 *   type execute_completed; iterationNumber is 7; modelId is the provider row
 *   id; document_key is the recipe step output_type; step_key is the recipe
 *   step step_slug; job_id is the job id.
 */
Deno.test('processSimpleJob - emits execute_completed and returns dispatched when prepareModelJob returns success', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-completed', job_type: 'EXECUTE', step_slug: 'completed-test-step', output_type: FileType.HeaderContext });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-completed', iteration_count: 7 })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-completed' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-completed', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-completed', sessionId: 'session-completed', iterationNumber: 1, planner_metadata: { recipe_step_id: 'step-completed' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-completed', iteration_number: 1 }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy });
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  if (!('dispatched' in result)) throw new Error('expected dispatched return');
  assertEquals(result.dispatched, true);
  const executeCompletedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
    (c) => c.args[0].type === 'execute_completed',
  );
  if (!executeCompletedCall) throw new Error('execute_completed notification was not emitted');
  const event = executeCompletedCall.args[0];
  if (event.type !== 'execute_completed') throw new Error('expected execute_completed event');
  assertEquals(event.job_id, 'job-completed');
  assertEquals(event.modelId, 'provider-completed');
  assertEquals(event.iterationNumber, 7);
  assertEquals(event.document_key, FileType.HeaderContext);
  assertEquals(event.step_key, 'completed-test-step');
});

/**
 * Contract: given a prepareModelJob returning { waiting_for_children: true },
 *   processSimpleJob returns { deferred: true }, calls
 *   ctx.notificationService.sendJobNotificationEvent zero times and writes
 *   dialectic_generation_jobs zero times.
 * Arrange: a valid EXECUTE job; a spy prepareModelJob returning
 *   { waiting_for_children: true }.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is { deferred: true }; sendJobNotificationEvent call count 0;
 *   dialectic_generation_jobs update call count 0.
 */
Deno.test('processSimpleJob - returns deferred when prepareModelJob returns waiting_for_children', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-deferred', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-deferred' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-deferred' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-deferred', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-deferred', sessionId: 'session-deferred', planner_metadata: { recipe_step_id: 'step-deferred' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-deferred' }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ waiting_for_children: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy });
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  if (!('deferred' in result)) throw new Error('expected deferred return');
  assertEquals(result.deferred, true);
  assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 0);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});

/**
 * Contract: given a ContextWindowError from prepareModelJob, processSimpleJob
 *   returns the error arm with retriable: false, does not write
 *   dialectic_generation_jobs, and emits three notifications with code
 *   CONTEXT_WINDOW_ERROR — sendContributionGenerationFailedEvent,
 *   sendContributionFailedNotification, and sendJobNotificationEvent with type
 *   job_failed.
 * Arrange: a valid EXECUTE job; a spy prepareModelJob returning
 *   { error: new ContextWindowError('context-window-exceeded'), retriable: true }.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is error arm with error.message 'context-window-exceeded'
 *   and retriable false; no dialectic_generation_jobs update;
 *   sendContributionGenerationFailedEvent with code CONTEXT_WINDOW_ERROR;
 *   sendContributionFailedNotification with code CONTEXT_WINDOW_ERROR;
 *   sendJobNotificationEvent with type job_failed and code CONTEXT_WINDOW_ERROR.
 */
Deno.test('processSimpleJob - classifies ContextWindowError as immediate failure with CONTEXT_WINDOW_ERROR code', async (t) => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-cwe', job_type: 'EXECUTE', step_slug: 'cwe-test-step', output_type: FileType.HeaderContext });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-cwe' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-cwe' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-cwe', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-cwe', sessionId: 'session-cwe', stageSlug: DialecticStageSlug.Thesis, planner_metadata: { recipe_step_id: 'step-cwe' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-cwe' }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ error: new ContextWindowError('context-window-exceeded'), retriable: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy });
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  await t.step('returns error arm with retriable false and raw error message', () => {
    if (!('error' in result)) throw new Error('expected error return arm');
    assertEquals(result.error.message, 'context-window-exceeded');
    assertEquals(result.retriable, false);
  });

  await t.step('writes no dialectic_generation_jobs update', () => {
    const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    if (updateSpy) {
      assertEquals(updateSpy.callCount, 0);
    }
  });

  await t.step('sendContributionGenerationFailedEvent carries CONTEXT_WINDOW_ERROR code and templated message', () => {
    const calls = mockNotificationService.sendContributionGenerationFailedEvent.calls;
    assertEquals(calls.length, 1);
    const event = calls[0].args[0];
    assertEquals(event.type, 'other_generation_failed');
    assertEquals(event.sessionId, 'session-cwe');
    assertEquals(event.job_id, 'job-cwe');
    assertEquals(event.error.code, 'CONTEXT_WINDOW_ERROR');
    assertEquals(
      event.error.message,
      'Context window limit exceeded, message too large to send to the model and it cannot be compressed further: context-window-exceeded',
    );
  });

  await t.step('sendContributionFailedNotification carries CONTEXT_WINDOW_ERROR code and templated message', () => {
    const calls = mockNotificationService.sendContributionFailedNotification.calls;
    assertEquals(calls.length, 1);
    const event = calls[0].args[0];
    assertEquals(event.type, 'contribution_generation_failed');
    assertEquals(event.sessionId, 'session-cwe');
    assertEquals(event.stageSlug, 'thesis');
    assertEquals(event.job_id, 'job-cwe');
    assertEquals(event.error.code, 'CONTEXT_WINDOW_ERROR');
    assertEquals(
      event.error.message,
      'Context window limit exceeded, message too large to send to the model and it cannot be compressed further: context-window-exceeded',
    );
  });

  await t.step('sendJobNotificationEvent carries job_failed with CONTEXT_WINDOW_ERROR code and raw error message', () => {
    const jobFailedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
      (c) => c.args[0].type === 'job_failed',
    );
    if (!jobFailedCall) throw new Error('job_failed notification was not emitted');
    const event = jobFailedCall.args[0];
    if (event.type !== 'job_failed') throw new Error('expected job_failed event');
    assertEquals(event.job_id, 'job-cwe');
    assertEquals(event.modelId, 'provider-cwe');
    assertEquals(event.document_key, FileType.HeaderContext);
    assertEquals(event.step_key, 'cwe-test-step');
    assertEquals(event.error.code, 'CONTEXT_WINDOW_ERROR');
    assertEquals(event.error.message, 'context-window-exceeded');
  });
});

/**
 * Contract: given a prepareModelJob returning an error arm whose message matches
 *   none of the fourteen classified substrings, processSimpleJob returns the
 *   error arm with retriable: true, calls ctx.retryJob zero times, and writes
 *   dialectic_generation_jobs zero times. Arranged beside a classified case so
 *   the flag cannot be a constant.
 * Arrange: a valid EXECUTE job; a spy prepareModelJob returning
 *   { error: new Error('unclassified-failure-message'), retriable: true }; a
 *   spy retryJob injected via ctx.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is error arm with error.message
 *   'unclassified-failure-message' and retriable true; retryJob call count 0;
 *   dialectic_generation_jobs update call count 0.
 */
Deno.test('processSimpleJob - returns retriable true for unclassified failure', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-unclassified', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-unclassified' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-unclassified' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-unclassified', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-unclassified', sessionId: 'session-unclassified', planner_metadata: { recipe_step_id: 'step-unclassified' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-unclassified' }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ error: new Error('unclassified-failure-message'), retriable: true }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async (): Promise<RetryJobReturn> => ({ notified: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy, retryJob: retrySpy });
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.error.message, 'unclassified-failure-message');
  assertEquals(result.retriable, true);
  assertEquals(retrySpy.calls.length, 0);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});

/**
 * Contract: given a gatherArtifacts that returns GatherArtifactsSuccessReturn
 *   with specific artifacts, processSimpleJob flows those artifacts unchanged
 *   into promptConstructionPayload.resourceDocuments passed to prepareModelJob.
 * Arrange: a spy gatherArtifacts returning { artifacts: [doc0, doc1] } where
 *   each doc has distinct identifiable fields; a spy prepareModelJob capturing
 *   the payload.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  prepareModelJob spy received promptConstructionPayload.resourceDocuments
 *   deep-equal to [doc0, doc1].
 */
Deno.test('processSimpleJob - gatherArtifacts success flows artifacts into prepareModelJob promptConstructionPayload.resourceDocuments', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-gather-flow', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-gather-flow' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-gather-flow' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-gather-flow', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-gather-flow', sessionId: 'session-gather-flow', planner_metadata: { recipe_step_id: 'step-gather-flow' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-gather-flow' }), payload: executePayload };

  const doc0: ResourceDocument = { id: 'doc-0-gather-flow', content: 'content-0', document_key: FileType.business_case, stage_slug: 'thesis', type: 'document' };
  const doc1: ResourceDocument = { id: 'doc-1-gather-flow', content: 'content-1', document_key: FileType.feature_spec, stage_slug: 'antithesis', type: 'document' };
  const expectedArtifacts = [doc0, doc1];

  const gatherSpy: Spy<BoundGatherArtifactsFn> = spy(
    async (): Promise<GatherArtifactsSuccessReturn> => ({ artifacts: expectedArtifacts }),
  );

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy, gatherArtifacts: gatherSpy });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const preparePayload = prepareSpy.calls[0].args[2];
  assertEquals(preparePayload.promptConstructionPayload.resourceDocuments, expectedArtifacts);
});

/**
 * Contract: given a gatherArtifacts that returns GatherArtifactsErrorReturn
 *   with retriable: false, processSimpleJob returns the error arm with
 *   retriable: false and does not call prepareModelJob.
 * Arrange: a spy gatherArtifacts returning
 *   { error: new Error('Required input document missing'), retriable: false };
 *   a spy prepareModelJob.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  prepareModelJob spy call count 0; return is error arm with
 *   error.message 'Required input document missing' and retriable false.
 */
Deno.test('processSimpleJob - gatherArtifacts error skips prepareModelJob and returns error arm', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-gather-err', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-gather-err' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-gather-err' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-gather-err', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-gather-err', sessionId: 'session-gather-err', planner_metadata: { recipe_step_id: 'step-gather-err' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-gather-err' }), payload: executePayload };

  const gatherSpy: Spy<BoundGatherArtifactsFn> = spy(
    async (): Promise<GatherArtifactsErrorReturn> => ({
      error: new Error('Required input document missing'),
      retriable: false,
    }),
  );

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy, gatherArtifacts: gatherSpy });
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  assertEquals(prepareSpy.calls.length, 0);
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.error.message, 'Required input document missing');
  assertEquals(result.retriable, false);
});

/**
 * Contract: given a gatherArtifacts spy, processSimpleJob calls it with
 *   stageSlug from the payload's own value and output_type from the resolved
 *   recipe step.
 * Arrange: a payload with distinct stageSlug DialecticStageSlug.Antithesis; a
 *   recipe step with distinct output_type FileType.feature_spec; a spy
 *   gatherArtifacts; a spy prepareModelJob returning success.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  gatherArtifacts called once; its first arg carries stageSlug
 *   DialecticStageSlug.Antithesis and output_type FileType.feature_spec.
 */
Deno.test('processSimpleJob - gatherArtifacts receives stageSlug and output_type from resolved recipe step', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-gather-stage', job_type: 'EXECUTE', step_slug: 'gather-stage-test', output_type: FileType.feature_spec });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-gather-stage' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-gather-stage' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-gather-stage', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-gather-stage', sessionId: 'session-gather-stage', stageSlug: DialecticStageSlug.Antithesis, planner_metadata: { recipe_step_id: 'step-gather-stage' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-gather-stage' }), payload: executePayload };

  const gatherSpy: Spy<BoundGatherArtifactsFn> = spy(
    async (): Promise<GatherArtifactsSuccessReturn> => ({ artifacts: [] }),
  );

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy, gatherArtifacts: gatherSpy });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  assertEquals(gatherSpy.calls.length, 1);
  const gatherArgs = gatherSpy.calls[0].args[1];
  if (!('stageSlug' in gatherArgs)) throw new Error('expected stageSlug in gatherArtifacts params');
  assertEquals(gatherArgs.stageSlug, DialecticStageSlug.Antithesis);
  if (!('output_type' in gatherArgs)) throw new Error('expected output_type in gatherArtifacts params');
  assertEquals(gatherArgs.output_type, FileType.feature_spec);
});

/**
 * Contract: given a promptAssembler.assemble that returns structured messages
 *   (continuation path with messages.length >= 3), processSimpleJob populates
 *   conversationHistory with the first two messages and routes the third
 *   message's content as currentUserPrompt in promptConstructionPayload.
 * Arrange: a spy promptAssembler returning an AssembledPrompt with three
 *   messages — system, assistant, user — where the user message has distinct
 *   content 'continuation-instruction'; a spy prepareModelJob capturing the
 *   payload.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  prepareModelJob called once; promptConstructionPayload.conversationHistory
 *   has length 2 containing the first two messages;
 *   promptConstructionPayload.currentUserPrompt is 'continuation-instruction'.
 */
Deno.test('processSimpleJob - continuation path routes third message content as currentUserPrompt', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-continuation', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-continuation' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-continuation' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-continuation', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-continuation', sessionId: 'session-continuation', planner_metadata: { recipe_step_id: 'step-continuation' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-continuation' }), payload: executePayload };

  const continuationMessages: Messages[] = [
    { role: 'system', content: 'system-prompt-content' },
    { role: 'assistant', content: 'assistant-response-content' },
    { role: 'user', content: 'continuation-instruction' },
  ];

  const assembledPrompt: AssembledPrompt = {
    ...MOCK_ASSEMBLED_PROMPT,
    messages: continuationMessages,
  };

  const assembleSpy = spy(async (_options: AssemblePromptOptions) => assembledPrompt);
  const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy, promptAssembler });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const preparePayload = prepareSpy.calls[0].args[2];
  assertEquals(preparePayload.promptConstructionPayload.conversationHistory.length, 2);
  assertEquals(preparePayload.promptConstructionPayload.conversationHistory[0], continuationMessages[0]);
  assertEquals(preparePayload.promptConstructionPayload.conversationHistory[1], continuationMessages[1]);
  assertEquals(preparePayload.promptConstructionPayload.currentUserPrompt, 'continuation-instruction');
});

/**
 * Contract: given a promptAssembler.assemble that returns no messages
 *   (non-continuation path), processSimpleJob leaves conversationHistory empty
 *   and routes assembled.promptContent as currentUserPrompt in
 *   promptConstructionPayload.
 * Arrange: a spy promptAssembler returning an AssembledPrompt with no messages
 *   and promptContent 'non-continuation-prompt'; a spy prepareModelJob
 *   capturing the payload.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  prepareModelJob called once;
 *   promptConstructionPayload.conversationHistory has length 0;
 *   promptConstructionPayload.currentUserPrompt is 'non-continuation-prompt'.
 */
Deno.test('processSimpleJob - non-continuation path routes promptContent as currentUserPrompt', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-non-continuation', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-non-continuation' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-non-continuation' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-non-continuation', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-non-continuation', sessionId: 'session-non-continuation', planner_metadata: { recipe_step_id: 'step-non-continuation' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-non-continuation' }), payload: executePayload };

  const assembledPrompt: AssembledPrompt = {
    ...MOCK_ASSEMBLED_PROMPT,
    messages: undefined,
    promptContent: 'non-continuation-prompt',
  };

  const assembleSpy = spy(async (_options: AssemblePromptOptions) => assembledPrompt);
  const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy, promptAssembler });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const preparePayload = prepareSpy.calls[0].args[2];
  assertEquals(preparePayload.promptConstructionPayload.conversationHistory.length, 0);
  assertEquals(preparePayload.promptConstructionPayload.currentUserPrompt, 'non-continuation-prompt');
});

/**
 * Contract: given a job whose payload is not a valid DialecticExecuteJobPayload
 *   (missing stageSlug), processSimpleJob returns the error arm with
 *   retriable: false.
 * Arrange: a DialecticJobRow with payload {} (no stageSlug, projectId, or
 *   sessionId).
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is error arm with retriable false; no
 *   dialectic_generation_jobs update issued.
 */
Deno.test('processSimpleJob - returns error arm with retriable false for malformed job payload', async () => {
  // Arrange
  resetMockNotificationService();

  const mockSetup = createMockSupabaseClient(undefined, { genericMockResults: {} });

  const executeJob = { ...buildDialecticJobRow({ id: 'job-malformed' }), payload: {} as unknown as Json };

  const baseParams = buildJobContextParams({});
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.retriable, false);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});

/**
 * Contract: given a session DB lookup that returns an error, processSimpleJob
 *   returns the error arm with retriable: false (classified failure — session
 *   not found).
 * Arrange: a mock DB returning an error for dialectic_sessions select; a valid
 *   EXECUTE job.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is error arm with retriable false; no
 *   dialectic_generation_jobs update issued.
 */
Deno.test('processSimpleJob - returns error arm with retriable false when session lookup fails', async () => {
  // Arrange
  resetMockNotificationService();

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: null, error: new Error('Session not found') }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ sessionId: 'session-missing', planner_metadata: { recipe_step_id: 'step-missing' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-session-missing' }), payload: executePayload };

  const baseParams = buildJobContextParams({});
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.retriable, false);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});

/**
 * Contract: given a provider DB lookup that returns no valid provider,
 *   processSimpleJob returns the error arm with retriable: false.
 * Arrange: a mock DB returning null for ai_providers select; a valid EXECUTE
 *   job with a session that does exist.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is error arm with retriable false; no
 *   dialectic_generation_jobs update issued.
 */
Deno.test('processSimpleJob - returns error arm with retriable false when provider lookup fails', async () => {
  // Arrange
  resetMockNotificationService();

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-provider-missing' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: null, error: new Error('Provider not found') }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-missing', sessionId: 'session-provider-missing', planner_metadata: { recipe_step_id: 'step-provider-missing' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-provider-missing' }), payload: executePayload };

  const baseParams = buildJobContextParams({});
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.retriable, false);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});

/**
 * Contract: given a gatherArtifacts is called after promptAssembler.assemble
 *   resolves (not before), processSimpleJob does not call gatherArtifacts while
 *   assemble is pending.
 * Arrange: a spy promptAssembler with a controllable promise that does not
 *   resolve immediately; a spy gatherArtifacts.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }) — do not await yet.
 * Assert:  gatherArtifacts not called while assemble is pending; after
 *   resolving assemble, gatherArtifacts called once.
 */
Deno.test('processSimpleJob - gatherArtifacts is called after promptAssembler.assemble resolves', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-gather-after-assemble', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-gather-after-assemble' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-gather-after-assemble' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-gather-after-assemble', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-gather-after-assemble', sessionId: 'session-gather-after-assemble', planner_metadata: { recipe_step_id: 'step-gather-after-assemble' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-gather-after-assemble' }), payload: executePayload };

  let resolveAssemble!: () => void;
  const assemblePromise = new Promise<AssembledPrompt>((resolve) => {
    resolveAssemble = () => resolve(MOCK_ASSEMBLED_PROMPT);
  });

  const assembleSpy = spy(async (_options: AssemblePromptOptions) => assemblePromise);
  const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

  const gatherSpy: Spy<BoundGatherArtifactsFn> = spy(
    async (): Promise<GatherArtifactsSuccessReturn> => ({ artifacts: [] }),
  );

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> => ({ queued: true }),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy, promptAssembler, gatherArtifacts: gatherSpy });
  const ctx = createJobContext(baseParams);

  // Act
  const jobPromise = processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert — gatherArtifacts not called while assemble is pending
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(gatherSpy.calls.length, 0);

  // Resolve assemble and let the job complete
  resolveAssemble();
  await jobPromise;

  // Assert — gatherArtifacts called after assemble resolved
  assertEquals(gatherSpy.calls.length, 1);
});

/**
 * Contract: given a prepareModelJob returning a result that matches neither the
 *   queued arm nor the pending arm nor the error arm, processSimpleJob returns
 *   the error arm carrying 'prepareModelJob returned an invalid result shape'
 *   with retriable false.
 * Arrange: a valid EXECUTE job; a spy prepareModelJob returning a malformed
 *   shape { bogus: true } that no return guard matches.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is error arm with error.message
 *   'prepareModelJob returned an invalid result shape' and retriable false.
 */
Deno.test('processSimpleJob - returns error arm with invalid result shape message when prepareModelJob returns neither arm', async () => {
  // Arrange
  resetMockNotificationService();

  const recipeStepRow = buildDialecticStageRecipeStep({ id: 'step-invalid-shape', job_type: 'EXECUTE' });
  if (recipeStepRow === null) throw new Error('buildDialecticStageRecipeStep returned null');

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: { select: () => Promise.resolve({ data: [buildDialecticSessionRow({ id: 'session-invalid-shape' })], error: null }) },
      ai_providers: { select: () => Promise.resolve({ data: [buildMockProvider({ id: 'provider-invalid-shape' })], error: null }) },
      dialectic_projects: { select: () => Promise.resolve({ data: [{ ...buildDialecticProjectRow(), dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' } }], error: null }) },
      dialectic_stages: { select: () => Promise.resolve({ data: [{ ...buildDialecticStage(), system_prompts: { id: 'sp-invalid-shape', prompt_text: 'sys' } }], error: null }) },
      domain_specific_prompt_overlays: { select: () => Promise.resolve({ data: [{ overlay_values: {} }], error: null }) },
      dialectic_stage_recipe_steps: { select: () => Promise.resolve({ data: [recipeStepRow], error: null }) },
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({ model_id: 'provider-invalid-shape', sessionId: 'session-invalid-shape', planner_metadata: { recipe_step_id: 'step-invalid-shape' } });
  if (!isJson(executePayload)) throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  const executeJob = { ...buildDialecticJobRow({ id: 'job-invalid-shape' }), payload: executePayload };

  const prepareSpy = spy(
    async (_deps: PrepareModelJobDeps, _params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ bogus: true } as unknown as PrepareModelJobReturn),
  );

  const baseParams = buildJobContextParams({ prepareModelJob: prepareSpy });
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, { job: executeJob });

  // Assert
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.error.message, 'prepareModelJob returned an invalid result shape');
  assertEquals(result.retriable, false);
});

/**
 * Contract: given an unknown payload that is not a record, processSimpleJob
 *   returns the no-readable-job-row error arm with retriable: false and writes
 *   no row.
 * Arrange: a non-record payload (null).
 * Act:     processSimpleJob(ctx, { dbClient }, null).
 * Assert:  return is error arm with error.message
 *   '[processSimpleJob] Received a payload carrying no readable job row.' and
 *   retriable false; no dialectic_generation_jobs update issued.
 */
Deno.test('processSimpleJob - returns no-readable-job-row error arm when payload is not a record', async () => {
  // Arrange
  resetMockNotificationService();

  const mockSetup = createMockSupabaseClient(undefined, { genericMockResults: {} });

  const baseParams = buildJobContextParams({});
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, null);

  // Assert
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.error.message, '[processSimpleJob] Received a payload carrying no readable job row.');
  assertEquals(result.retriable, false);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});

/**
 * Contract: given a payload whose job member is not a DialecticJobRow,
 *   processSimpleJob returns the no-readable-job-row error arm with
 *   retriable: false and writes no row.
 * Arrange: a payload { job: <invalidated job row> } where the job row is
 *   corrupted via invalidateDialecticJobRow so isDialecticJobRow rejects it.
 * Act:     processSimpleJob(ctx, { dbClient }, { job }).
 * Assert:  return is error arm with error.message
 *   '[processSimpleJob] Received a payload carrying no readable job row.' and
 *   retriable false; no dialectic_generation_jobs update issued.
 */
Deno.test('processSimpleJob - returns no-readable-job-row error arm when job member is not a job row', async () => {
  // Arrange
  resetMockNotificationService();

  const mockSetup = createMockSupabaseClient(undefined, { genericMockResults: {} });

  const invalidJob: unknown = invalidateDialecticJobRow({ id: 123 });
  const payload = { job: invalidJob };

  const baseParams = buildJobContextParams({});
  const ctx = createJobContext(baseParams);

  // Act
  const result = await processSimpleJob(ctx, { dbClient: mockSetup.client as unknown as SupabaseClient<Database> }, payload);

  // Assert
  if (!('error' in result)) throw new Error('expected error return arm');
  assertEquals(result.error.message, '[processSimpleJob] Received a payload carrying no readable job row.');
  assertEquals(result.retriable, false);
  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});
