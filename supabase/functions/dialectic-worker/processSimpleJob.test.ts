import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { Database, Tables, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
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
    DialecticSession, 
    DialecticContributionRow, 
    SelectedAiProvider, 
    DialecticJobPayload,
    DialecticExecuteJobPayload,
    ExecuteModelCallAndSaveParams, 
    DialecticRecipeTemplateStep,
    DialecticStageRecipeStep,
    OutputRule,
    InputRule,
    RelevanceRule,
    UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import { resetMockNotificationService, mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { MockPromptAssembler, MOCK_ASSEMBLED_PROMPT } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';
import { FileType, ModelContributionUploadContext } from '../_shared/types/file_manager.types.ts';
import { createJobContext, createExecuteJobContext } from './createJobContext.ts';
import { IJobContext, IExecuteJobContext, JobContextParams } from './JobContext.interface.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';
// Helper: wrap a PromptAssembler to forbid direct calls to legacy methods
function wrapAssemblerForbidLegacy<T extends object>(assembler: T): T {
  const forbidden = new Set(['gatherContext', 'render', 'gatherInputsForStage', 'gatherContinuationInputs']);
  return new Proxy(assembler, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && forbidden.has(prop)) {
        throw new Error(`Forbidden direct call to promptAssembler.${prop}`);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const mockPayload: Json = {
  projectId: 'project-abc',
  sessionId: 'session-456',
  stageSlug: 'test-stage',
  model_id: 'model-def',
  iterationNumber: 1,
  continueUntilComplete: false,
  walletId: 'wallet-ghi',
  user_jwt: 'jwt.token.here',
  // Provide a resolvable recipe step by default so assembler is reached
  planner_metadata: { recipe_step_id: 'step-1', recipe_template_id: 'template-123' },
};

if (!isDialecticJobPayload(mockPayload)) {
  throw new Error("Test setup failed: mockPayload is not a valid DialecticJobPayload.");
}

const defaultStepSlug = 'test-stage';

// Define a type for our mock job for clarity
const mockJob: DialecticJobRow = {
  id: 'job-123',
  session_id: 'session-456',
  user_id: 'user-789',
  stage_slug: 'test-stage',
  iteration_number: 1,
  payload: mockPayload,
  status: 'pending',
  attempt_count: 0,
  max_retries: 3,
  created_at: new Date().toISOString(),
  parent_job_id: null,
  results: null,
  completed_at: null,
  error_details: null,
  started_at: null,
  target_contribution_id: null,
  prerequisite_job_id: null,
  is_test_job: false,
  job_type: 'PLAN',
};

const mockSessionData: DialecticSession = {
  id: 'session-456',
  project_id: 'project-abc',
  session_description: 'A mock session',
  user_input_reference_url: null,
  iteration_count: 1,
  selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
  status: 'in-progress',
  associated_chat_id: 'chat-789',
  current_stage_id: 'stage-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockProviderData: SelectedAiProvider = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
};

const mockContribution: DialecticContributionRow = {
    id: 'contrib-123',
    session_id: 'session-456',
    stage: 'test-stage',
    iteration_number: 1,
    model_id: 'model-def',
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: 'model_contribution_main',
    created_at: new Date().toISOString(),
    error: null,
    file_name: 'test.txt',
    mime_type: 'text/plain',
    model_name: 'Mock AI',
    original_model_contribution_id: null,
    processing_time_ms: 100,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 100,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    target_contribution_id: null,
    tokens_used_input: 10,
    tokens_used_output: 20,
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
};


const setupMockClient = (configOverrides: Record<string, any> = {}) => {
    const mockProject: Tables<'dialectic_projects'> & { dialectic_domains: Pick<Tables<'dialectic_domains'>, 'id' | 'name' | 'description'> } = {
        id: 'project-abc',
        user_id: 'user-789',
        project_name: 'Test Project',
        initial_user_prompt: 'Test prompt',
        selected_domain_id: 'domain-123',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        initial_prompt_resource_id: null,
        process_template_id: 'template-123',
        repo_url: null,
        selected_domain_overlay_id: null,
        user_domain_overlay_values: null,
        dialectic_domains: {
            id: 'domain-123',
            name: 'Test Domain',
            description: 'A domain for testing',
        }
    };

    const mockStage: Tables<'dialectic_stages'> & { system_prompts: { id: string; prompt_text: string } | null } = {
        id: 'stage-1',
        slug: 'test-stage',
        display_name: 'Test Stage',
        created_at: new Date().toISOString(),
        default_system_prompt_id: 'prompt-123',
        description: null,
        expected_output_template_ids: [],
        system_prompts: {
            id: 'prompt-123',
            prompt_text: 'This is the base system prompt for the test stage.',
        },
        active_recipe_instance_id: null,
        recipe_template_id: 'template-123',
    };

    const templateInputsRequired: InputRule[] = [
        {
            type: 'document',
            slug: defaultStepSlug,
            document_key: FileType.business_case,
            required: true,
            section_header: 'Business Case Inputs',
        },
        {
            type: 'document',
            slug: defaultStepSlug,
            document_key: FileType.feature_spec,
            required: true,
        },
        {
            type: 'header_context',
            slug: defaultStepSlug,
            document_key: FileType.HeaderContext,
            required: true,
            section_header: 'Planner Context',
        },
    ];

    const templateInputsRelevance: RelevanceRule[] = [
        { document_key: FileType.business_case, slug: defaultStepSlug, relevance: 1, type: 'document' },
        { document_key: FileType.feature_spec, slug: defaultStepSlug, relevance: 0.85, type: 'document' },
        { document_key: FileType.HeaderContext, slug: defaultStepSlug, relevance: 0.75 },
    ];

    const templateOutputsRequired: OutputRule = {
        system_materials: {
            stage_rationale: 'Align business case with feature spec for this iteration.',
            executive_summary: 'Summarize the dialectic findings across artifacts.',
            input_artifacts_summary: 'Business case + feature spec + header context.',
            quality_standards: ['Tie evidence directly to documents', 'Preserve prior commitments'],
            validation_checkpoint: ['All referenced artifacts exist', 'Instructions follow dependency order'],
            document_order: ['business_case'],
            current_document: 'business_case',
        },
        header_context_artifact: {
            type: 'header_context',
            document_key: 'header_context',
            artifact_class: 'header_context',
            file_type: 'json',
        },
        context_for_documents: [
            {
                document_key: FileType.business_case,
                content_to_include: {
                    focus: 'doc-centric deliverable summary',
                    reasoning_chain: true,
                },
            },
        ],
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

    const stageInputsRequired: InputRule[] = [
        {
            type: 'document',
            slug: defaultStepSlug,
            document_key: FileType.business_case,
            required: true,
        },
        {
            type: 'document',
            slug: defaultStepSlug,
            document_key: FileType.feature_spec,
            required: true,
        },
        {
            type: 'header_context',
            slug: defaultStepSlug,
            document_key: FileType.HeaderContext,
            required: true,
        },
    ];

    const stageInputsRelevance: RelevanceRule[] = [
        { document_key: FileType.business_case, slug: defaultStepSlug, relevance: 1 },
        { document_key: FileType.feature_spec, slug: defaultStepSlug, relevance: 0.85 },
        { document_key: FileType.HeaderContext, slug: defaultStepSlug, relevance: 0.75 },
    ];

    const stageOutputsRequired: OutputRule = {
        system_materials: {
            stage_rationale: 'Align business case with feature spec for this iteration.',
            executive_summary: 'Summarize the dialectic findings across artifacts.',
            input_artifacts_summary: 'Business case + feature spec + header context.',
            validation_checkpoint: ['All referenced artifacts exist', 'Instructions follow dependency order'],
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
            },
        ],
    };
    
    return createMockSupabaseClient('user-789', {
        genericMockResults: {
            dialectic_projects: {
                select: () => Promise.resolve({ data: [mockProject], error: null }),
            },
            dialectic_stages: {
                select: () => Promise.resolve({ data: [mockStage], error: null }),
            },
            dialectic_sessions: {
                select: () => Promise.resolve({ data: [mockSessionData], error: null }),
            },
            ai_providers: {
                select: () => Promise.resolve({ data: [mockProviderData], error: null }),
            },
            dialectic_contributions: {
                select: () => Promise.resolve({ data: [mockContribution], error: null }),
            },
            // Default overlays present so happy-path flows proceed
            domain_specific_prompt_overlays: {
                select: () => Promise.resolve({
                    data: [
                        {
                            overlay_values: {
                                role: 'senior product strategist',
                                stage_instructions: 'baseline',
                                style_guide_markdown: '# Guide',
                                expected_output_artifacts_json: '{}',
                            },
                        },
                    ],
                    error: null,
                }),
            },
            // Provide default template step rows for recipe resolution by ID or by (template_id, step_slug)
            dialectic_recipe_template_steps: {
                select: (state: any) => {
                    const defaultStep: DialecticRecipeTemplateStep = {
                        id: 'step-1',
                        template_id: 'template-123',
                        step_number: 1,
                        step_key: 'seed',
                        step_slug: 'seed',
                        step_name: 'Doc-centric execution step',
                        step_description: 'Generate the main business case document.',
                        job_type: 'EXECUTE',
                        prompt_type: 'Turn',
                        prompt_template_id: 'prompt-123',
                        output_type: FileType.business_case,
                        granularity_strategy: 'per_source_document',
                        inputs_required: templateInputsRequired,
                        inputs_relevance: templateInputsRelevance,
                        outputs_required: templateOutputsRequired,
                        parallel_group: null,
                        branch_key: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };
                    // Match by id
                    const hasIdEq = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'id' && f.value === 'step-1');
                    if (hasIdEq) {
                        return Promise.resolve({ data: [defaultStep], error: null });
                    }
                    // Match by template_id and step_slug
                    const hasTemplate = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'template_id' && f.value === 'template-123');
                    const hasSlug = Array.isArray(state?.filters) && state.filters.some((f: any) => f.type === 'eq' && f.column === 'step_slug' && typeof f.value === 'string');
                    if (hasTemplate && hasSlug) {
                        return Promise.resolve({ data: [defaultStep], error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
            },
            dialectic_stage_recipe_steps: {
                select: (state: any) => {
                    const defaultStageStep: DialecticStageRecipeStep = {
                        id: 'stage-step-1',
                        instance_id: 'instance-1',
                        template_step_id: 'step-1',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        step_key: 'seed',
                        step_slug: 'seed',
                        step_name: 'Doc-centric execution step',
                        step_description: 'Generate the main business case document.',
                        job_type: 'EXECUTE',
                        prompt_type: 'Turn',
                        output_type: FileType.business_case,
                        granularity_strategy: 'per_source_document',
                        inputs_required: stageInputsRequired,
                        inputs_relevance: stageInputsRelevance,
                        outputs_required: stageOutputsRequired,
                        config_override: { temperature: 0.2 },
                        object_filter: { branch_key: 'business_case' },
                        output_overrides: { document_key: FileType.business_case },
                        is_skipped: false,
                        parallel_group: null,
                        branch_key: null,
                        prompt_template_id: 'prompt-123',
                        execution_order: 1,
                    };

                    const filters = Array.isArray(state?.filters) ? state.filters : [];
                    const matchesId = filters.some((f: any) => f.type === 'eq' && f.column === 'id' && f.value === defaultStageStep.id);
                    if (matchesId) {
                        return Promise.resolve({ data: [defaultStageStep], error: null });
                    }

                    const matchesInstance = filters.some((f: any) => f.type === 'eq' && f.column === 'instance_id' && f.value === defaultStageStep.instance_id);
                    const matchesSlug = filters.some((f: any) => f.type === 'eq' && f.column === 'step_slug' && typeof f.value === 'string');
                    if (matchesInstance && matchesSlug) {
                        return Promise.resolve({ data: [defaultStageStep], error: null });
                    }

                    return Promise.resolve({ data: [], error: null });
                },
            },
            ...configOverrides,
        },
    });
};

const getMockDeps = (overrideParams?: Partial<JobContextParams>): { promptAssembler: MockPromptAssembler, fileManager: MockFileManagerService, rootCtx: IJobContext } => {
    const mockParams = createMockJobContextParams();
    const finalParams = { ...mockParams, ...overrideParams };

    const rootCtx = createJobContext(finalParams);

    const promptAssembler = finalParams.promptAssembler as MockPromptAssembler;
    const fileManager = finalParams.fileManager as MockFileManagerService;

    return { promptAssembler, fileManager, rootCtx };
};

Deno.test('processSimpleJob - Happy Path', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { promptAssembler, rootCtx } = getMockDeps();

    const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

    await t.step('should call the executor function with correct parameters', async () => {
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
        
        assertEquals(executeSpy.calls.length, 1, 'Expected executeModelCallAndSave to be called once');
        const [executorParams] = executeSpy.calls[0].args;
        
        assertEquals(executorParams.job.id, mockJob.id);
        assertEquals(executorParams.providerDetails.id, mockProviderData.id);
        
        assertEquals(executorParams.promptConstructionPayload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);
        assertEquals(executorParams.promptConstructionPayload.source_prompt_resource_id, MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id);
    });

    clearAllStubs?.();
});

Deno.test('processSimpleJob - emits execute_started at EXECUTE job start', async () => {
  resetMockNotificationService();
  const { client: dbClient, clearAllStubs } = setupMockClient();
  const { rootCtx } = getMockDeps();

  const executeJob: typeof mockJob = { ...mockJob, job_type: 'EXECUTE' };

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

Deno.test('processSimpleJob - does not call legacy promptAssembler methods directly', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const mockParams = createMockJobContextParams();
    const wrappedAssembler = wrapAssemblerForbidLegacy(mockParams.promptAssembler);
    const { rootCtx } = getMockDeps({ promptAssembler: wrappedAssembler });

    let threw = false;
    try {
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
    // Intended green behavior: should not attempt to call forbidden legacy methods
    assertEquals(threw, false, 'processSimpleJob must not invoke legacy assembler methods directly');

    clearAllStubs?.();
});

Deno.test('processSimpleJob - Failure with Retries Remaining', async (t) => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();

    const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => {
        return Promise.reject(new Error('Executor failed'));
    });

    const retryJobSpy = spy(rootCtx, 'retryJob');

    await t.step('should call retryJob when the executor fails', async () => {
        await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', rootCtx, 'auth-token');

        assertEquals(retryJobSpy.calls.length, 1, 'Expected retryJob to be called exactly once');
    });
    
    clearAllStubs?.();
    executorStub.restore();
});

Deno.test('processSimpleJob - Failure with No Retries Remaining', async (t) => {
    const { client: dbClient, spies, clearAllStubs } = setupMockClient();
    const { rootCtx } = getMockDeps();

    const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => {
        return Promise.reject(new Error('Executor failed consistently'));
    });

    const retryJobSpy = spy(rootCtx, 'retryJob');
    const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

    await t.step('should mark job as failed after exhausting all retries', async () => {
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
  const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => {
    return Promise.reject(new Error('Executor failed consistently'));
  });

  const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

  let threw = false;
  try {
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

  const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => Promise.resolve());

  const executeJob: typeof mockJob = { ...mockJob, job_type: 'EXECUTE' };

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

    const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => {
        return Promise.reject(new Error('Executor failed consistently'));
    });

    const jobWithNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

    await t.step('should send both internal and user-facing failure notifications', async () => {
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

    const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => {
        return Promise.reject(new ContextWindowError('Token limit exceeded during execution.'));
    });

    const retryJobSpy = spy(rootCtx, 'retryJob');

    await t.step('should fail the job immediately without retrying', async () => {
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

    const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

    await processSimpleJob(
        dbClient as unknown as SupabaseClient<Database>,
        { ...mockJob, payload: mockPayload },
        'user-789',
        rootCtx,
        'auth-token',
    );

    // Assert desired behavior for new contract
    assertEquals(promptAssembler.assemble.calls.length, 1);
    assertEquals(executeSpy.calls.length, 1, 'Expected executeModelCallAndSave to be called once');
    const [executorParams] = executeSpy.calls[0].args;
    assertEquals(
        executorParams.promptConstructionPayload.currentUserPrompt,
        MOCK_ASSEMBLED_PROMPT.promptContent,
        'currentUserPrompt should be set to the content from the assembled prompt',
    );
    assertEquals(
        executorParams.promptConstructionPayload.source_prompt_resource_id,
        MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id,
        'source_prompt_resource_id should be passed through from the assembled prompt',
    );

    clearAllStubs?.();
});

Deno.test('processSimpleJob - should call gatherContinuationInputs for a continuation job', async () => {    
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

    const continuationPayload: DialecticJobPayload = {
        ...mockPayload,
        target_contribution_id: continuationChunkId,
        stageSlug: stageSlug,
    };

    if (!isJson(continuationPayload)) {
        throw new Error("Test setup failed: continuationPayload is not a valid Json");
    }

    const continuationJob: DialecticJobRow & { payload: DialecticJobPayload } = {
        ...mockJob,
        payload: continuationPayload,
        target_contribution_id: continuationChunkId,
    };

    // The current implementation will throw an error because the mock for executeModelCallAndSave is not set up
    // to handle the return from gatherContinuationInputs. This is acceptable for the RED state,
    // as the primary assertion on the spy call will fail first.
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
    assertEquals(assembleOptions.continuationContent, "Please continue.");

    clearAllStubs?.();
});

Deno.test('processSimpleJob - should dispatch a correctly formed PromptConstructionPayload', async () => {
    const { client: dbClient, clearAllStubs } = setupMockClient();
    const { rootCtx, promptAssembler } = getMockDeps();
    
    // Arrange
    const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

    // Act
    await processSimpleJob(dbClient as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-789', rootCtx, 'auth-token');

    // Assert
    assertEquals(promptAssembler.assemble.calls.length, 1);
    assertEquals(executeSpy.calls.length, 1);
    const [executorParams] = executeSpy.calls[0].args;
    
    const payload = executorParams.promptConstructionPayload;
    assertEquals(payload.currentUserPrompt, MOCK_ASSEMBLED_PROMPT.promptContent);
    assertEquals(payload.source_prompt_resource_id, MOCK_ASSEMBLED_PROMPT.source_prompt_resource_id);
    // resourceDocuments are not implemented/synthesized in this job type
    assertEquals(payload.resourceDocuments.length, 0);

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
  
    const executeSpy = spy(rootCtx, 'executeModelCallAndSave');
  
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );
  
    const [executorParams] = executeSpy.calls[0].args;
    assertEquals(
      executorParams.promptConstructionPayload.currentUserPrompt,
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
  const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

  // Act
  let threw = false;
  try {
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
    'Expected no executeModelCallAndSave when stage overlays are missing (should fail fast)'
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
  const continuationPayload: DialecticJobPayload = {
    ...mockPayload,
    target_contribution_id: continuationContributionId,
  };

  if (!isJson(continuationPayload)) {
    throw new Error('Test setup failed: continuationPayload is not valid Json.');
  }

  const continuationJob: DialecticJobRow & { payload: DialecticJobPayload } = {
    ...mockJob,
    payload: continuationPayload,
    target_contribution_id: continuationContributionId,
  };

  const recordedCalls: ExecuteModelCallAndSaveParams[] = [];
  const executorStub = stub(rootCtx, 'executeModelCallAndSave', async (params: ExecuteModelCallAndSaveParams) => {
    recordedCalls.push(params);
  });

  try {
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      continuationJob,
      'user-789',
      rootCtx,
      'auth-token',
    );
  } catch (_e) {
    // Existing implementation may throw once executor runs; the recorded call is the RED signal.
  }

  assertEquals(recordedCalls.length, 1, 'Expected executeModelCallAndSave to be invoked once for continuation job.');
  const [executorParams] = recordedCalls;
  const payload = executorParams.promptConstructionPayload;

  assertEquals(
    payload.sourceContributionId,
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
  const continuationPayload: DialecticExecuteJobPayload = {
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'test-stage',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
    user_jwt: 'jwt.token.here',
    planner_metadata: { recipe_step_id: 'step-1', recipe_template_id: 'template-123' },
    prompt_template_id: 'prompt-123',
    output_type: FileType.business_case,
    canonicalPathParams: {
      contributionType: 'thesis',
      stageSlug: 'test-stage',
    },
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
  };

  if (!isJson(continuationPayload)) {
    throw new Error('Test setup failed: continuationPayload is not valid Json.');
  }
  const continuationJob = {
    ...mockJob,
    payload: continuationPayload,
    target_contribution_id: continuationContributionId,
  };

  const executorStub = stub(rootCtx, 'executeModelCallAndSave', async (params: ExecuteModelCallAndSaveParams) => {
    if (!isDialecticJobPayload(params.job.payload)) {
      throw new Error('Test setup failed: job payload is not DialecticJobPayload.');
    }
    const payloadCandidate = params.job.payload;
    if (!isDialecticExecuteJobPayload(payloadCandidate)) {
      throw new Error('Test setup failed: payload is not DialecticExecuteJobPayload.');
    }
    const payload = payloadCandidate;
    const promptContent = params.promptConstructionPayload.currentUserPrompt;
    if (typeof promptContent !== 'string' || promptContent.length === 0) {
      throw new Error('Test setup failed: prompt content missing for continuation job.');
    }

    const pathContext: ModelContributionUploadContext['pathContext'] = {
      projectId: payload.projectId,
      fileType: continuationPayload.output_type,
      sessionId: payload.sessionId,
      iteration: payload.iterationNumber,
      stageSlug: payload.stageSlug,
      contributionType: continuationPayload.canonicalPathParams.contributionType,
      modelSlug: params.providerDetails.api_identifier,
      attemptCount: params.job.attempt_count,
      isContinuation: true,
    };

    if (typeof continuationPayload.continuation_count === 'number') {
      pathContext.turnIndex = continuationPayload.continuation_count;
    }
    if (typeof params.promptConstructionPayload.sourceContributionId === 'string') {
      pathContext.sourceContributionId = params.promptConstructionPayload.sourceContributionId;
    }

    if(!payload.stageSlug) {
      throw new Error('Test setup failed: payload.stageSlug is missing.');
    }
    if(!payload.iterationNumber) {
      throw new Error('Test setup failed: payload.iterationNumber is missing.');
    }
    if(!continuationPayload.canonicalPathParams.contributionType) {
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
        sessionId: payload.sessionId,
        modelIdUsed: params.providerDetails.id,
        modelNameDisplay: params.providerDetails.name,
        stageSlug: payload.stageSlug,
        iterationNumber: payload.iterationNumber,
        contributionType: continuationPayload.canonicalPathParams.contributionType,
        tokensUsedInput: promptContent.length,
        tokensUsedOutput: 0,
        processingTimeMs: 0,
        source_prompt_resource_id: params.promptConstructionPayload.source_prompt_resource_id,
        target_contribution_id: payload.target_contribution_id,
        document_relationships: payload.document_relationships,
        isIntermediate: payload.isIntermediate,
      },
    };

    await fileManager.uploadAndRegisterFile(uploadContext);
  });

  const callUnifiedAIModelStub = stub(rootCtx, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
    content: JSON.stringify({
      sections: [],
      continuation_needed: false,
    }),
    finish_reason: 'stop',
    rawProviderResponse: { finish_reason: 'stop' },
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 5,
    processingTimeMs: 1,
  }));

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
  callUnifiedAIModelStub.restore();
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
  const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

  // Force final-attempt behavior to observe terminal failure status
  const jobNoRetries: DialecticJobRow = { ...mockJob, attempt_count: 3, max_retries: 3 };

  let threw = false;
  try {
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

  const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

  const planPayloadWithJwt = {
    ...mockPayload,
    user_jwt: 'jwt.token.here',
  };
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

  assertEquals(executeSpy.calls.length, 1, 'Expected executor to be called once');
  const [execArgs] = executeSpy.calls[0].args;
  const sentJobPayloadUnknown = execArgs.job.payload;
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
  const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

  const planPayloadNoJwt = {
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'test-stage',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
  } as DialecticJobPayload;
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
  const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => {
    return Promise.reject(new Error('Wallet is required to process model calls.'));
  });

  const retryJobSpy = spy(rootCtx, 'retryJob');

  // Act
  let threw = false;
  try {
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
  const executorStub = stub(rootCtx, 'executeModelCallAndSave', () => {
    return Promise.reject(new Error('Token wallet service is required for affordability preflight'));
  });

  const retryJobSpy = spy(rootCtx, 'retryJob');

  // Act
  let threw = false;
  try {
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
      executive_summary: 'Summarize execution intent.',
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

  const executeSpy = spy(rootCtx, 'executeModelCallAndSave');

  // Act
    await processSimpleJob(
      dbClient as unknown as SupabaseClient<Database>,
      { ...mockJob, payload: mockPayload },
      'user-789',
      rootCtx,
      'auth-token',
    );

  // Assert
  const [executorParams] = executeSpy.calls[0].args;
  assert('inputsRelevance' in executorParams && Array.isArray((executorParams).inputsRelevance));
  assert('inputsRequired' in executorParams && Array.isArray((executorParams).inputsRequired));

  const inputsRelevanceUnknown = (executorParams).inputsRelevance;
  const inputsRequiredUnknown = (executorParams).inputsRequired;

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