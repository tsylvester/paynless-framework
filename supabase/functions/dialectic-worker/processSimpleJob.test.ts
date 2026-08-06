import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, type Spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { 
  isJson, 
} from '../_shared/utils/type_guards.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import { 
    DialecticExecuteJobPayload,
} from '../dialectic-service/dialectic.interface.ts';
import type {
    PrepareModelJobParams,
    PrepareModelJobPayload,
    PrepareModelJobSuccessReturn,
    PrepareModelJobReturn,
} from './prepareModelJob/prepareModelJob.interface.ts';
import { resetMockNotificationService, mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MOCK_ASSEMBLED_PROMPT, buildIPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { AssembledPrompt, AssemblePromptOptions } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import type { Messages, ResourceDocument } from '../_shared/types.ts';
import type {
  GatherArtifactsErrorReturn,
  GatherArtifactsSuccessReturn,
  BoundGatherArtifactsFn,
} from './gatherArtifacts/gatherArtifacts.interface.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { createMockJobContextParams } from './createJobContext/JobContext.mock.ts';
import { createJobContext } from './createJobContext/createJobContext.ts';
import type { RetryJobFn } from './createJobContext/JobContext.interface.ts';
import {
  buildDialecticJobRow,
  buildDialecticExecuteJobPayload,
  buildDialecticSessionRow,
  buildDialecticProjectRow,
  buildDialecticStage,
  buildDialecticStageRecipeStep,
  buildInputRule,
  buildRelevanceRule,
} from '../_shared/dialectic.mock.ts';
import { buildMockProvider } from '../_shared/ai_service/ai_provider.mock.ts';
import { createMockDownloadFromStorage } from '../_shared/supabase_storage_utils.mock.ts';

function createStandardTestSetup(options: {
  testPrefix: string;
  recipeStepOverrides?: Partial<NonNullable<ReturnType<typeof buildDialecticStageRecipeStep>>>;
  sessionOverrides?: Partial<ReturnType<typeof buildDialecticSessionRow>>;
  providerOverrides?: Partial<ReturnType<typeof buildMockProvider>>;
  projectOverrides?: Partial<ReturnType<typeof buildDialecticProjectRow>>;
  payloadOverrides?: Partial<DialecticExecuteJobPayload>;
  jobOverrides?: Partial<Parameters<typeof buildDialecticJobRow>[0]>;
  extraMockResults?: NonNullable<Parameters<typeof createMockSupabaseClient>[1]>['genericMockResults'];
}) {
  const recipeStepRow = buildDialecticStageRecipeStep({
    id: `step-${options.testPrefix}`,
    job_type: 'EXECUTE',
    ...options.recipeStepOverrides,
  });
  if (recipeStepRow === null) {
    throw new Error('buildDialecticStageRecipeStep returned null');
  }

  const mockSetup = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_sessions: {
        select: () =>
          Promise.resolve({
            data: [buildDialecticSessionRow({ id: `session-${options.testPrefix}`, ...options.sessionOverrides })],
            error: null,
          }),
      },
      ai_providers: {
        select: () =>
          Promise.resolve({
            data: [buildMockProvider({ id: `provider-${options.testPrefix}`, ...options.providerOverrides })],
            error: null,
          }),
      },
      dialectic_projects: {
        select: () =>
          Promise.resolve({
            data: [{
              ...buildDialecticProjectRow(options.projectOverrides),
              dialectic_domains: { id: 'test-domain-id', name: 'd', description: 'd' },
            }],
            error: null,
          }),
      },
      dialectic_stages: {
        select: () =>
          Promise.resolve({
            data: [{
              ...buildDialecticStage(),
              system_prompts: { id: `sp-${options.testPrefix}`, prompt_text: 'sys' },
            }],
            error: null,
          }),
      },
      domain_specific_prompt_overlays: {
        select: () =>
          Promise.resolve({ data: [{ overlay_values: {} }], error: null }),
      },
      dialectic_stage_recipe_steps: {
        select: () =>
          Promise.resolve({ data: [recipeStepRow], error: null }),
      },
      ...options.extraMockResults,
    },
  });

  const executePayload = buildDialecticExecuteJobPayload({
    model_id: `provider-${options.testPrefix}`,
    sessionId: `session-${options.testPrefix}`,
    planner_metadata: { recipe_step_id: `step-${options.testPrefix}` },
    ...options.payloadOverrides,
  });
  if (!isJson(executePayload)) {
    throw new Error('buildDialecticExecuteJobPayload did not produce valid JSON');
  }
  const executeJob = buildDialecticJobRow({
    id: `job-${options.testPrefix}`,
    payload: executePayload,
    ...options.jobOverrides,
  });

  return { mockSetup, executeJob, recipeStepRow };
}

/**
 * Contract: given a valid EXECUTE job whose session and provider DB lookups
 *   succeed, processSimpleJob dispatches ctx.prepareModelJob exactly once with
 *   prepareParams carrying the looked-up provider row (routed from payload
 *   model_id) and session row (routed from payload sessionId).
 * Arrange: a mock DB returning a distinct provider row and session row; a spy
 *   prepareModelJob; a valid EXECUTE job whose payload model_id and sessionId
 *   target those rows.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  prepareModelJob called once; prepareParams.providerRow.id is the
 *   looked-up provider id; prepareParams.sessionData.id is the looked-up
 *   session id; prepareParams.job.id is the dispatched job id.
 */
Deno.test('should call the executor function with correct parameters', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'dispatch-target' });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-dispatch',
    ctx,
    'auth-dispatch',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const capturedParams = prepareSpy.calls[0].args[0];
  assertEquals(capturedParams.job.id, executeJob.id);
  assertEquals(capturedParams.providerRow.id, 'provider-dispatch-target');
  assertEquals(capturedParams.sessionData.id, 'session-dispatch-target');
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
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  sendJobNotificationEvent called with type execute_started;
 *   payload.modelId is the provider row id; payload.iterationNumber is 7;
 *   payload.document_key is the recipe step output_type; payload.step_key is
 *   the recipe step step_slug; payload.job_id is the job id.
 */
Deno.test('processSimpleJob - emits execute_started at EXECUTE job start', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'emit-target',
    recipeStepOverrides: { step_slug: 'emit-test-step', output_type: FileType.HeaderContext },
    sessionOverrides: { iteration_count: 7 },
    payloadOverrides: { iterationNumber: 1 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-emit',
    ctx,
    'auth-emit',
  );

  // Assert
  const executeStartedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
    (c) => c.args[0].type === 'execute_started',
  );
  if (!executeStartedCall) {
    throw new Error('execute_started notification was not emitted');
  }
  const event = executeStartedCall.args[0];
  if (event.type !== 'execute_started') {
    throw new Error('expected execute_started event');
  }
  assertEquals(event.job_id, 'job-emit-target');
  assertEquals(event.modelId, 'provider-emit-target');
  assertEquals(event.iterationNumber, 7);
  assertEquals(event.document_key, FileType.HeaderContext);
  assertEquals(event.step_key, 'emit-test-step');
});

/**
 * Contract: given an EXECUTE job on a retry attempt (currentAttempt > 0) with a
 *   non-empty projectOwnerUserId, processSimpleJob does not emit execute_started
 *   via notificationService.sendJobNotificationEvent.
 * Arrange: a valid EXECUTE job with attempt_count > 0; a non-empty owner; mock
 *   DB returning valid session/provider/project/stage/overlays/recipe-step; a
 *   spy prepareModelJob returning success.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  no sendJobNotificationEvent call has type execute_started.
 */
Deno.test('processSimpleJob - does not emit execute_started on a retry attempt', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'retry-target',
    jobOverrides: { attempt_count: 1 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-retry',
    ctx,
    'auth-retry',
  );

  // Assert
  const executeStartedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
    (c) => c.args[0].type === 'execute_started',
  );
  assertEquals(executeStartedCall, undefined);
});

/**
 * Contract: given a retriable error from prepareModelJob (not matching any
 *   immediate-failure substring) with currentAttempt < max_retries,
 *   processSimpleJob calls ctx.retryJob with currentAttempt + 1 and a
 *   failedAttempt array carrying the payload model_id and the error message,
 *   and returns without writing a terminal retry_loop_failed DB update.
 * Arrange: a valid EXECUTE job with attempt_count 1 and max_retries 3; a spy
 *   prepareModelJob returning a retriable error with a distinct message; a spy
 *   retryJob.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  retryJob called once; its currentAttempt argument is 2 (not 1);
 *   failedAttempt[0].modelId is the payload model_id; failedAttempt[0].error is
 *   the error message; no DB update to dialectic_generation_jobs with status
 *   retry_loop_failed.
 */
Deno.test('processSimpleJob - Failure with Retries Remaining', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'retry-remaining',
    providerOverrides: { api_identifier: 'api-retry-remaining' },
    jobOverrides: { attempt_count: 1, max_retries: 3 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ error: new Error('retriable-failure-message'), retriable: true }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async (
      _deps,
      _dbClient,
      _job,
      _currentAttempt,
      _failedAttempts,
      _projectOwnerUserId,
    ) => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-retry-remaining',
    ctx,
    'auth-retry-remaining',
  );

  // Assert
  assertEquals(retrySpy.calls.length, 1);
  const retryArgs = retrySpy.calls[0].args;
  assertEquals(retryArgs[3], 2);
  const failedAttempts = retryArgs[4];
  assertEquals(failedAttempts.length, 1);
  const failedAttempt = failedAttempts[0];
  assertEquals(failedAttempt.modelId, 'provider-retry-remaining');
  assertEquals(failedAttempt.error, 'retriable-failure-message');
  assertEquals(failedAttempt.api_identifier, 'api-retry-remaining');

  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (updateSpy) {
    assertEquals(updateSpy.callCount, 0);
  }
});

/**
 * Contract: given a retriable error from prepareModelJob with
 *   currentAttempt >= max_retries, processSimpleJob does not call retryJob and
 *   writes a terminal DB update with status retry_loop_failed and attempt_count
 *   set to currentAttempt + 1.
 * Arrange: a valid EXECUTE job with attempt_count 3 and max_retries 3; a spy
 *   prepareModelJob returning a retriable error; a spy retryJob.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  retryJob not called; DB update on dialectic_generation_jobs called
 *   with status retry_loop_failed and attempt_count 4.
 */
Deno.test('processSimpleJob - Failure with No Retries Remaining', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'no-retries',
    jobOverrides: { attempt_count: 3, max_retries: 3 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ error: new Error('terminal-failure-message'), retriable: true }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async () => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-no-retries',
    ctx,
    'auth-no-retries',
  );

  // Assert
  assertEquals(retrySpy.calls.length, 0);

  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (!updateSpy) {
    throw new Error('expected update spy on dialectic_generation_jobs');
  }
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0];
  const updateData = updateArgs[0] as Record<string, unknown>;
  assertEquals(updateData.status, 'retry_loop_failed');
  assertEquals(updateData.attempt_count, 4);
});

/**
 * Contract: given a terminal failure (retries exhausted) with a non-empty
 *   projectOwnerUserId and a non-empty notificationDocumentKey, processSimpleJob
 *   emits job_failed via sendJobNotificationEvent carrying iterationNumber from
 *   job.iteration_number (not sessionData.iteration_count), document_key from
 *   the resolved recipe step's output_type, step_key from the resolved recipe
 *   step's step_slug, modelId from the payload model_id, and error.code
 *   RETRY_LOOP_FAILED.
 * Arrange: a valid EXECUTE job with attempt_count 3, max_retries 3, and
 *   iteration_number 5 (distinct from the session row's iteration_count 1); a
 *   recipe step with distinct output_type and step_slug; a spy prepareModelJob
 *   returning a retriable error with a distinct message.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  sendJobNotificationEvent called with type job_failed;
 *   iterationNumber is 5; document_key is the recipe step output_type;
 *   step_key is the recipe step step_slug; modelId is the payload model_id;
 *   error.code is RETRY_LOOP_FAILED; error.message is the error message.
 */
Deno.test('processSimpleJob - emits job_failed document-centric notification on terminal failure', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'job-failed',
    recipeStepOverrides: { step_slug: 'failed-test-step', output_type: FileType.HeaderContext },
    sessionOverrides: { iteration_count: 1 },
    jobOverrides: { attempt_count: 3, max_retries: 3, iteration_number: 5 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ error: new Error('terminal-job-failed-message'), retriable: true }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async () => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-job-failed',
    ctx,
    'auth-job-failed',
  );

  // Assert
  const jobFailedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
    (c) => c.args[0].type === 'job_failed',
  );
  if (!jobFailedCall) {
    throw new Error('job_failed notification was not emitted');
  }
  const event = jobFailedCall.args[0];
  if (event.type !== 'job_failed') {
    throw new Error('expected job_failed event');
  }
  assertEquals(event.job_id, 'job-job-failed');
  assertEquals(event.modelId, 'provider-job-failed');
  assertEquals(event.iterationNumber, 5);
  assertEquals(event.document_key, FileType.HeaderContext);
  assertEquals(event.step_key, 'failed-test-step');
  assertEquals(event.error.code, 'RETRY_LOOP_FAILED');
  assertEquals(event.error.message, 'terminal-job-failed-message');
});

/**
 * Contract: given a successful prepareModelJob return with a non-empty
 *   projectOwnerUserId, processSimpleJob emits execute_completed via
 *   sendJobNotificationEvent carrying iterationNumber from
 *   sessionData.iteration_count (not job.iteration_number), modelId from the
 *   looked-up provider row, document_key from the resolved recipe step's
 *   output_type, and step_key from the resolved recipe step's step_slug.
 * Arrange: a valid EXECUTE job with iteration_number 1 on the job row (distinct
 *   from the session row's iteration_count 7); a recipe step with distinct
 *   output_type and step_slug; a spy prepareModelJob returning success.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  sendJobNotificationEvent called with type execute_completed;
 *   iterationNumber is 7; modelId is the provider row id; document_key is the
 *   recipe step output_type; step_key is the recipe step step_slug; job_id is
 *   the job id.
 */
Deno.test('processSimpleJob - emits execute_completed when prepareModelJob returns success', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'completed',
    recipeStepOverrides: { step_slug: 'completed-test-step', output_type: FileType.HeaderContext },
    sessionOverrides: { iteration_count: 7 },
    payloadOverrides: { iterationNumber: 1 },
    jobOverrides: { iteration_number: 1 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-completed',
    ctx,
    'auth-completed',
  );

  // Assert
  const executeCompletedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
    (c) => c.args[0].type === 'execute_completed',
  );
  if (!executeCompletedCall) {
    throw new Error('execute_completed notification was not emitted');
  }
  const event = executeCompletedCall.args[0];
  if (event.type !== 'execute_completed') {
    throw new Error('expected execute_completed event');
  }
  assertEquals(event.job_id, 'job-completed');
  assertEquals(event.modelId, 'provider-completed');
  assertEquals(event.iterationNumber, 7);
  assertEquals(event.document_key, FileType.HeaderContext);
  assertEquals(event.step_key, 'completed-test-step');
});

/**
 * Contract: given a terminal failure (retries exhausted) with a non-empty
 *   projectOwnerUserId, processSimpleJob emits two notifications:
 *   (1) sendContributionFailedNotification (user-facing) with type
 *       contribution_generation_failed, sessionId/stageSlug/projectId from
 *       job.payload, error.code RETRY_LOOP_FAILED, and error.message as the
 *       template "Generation for stage '<stageSlug>' has failed after all
 *       retry attempts.";
 *   (2) sendContributionGenerationFailedEvent (internal) with type
 *       other_generation_failed, sessionId from the destructured payload
 *       variable, error.code RETRY_LOOP_FAILED, and error.message as the raw
 *       failedAttempt.error.
 * Arrange: a valid EXECUTE job with attempt_count 3, max_retries 3, and a
 *   distinct stageSlug in the payload; a spy prepareModelJob returning a
 *   retriable error with a distinct message.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  (step 1) sendContributionFailedNotification called with the
 *   templated message as a literal; (step 2) sendContributionGenerationFailedEvent
 *   called with the raw error message as a literal.
 */
Deno.test('processSimpleJob - emits internal and user-facing failure notifications when retries are exhausted', async (t) => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'exhausted',
    payloadOverrides: { stageSlug: 'test-stage-slug' },
    jobOverrides: { attempt_count: 3, max_retries: 3 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ error: new Error('terminal-exhausted-message'), retriable: true }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async () => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-exhausted',
    ctx,
    'auth-exhausted',
  );

  // Assert
  await t.step('sendContributionFailedNotification (user-facing) carries templated message', () => {
    const failedNotificationCalls = mockNotificationService.sendContributionFailedNotification.calls;
    assertEquals(failedNotificationCalls.length, 1);
    const event = failedNotificationCalls[0].args[0];
    assertEquals(event.type, 'contribution_generation_failed');
    assertEquals(event.sessionId, 'session-exhausted');
    assertEquals(event.stageSlug, 'test-stage-slug');
    assertEquals(event.projectId, 'test-project-id');
    assertEquals(event.job_id, 'job-exhausted');
    assertEquals(event.error.code, 'RETRY_LOOP_FAILED');
    assertEquals(event.error.message, "Generation for stage 'test-stage-slug' has failed after all retry attempts.");
  });

  await t.step('sendContributionGenerationFailedEvent (internal) carries raw error message', () => {
    const internalFailedCalls = mockNotificationService.sendContributionGenerationFailedEvent.calls;
    assertEquals(internalFailedCalls.length, 1);
    const event = internalFailedCalls[0].args[0];
    assertEquals(event.type, 'other_generation_failed');
    assertEquals(event.sessionId, 'session-exhausted');
    assertEquals(event.job_id, 'job-exhausted');
    assertEquals(event.error.code, 'RETRY_LOOP_FAILED');
    assertEquals(event.error.message, 'terminal-exhausted-message');
  });
});

/**
 * Contract: given a ContextWindowError from prepareModelJob (input too large to
 *   fit even after compression), processSimpleJob classifies it as an immediate
 *   non-retriable failure: writes status 'failed' (not retry_loop_failed) to the
 *   DB, does not call retryJob, and emits three notifications with code
 *   CONTEXT_WINDOW_ERROR — (1) sendContributionGenerationFailedEvent with a
 *   templated message, (2) sendContributionFailedNotification with the same
 *   templated message, (3) sendJobNotificationEvent with type job_failed and the
 *   raw error.message.
 * Arrange: a valid EXECUTE job with attempt_count 0 and max_retries 3 (retries
 *   remain, but must not be used); a spy prepareModelJob returning
 *   { error: new ContextWindowError('context-window-exceeded'), retriable: true };
 *   a spy retryJob.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  (step 1) DB update with status 'failed' and templated
 *   error_details.message; (step 2) retryJob not called; (step 3)
 *   sendContributionGenerationFailedEvent with code CONTEXT_WINDOW_ERROR and
 *   templated message; (step 4) sendContributionFailedNotification with code
 *   CONTEXT_WINDOW_ERROR and templated message; (step 5)
 *   sendJobNotificationEvent with type job_failed, code CONTEXT_WINDOW_ERROR,
 *   and raw error.message.
 */
Deno.test('processSimpleJob - classifies ContextWindowError as immediate failure with CONTEXT_WINDOW_ERROR code', async (t) => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'cwe',
    recipeStepOverrides: { step_slug: 'cwe-test-step', output_type: FileType.HeaderContext },
    payloadOverrides: { stageSlug: 'test-stage-slug' },
    jobOverrides: { attempt_count: 0, max_retries: 3 },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> =>
      ({ error: new ContextWindowError('context-window-exceeded'), retriable: true }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async () => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-cwe',
    ctx,
    'auth-cwe',
  );

  // Assert
  await t.step('writes failed status (not retry_loop_failed) with templated error_details', () => {
    const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    if (!updateSpy) {
      throw new Error('expected update spy on dialectic_generation_jobs');
    }
    assertEquals(updateSpy.callCount, 1);
    const updateData = updateSpy.callsArgs[0][0] as Record<string, unknown>;
    assertEquals(updateData.status, 'failed');
    const errorDetails = updateData.error_details as { message: string };
    assertEquals(errorDetails.message, 'Context window limit exceeded: context-window-exceeded');
  });

  await t.step('does not call retryJob', () => {
    assertEquals(retrySpy.calls.length, 0);
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
    assertEquals(event.stageSlug, 'test-stage-slug');
    assertEquals(event.projectId, 'test-project-id');
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
    if (!jobFailedCall) {
      throw new Error('job_failed notification was not emitted');
    }
    const event = jobFailedCall.args[0];
    if (event.type !== 'job_failed') {
      throw new Error('expected job_failed event');
    }
    assertEquals(event.job_id, 'job-cwe');
    assertEquals(event.modelId, 'provider-cwe');
    assertEquals(event.document_key, FileType.HeaderContext);
    assertEquals(event.step_key, 'cwe-test-step');
    assertEquals(event.error.code, 'CONTEXT_WINDOW_ERROR');
    assertEquals(event.error.message, 'context-window-exceeded');
  });
});

/**
 * Contract: given a non-continuation EXECUTE job, processSimpleJob builds a
 *   promptConstructionPayload without setting systemInstruction, so the field
 *   is undefined when passed to prepareModelJob.
 * Arrange: a valid EXECUTE job with no sourceContributionId (non-continuation);
 *   a spy prepareModelJob capturing the payload.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  prepareModelJob received a promptConstructionPayload where
 *   systemInstruction is undefined.
 */
Deno.test('processSimpleJob - omits systemInstruction on promptConstructionPayload for non-continuation jobs', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'no-sysinst' });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-no-sysinst',
    ctx,
    'auth-no-sysinst',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const preparePayload = prepareSpy.calls[0].args[1];
  assertEquals(preparePayload.promptConstructionPayload.systemInstruction, undefined);
});

/**
 * Contract: given a continuation EXECUTE job with a non-empty
 *   target_contribution_id on the payload, processSimpleJob passes
 *   sourceContributionId set to that value in the assembleOptions given to
 *   promptAssembler.assemble().
 * Arrange: a valid EXECUTE job with target_contribution_id
 *   'contribution-target-123'; a spy promptAssembler.assemble capturing the
 *   options; a spy prepareModelJob returning success.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  assemble spy received assembleOptions.sourceContributionId equal to
 *   'contribution-target-123'.
 */
Deno.test('processSimpleJob - should assemble with sourceContributionId for a continuation job', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'cont-assemble',
    payloadOverrides: { target_contribution_id: 'contribution-target-123' },
  });

  const assembleSpy = spy(async (_options: AssemblePromptOptions) => MOCK_ASSEMBLED_PROMPT);

  const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    promptAssembler,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-cont-assemble',
    ctx,
    'auth-cont-assemble',
  );

  // Assert
  assertEquals(assembleSpy.calls.length, 1);
  const assembleOptions = assembleSpy.calls[0].args[0];
  assertEquals(assembleOptions.sourceContributionId, 'contribution-target-123');
});

/**
 * Contract: given a project whose initial_user_prompt column is empty and a
 *   file-backed prompt resource resolving to distinct content, processSimpleJob
 *   routes the file-backed content into assembleOptions.projectInitialUserPrompt
 *   (not undefined, not the empty column value).
 * Arrange: a project row with empty initial_user_prompt and a populated
 *   initial_prompt_resource_id; a dialectic_project_resources row pointing at a
 *   storage path; downloadFromStorage returning a distinct literal encoded as
 *   bytes; an assemble spy capturing the options.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  assemble spy received projectInitialUserPrompt equal to the decoded
 *   file content literal 'file-backed-prompt-content'.
 */
Deno.test('processSimpleJob - uses file-backed initial prompt when column empty', async () => {
  // Arrange
  resetMockNotificationService();

  const fileContentLiteral = 'file-backed-prompt-content';

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'file-backed',
    projectOverrides: {
      initial_user_prompt: '',
      initial_prompt_resource_id: 'resource-file-backed',
    },
    extraMockResults: {
      dialectic_project_resources: {
        select: () =>
          Promise.resolve({
            data: [{
              storage_bucket: 'test-bucket',
              storage_path: 'test/path',
              file_name: 'prompt.txt',
            }],
            error: null,
          }),
      },
    },
  });

  const encodedBytes = new TextEncoder().encode(fileContentLiteral);
  const fileBuffer = new ArrayBuffer(encodedBytes.length);
  new Uint8Array(fileBuffer).set(encodedBytes);

  const downloadFromStorage = createMockDownloadFromStorage({
    mode: 'success',
    data: fileBuffer,
  });

  const assembleSpy = spy(async (_options: AssemblePromptOptions) => MOCK_ASSEMBLED_PROMPT);
  const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    promptAssembler,
    downloadFromStorage,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-file-backed',
    ctx,
    'auth-file-backed',
  );

  // Assert
  assertEquals(assembleSpy.calls.length, 1);
  const assembleOptions = assembleSpy.calls[0].args[0];
  assertEquals(assembleOptions.projectInitialUserPrompt, fileContentLiteral);
});

/**
 * Contract: given a stage whose domain_specific_prompt_overlays query returns
 *   zero rows, processSimpleJob throws STAGE_CONFIG_MISSING_OVERLAYS, classifies
 *   it as immediate failure (DB status 'failed', error_details.code
 *   'STAGE_CONFIG_MISSING_OVERLAYS'), and never calls promptAssembler.assemble
 *   or ctx.prepareModelJob.
 * Arrange: a standard setup with domain_specific_prompt_overlays select
 *   returning { data: [], error: null }; a spy prepareModelJob; a spy
 *   promptAssembler.assemble.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  DB update on dialectic_generation_jobs with status 'failed' and
 *   error_details.code 'STAGE_CONFIG_MISSING_OVERLAYS'; prepareModelJob spy
 *   call count 0; assemble spy call count 0.
 */
Deno.test('processSimpleJob - fails when stage overlays are missing (no render, no model call)', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'overlays-missing',
    extraMockResults: {
      domain_specific_prompt_overlays: {
        select: () =>
          Promise.resolve({ data: [], error: null }),
      },
    },
  });

  const assembleSpy = spy(async (_options: AssemblePromptOptions) => MOCK_ASSEMBLED_PROMPT);
  const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    promptAssembler,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await assertRejects(
    () =>
      processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-overlays-missing',
        ctx,
        'auth-overlays-missing',
      ),
    Error,
    'STAGE_CONFIG_MISSING_OVERLAYS',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 0);
  assertEquals(assembleSpy.calls.length, 0);

  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (!updateSpy) {
    throw new Error('expected update spy on dialectic_generation_jobs');
  }
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0];
  const updateData = updateArgs[0] as Record<string, unknown>;
  assertEquals(updateData.status, 'failed');
  const errorDetails = updateData.error_details as Record<string, unknown>;
  assertEquals(errorDetails.code, 'STAGE_CONFIG_MISSING_OVERLAYS');
});

/**
 * Contract: given a continuation EXECUTE job with a non-empty
 *   target_contribution_id on the payload, processSimpleJob forwards
 *   sourceContributionId set to that value into the
 *   promptConstructionPayload passed to ctx.prepareModelJob.
 * Arrange: a valid EXECUTE job with target_contribution_id
 *   'contribution-target-123'; a spy prepareModelJob capturing the payload.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  prepareModelJob spy received promptConstructionPayload.sourceContributionId
 *   equal to 'contribution-target-123'.
 */
Deno.test('processSimpleJob - forwards sourceContributionId for continuation uploads', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'cont-upload',
    payloadOverrides: { target_contribution_id: 'contribution-target-123' },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-cont-upload',
    ctx,
    'auth-cont-upload',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const preparePayload = prepareSpy.calls[0].args[1];
  assertEquals(preparePayload.promptConstructionPayload.sourceContributionId, 'contribution-target-123');
});

/**
 * Contract: given a project whose initial_user_prompt column is empty and no
 *   file-backed prompt resource exists (initial_prompt_resource_id null),
 *   processSimpleJob throws 'Initial prompt is required to start this stage,
 *   but none was provided.', classifies it as immediate failure (DB status
 *   'failed', error_details.code 'INVALID_INITIAL_PROMPT'), and never calls
 *   promptAssembler.assemble or ctx.prepareModelJob.
 * Arrange: a standard setup with projectOverrides { initial_user_prompt: '',
 *   initial_prompt_resource_id: null }; a spy prepareModelJob; a spy
 *   promptAssembler.assemble.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  DB update on dialectic_generation_jobs with status 'failed' and
 *   error_details.code 'INVALID_INITIAL_PROMPT'; prepareModelJob spy call
 *   count 0; assemble spy call count 0.
 */
Deno.test('processSimpleJob - fails when no initial prompt exists', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'no-prompt',
    projectOverrides: {
      initial_user_prompt: '',
      initial_prompt_resource_id: null,
    },
  });

  const assembleSpy = spy(async (_options: AssemblePromptOptions) => MOCK_ASSEMBLED_PROMPT);
  const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    promptAssembler,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await assertRejects(
    () =>
      processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-no-prompt',
        ctx,
        'auth-no-prompt',
      ),
    Error,
    'Initial prompt is required to start this stage, but none was provided.',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 0);
  assertEquals(assembleSpy.calls.length, 0);

  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (!updateSpy) {
    throw new Error('expected update spy on dialectic_generation_jobs');
  }
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0];
  const updateData = updateArgs[0] as Record<string, unknown>;
  assertEquals(updateData.status, 'failed');
  const errorDetails = updateData.error_details as Record<string, unknown>;
  assertEquals(errorDetails.code, 'INVALID_INITIAL_PROMPT');
});

/**
 * Contract: given a prepareModelJob that throws 'Wallet is required to process
 *   model calls.', processSimpleJob classifies it as immediate failure (DB
 *   status 'failed', error_details.code 'WALLET_MISSING') and does not call
 *   ctx.retryJob.
 * Arrange: a standard setup; a spy prepareModelJob that throws
 *   new Error('Wallet is required to process model calls.'); a spy retryJob.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  DB update on dialectic_generation_jobs with status 'failed' and
 *   error_details.code 'WALLET_MISSING'; retryJob spy call count 0.
 */
Deno.test('processSimpleJob - Wallet missing is immediate failure (no retry)', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'wallet-missing' });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => {
      throw new Error('Wallet is required to process model calls.');
    },
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async () => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await assertRejects(
    () =>
      processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-wallet-missing',
        ctx,
        'auth-wallet-missing',
      ),
    Error,
    'Wallet is required to process model calls.',
  );

  // Assert
  assertEquals(retrySpy.calls.length, 0);

  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (!updateSpy) {
    throw new Error('expected update spy on dialectic_generation_jobs');
  }
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0];
  const updateData = updateArgs[0] as Record<string, unknown>;
  assertEquals(updateData.status, 'failed');
  const errorDetails = updateData.error_details as Record<string, unknown>;
  assertEquals(errorDetails.code, 'WALLET_MISSING');
});

/**
 * Contract: given a prepareModelJob that returns a PrepareModelJobErrorReturn
 *   with error.message 'Token wallet service is required for affordability
 *   preflight' and retriable: true, processSimpleJob classifies it as
 *   immediate failure (DB status 'failed', error_details.code
 *   'INTERNAL_DEPENDENCY_MISSING') and does not call ctx.retryJob.
 * Arrange: a standard setup; a spy prepareModelJob returning
 *   { error: new Error('Token wallet service is required for affordability
 *   preflight'), retriable: true }; a spy retryJob.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  DB update on dialectic_generation_jobs with status 'failed' and
 *   error_details.code 'INTERNAL_DEPENDENCY_MISSING'; retryJob spy call
 *   count 0.
 */
Deno.test('processSimpleJob - Preflight dependency missing is immediate failure (no retry)', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'preflight-missing' });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => ({
      error: new Error('Token wallet service is required for affordability preflight'),
      retriable: true,
    }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async () => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await assertRejects(
    () =>
      processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-preflight-missing',
        ctx,
        'auth-preflight-missing',
      ),
    Error,
    'Token wallet service is required for affordability preflight',
  );

  // Assert
  assertEquals(retrySpy.calls.length, 0);

  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (!updateSpy) {
    throw new Error('expected update spy on dialectic_generation_jobs');
  }
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0];
  const updateData = updateArgs[0] as Record<string, unknown>;
  assertEquals(updateData.status, 'failed');
  const errorDetails = updateData.error_details as Record<string, unknown>;
  assertEquals(errorDetails.code, 'INTERNAL_DEPENDENCY_MISSING');
});

/**
 * Contract: given a resolved recipe_step with specific inputs_required and
 *   inputs_relevance arrays, processSimpleJob forwards both arrays unchanged
 *   into the PrepareModelJobPayload passed to ctx.prepareModelJob.
 * Arrange: a standard setup with recipeStepOverrides setting inputs_required
 *   and inputs_relevance to distinct identifiable arrays; a spy
 *   prepareModelJob capturing the payload.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  prepareModelJob spy received payload.inputsRequired and
 *   payload.inputsRelevance deep-equal to the arrays set on the recipe step.
 */
Deno.test('processSimpleJob - forwards recipe_step inputs_relevance and inputs_required to executor', async () => {
  // Arrange
  resetMockNotificationService();

  const customInputsRequired = [
    buildInputRule({ document_key: FileType.feature_spec, slug: 'antithesis', required: false }),
  ];
  const customInputsRelevance = [
    buildRelevanceRule({ document_key: FileType.feature_spec, relevance: 0.5, slug: 'antithesis' }),
  ];

  const { mockSetup, executeJob } = createStandardTestSetup({
    testPrefix: 'inputs-fwd',
    recipeStepOverrides: {
      inputs_required: customInputsRequired,
      inputs_relevance: customInputsRelevance,
    },
  });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-inputs-fwd',
    ctx,
    'auth-inputs-fwd',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const preparePayload = prepareSpy.calls[0].args[1];
  assertEquals(preparePayload.inputsRequired, customInputsRequired);
  assertEquals(preparePayload.inputsRelevance, customInputsRelevance);
});

Deno.test('processSimpleJob - continuation message routing', async (t) => {

    /**
     * Contract: given an assembled prompt whose messages array contains exactly 3
     *   Messages, processSimpleJob routes messages[0] and messages[1] into
     *   promptConstructionPayload.conversationHistory and sets
     *   promptConstructionPayload.currentUserPrompt to messages[2].content.
     * Arrange: a standard setup; a spy promptAssembler.assemble returning an
     *   AssembledPrompt with messages: [msg0, msg1, msg2] where each has distinct
     *   content; a spy prepareModelJob capturing the payload.
     * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
     * Assert:  prepareModelJob spy received promptConstructionPayload.conversationHistory
     *   equal to [msg0, msg1] and currentUserPrompt equal to msg2.content.
     */
    await t.step('when assembled.messages is present with 3 messages, conversationHistory contains first two and currentUserPrompt is the third message content', async () => {
      // Arrange
      resetMockNotificationService();

      const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'cont-route-3msg' });

      const msg0: Messages = { role: 'user', content: 'seed-user-message' };
      const msg1: Messages = { role: 'assistant', content: 'seed-assistant-message' };
      const msg2: Messages = { role: 'user', content: 'continuation-instruction' };
      const assembledWithMessages: AssembledPrompt = {
        ...MOCK_ASSEMBLED_PROMPT,
        messages: [msg0, msg1, msg2],
      };

      const assembleSpy = spy(async (_options: AssemblePromptOptions) => assembledWithMessages);
      const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

      const prepareSpy = spy(
        async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
          ({ queued: true }),
      );

      const baseParams = createMockJobContextParams({
        prepareModelJob: prepareSpy,
        promptAssembler,
      });
      const ctx = createJobContext(baseParams);

      // Act
      await processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-cont-route-3msg',
        ctx,
        'auth-cont-route-3msg',
      );

      // Assert
      assertEquals(prepareSpy.calls.length, 1);
      const preparePayload = prepareSpy.calls[0].args[1];
      assertEquals(preparePayload.promptConstructionPayload.conversationHistory, [msg0, msg1]);
      assertEquals(preparePayload.promptConstructionPayload.currentUserPrompt, 'continuation-instruction');
    });

    /**
     * Contract: given an assembled prompt with no messages array,
     *   processSimpleJob leaves promptConstructionPayload.conversationHistory
     *   empty and sets promptConstructionPayload.currentUserPrompt to
     *   assembled.promptContent.
     * Arrange: a standard setup; a spy promptAssembler.assemble returning
     *   MOCK_ASSEMBLED_PROMPT (no messages field); a spy prepareModelJob
     *   capturing the payload.
     * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
     * Assert:  prepareModelJob spy received promptConstructionPayload.conversationHistory
     *   equal to [] and currentUserPrompt equal to
     *   MOCK_ASSEMBLED_PROMPT.promptContent.
     */
    await t.step('when assembled.messages is absent, conversationHistory is empty and currentUserPrompt is assembled.promptContent — existing behavior unchanged', async () => {
      // Arrange
      resetMockNotificationService();

      const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'cont-route-no-msg' });

      const assembleSpy = spy(async (_options: AssemblePromptOptions) => MOCK_ASSEMBLED_PROMPT);
      const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

      const prepareSpy = spy(
        async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
          ({ queued: true }),
      );

      const baseParams = createMockJobContextParams({
        prepareModelJob: prepareSpy,
        promptAssembler,
      });
      const ctx = createJobContext(baseParams);

      // Act
      await processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-cont-route-no-msg',
        ctx,
        'auth-cont-route-no-msg',
      );

      // Assert
      assertEquals(prepareSpy.calls.length, 1);
      const preparePayload = prepareSpy.calls[0].args[1];
      assertEquals(preparePayload.promptConstructionPayload.conversationHistory, []);
      assertEquals(preparePayload.promptConstructionPayload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);
    });

    /**
     * Contract: given an assembled prompt with messages present (continuation path)
     *   and a specific source_prompt_resource_id, processSimpleJob still populates
     *   promptConstructionPayload.source_prompt_resource_id from
     *   assembled.source_prompt_resource_id — no regression from message routing.
     * Arrange: a standard setup; a spy promptAssembler.assemble returning an
     *   AssembledPrompt with messages: [msg0, msg1, msg2] and
     *   source_prompt_resource_id: 'cont-resource-id'; a spy prepareModelJob
     *   capturing the payload.
     * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
     * Assert:  prepareModelJob spy received promptConstructionPayload.source_prompt_resource_id
     *   equal to 'cont-resource-id'.
     */
    await t.step('when assembled.messages is present, source_prompt_resource_id is still populated from assembled — no regression', async () => {
      // Arrange
      resetMockNotificationService();

      const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'cont-route-sprid' });

      const msg0: Messages = { role: 'user', content: 'seed-user-message' };
      const msg1: Messages = { role: 'assistant', content: 'seed-assistant-message' };
      const msg2: Messages = { role: 'user', content: 'continuation-instruction' };
      const assembledWithMessages: AssembledPrompt = {
        ...MOCK_ASSEMBLED_PROMPT,
        source_prompt_resource_id: 'cont-resource-id',
        messages: [msg0, msg1, msg2],
      };

      const assembleSpy = spy(async (_options: AssemblePromptOptions) => assembledWithMessages);
      const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

      const prepareSpy = spy(
        async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
          ({ queued: true }),
      );

      const baseParams = createMockJobContextParams({
        prepareModelJob: prepareSpy,
        promptAssembler,
      });
      const ctx = createJobContext(baseParams);

      // Act
      await processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-cont-route-sprid',
        ctx,
        'auth-cont-route-sprid',
      );

      // Assert
      assertEquals(prepareSpy.calls.length, 1);
      const preparePayload = prepareSpy.calls[0].args[1];
      assertEquals(preparePayload.promptConstructionPayload.source_prompt_resource_id, 'cont-resource-id');
    });

    /**
     * Contract: given an assembled prompt with no messages (non-continuation path)
     *   and a specific source_prompt_resource_id, processSimpleJob populates
     *   promptConstructionPayload.source_prompt_resource_id from
     *   assembled.source_prompt_resource_id.
     * Arrange: a standard setup; a spy promptAssembler.assemble returning an
     *   AssembledPrompt with no messages and
     *   source_prompt_resource_id: 'noncont-resource-id'; a spy prepareModelJob
     *   capturing the payload.
     * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
     * Assert:  prepareModelJob spy received promptConstructionPayload.source_prompt_resource_id
     *   equal to 'noncont-resource-id'.
     */
    await t.step('when assembled.messages is absent, source_prompt_resource_id is still populated from assembled — no regression', async () => {
      // Arrange
      resetMockNotificationService();

      const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'noncont-route-sprid' });

      const assembledNoMessages: AssembledPrompt = {
        ...MOCK_ASSEMBLED_PROMPT,
        source_prompt_resource_id: 'noncont-resource-id',
      };

      const assembleSpy = spy(async (_options: AssemblePromptOptions) => assembledNoMessages);
      const promptAssembler = buildIPromptAssembler({ assemble: assembleSpy });

      const prepareSpy = spy(
        async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
          ({ queued: true }),
      );

      const baseParams = createMockJobContextParams({
        prepareModelJob: prepareSpy,
        promptAssembler,
      });
      const ctx = createJobContext(baseParams);

      // Act
      await processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-noncont-route-sprid',
        ctx,
        'auth-noncont-route-sprid',
      );

      // Assert
      assertEquals(prepareSpy.calls.length, 1);
      const preparePayload = prepareSpy.calls[0].args[1];
      assertEquals(preparePayload.promptConstructionPayload.source_prompt_resource_id, 'noncont-resource-id');
    });
});

/**
 * Contract: given a prepareModelJob that returns a PrepareModelJobErrorReturn
 *   with error.message containing 'insufficient funds' and retriable: false,
 *   processSimpleJob classifies it as immediate failure (DB status 'failed',
 *   error_details.code 'INSUFFICIENT_FUNDS') and does not call ctx.retryJob.
 * Arrange: a standard setup; a spy prepareModelJob returning
 *   { error: new Error('Insufficient funds for this operation.'), retriable: false };
 *   a spy retryJob.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  DB update on dialectic_generation_jobs with status 'failed' and
 *   error_details.code 'INSUFFICIENT_FUNDS'; retryJob spy call count 0.
 */
Deno.test('processSimpleJob - INSUFFICIENT_FUNDS from prepareModelJob PrepareModelJobErrorReturn is classified immediately', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'insufficient-funds' });

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => ({
      error: new Error('Insufficient funds for this operation.'),
      retriable: false,
    }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async () => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await assertRejects(
    () =>
      processSimpleJob(
        mockSetup.client as unknown as SupabaseClient<Database>,
        executeJob,
        'owner-insufficient-funds',
        ctx,
        'auth-insufficient-funds',
      ),
    Error,
    'Insufficient funds for this operation.',
  );

  // Assert
  assertEquals(retrySpy.calls.length, 0);

  const updateSpy = mockSetup.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  if (!updateSpy) {
    throw new Error('expected update spy on dialectic_generation_jobs');
  }
  assertEquals(updateSpy.callCount, 1);
  const updateArgs = updateSpy.callsArgs[0];
  const updateData = updateArgs[0] as Record<string, unknown>;
  assertEquals(updateData.status, 'failed');
  const errorDetails = updateData.error_details as Record<string, unknown>;
  assertEquals(errorDetails.code, 'INSUFFICIENT_FUNDS');
});

/**
 * Contract: processSimpleJob does not call ctx.gatherArtifacts until
 *   ctx.promptAssembler.assemble has resolved.
 * Arrange: a standard setup; a spy promptAssembler.assemble returning a promise
 *   controlled by a deferred (not yet resolved); a spy gatherArtifacts.
 * Act:     call processSimpleJob(...) — it awaits the assemble promise.
 * Assert:  before resolving the deferred, gatherArtifacts spy call count is 0;
 *   after resolving the deferred, gatherArtifacts spy call count is 1.
 */
Deno.test('processSimpleJob - gatherArtifacts is called after promptAssembler.assemble resolves', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'gather-after-assemble' });

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
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    promptAssembler,
    gatherArtifacts: gatherSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  const jobPromise = processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-gather-after-assemble',
    ctx,
    'auth-gather-after-assemble',
  );

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
 * Contract: given a gatherArtifacts that returns GatherArtifactsSuccessReturn
 *   with specific artifacts, processSimpleJob flows those artifacts unchanged
 *   into promptConstructionPayload.resourceDocuments passed to prepareModelJob.
 * Arrange: a standard setup; a spy gatherArtifacts returning
 *   { artifacts: [doc0, doc1] } where each doc has distinct identifiable fields;
 *   a spy prepareModelJob capturing the payload.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  prepareModelJob spy received promptConstructionPayload.resourceDocuments
 *   deep-equal to [doc0, doc1].
 */
Deno.test('processSimpleJob - gatherArtifacts success flows artifacts into prepareModelJob promptConstructionPayload.resourceDocuments', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'gather-flow' });

  const doc0: ResourceDocument = {
    id: 'doc-0-gather-flow',
    content: 'content-0',
    document_key: 'business_case',
    stage_slug: 'thesis',
    type: 'document',
  };
  const doc1: ResourceDocument = {
    id: 'doc-1-gather-flow',
    content: 'content-1',
    document_key: 'feature_spec',
    stage_slug: 'antithesis',
    type: 'document',
  };
  const expectedArtifacts = [doc0, doc1];

  const gatherSpy: Spy<BoundGatherArtifactsFn> = spy(
    async (): Promise<GatherArtifactsSuccessReturn> => ({ artifacts: expectedArtifacts }),
  );

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    gatherArtifacts: gatherSpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-gather-flow',
    ctx,
    'auth-gather-flow',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 1);
  const preparePayload = prepareSpy.calls[0].args[1];
  assertEquals(preparePayload.promptConstructionPayload.resourceDocuments, expectedArtifacts);
});

/**
 * Contract: given a gatherArtifacts that returns GatherArtifactsErrorReturn
 *   with retriable: false and a generic required-document error message,
 *   processSimpleJob skips prepareModelJob and enters the retry path
 *   (calls ctx.retryJob).
 * Arrange: a standard setup; a spy gatherArtifacts returning
 *   { error: new Error('Required input document missing'), retriable: false };
 *   a spy prepareModelJob; a spy retryJob.
 * Act:     processSimpleJob(dbClient, job, owner, ctx, authToken).
 * Assert:  prepareModelJob spy call count 0; retryJob spy call count 1.
 */
Deno.test('processSimpleJob - gatherArtifacts required-document error skips prepareModelJob and enters retry path', async () => {
  // Arrange
  resetMockNotificationService();

  const { mockSetup, executeJob } = createStandardTestSetup({ testPrefix: 'gather-err-retry' });

  const gatherSpy: Spy<BoundGatherArtifactsFn> = spy(
    async (): Promise<GatherArtifactsErrorReturn> => ({
      error: new Error('Required input document missing'),
      retriable: false,
    }),
  );

  const prepareSpy = spy(
    async (_params: PrepareModelJobParams, _payload: PrepareModelJobPayload): Promise<PrepareModelJobSuccessReturn> =>
      ({ queued: true }),
  );

  const retrySpy: Spy<RetryJobFn> = spy(
    async (
      _deps,
      _dbClient,
      _job,
      _currentAttempt,
      _failedAttempts,
      _projectOwnerUserId,
    ) => ({ error: undefined }),
  );

  const baseParams = createMockJobContextParams({
    prepareModelJob: prepareSpy,
    gatherArtifacts: gatherSpy,
    retryJob: retrySpy,
  });
  const ctx = createJobContext(baseParams);

  // Act
  await processSimpleJob(
    mockSetup.client as unknown as SupabaseClient<Database>,
    executeJob,
    'owner-gather-err-retry',
    ctx,
    'auth-gather-err-retry',
  );

  // Assert
  assertEquals(prepareSpy.calls.length, 0);
  assertEquals(retrySpy.calls.length, 1);
});