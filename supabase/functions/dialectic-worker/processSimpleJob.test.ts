import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { Database } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { 
  isDialecticExecuteJobPayload, 
  isDialecticJobPayload, 
  isJson, 
  isRecord,
} from '../_shared/utils/type_guards.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import { 
    DialecticJobRow, 
    DialecticJobPayload,
    DialecticExecuteJobPayload,
    DialecticRecipeTemplateStep,
    OutputRule,
} from '../dialectic-service/dialectic.interface.ts';
import type {
    PrepareModelJobParams,
    PrepareModelJobPayload,
    PrepareModelJobSuccessReturn,
} from './prepareModelJob/prepareModelJob.interface.ts';
import {
    isPrepareModelJobErrorReturn,
} from './prepareModelJob/prepareModelJob.guard.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { resetMockNotificationService, mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MOCK_ASSEMBLED_PROMPT } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { FileType, ModelContributionUploadContext } from '../_shared/types/file_manager.types.ts';
import { AssembledPrompt, AssemblePromptOptions } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
import type {
  GatherArtifactsErrorReturn,
  GatherArtifactsSuccessReturn,
} from './gatherArtifacts/gatherArtifacts.interface.ts';
import {
  mockPayload,
  mockJob,
  mockProviderData,
  defaultStepSlug,
  createPrepareModelJobSuccessReturn,
  assertPrepareModelJobTwoArgCall,
  setupMockClient,
  getMockDeps,
  buildProcessSimpleJobExecutePayload,
} from './processSimpleJob.mock.ts';

Deno.test('processSimpleJob - Happy Path', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { promptAssembler, rootCtx } = getMockDeps();

    const executeSpy = spy(rootCtx, 'prepareModelJob');

    await t.step('should call the executor function with correct parameters', async () => {
        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', rootCtx, 'auth-token');

        assertEquals(promptAssembler.assemble.calls.length, 1, 'Expected promptAssembler.assemble to be called once');
        const [assembleOptions] = promptAssembler.assemble.calls[0].args;
        assertExists(assembleOptions.job);
        assertEquals(assembleOptions.job.id, mockJob.id);
        // Ensure AssemblePromptOptions shape is correct
        assertExists(assembleOptions.project);
        assertExists(assembleOptions.session);
        assertExists(assembleOptions.stage);
        // stage.system_prompts and overlays should exist
        // Use 'in' checks to avoid type casting
        const stageVal = assembleOptions.stage;
        const hasRecipeStep = 'recipe_step' in stageVal;
        assertEquals(hasRecipeStep, true, 'StageContext must include recipe_step as required by the assembler contract');
        
        assertEquals(executeSpy.calls.length, 1, 'Expected prepareModelJob to be called once');
        const { params: pParams, payload: pPayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);

        assertEquals(pParams.job.id, mockJob.id);
        assertEquals(pParams.providerRow.id, mockProviderData.id);
        assertEquals(pParams.authToken, 'auth-token');
        assertEquals(pParams.projectOwnerUserId, 'user-789');

        assertEquals(pPayload.promptConstructionPayload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);
        assertEquals(pPayload.promptConstructionPayload.source_prompt_resource_id, MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id);
        assertEquals(pPayload.compressionStrategy, getSortedCompressionCandidates);
    });

    clearAllStubs?.();
});

Deno.test('processSimpleJob - emits execute_started at EXECUTE job start', async () => {
  resetMockNotificationService();
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  const executeJob: typeof mockJob = { ...mockJob, job_type: 'EXECUTE' };

  if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
    throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
  }
  await processSimpleJob(
    dbClient as unknown as SupabaseClient<Database>,
    { ...executeJob, payload: mockPayload },
    'user-789',
    rootCtx,
    'auth-token',
  );

  const calls = mockNotificationService.sendJobNotificationEvent.calls;
  const startedCall = calls.find((c) => isRecord(c.args[0]) && c.args[0].type === 'execute_started');
  assertExists(startedCall, 'execute_started event should be emitted');
  const [payloadArg, targetUserId] = startedCall.args;
  assertEquals(payloadArg.type, 'execute_started');
  assertEquals(payloadArg.sessionId, executeJob.session_id);
  assertEquals(payloadArg.stageSlug, executeJob.stage_slug);
  assertEquals(payloadArg.job_id, executeJob.id);
  assertEquals(payloadArg.step_key, 'seed');
  assertEquals(payloadArg.document_key, 'business_case');
  assertEquals(payloadArg.modelId, 'model-def');
  assertEquals(payloadArg.iterationNumber, 1);
  assertEquals(targetUserId, 'user-789');

  clearAllStubs?.();
});

Deno.test('processSimpleJob - Failure with Retries Remaining', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();

    const executorStub = stub(rootCtx, 'prepareModelJob', () => {
        return Promise.resolve({ error: new Error('Executor failed'), retriable: true });
    });

    const retryJobSpy = spy(rootCtx, 'retryJob');

    await t.step('should call retryJob when the executor fails', async () => {
        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', rootCtx, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 1, 'Expected retryJob to be called exactly once');
    });
    
    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - Failure with No Retries Remaining', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();

    const executorStub = stub(rootCtx, 'prepareModelJob', () => {
        return Promise.resolve({ error: new Error('Executor failed consistently'), retriable: true });
    });

    const retryJobSpy = spy(rootCtx, 'retryJob');
    const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

    await t.step('should mark job as failed after exhausting all retries', async () => {
        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...jobWithNoRetries, payload: mockPayload }, 'user-789', rootCtx, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called when retries are exhausted');

        const historicSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(historicSpies, "Job update spies should exist");
        
        const finalUpdateCallArgs = historicSpies.callsArgs.find(args => {
            const payload = args[0];
            return isRecord(payload) && payload.status === 'retry_loop_failed';
        });
        assertExists(finalUpdateCallArgs, "Final job status should be 'retry_loop_failed'");
    });

    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - emits job_failed document-centric notification on terminal failure', async () => {
  resetMockNotificationService();
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  // Force executor to fail so job reaches terminal failure path
  const executorStub = stub(rootCtx, 'prepareModelJob', () => {
    return Promise.resolve({ error: new Error('Executor failed consistently'), retriable: true });
  });

  const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

  let threw = false;
  try {
    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...jobWithNoRetries, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Expect a single document-centric job_failed event
  assertEquals(mockNotificationService.sendJobNotificationEvent.calls.length, 1, 'Expected job_failed notification to be emitted');
  const [payloadArg, targetUserId] = mockNotificationService.sendJobNotificationEvent.calls[0].args;
  assert(isRecord(payloadArg));
  assertEquals(payloadArg.type, 'job_failed');
  assertEquals(payloadArg.sessionId, mockPayload.sessionId);
  assertEquals(payloadArg.stageSlug, mockPayload.stageSlug);
  assertEquals(payloadArg.job_id, jobWithNoRetries.id);
  assertEquals(typeof payloadArg.step_key, 'string');
  assertEquals(payloadArg.step_key, 'seed');
  assertEquals(typeof payloadArg.document_key, 'string');
  assertEquals(payloadArg.modelId, mockPayload.model_id);
  assertEquals(payloadArg.iterationNumber, mockPayload.iterationNumber);
  assertEquals(targetUserId, 'user-789');

  executorStub.restore();
  clearAllStubs?.();
});

Deno.test('processSimpleJob - emits execute_started and execute_completed when EXECUTE job finishes all chunks', async () => {
  resetMockNotificationService();
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  const executorStub = stub(rootCtx, 'prepareModelJob', () =>
    Promise.resolve(createPrepareModelJobSuccessReturn()),
  );

  const executeJob: typeof mockJob = { ...mockJob, job_type: 'EXECUTE' };

  if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
    throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
  }
  await processSimpleJob(
    dbClient as unknown as SupabaseClient<Database>,
    { ...executeJob, payload: mockPayload },
    'user-789',
    rootCtx,
    'auth-token',
  );

  const calls = mockNotificationService.sendJobNotificationEvent.calls;
  assertEquals(calls.length, 2, 'Expected execute_started and execute_completed to be emitted');
  const startedCall = calls.find((c) => isRecord(c.args[0]) && c.args[0].type === 'execute_started');
  const completedCall = calls.find((c) => isRecord(c.args[0]) && c.args[0].type === 'execute_completed');
  assertExists(startedCall, 'execute_started event should be emitted');
  assertExists(completedCall, 'execute_completed event should be emitted');
  const started = startedCall.args[0];
  const completed = completedCall.args[0];
  assert(isRecord(started));
  assert(isRecord(completed));
  assertEquals(started.type, 'execute_started');
  assertEquals(started.sessionId, executeJob.session_id);
  assertEquals(started.step_key, 'seed');
  assertEquals(started.modelId, 'model-def');
  assertEquals(completed.type, 'execute_completed');
  assertEquals(completed.sessionId, executeJob.session_id);
  assertEquals(completed.step_key, 'seed');
  assertEquals(completed.modelId, 'model-def');
  assertEquals(completedCall.args[1], 'user-789');

  executorStub.restore();
  clearAllStubs?.();
});

Deno.test('processSimpleJob - emits internal and user-facing failure notifications when retries are exhausted', async (t) => {
    resetMockNotificationService();
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();

    const executorStub = stub(rootCtx, 'prepareModelJob', () => {
        return Promise.resolve({ error: new Error('Executor failed consistently'), retriable: true });
    });

    const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

    await t.step('should send both internal and user-facing failure notifications', async () => {
        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...jobWithNoRetries, payload: mockPayload },
            'user-789',
            rootCtx,
            'auth-token',
        );

        // RED expectation: internal event should be emitted once
        assertEquals(mockNotificationService.sendContributionGenerationFailedEvent.calls.length, 1, 'Expected internal failure event to be emitted');
        const [internalPayloadArg] = mockNotificationService.sendContributionGenerationFailedEvent.calls[0].args;
        assert(isRecord(internalPayloadArg) && internalPayloadArg.sessionId === mockPayload.sessionId);

        // Existing user-facing notification should still be sent
        assertEquals(mockNotificationService.sendContributionFailedNotification.calls.length, 1, 'Expected user-facing failure notification to be sent');
    });

    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - ContextWindowError Handling', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();

    const executorStub = stub(rootCtx, 'prepareModelJob', () => {
        return Promise.resolve({
            error: new ContextWindowError('Token limit exceeded during execution.'),
            retriable: false,
        });
    });

    const retryJobSpy = spy(rootCtx, 'retryJob');

    await t.step('should fail the job immediately without retrying', async () => {
        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', rootCtx, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called for a ContextWindowError');

        const updateSpy = spies.getLatestQueryBuilderSpies('dialectic_generation_jobs')?.update;
        assert(updateSpy, "Update spy should exist for dialectic_generation_jobs table");
        assertEquals(updateSpy.calls.length, 1, 'Expected a single update call to fail the job');
        
        const [updatePayload] = updateSpy.calls[0].args;
        assertEquals(updatePayload.status, 'failed');
        assert(isRecord(updatePayload.error_details) && typeof updatePayload.error_details.message === 'string' && updatePayload.error_details.message.includes('Context window limit exceeded'));
    });

    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - renders prompt template and omits systemInstruction when not provided (non-continuation)', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx, promptAssembler } = getMockDeps();

    const executeSpy = spy(rootCtx, 'prepareModelJob');

    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
        dbClient as unknown as SupabaseClient<Database>,
        { ...mockJob, payload: mockPayload },
        'user-789',
        rootCtx,
        'auth-token',
    );

    // Assert desired behavior for new contract
    assertEquals(promptAssembler.assemble.calls.length, 1);
    assertEquals(executeSpy.calls.length, 1, 'Expected prepareModelJob to be called once');
    const { payload: pPayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);
    assertEquals(
        pPayload.promptConstructionPayload.currentUserPrompt,
        MOCK_ASSEMBLED_PROMPT.promptContent,
        'currentUserPrompt should be set to the content from the assembled prompt',
    );
    assertEquals(
        pPayload.promptConstructionPayload.source_prompt_resource_id,
        MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id,
        'source_prompt_resource_id should be passed through from the assembled prompt',
    );

    clearAllStubs?.();
});

Deno.test('processSimpleJob - should assemble with sourceContributionId for a continuation job', async () => {    
  const trueRootId = 'true-root-id-for-test';
    const continuationChunkId = 'prev-contrib-id';
    const stageSlug = 'synthesis';

    const mockContinuationChunk = {
        id: continuationChunkId,
        stage: stageSlug,
        document_relationships: { [stageSlug]: trueRootId },
    };

    const { client: dbClient, clearAllStubs } = setupMockClient({
        dialectic_contributions: {
            select: { data: [mockContinuationChunk], error: null }
        }
    });
    const { rootCtx, promptAssembler } = getMockDeps();

    const continuationPayload: DialecticExecuteJobPayload = buildProcessSimpleJobExecutePayload({
        target_contribution_id: continuationChunkId,
        stageSlug: stageSlug,
    });

    if (!isJson(continuationPayload)) {
        throw new Error("Test setup failed: continuationPayload is not a valid Json");
    }

    const continuationJob: DialecticJobRow & { payload: DialecticJobPayload } = {
        ...mockJob,
        payload: continuationPayload,
        target_contribution_id: continuationChunkId,
    };

    // The mock prepareModelJob returns an error by default; continuation assembly is still asserted below.
    try {
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            continuationJob,
            'user-789',
            rootCtx,
            'auth-token'
        );
    } catch (_e) {
        // Silently catch the expected error to allow the spy assertion to proceed.
    }

    assertEquals(promptAssembler.assemble.calls.length, 1, "Expected assemble to be called once for a continuation job.");
    const [assembleOptions] = promptAssembler.assemble.calls[0].args;
    assertExists(assembleOptions.job);
    assertEquals(assembleOptions.sourceContributionId, continuationChunkId);

    clearAllStubs?.();
});

Deno.test('processSimpleJob - should dispatch a correctly formed PromptConstructionPayload', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx, promptAssembler } = getMockDeps();
    
    // Arrange
    const executeSpy = spy(rootCtx, 'prepareModelJob');

    // Act
    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', rootCtx, 'auth-token');

    // Assert
    assertEquals(promptAssembler.assemble.calls.length, 1);
    assertEquals(executeSpy.calls.length, 1);
    const { payload: jobPayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);

    const promptPayload = jobPayload.promptConstructionPayload;
    assertEquals(promptPayload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);
    assertEquals(promptPayload.source_prompt_resource_id, MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id);
    // resourceDocuments are not implemented/synthesized in this job type
    assertEquals(promptPayload.resourceDocuments.length, 0);

    clearAllStubs?.();
});

Deno.test('processSimpleJob - uses file-backed initial prompt when column empty', async () => {
    const fileBackedContent = 'Hello from file';
  
    // Arrange: project with empty initial_user_prompt and a valid resource id
    const { client: dbClient, clearAllStubs } = setupMockClient({
      dialectic_projects: {
        select: () =>
          Promise.resolve({
            data: [
              {
                id: 'project-abc',
                user_id: 'user-789',
                project_name: 'Test Project',
                initial_user_prompt: '',
                selected_domain_id: 'domain-123',
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                initial_prompt_resource_id: 'res-123',
                process_template_id: 'template-123',
                repo_url: null,
                selected_domain_overlay_id: null,
                user_domain_overlay_values: null,
                dialectic_domains: { id: 'domain-123', name: 'Test Domain', description: 'A domain for testing' },
              },
            ],
            error: null,
          }),
      },
      // IMPORTANT: .single() expects an array with exactly 1 record
      dialectic_project_resources: {
        select: (state: any) => {
          const isById =
            Array.isArray(state.filters) &&
            state.filters.some((f: any) => f.type === 'eq' && f.column === 'id' && f.value === 'res-123');
          if (isById) {
            return Promise.resolve({
              data: [{ storage_bucket: 'test-bucket', storage_path: 'projects/project-abc', file_name: 'initial.md' }],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
      },
    });
  
    const { rootCtx } = getMockDeps();
  
    // Stub storage download to return a proper ArrayBuffer and mimeType
    const blob = new Blob([fileBackedContent], { type: 'text/markdown' });
    const arrayBuffer: ArrayBuffer = await blob.arrayBuffer();
    const downloadStub = stub(rootCtx, 'downloadFromStorage', () =>
      Promise.resolve({ data: arrayBuffer, mimeType: blob.type, error: null })
    );
  
    const executeSpy = spy(rootCtx, 'prepareModelJob');
  
    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );
  
    const { payload: jobPayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);
    assertEquals(
      jobPayload.promptConstructionPayload.currentUserPrompt,
        MOCK_ASSEMBLED_PROMPT.promptContent,
      'currentUserPrompt should be the content from the assembled prompt',
    );
  
    downloadStub.restore();
    clearAllStubs?.();
  });

Deno.test('processSimpleJob - fails when stage overlays are missing (no render, no model call)', async () => {
  // Arrange: explicitly override overlays to be empty to trigger fail-fast path
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    domain_specific_prompt_overlays: {
      select: () => Promise.resolve({ data: [], error: null }),
    },
  });
  const { rootCtx } = getMockDeps();

  // We do not stub the assembler; we expect failure before render
  const executeSpy = spy(rootCtx, 'prepareModelJob');

  // Act
  let threw = false;
  try {
    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: executor must NOT be called when overlays are missing
  assertEquals(
    executeSpy.calls.length,
    0,
    'Expected no prepareModelJob when stage overlays are missing (should fail fast)'
  );

  // Assert: job is marked failed with explicit overlays-missing code
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'STAGE_CONFIG_MISSING_OVERLAYS'
    );
  });
  assertExists(
    failedUpdate,
    "Expected job to fail with code 'STAGE_CONFIG_MISSING_OVERLAYS' when overlays are missing"
  );
  assertEquals(threw, true);

  clearAllStubs?.();
});

Deno.test('processSimpleJob - forwards sourceContributionId for continuation uploads', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  const continuationContributionId = 'root-contrib-123';
  const continuationPayload: DialecticExecuteJobPayload = buildProcessSimpleJobExecutePayload({
    target_contribution_id: continuationContributionId,
  });

  if (!isJson(continuationPayload)) {
    throw new Error('Test setup failed: continuationPayload is not valid Json.');
  }

  const continuationJob: DialecticJobRow & { payload: DialecticJobPayload } = {
    ...mockJob,
    payload: continuationPayload,
    target_contribution_id: continuationContributionId,
  };

  const recordedCalls: PrepareModelJobParams[] = [];
  const recordedPayloads: PrepareModelJobPayload[] = [];
  const executorStub = stub(rootCtx, 'prepareModelJob', async (params: PrepareModelJobParams, jobPayload: PrepareModelJobPayload) => {
    recordedCalls.push(params);
    recordedPayloads.push(jobPayload);
    return createPrepareModelJobSuccessReturn();
  });

  await processSimpleJob(
    dbClient as unknown as SupabaseClient<Database>,
    continuationJob,
    'user-789',
    rootCtx,
    'auth-token',
  );

  assertEquals(recordedCalls.length, 1, 'Expected prepareModelJob to be invoked once for continuation job.');
  assertEquals(recordedPayloads.length, 1);
  const promptPayload = recordedPayloads[0].promptConstructionPayload;

  assertEquals(
    promptPayload.sourceContributionId,
    continuationContributionId,
    'PromptConstructionPayload must include sourceContributionId for continuation uploads.',
  );

  executorStub.restore();
  clearAllStubs?.();
});

Deno.test('processSimpleJob - continuations push sourceContributionId into FileManager path context', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx, fileManager } = getMockDeps();

  const continuationContributionId = 'root-contrib-456';
  const continuationPayload: DialecticExecuteJobPayload = buildProcessSimpleJobExecutePayload({
    prompt_template_id: 'prompt-123',
    output_type: FileType.business_case,
    inputs: {
      header_context: 'resource-1',
    },
    document_key: 'business_case',
    branch_key: null,
    parallel_group: null,
    document_relationships: { thesis: continuationContributionId },
    isIntermediate: false,
    target_contribution_id: continuationContributionId,
    continuation_count: 1,
  });

  if (!isJson(continuationPayload)) {
    throw new Error('Test setup failed: continuationPayload is not valid Json.');
  }
  const continuationJob = {
    ...mockJob,
    payload: continuationPayload,
    target_contribution_id: continuationContributionId,
  };

  const executorStub = stub(rootCtx, 'prepareModelJob', async (params: PrepareModelJobParams, jobPayload: PrepareModelJobPayload) => {
    if (!isDialecticJobPayload(params.job.payload)) {
      throw new Error('Test setup failed: job payload is not DialecticJobPayload.');
    }
    const payloadCandidate = params.job.payload;
    if (!isDialecticExecuteJobPayload(payloadCandidate)) {
      throw new Error('Test setup failed: payload is not DialecticExecuteJobPayload.');
    }
    const executePayload = payloadCandidate;
    const promptContent = jobPayload.promptConstructionPayload.currentUserPrompt;
    if (typeof promptContent !== 'string' || promptContent.length === 0) {
      throw new Error('Test setup failed: prompt content missing for continuation job.');
    }

    const pathContext: ModelContributionUploadContext['pathContext'] = {
      projectId: executePayload.projectId,
      fileType: continuationPayload.output_type,
      sessionId: executePayload.sessionId,
      iteration: executePayload.iterationNumber,
      stageSlug: executePayload.stageSlug,
      contributionType: continuationPayload.canonicalPathParams.contributionType,
      modelSlug: params.providerRow.api_identifier,
      attemptCount: params.job.attempt_count,
      isContinuation: true,
    };

    if (typeof continuationPayload.continuation_count === 'number') {
      pathContext.turnIndex = continuationPayload.continuation_count;
    }
    if (typeof jobPayload.promptConstructionPayload.sourceContributionId === 'string') {
      pathContext.sourceContributionId = jobPayload.promptConstructionPayload.sourceContributionId;
    }

    if (!executePayload.stageSlug) {
      throw new Error('Test setup failed: payload.stageSlug is missing.');
    }
    if (!executePayload.iterationNumber) {
      throw new Error('Test setup failed: payload.iterationNumber is missing.');
    }
    if (!continuationPayload.canonicalPathParams.contributionType) {
      throw new Error('Test setup failed: continuationPayload.canonicalPathParams.contributionType is missing.');
    }
    const uploadContext: ModelContributionUploadContext = {
      pathContext,
      fileContent: promptContent,
      mimeType: 'text/plain',
      sizeBytes: promptContent.length,
      userId: params.projectOwnerUserId,
      description: `Continuation upload for ${continuationPayload.stageSlug}`,
      contributionMetadata: {
        sessionId: executePayload.sessionId,
        modelIdUsed: params.providerRow.id,
        modelNameDisplay: params.providerRow.name,
        stageSlug: executePayload.stageSlug,
        iterationNumber: executePayload.iterationNumber,
        contributionType: continuationPayload.canonicalPathParams.contributionType,
        tokensUsedInput: promptContent.length,
        tokensUsedOutput: 0,
        processingTimeMs: 0,
        source_prompt_resource_id: jobPayload.promptConstructionPayload.source_prompt_resource_id,
        target_contribution_id: executePayload.target_contribution_id,
        document_relationships: executePayload.document_relationships,
        isIntermediate: executePayload.isIntermediate,
      },
    };

    await fileManager.uploadAndRegisterFile(uploadContext);
    return createPrepareModelJobSuccessReturn();
  });

  await processSimpleJob(
    dbClient as unknown as SupabaseClient<Database>,
    continuationJob,
    'user-789',
    rootCtx,
    'auth-token',
  );

  const uploadCalls = fileManager.uploadAndRegisterFile.calls;
  assertEquals(uploadCalls.length, 1, 'Expected FileManager upload to be invoked once for continuation jobs.');
  const [uploadContextArg] = uploadCalls[0].args;
  const pathContext = uploadContextArg.pathContext;
  assertEquals(
    pathContext.sourceContributionId,
    continuationContributionId,
    'FileManager pathContext must include sourceContributionId for continuation uploads.',
  );

  executorStub.restore();
  clearAllStubs?.();
});

Deno.test('processSimpleJob - fails when no initial prompt exists', async () => {
  resetMockNotificationService();
  // Arrange: project with no direct prompt and no resource id
  const { client: dbClient, spies, clearAllStubs } = setupMockClient({
    dialectic_projects: {
      select: () =>
        Promise.resolve({
          data: [
            {
              id: 'project-abc',
              user_id: 'user-789',
              project_name: 'Test Project',
              initial_user_prompt: '',
              selected_domain_id: 'domain-123',
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              initial_prompt_resource_id: null,
              process_template_id: 'template-123',
              repo_url: null,
              selected_domain_overlay_id: null,
              user_domain_overlay_values: null,
              dialectic_domains: { id: 'domain-123', name: 'Test Domain', description: 'A domain for testing' },
            },
          ],
          error: null,
        }),
    },
  });

  const { rootCtx } = getMockDeps();

  // Spy on executor to ensure it is NOT called when prompt is missing
  const executeSpy = spy(rootCtx, 'prepareModelJob');

  // Force final-attempt behavior to observe terminal failure status
  const jobNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

  let threw = false;
  try {
    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...jobNoRetries, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: model executor should not be called when no prompt exists
  assertEquals(executeSpy.calls.length, 0, 'Expected no model call when no initial prompt exists');

  // Assert: job enters failure path and is marked as failed at final attempt
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'INVALID_INITIAL_PROMPT'
    );
  });
  assertExists(failedUpdate, "Expected job to enter failure path with status 'failed' and INVALID_INITIAL_PROMPT code");

  // Assert notifications were emitted
  assertEquals(mockNotificationService.sendContributionGenerationFailedEvent.calls.length, 1, 'Expected internal failure event to be emitted');
  const [internalPayloadArg] = mockNotificationService.sendContributionGenerationFailedEvent.calls[0].args;
  assert(
    isRecord(internalPayloadArg) &&
      isRecord((internalPayloadArg).error) &&
      (internalPayloadArg).error.code === 'INVALID_INITIAL_PROMPT',
  );
  assertEquals(mockNotificationService.sendContributionFailedNotification.calls.length, 1, 'Expected user-facing failure notification to be sent');
  assertEquals(threw, true);

  clearAllStubs?.();
});

// =============================================================
// plan→execute must preserve user_jwt; missing user_jwt fails
// =============================================================
Deno.test('processSimpleJob - preserves payload.user_jwt when transforming plan to execute', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  const executeSpy = spy(rootCtx, 'prepareModelJob');

  const planPayloadWithJwt: DialecticExecuteJobPayload = buildProcessSimpleJobExecutePayload({
    user_jwt: 'jwt.token.here',
  });
  if (!isJson(planPayloadWithJwt) || !isDialecticJobPayload(planPayloadWithJwt)) {
    throw new Error('Test setup failed: planPayloadWithJwt invalid');
  }

    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: planPayloadWithJwt },
      'user-789',
      rootCtx,
      'auth-token',
    );

  assertEquals(executeSpy.calls.length, 1, 'Expected prepareModelJob to be called once');
  const { params: pmsParams } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);
  const sentJobPayloadUnknown = pmsParams.job.payload;
  let preserved = false;
  let preservedValue = '';
  if (isRecord(sentJobPayloadUnknown) && 'user_jwt' in sentJobPayloadUnknown) {
    const v = (sentJobPayloadUnknown)['user_jwt'];
    if (typeof v === 'string' && v.length > 0) {
      preserved = true;
      preservedValue = v;
    }
  }
  assertEquals(preserved, true);
  assertEquals(preservedValue, 'jwt.token.here');

  clearAllStubs?.();
});

Deno.test('processSimpleJob - missing user_jwt fails early and does not call executor', async () => {
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();
  const executeSpy = spy(rootCtx, 'prepareModelJob');

  const planPayloadNoJwt: DialecticExecuteJobPayload = buildProcessSimpleJobExecutePayload({
    user_jwt: '',
  });
  if (!isJson(planPayloadNoJwt) || !isDialecticJobPayload(planPayloadNoJwt)) {
    throw new Error('Test setup failed: planPayloadNoJwt invalid');
  }

  let threw = false;
  try {
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: planPayloadNoJwt },
      'user-789',
      rootCtx,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  assertEquals(executeSpy.calls.length, 0, 'Executor must not be called when user_jwt is missing');
  assert(threw);

  clearAllStubs?.();
});

Deno.test('processSimpleJob - Wallet missing is immediate failure (no retry)', async () => {
  resetMockNotificationService();
  const { client: dbClient, spies, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  // Arrange: executor surfaces wallet-required error
  const executorStub = stub(rootCtx, 'prepareModelJob', () => {
    return Promise.resolve({ error: new Error('Wallet is required to process model calls.'), retriable: false });
  });

  const retryJobSpy = spy(rootCtx, 'retryJob');

  // Act
  let threw = false;
  try {
    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: no retry attempts
  assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called when wallet is missing');

  // Assert: job marked as failed with WALLET_MISSING code
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'WALLET_MISSING'
    );
  });
  assertExists(failedUpdate, "Expected job to fail immediately with code 'WALLET_MISSING'");

  // Assert notifications
  assertEquals(mockNotificationService.sendContributionGenerationFailedEvent.calls.length, 1, 'Expected internal failure event to be emitted');
  const [internalPayloadArg] = mockNotificationService.sendContributionGenerationFailedEvent.calls[0].args;
  assert(
    isRecord(internalPayloadArg) &&
      internalPayloadArg.type === 'other_generation_failed' &&
      isRecord((internalPayloadArg).error) &&
      (internalPayloadArg).error.code === 'WALLET_MISSING'
  );
  assertEquals(mockNotificationService.sendContributionFailedNotification.calls.length, 1, 'Expected user-facing failure notification to be sent');
  assertEquals(threw, true);
  retryJobSpy.restore();
  executorStub.restore();
  clearAllStubs?.();
});

Deno.test('processSimpleJob - Preflight dependency missing is immediate failure (no retry)', async () => {
  resetMockNotificationService();
  const { client: dbClient, spies, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  // Arrange: executor surfaces preflight dependency error
  const executorStub = stub(rootCtx, 'prepareModelJob', () => {
    return Promise.resolve({
      error: new Error('Token wallet service is required for affordability preflight'),
      retriable: false,
    });
  });

  const retryJobSpy = spy(rootCtx, 'retryJob');

  // Act
  let threw = false;
  try {
    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );
  } catch (_e) {
    threw = true;
  }

  // Assert: no retry attempts
  assertEquals(retryJobSpy.calls.length, 0, 'Expected retryJob NOT to be called when preflight dependency is missing');

  // Assert: job marked as failed with INTERNAL_DEPENDENCY_MISSING code
  const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
  assertExists(jobsUpdateSpies, 'Job update spies should exist');
  const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
    const payload = args[0];
    return (
      isRecord(payload) &&
      payload.status === 'failed' &&
      isRecord(payload.error_details) &&
      (payload.error_details).code === 'INTERNAL_DEPENDENCY_MISSING'
    );
  });
  assertExists(failedUpdate, "Expected job to fail immediately with code 'INTERNAL_DEPENDENCY_MISSING'");

  // Assert notifications
  assertEquals(mockNotificationService.sendContributionGenerationFailedEvent.calls.length, 1, 'Expected internal failure event to be emitted');
  const [internalPayloadArg] = mockNotificationService.sendContributionGenerationFailedEvent.calls[0].args;
  assert(
    isRecord(internalPayloadArg) &&
      internalPayloadArg.type === 'other_generation_failed' &&
      isRecord((internalPayloadArg).error) &&
      (internalPayloadArg).error.code === 'INTERNAL_DEPENDENCY_MISSING'
  );
  assertEquals(mockNotificationService.sendContributionFailedNotification.calls.length, 1, 'Expected user-facing failure notification to be sent');

  // Assert thrown
  assertEquals(threw, true);
  retryJobSpy.restore();
  executorStub.restore();
  clearAllStubs?.();
});

Deno.test('processSimpleJob - forwards recipe_step inputs_relevance and inputs_required to executor', async () => {
  // Arrange: override recipe step to include non-empty inputs_required and inputs_relevance
  const customOutputsRequired: OutputRule = {
    system_materials: {
      stage_rationale: 'Ensure business-case alignment.',
      agent_notes_to_self: 'Summarize execution intent.',
      input_artifacts_summary: 'Business case, feature spec, header context.',
      document_order: ['business_case'],
      current_document: 'business_case',
    },
    header_context_artifact: {
      type: 'header_context',
      document_key: 'header_context',
      artifact_class: 'header_context',
      file_type: 'json',
    },
    documents: [
      {
        artifact_class: 'rendered_document',
        file_type: 'markdown',
        document_key: FileType.business_case,
        template_filename: 'business_case.md',
        content_to_include: {
          enforce_style: 'doc-centric',
        },
      },
    ],
  };
  const customStep: DialecticRecipeTemplateStep = {
    id: 'step-1',
    template_id: 'template-123',
    step_number: 1,
    step_key: 'doc_step',
    step_slug: 'doc-step',
    step_name: 'Doc-centric execution step',
    step_description: 'Test execution step with explicit inputs',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    prompt_template_id: 'prompt-123',
    output_type: FileType.business_case,
    granularity_strategy: 'per_source_document',
    inputs_required: [
      { type: 'document', slug: defaultStepSlug, document_key: FileType.business_case, required: true },
      { type: 'header_context', slug: defaultStepSlug, document_key: FileType.HeaderContext, required: true },
    ],
    inputs_relevance: [
      { document_key: FileType.business_case, slug: defaultStepSlug, relevance: 0.9, type: 'document' },
      { document_key: FileType.HeaderContext, slug: defaultStepSlug, relevance: 0.7 },
    ],
    outputs_required: customOutputsRequired,
    parallel_group: null,
    branch_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { client: dbClient, clearAllStubs } = setupMockClient({
    dialectic_recipe_template_steps: {
      select: () => Promise.resolve({ data: [customStep], error: null }),
    },
  });
  const { rootCtx } = getMockDeps();

  const executeSpy = spy(rootCtx, 'prepareModelJob');

  // Act
  if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
    throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
  }
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );

  // Assert
  const { payload: recipeJobPayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);
  assert(Array.isArray(recipeJobPayload.inputsRelevance));
  assert(Array.isArray(recipeJobPayload.inputsRequired));

  const inputsRelevanceUnknown = recipeJobPayload.inputsRelevance;
  const inputsRequiredUnknown = recipeJobPayload.inputsRequired;

  // Verify lengths
  assert(Array.isArray(inputsRelevanceUnknown) && inputsRelevanceUnknown.length === 2);
  assert(Array.isArray(inputsRequiredUnknown) && inputsRequiredUnknown.length === 2);

  // Verify selected identity fields are preserved verbatim
  const r0 = inputsRelevanceUnknown[0];
  const r1 = inputsRelevanceUnknown[1];
  assert(isRecord(r0) && r0.type === 'document' && r0.slug === defaultStepSlug);
  assert(isRecord(r1) && r1.document_key === 'header_context');

  const req0 = inputsRequiredUnknown[0];
  const req1 = inputsRequiredUnknown[1];
  assert(isRecord(req0) && req0.type === 'document');
  assert(isRecord(req1) && req1.document_key === 'header_context');

  clearAllStubs?.();
});

// --- Continuation message routing tests (Node 7) ---

const MOCK_CONTINUATION_ASSEMBLED: AssembledPrompt = {
    promptContent: 'fallback prompt content for non-message path',
    source_prompt_resource_id: 'mock-continuation-resource-id',
    messages: [
        { role: 'user', content: 'seed prompt content' },
        { role: 'assistant', content: 'assembled assistant content' },
        { role: 'user', content: 'continuation instruction' },
    ],
};

Deno.test('processSimpleJob - continuation message routing', async (t) => {

    await t.step('when assembled.messages is present with 3 messages, conversationHistory contains first two and currentUserPrompt is the third message content', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient();
        const { promptAssembler, rootCtx } = getMockDeps();

        promptAssembler.assemble = spy(
            async (_options: AssemblePromptOptions): Promise<AssembledPrompt> => {
                return MOCK_CONTINUATION_ASSEMBLED;
            },
        );

        const executeSpy = spy(rootCtx, 'prepareModelJob');

        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            rootCtx,
            'auth-token',
        );

        assertEquals(executeSpy.calls.length, 1, 'Expected prepareModelJob to be called once');
        const { payload: routePayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);
        const payload = routePayload.promptConstructionPayload;

        assertEquals(payload.conversationHistory.length, 2, 'conversationHistory should contain the first two messages');
        assertEquals(payload.conversationHistory[0].role, 'user');
        assertEquals(payload.conversationHistory[0].content, 'seed prompt content');
        assertEquals(payload.conversationHistory[1].role, 'assistant');
        assertEquals(payload.conversationHistory[1].content, 'assembled assistant content');
        assertEquals(payload.currentUserPrompt, 'continuation instruction');

        clearAllStubs?.();
    });

    await t.step('when assembled.messages is absent, conversationHistory is empty and currentUserPrompt is assembled.promptContent — existing behavior unchanged', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient();
        const { rootCtx } = getMockDeps();
        // Default mock returns MOCK_ASSEMBLED_PROMPT which has no messages field

        const executeSpy = spy(rootCtx, 'prepareModelJob');

        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            rootCtx,
            'auth-token',
        );

        assertEquals(executeSpy.calls.length, 1, 'Expected prepareModelJob to be called once');
        const { payload: routePayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);
        const payload = routePayload.promptConstructionPayload;

        assertEquals(payload.conversationHistory.length, 0, 'conversationHistory should be empty when messages is absent');
        assertEquals(payload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);

        clearAllStubs?.();
    });

    await t.step('when assembled.messages is present, source_prompt_resource_id is still populated from assembled — no regression', async () => {
        const { client: dbClient, clearAllStubs } = setupMockClient();
        const { promptAssembler, rootCtx } = getMockDeps();

        promptAssembler.assemble = spy(
            async (_options: AssemblePromptOptions): Promise<AssembledPrompt> => {
                return MOCK_CONTINUATION_ASSEMBLED;
            },
        );

        const executeSpy = spy(rootCtx, 'prepareModelJob');

        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            rootCtx,
            'auth-token',
        );

        assertEquals(executeSpy.calls.length, 1);
        const { payload: routePayload } = assertPrepareModelJobTwoArgCall(executeSpy.calls[0].args);

        assertEquals(
            routePayload.promptConstructionPayload.source_prompt_resource_id,
            MOCK_CONTINUATION_ASSEMBLED.source_prompt_resource_id,
            'source_prompt_resource_id must come from assembled regardless of message routing path',
        );

        clearAllStubs?.();
    });

    await t.step('prepareModelJob receives correctly routed promptConstructionPayload in both continuation and non-continuation paths', async () => {
        // --- Continuation path ---
        const { client: dbClient1, clearAllStubs: clear1 } = setupMockClient();
        const { promptAssembler: pa1, rootCtx: ctx1 } = getMockDeps();

        pa1.assemble = spy(
            async (_options: AssemblePromptOptions): Promise<AssembledPrompt> => {
                return MOCK_CONTINUATION_ASSEMBLED;
            },
        );

        const executeSpy1 = spy(ctx1, 'prepareModelJob');

        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(
            dbClient1 as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            ctx1,
            'auth-token',
        );

        const { payload: continuationJobPayload } = assertPrepareModelJobTwoArgCall(executeSpy1.calls[0].args);
        const continuationPayload = continuationJobPayload.promptConstructionPayload;
        assertEquals(continuationPayload.conversationHistory.length, 2, 'Continuation path: conversationHistory should have 2 entries');
        assertEquals(continuationPayload.currentUserPrompt, 'continuation instruction', 'Continuation path: currentUserPrompt should be third message content');
        assertEquals(continuationPayload.source_prompt_resource_id, MOCK_CONTINUATION_ASSEMBLED.source_prompt_resource_id);

        clear1?.();

        // --- Non-continuation path ---
        const { client: dbClient2, clearAllStubs: clear2 } = setupMockClient();
        const { rootCtx: ctx2 } = getMockDeps();

        const executeSpy2 = spy(ctx2, 'prepareModelJob');

        await processSimpleJob(
            dbClient2 as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            ctx2,
            'auth-token',
        );

        const { payload: nonContinuationJobPayload } = assertPrepareModelJobTwoArgCall(executeSpy2.calls[0].args);
        const nonContinuationPayload = nonContinuationJobPayload.promptConstructionPayload;
        assertEquals(nonContinuationPayload.conversationHistory.length, 0, 'Non-continuation path: conversationHistory should be empty');
        assertEquals(nonContinuationPayload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent, 'Non-continuation path: currentUserPrompt should be assembled.promptContent');
        assertEquals(nonContinuationPayload.source_prompt_resource_id, MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id);

        clear2?.();
    });
});

Deno.test('processSimpleJob - isPrepareModelJobErrorReturn recognizes prepareModelJob failure objects', () => {
    const insufficientReturn: unknown = {
        error: new Error('Insufficient funds for this operation'),
        retriable: false,
    };
    assertEquals(isPrepareModelJobErrorReturn(insufficientReturn), true);
});

Deno.test('processSimpleJob - INSUFFICIENT_FUNDS from prepareModelJob PrepareModelJobErrorReturn is classified immediately', async () => {
    resetMockNotificationService();
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();
    const prepareStub = stub(rootCtx, 'prepareModelJob', () =>
        Promise.resolve({
            error: new Error('Insufficient funds for this operation'),
            retriable: false,
        }),
    );
    const retryJobSpy = spy(rootCtx, 'retryJob');
    let threw = false;
    try {
        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            rootCtx,
            'auth-token',
        );
    } catch (_e) {
        threw = true;
    }
    assertEquals(retryJobSpy.calls.length, 0, 'INSUFFICIENT_FUNDS must not trigger retry');
    const jobsUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(jobsUpdateSpies);
    const failedUpdate = jobsUpdateSpies.callsArgs.find((args: unknown[]) => {
        const payload = args[0];
        return (
            isRecord(payload) &&
            payload.status === 'failed' &&
            isRecord(payload.error_details) &&
            (payload.error_details).code === 'INSUFFICIENT_FUNDS'
        );
    });
    assertExists(failedUpdate);
    assertEquals(threw, true);
    prepareStub.restore();
    clearAllStubs?.();
});

Deno.test('processSimpleJob - gatherArtifacts is called after promptAssembler.assemble resolves', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx, promptAssembler } = getMockDeps();
    const callOrder: string[] = [];

    promptAssembler.assemble = spy(
        async (_options: AssemblePromptOptions): Promise<AssembledPrompt> => {
            callOrder.push('assemble');
            return MOCK_ASSEMBLED_PROMPT;
        },
    );
    const gatherStub = stub(rootCtx, 'gatherArtifacts', async () => {
        callOrder.push('gatherArtifacts');
        const result: GatherArtifactsSuccessReturn = { artifacts: [] };
        return result;
    });
    const prepareSpy = spy(rootCtx, 'prepareModelJob');

    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
        dbClient as unknown as SupabaseClient<Database>,
        { ...mockJob, payload: mockPayload },
        'user-789',
        rootCtx,
        'auth-token',
    );

    assertEquals(gatherStub.calls.length, 1, 'Expected gatherArtifacts to be called once');
    assertEquals(prepareSpy.calls.length, 1, 'Expected prepareModelJob to be called once');
    assertEquals(callOrder.length >= 2, true, 'Expected assemble and gatherArtifacts call ordering to be captured');
    assertEquals(callOrder[0], 'assemble');
    assertEquals(callOrder[1], 'gatherArtifacts');

    gatherStub.restore();
    clearAllStubs?.();
});

Deno.test('processSimpleJob - gatherArtifacts success flows artifacts into prepareModelJob promptConstructionPayload.resourceDocuments', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();
    const gatheredArtifacts: GatherArtifactsSuccessReturn = {
        artifacts: [
            {
                id: 'artifact-1',
                content: 'artifact content',
                document_key: FileType.business_case,
                stage_slug: 'seed',
                type: 'document',
            },
        ],
    };

    const gatherStub = stub(rootCtx, 'gatherArtifacts', async () => {
        return gatheredArtifacts;
    });
    const prepareSpy = spy(rootCtx, 'prepareModelJob');

    if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
    }
    await processSimpleJob(
        dbClient as unknown as SupabaseClient<Database>,
        { ...mockJob, payload: mockPayload },
        'user-789',
        rootCtx,
        'auth-token',
    );

    assertEquals(gatherStub.calls.length, 1, 'Expected gatherArtifacts to be called once');
    assertEquals(prepareSpy.calls.length, 1, 'Expected prepareModelJob to be called once');
    const { payload: preparePayload } = assertPrepareModelJobTwoArgCall(prepareSpy.calls[0].args);
    assertEquals(
        preparePayload.promptConstructionPayload.resourceDocuments,
        gatheredArtifacts.artifacts,
        'Expected gathered artifacts to be forwarded to prepareModelJob prompt payload',
    );

    gatherStub.restore();
    clearAllStubs?.();
});

Deno.test('processSimpleJob - gatherArtifacts required-document error skips prepareModelJob and enters retry path', async () => {
    resetMockNotificationService();
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();
    const gatherErrorResult: GatherArtifactsErrorReturn = {
        error: new Error(
            "Required rendered document for input rule type 'document' with stage 'seed' and document_key 'business_case' was not found in dialectic_project_resources.",
        ),
        retriable: false,
    };
    const gatherStub = stub(rootCtx, 'gatherArtifacts', async () => {
        return gatherErrorResult;
    });
    const prepareSpy = spy(rootCtx, 'prepareModelJob');
    const retrySpy = spy(rootCtx, 'retryJob');

    let threw = false;
    try {
        if(!isJson(mockPayload) || !isDialecticExecuteJobPayload(mockPayload)) {
            throw new Error('Test setup failed: mockPayload is not a valid DialecticExecuteJobPayload');
        }
        await processSimpleJob(
            dbClient as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-789',
            rootCtx,
            'auth-token',
        );
    } catch (_e) {
        threw = true;
    }

    assertEquals(gatherStub.calls.length, 1, 'Expected gatherArtifacts to be called once');
    assertEquals(
        prepareSpy.calls.length,
        0,
        'prepareModelJob must not be called when gatherArtifacts returns an error',
    );
    assertEquals(
        retrySpy.calls.length,
        1,
        'gatherArtifacts required-document errors should enter existing retry classification flow',
    );
    assertEquals(threw, false);

    gatherStub.restore();
    retrySpy.restore();
    clearAllStubs?.();
});