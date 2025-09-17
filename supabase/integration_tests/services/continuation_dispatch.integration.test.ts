import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  setSharedAdminClient,
  testLogger,
} from "../../functions/_shared/_integration.test.utils.ts";
import { type Database } from "../../functions/types_db.ts";
import { type IDialecticJobDeps, type GenerateContributionsPayload } from "../../functions/dialectic-service/dialectic.interface.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { getAiProviderAdapter } from "../../functions/_shared/ai_service/factory.ts";
import { DummyAdapter } from "../../functions/_shared/ai_service/dummy_adapter.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { callUnifiedAIModel } from "../../functions/dialectic-service/callModel.ts";
import { PromptAssembler } from "../../functions/_shared/prompt-assembler.ts";
import { RagService } from "../../functions/_shared/services/rag_service.ts";
import { IndexingService, LangchainTextSplitter, EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { TokenWalletService } from "../../functions/_shared/services/tokenWalletService.ts";
import { getGranularityPlanner } from "../../functions/dialectic-worker/strategies/granularity.strategies.ts";
import { getAiProviderConfig } from "../../functions/dialectic-worker/processComplexJob.ts";
import { countTokens } from "../../functions/_shared/utils/tokenizer_utils.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { handleJob } from "../../functions/dialectic-worker/index.ts";
import { isDialecticJobPayload, hasModelResultWithContributionId } from "../../functions/_shared/utils/type_guards.ts";

let adminClient: SupabaseClient<Database>;
let testDeps: IDialecticJobDeps;
let primaryUser: User;
let primaryUserJwt: string;
let testWalletId: string;
let modelAId: string;
let modelBId: string;

const pollForCondition = async (
  condition: () => Promise<boolean>,
  timeoutMessage: string,
  interval = 300,
  timeout = 5000,
) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Timeout waiting for condition: ${timeoutMessage}`);
};

Deno.test(
  "Continuation dispatch integration test",
  { sanitizeOps: false, sanitizeResources: false },
  async (t) => {
    await t.step("Setup", async () => {
      adminClient = initializeSupabaseAdminClient();
      setSharedAdminClient(adminClient);
      initializeTestDeps();

      const { userId, userClient, jwt } = await coreCreateAndSetupTestUser();
      primaryUserJwt = jwt;
      const { data: { user } } = await userClient.auth.getUser();
      assertExists(user);
      primaryUser = user;

      // Ensure wallet
      await coreEnsureTestUserAndWallet(user.id, 1000000000, 'local');
      const realWallet = new TokenWalletService(userClient, adminClient);
      const contextWallet = await realWallet.getWalletForContext(user.id, undefined);
      if (!contextWallet) {
        throw new Error('Expected a token wallet for test user');
      }
      testWalletId = contextWallet.walletId;

      // Fetch two providers from DB
      const requiredProviders = ['openai-gpt-4.1', 'anthropic-claude-3-7-sonnet-20250219'];
      const { data: fetchedProviders, error: providersError } = await adminClient
        .from('ai_providers')
        .select('id, api_identifier')
        .in('api_identifier', requiredProviders);
      assert(!providersError, `Failed to fetch AI providers: ${providersError?.message}`);
      assertExists(fetchedProviders);
      const modelA = fetchedProviders.find(p => p.api_identifier === 'openai-gpt-4.1');
      const modelB = fetchedProviders.find(p => p.api_identifier === 'anthropic-claude-3-7-sonnet-20250219');
      assertExists(modelA);
      assertExists(modelB);
      modelAId = modelA.id;
      modelBId = modelB.id;

      // Wire deps (similar to pipeline test)
      const { data: embeddingProvider } = await adminClient
        .from('ai_providers')
        .select('*')
        .eq('is_default_embedding', true)
        .single();
      assertExists(embeddingProvider);
      const embeddingAdapter = getAiProviderAdapter({ provider: embeddingProvider, apiKey: 'sk-dummy', logger: testLogger, providerMap: { 'openai-': DummyAdapter, 'anthropic-': DummyAdapter, 'google-': DummyAdapter, 'dummy-': DummyAdapter } });
      if (!embeddingAdapter) {
        throw new Error('Failed to create embedding adapter');
      }
      const embeddingClient = new EmbeddingClient(embeddingAdapter);
      const textSplitter = new LangchainTextSplitter();
      const realWalletService = new TokenWalletService(adminClient, adminClient);
      const indexingService = new IndexingService(adminClient, testLogger, textSplitter, embeddingClient, realWalletService);
      const ragService = new RagService({ dbClient: adminClient, logger: testLogger, indexingService, embeddingClient, tokenWalletService: realWalletService });

      testDeps = {
        logger: testLogger,
        fileManager: new FileManagerService(adminClient, { constructStoragePath }),
        downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
        deleteFromStorage: () => Promise.resolve({ error: null }),
        getExtensionFromMimeType: () => ".md",
        randomUUID: () => crypto.randomUUID(),
        callUnifiedAIModel,
        getSeedPromptForStage: async () => ({ content: "seed", fullPath: "seed.md", bucket: "seed", path: "seed", fileName: "seed.md" }),
        continueJob: (await import("../../functions/dialectic-worker/continueJob.ts")).continueJob,
        retryJob: (await import("../../functions/dialectic-worker/retryJob.ts")).retryJob,
        notificationService: new NotificationService(adminClient),
        executeModelCallAndSave,
        ragService,
        indexingService,
        embeddingClient,
        planComplexStage: (await import("../../functions/dialectic-worker/task_isolator.ts")).planComplexStage,
        getGranularityPlanner,
        countTokens,
        getAiProviderConfig,
        promptAssembler: new PromptAssembler(adminClient),
        getAiProviderAdapter,
        tokenWalletService: realWalletService,
      };

      // Inject SIMULATE_MAX_TOKENS only on initial job for modelB
      const realExecute = testDeps.executeModelCallAndSave;
      const realCallUnified = testDeps.callUnifiedAIModel;
      if (!realCallUnified) {
        throw new Error('callUnifiedAIModel dependency is required for this test');
      }
      testDeps.callUnifiedAIModel = (chatApiRequest, userAuthToken, deps) => realCallUnified(chatApiRequest, userAuthToken, { ...(deps || {}), isTest: true });
      testDeps.executeModelCallAndSave = async (params) => {
        const { job } = params;
        const modified = { ...params, promptConstructionPayload: { ...params.promptConstructionPayload } };
        const base = typeof modified.promptConstructionPayload.currentUserPrompt === 'string' ? modified.promptConstructionPayload.currentUserPrompt : '';
        if (job && isDialecticJobPayload(job.payload)) {
          const isInitial = job.payload.target_contribution_id === undefined && (!job.payload.continuation_count || job.payload.continuation_count === 0);
          if (isInitial && job.payload.model_id === modelBId) {
            modified.promptConstructionPayload.currentUserPrompt = `${base}\nSIMULATE_MAX_TOKENS`;
          }
        }
        return realExecute(modified);
      };
    });

    let testSessionId = '';
    let testProjectId = '';

    await t.step("Create project and start session", async () => {
      // Minimal project creation via direct inserts is out of scope here; reuse your existing service if needed.
      // For brevity, we use the pipeline test approach: pick an existing domain and create project via service.
      const { data: domain } = await adminClient.from('dialectic_domains').select('id').eq('name', 'Software Development').single();
      assertExists(domain);
      const formData = new FormData();
      formData.append('projectName', 'Continuation Dispatch Test Project');
      formData.append('initialUserPromptText', 'Seed prompt content for continuation dispatch test.');
      formData.append('selectedDomainId', domain.id);
      const { createProject } = await import("../../functions/dialectic-service/createProject.ts");
      const { data: proj, error: projErr } = await createProject(formData, adminClient, primaryUser);
      if (projErr || !proj) {
        throw new Error(`Failed to create project: ${projErr?.message || 'no data returned'}`);
      }
      testProjectId = proj.id;

      const { startSession } = await import("../../functions/dialectic-service/startSession.ts");
      const { data: sess, error: sessErr } = await startSession(primaryUser, adminClient, { projectId: proj.id, selectedModelIds: [modelAId, modelBId], sessionDescription: 'Continuation Test' });
      if (sessErr || !sess) {
        throw new Error(`Failed to start session: ${sessErr?.message || 'no data returned'}`);
      }
      testSessionId = sess.id;
    });

    await t.step("Enqueue and run only initial thesis jobs (force one continuation)", async () => {
      const payload: GenerateContributionsPayload = {
        sessionId: testSessionId,
        stageSlug: 'thesis',
        iterationNumber: 1,
        projectId: testProjectId,
        continueUntilComplete: true,
        walletId: testWalletId,
      };
      const { data: jobData, error: creationError } = await generateContributions(adminClient, payload, primaryUser, testDeps, primaryUserJwt);
      if (creationError || !jobData) {
        throw new Error(`Error creating jobs: ${creationError?.message || 'no data returned'}`);
      }
      assertExists(jobData.job_ids);
      assertEquals(jobData.job_ids.length, 2);

      const { data: jobs, error: jobsError } = await adminClient.from('dialectic_generation_jobs').select('*').in('id', jobData.job_ids);
      assert(!jobsError);
      assertExists(jobs);

      // Diagnostics: verify JWT on initial jobs
      for (const job of jobs) {
        const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
        const hasJwt = payload && typeof payload.user_jwt === 'string' && payload.user_jwt.length > 0;
        console.log('[diag] initial_job', { id: job.id, status: job.status, hasJwt });
      }

      // Run only the two initial jobs via the worker handler
      for (const job of jobs) {
        await handleJob(adminClient, job, testDeps, primaryUserJwt);
      }

      // Diagnostics: list all jobs for session with status, key payload fields, and error details
      {
        const { data: postRunJobs } = await adminClient
          .from('dialectic_generation_jobs')
          .select('*')
          .eq('session_id', testSessionId)
          .order('created_at', { ascending: true });
        if (Array.isArray(postRunJobs)) {
          for (const j of postRunJobs) {
            const p = typeof j.payload === 'string' ? JSON.parse(j.payload) : j.payload;
            const err = typeof j.error_details === 'string' ? JSON.parse(j.error_details) : j.error_details;
            const info = {
              id: j.id,
              status: j.status,
              job_type: p?.job_type,
              model_id: p?.model_id,
              continueUntilComplete: p?.continueUntilComplete,
              continuation_count: p?.continuation_count,
              output_type: p?.output_type,
              has_user_jwt: !!(p && typeof p.user_jwt === 'string' && p.user_jwt.length > 0),
              target_contribution_id: p?.target_contribution_id,
              parent_job_id: j.parent_job_id,
              error_code: err?.code,
              error_message: err?.message,
            };
            console.log('[diag] post_run_job', info);
          }
        }
      }

      // Identify the continuation via target_contribution_id from the job that completed with needs_continuation
      // Find contribution id from the modelB job results
      const { data: modelBJob } = await adminClient.from('dialectic_generation_jobs').select('*').eq('session_id', testSessionId).eq('status', 'completed').order('created_at', { ascending: false }).limit(1).single();
      assertExists(modelBJob);
      const res = typeof modelBJob.results === 'string' ? JSON.parse(modelBJob.results) : modelBJob.results;
      assertExists(res);
      assert(hasModelResultWithContributionId(res));
      const targetContributionId = res.modelProcessingResult.contributionId;
      console.log('[diag] modelB_completed_job', { id: modelBJob.id, targetContributionId });

      // Assert continuation row exists in pending_continuation
      const { data: contRow } = await adminClient.from('dialectic_generation_jobs').select('*').eq('payload->>target_contribution_id', targetContributionId).single();
      assertExists(contRow, 'Continuation job row was not inserted');
      assertEquals(contRow.status, 'pending_continuation', 'Continuation should start in pending_continuation');

      // Diagnostics: verify JWT on continuation job
      const contPayload = typeof contRow.payload === 'string' ? JSON.parse(contRow.payload) : contRow.payload;
      const contHasJwt = contPayload && typeof contPayload.user_jwt === 'string' && contPayload.user_jwt.length > 0;
      console.log('[diag] continuation_job_created', { id: contRow.id, status: contRow.status, contHasJwt });

      // Rely on trigger: wait for it to move to processing and then to terminal
      await pollForCondition(async () => {
        const { data: r } = await adminClient.from('dialectic_generation_jobs').select('status').eq('id', contRow.id).single();
        const ready = !!r && (r.status === 'processing' || r.status === 'completed' || r.status === 'retry_loop_failed' || r.status === 'failed');
        if (r) console.log('[diag] continuation_status_poll_1', { id: contRow.id, status: r.status, ready });
        return ready;
      }, 'Continuation should be picked up by worker and reach processing');

      await pollForCondition(async () => {
        const { data: r } = await adminClient.from('dialectic_generation_jobs').select('status').eq('id', contRow.id).single();
        const terminal = !!r && (r.status === 'completed' || r.status === 'retry_loop_failed' || r.status === 'failed');
        if (r) console.log('[diag] continuation_status_poll_2', { id: contRow.id, status: r.status, terminal });
        return terminal;
      }, 'Continuation should reach a terminal state');
    });

    await t.step("No leftover pending_continuation jobs", async () => {
      const { data: leftovers } = await adminClient
        .from('dialectic_generation_jobs')
        .select('id')
        .eq('session_id', testSessionId)
        .eq('status', 'pending_continuation');
      assertExists(leftovers);
      assertEquals(leftovers.length, 0, 'No pending_continuation jobs should remain');
    });

    await t.step("Teardown", async () => {
      await coreCleanupTestResources();
    });
  },
);


