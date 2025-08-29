import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  MOCK_MODEL_CONFIG,
  setSharedAdminClient,
  testLogger,
} from "../../functions/_shared/_integration.test.utils.ts";
import { type Database } from "../../functions/types_db.ts";
import { getAiProviderAdapter } from "../../functions/_shared/ai_service/factory.ts";
import {
  type GenerateContributionsPayload,
  type DialecticJobRow,
  type DialecticProject,
  type SubmitStageResponsesPayload,
  type StartSessionSuccessResponse,
  type StartSessionPayload,
  IDialecticJobDeps,
  ExecuteModelCallAndSaveParams,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { isDialecticJobPayload, isDialecticJobRow, hasModelResultWithContributionId } from "../../functions/_shared/utils/type_guards.ts";
import { type IJobProcessors } from "../../functions/dialectic-worker/processJob.ts";
import { processSimpleJob } from "../../functions/dialectic-worker/processSimpleJob.ts";
import { processComplexJob } from "../../functions/dialectic-worker/processComplexJob.ts";
import { planComplexStage } from "../../functions/dialectic-worker/task_isolator.ts";
import { handleJob } from "../../functions/dialectic-worker/index.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { callUnifiedAIModel } from "../../functions/dialectic-service/callModel.ts";
import { UploadContext, FileType, IFileManager } from "../../functions/_shared/types/file_manager.types.ts";
import { RagService } from "../../functions/_shared/services/rag_service.ts";
import { IndexingService, LangchainTextSplitter, EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { getGranularityPlanner } from '../../functions/dialectic-worker/strategies/granularity.strategies.ts';
import { countTokens } from '../../functions/_shared/utils/tokenizer_utils.ts';
import { getAiProviderConfig } from '../../functions/dialectic-worker/processComplexJob.ts';
import { PromptAssembler } from "../../functions/_shared/prompt-assembler.ts";
import { DummyAdapter } from "../../functions/_shared/ai_service/dummy_adapter.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { TokenWalletService } from "../../functions/_shared/services/tokenWalletService.ts";

// --- Test Suite Setup ---
let adminClient: SupabaseClient<Database>;
let primaryUserClient: SupabaseClient<Database>;
let testDeps: IDialecticJobDeps;

const pollForCondition = async (
  condition: () => Promise<boolean>,
  timeoutMessage: string,
  interval = 500,
  timeout = 2000,
) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition: ${timeoutMessage}`);
};

const pollForJobStatus = async (
    jobId: string,
    expectedStatus: string,
    timeoutMessage: string,
    interval = 500,
    timeout = 2000,
): Promise<DialecticJobRow> => {
    let job: DialecticJobRow | null = null;
    await pollForCondition(async () => {
        const { data, error } = await adminClient.from('dialectic_generation_jobs').select('*').eq('id', jobId).single();
        if (error) {
            testLogger.warn(`[pollForJobStatus] Error fetching job ${jobId}: ${error.message}`);
            return false;
        }
        job = data;
        return job?.status === expectedStatus;
    }, timeoutMessage, interval, timeout);

    assertExists(job, `Job ${jobId} was not found after polling.`);
    if (!isDialecticJobRow(job)) {
        throw new Error("Polled data is not a valid DialecticJobRow");
    }
    return job;
};

const executePendingDialecticJobs = async (
    sessionId: string,
    deps: IDialecticJobDeps,
    authToken: string
) => {
    const { data: pendingJobs, error } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);

    assert(!error, `Failed to fetch pending jobs: ${error?.message}`);
    assertExists(pendingJobs, "No pending jobs found to execute.");
    
    testLogger.info(`[Test Helper] Found ${pendingJobs.length} pending jobs to execute.`);

    for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
            throw new Error(`Fetched job is not a valid DialecticJobRow: ${JSON.stringify(job)}`);
        }
        testLogger.info(`[Test Helper] >>>> Executing job ${job.id} | Status: ${job.status} | Parent: ${job.parent_job_id || 'None'}`);
        await handleJob(adminClient, job, deps, authToken);
    }
};

const submitMockFeedback = async (
    sessionId: string,
    projectId: string,
    stageSlug: string,
    iterationNumber: number,
    userId: string,
    fileManager: IFileManager
) => {
    testLogger.info(`[Test Helper] Submitting mock feedback for stage: ${stageSlug}`);
    const feedbackContent = `This is mock user feedback for the ${stageSlug} stage.`;
    const uploadContext: UploadContext = {
        pathContext: {
            projectId,
            sessionId,
            iteration: iterationNumber,
            stageSlug,
            fileType: FileType.UserFeedback,
            originalFileName: `user_feedback_${stageSlug}.md`
        },
        fileContent: feedbackContent,
        mimeType: 'text/markdown',
        sizeBytes: feedbackContent.length,
        userId: userId,
        description: `Mock feedback for ${stageSlug}`,
        feedbackTypeForDb: 'consolidated_feedback',
    };

    const { record, error } = await fileManager.uploadAndRegisterFile(uploadContext);
    assert(!error, `Failed to upload mock feedback: ${error?.message}`);
    assertExists(record, "Mock feedback record was not created.");
    if (record) {
        testLogger.info(`[Test Helper] Mock feedback submitted successfully for stage: ${stageSlug}. Record ID: ${record.id}`);
    }
};


Deno.test(
  "Dialectic Pipeline Integration Test Suite",
  { sanitizeOps: false, sanitizeResources: false },
  async (t) => {
    let primaryUserId: string;
    let primaryUserJwt: string;
    let primaryUser: User;
    let testProject: DialecticProject | null = null;
    let testDomainId: string;
    let testSession: StartSessionSuccessResponse | null = null;
    let modelAId: string;
    let modelBId: string;
    let testWalletId: string;

    const setup = async () => {
        adminClient = initializeSupabaseAdminClient();
        setSharedAdminClient(adminClient);
        initializeTestDeps();
        
        const { userId, userClient, jwt } = await coreCreateAndSetupTestUser();
        primaryUserId = userId;
        primaryUserJwt = jwt;
        primaryUserClient = userClient;
        const { data: { user } } = await userClient.auth.getUser();
        assertExists(user, "Test user could not be created or fetched.");
        primaryUser = user;

        // Fetch existing resources instead of creating them
        const { data: domain, error: domainError } = await adminClient
          .from('dialectic_domains')
          .select('id')
          .eq('name', 'Software Development') // Assuming this domain exists
          .single();
        assert(!domainError, `Failed to fetch test domain: ${domainError?.message}`);
        assertExists(domain, "The 'Software Development' domain must exist in the database for this test to run.");
        testDomainId = domain.id;

        // --- Fetch AI Providers from DB, treating seed.sql as the source of truth ---
        // Use providers that are seeded as enabled and active
        const requiredProviders = ['openai-gpt-4', 'anthropic-claude-3-7-sonnet-20250219'];
        const { data: fetchedProviders, error: providersError } = await adminClient
          .from('ai_providers')
          .select('id, api_identifier')
          .in('api_identifier', requiredProviders);

        assert(!providersError, `Failed to fetch AI providers: ${providersError?.message}`);
        assert(fetchedProviders.length === requiredProviders.length, `Could not find all required AI providers. Found: ${fetchedProviders.map(p => p.api_identifier).join(', ')}`);

        const modelA = fetchedProviders.find(p => p.api_identifier === 'openai-gpt-4');
        const modelB = fetchedProviders.find(p => p.api_identifier === 'anthropic-claude-3-7-sonnet-20250219');

        assertExists(modelA, "The 'openai-gpt-4' provider must exist in the database for this test to run.");
        assertExists(modelB, "The 'anthropic-claude-3-7-sonnet-20250219' provider must exist in the database for this test to run.");
        
        modelAId = modelA.id;
        modelBId = modelB.id;

        // Fetch the default embedding provider
        const { data: embeddingProvider, error: embeddingProviderError } = await adminClient
            .from('ai_providers')
            .select('*')
            .eq('is_default_embedding', true)
            .single();

        assert(!embeddingProviderError, `Failed to fetch default embedding provider: ${embeddingProviderError?.message}`);
        assertExists(embeddingProvider, "No default embedding provider found in the database.");
        
        // Use the factory to get a generic adapter for embeddings
        const embeddingAdapter = getAiProviderAdapter({
            provider: embeddingProvider,
            apiKey: "sk-dummy-key-for-embedding", // A dummy key is fine if the default is a dummy provider
            logger: testLogger,
            providerMap: { 
                'openai-': DummyAdapter,
                'anthropic-': DummyAdapter,
                'google-': DummyAdapter,
                'dummy-': DummyAdapter 
            }
        });

        if (!embeddingAdapter) {
            throw new Error("Failed to create an adapter for the default embedding provider.");
        }

        const embeddingClient = new EmbeddingClient(embeddingAdapter);
        const textSplitter = new LangchainTextSplitter();
        const realWallet = new TokenWalletService(primaryUserClient, adminClient);
        const indexingService = new IndexingService(adminClient, testLogger, textSplitter, embeddingClient, realWallet);
        const ragService = new RagService({
            dbClient: adminClient,
            logger: testLogger,
            indexingService,
            embeddingClient,
        });

        testDeps = {
            logger: testLogger,
            fileManager: new FileManagerService(adminClient),
            downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
            deleteFromStorage: () => Promise.resolve({ error: null }), // Can remain a mock for now
            getExtensionFromMimeType: () => ".md",
            randomUUID: () => crypto.randomUUID(),
            callUnifiedAIModel,
            getSeedPromptForStage: () => Promise.resolve({
                content: "This is the seed prompt for the stage.",
                fullPath: "seed-prompt.md",
                bucket: "seed-prompt-bucket",
                path: "seed-prompt.md",
                fileName: "seed-prompt.md",
            }),
            continueJob,
            retryJob,
            notificationService: new NotificationService(adminClient),
            executeModelCallAndSave,
            ragService: ragService,
            indexingService: indexingService,
            embeddingClient: embeddingClient,
            planComplexStage,
            getGranularityPlanner,
            countTokens: countTokens,
            getAiProviderConfig,
            promptAssembler: new PromptAssembler(adminClient),
            tokenWalletService: realWallet,
        };

        // Ensure a REAL wallet exists with a large balance and capture its UUID for the test
        await coreEnsureTestUserAndWallet(primaryUserId, 1000000000, 'local');
        const contextWallet = await realWallet.getWalletForContext(primaryUserId, undefined);
        if (!contextWallet) {
            throw new Error("A token wallet must exist for the test user.");
        }
        testWalletId = contextWallet.walletId;

        // Configure deps to call real /chat in TEST MODE and inject per-model behavior into prompts
        const realCallUnified = callUnifiedAIModel;
        const realExecute = executeModelCallAndSave;
        testDeps.callUnifiedAIModel = (chatApiRequest, userAuthToken, deps) => {
            return realCallUnified(chatApiRequest, userAuthToken, { ...(deps || {}), isTest: true });
        };
        testDeps.executeModelCallAndSave = async (params) => {
            const { job } = params;
            const modified = { ...params, promptConstructionPayload: { ...params.promptConstructionPayload } };
            const current = modified.promptConstructionPayload;
            const base = typeof current.currentUserPrompt === 'string' ? current.currentUserPrompt : '';
            if (job && isDialecticJobPayload(job.payload)) {
                const attempt = typeof job.attempt_count === 'number' ? job.attempt_count : 0;
                if (job.payload.model_id === modelAId) {
                    if (attempt === 0) {
                        current.currentUserPrompt = `${base}\nSIMULATE_ERROR`;
                        testLogger.info(`[Test] Injecting SIMULATE_ERROR for Job ${job.id} on attempt ${attempt}`);
                    } else {
                        testLogger.info(`[Test] Not injecting error for Job ${job.id} on attempt ${attempt} to allow retry success`);
                    }
                } else if (job.payload.model_id === modelBId) {
                    const payload = job.payload;
                    const isInitialModelBJob = (payload.target_contribution_id === undefined) && (payload.continuation_count === undefined || payload.continuation_count === 0);
                    if (isInitialModelBJob) {
                        current.currentUserPrompt = `${base}\nSIMULATE_MAX_TOKENS`;
                        testLogger.info(`[Test] Injecting SIMULATE_MAX_TOKENS for initial Model B Job ${job.id}`);
                    } else {
                        testLogger.info(`[Test] Skipping SIMULATE_MAX_TOKENS for continuation Model B Job ${job.id}`);
                    }
                }
            }
            return realExecute(modified);
        };
    };

    const teardown = async () => {
      // We only clean up the user, as other resources were pre-existing
      await coreCleanupTestResources();
      testProject = null;
      testSession = null;
    };

    await t.step("Setup", setup);

    await t.step("1. should create a new dialectic project", async () => {
      const formData = new FormData();
      formData.append("projectName", "E2E Test Project");
      formData.append("initialUserPromptText", "This is the initial prompt for our E2E test.");
      formData.append("selectedDomainId", testDomainId);
      formData.append("defaultProviderId", "165dfcb3-a0f7-521a-8707-3a1a66f275cc"); // openai-gpt-4o

      const { data, error } = await createProject(
        formData,
        adminClient,
        primaryUser
      );

      assert(!error, `Failed to create project: ${JSON.stringify(error)}`);
      assertExists(data, "Project creation did not return data.");

      if (data) {
        assert(data.project_name === "E2E Test Project", "Project name does not match.");
        assertExists(data.initial_prompt_resource_id, "Initial prompt resource was not created.");
        testProject = data;
      }
    });

    await t.step("2. should start a new session for the project", async () => {
      if (!testProject) {
        assert(testProject, "Cannot start session without a project.");
        return;
      }

      const payload: StartSessionPayload = {
        projectId: testProject.id,
        selectedModelIds: [modelAId, modelBId],
        sessionDescription: "E2E Test Session",
      };

      const { data, error } = await startSession(
        primaryUser,
        adminClient,
        payload
      );

      assert(!error, `Failed to start session: ${JSON.stringify(error)}`);
      assertExists(data, "Session creation did not return data.");
      if (data) {
        assert(data.project_id === testProject.id, "Session project_id does not match.");
        assert(data.status && data.status.startsWith("pending_"), "Session status is not pending or is null.");
        testSession = data;
      }
    });

    await t.step("3. should generate contributions for Thesis stage, handle retries, and continuations", async () => {
      if (!testSession) {
        assert(testSession, "Cannot generate contributions without a session.");
        return;
      }

      // Capture contents to assert final root equals concatenation of chain
      let initialChunkContent = '';
      let continuationChunkContent = '';

      // --- Arrange ---
      const generatePayload: GenerateContributionsPayload = {
        sessionId: testSession.id,
        stageSlug: "thesis",
        iterationNumber: 1,
        projectId: testSession.project_id,
        continueUntilComplete: true,
        walletId: testWalletId,
      };
      
      // --- Act & Assert: Job Creation ---
      const { data: jobData, error: creationError } = await generateContributions(
        adminClient,
        generatePayload,
        primaryUser,
        testDeps,
      );
      assert(!creationError, `Error creating jobs: ${creationError?.message}`);
      assertExists(jobData, "Job creation did not return data");
      
      if (jobData && jobData.job_ids) {
        assertEquals(jobData.job_ids.length, 2, "Expected exactly two jobs to be created.");
        
        // Find the specific jobs to control their execution order
        const { data: jobs, error: jobsError } = await adminClient.from('dialectic_generation_jobs').select('*').in('id', jobData.job_ids);
        assert(!jobsError, `Failed to fetch created jobs: ${jobsError?.message}`);
        assertExists(jobs, "Could not fetch the newly created jobs.");

        const jobA = jobs.find(j => isDialecticJobPayload(j.payload) && j.payload.model_id === modelAId);
        const jobB = jobs.find(j => isDialecticJobPayload(j.payload) && j.payload.model_id === modelBId);
        assertExists(jobA, "Job for model A was not found.");
        assertExists(jobB, "Job for model B was not found.");

        // --- Execute Jobs Sequentially. Use real adapters with test mode header via callUnifiedAIModel ---
        testLogger.info(`[Test] >>> Executing Job A (id: ${jobA.id}) - expecting failure...`);
        await handleJob(adminClient, jobA, testDeps, primaryUserJwt);

        testLogger.info(`[Test] >>> Executing Job B (id: ${jobB.id}) - expecting partial success...`);
        await handleJob(adminClient, jobB, testDeps, primaryUserJwt);
        
        // --- Verify Retry and Continuation Creation ---
        const retryingJobA = await pollForJobStatus(jobA.id, 'retrying', `Job A (${jobA.id}) should have status 'retrying' after first failed attempt.`);
        assertEquals(retryingJobA.attempt_count, 1, "Job A attempt count should be 1 after first failure.");

        const completedJobB = await pollForJobStatus(jobB.id, 'completed', `Original Job B (${jobB.id}) should be 'completed' after processing its first chunk.`);
        
        const jobBResults = completedJobB.results && typeof completedJobB.results === 'string'
            ? JSON.parse(completedJobB.results)
            : completedJobB.results;

        if (!hasModelResultWithContributionId(jobBResults)) {
            assert(false, `Completed Job B results did not have the expected structure or was null. Got: ${JSON.stringify(jobBResults)}`);
            return; // Exit the test step if the assertion fails.
        }
        
        const targetContributionId = jobBResults.modelProcessingResult.contributionId;

        // Diagnostics: enumerate jobs tied to this contribution to understand .single() failure causes
        testLogger.info(`[Diagnostics] Looking for continuation job. sessionId=${testSession.id}, targetContributionId=${targetContributionId}`);
        const { data: allWithTarget, error: allWithTargetErr } = await adminClient
          .from('dialectic_generation_jobs')
          .select('id,status,session_id,parent_job_id,payload')
          .eq('payload->>target_contribution_id', targetContributionId);
        testLogger.info(`[Diagnostics] Jobs with target_contribution_id=${targetContributionId}: count=${allWithTarget?.length ?? 0}, error=${allWithTargetErr?.message ?? 'none'}`);
        if (allWithTarget && allWithTarget.length > 0) {
          testLogger.info(`[Diagnostics] Job IDs: ${allWithTarget.map(j => j.id).join(', ')}`);
          const pending = allWithTarget.filter(j => j.status === 'pending_continuation');
          testLogger.info(`[Diagnostics] pending_continuation subset count=${pending.length}`);
        }

        const { data: continuationJobData, error: continuationJobError } = await adminClient
          .from('dialectic_generation_jobs')
          .select('*')
          .eq('payload->>target_contribution_id', targetContributionId)
          .single();
        
        assert(!continuationJobError, `Error fetching continuation job: ${continuationJobError?.message}`);
        assertExists(continuationJobData, "A new continuation job should have been created for job B.");

        // Capture initial chunk content from immutable raw JSON (not the main file which will be overwritten by assembly)
        {
          const { data: rootContribRows, error: rootContribErr } = await adminClient
            .from('dialectic_contributions')
            .select('id, storage_bucket, storage_path, file_name, raw_response_storage_path')
            .eq('id', targetContributionId);
          assert(!rootContribErr, `Error fetching root contribution for initial content: ${rootContribErr?.message}`);
          assertExists(rootContribRows, 'Root contribution not found for initial content capture');
          if (rootContribRows && rootContribRows.length === 1) {
            const rootContrib = rootContribRows[0];
            const rawPath = rootContrib.raw_response_storage_path;
            for (let attempt = 0; attempt < 3 && initialChunkContent.trim().length === 0; attempt++) {
              if (typeof rawPath === 'string' && rawPath.length > 0) {
                const { data: initJsonBytes, error: initJsonErr } = await downloadFromStorage(
                  adminClient,
                  rootContrib.storage_bucket,
                  rawPath,
                );
                assert(!initJsonErr, `Failed to download initial chunk raw JSON: ${initJsonErr?.message}`);
                if (initJsonBytes) {
                  const jsonText = new TextDecoder().decode(initJsonBytes);
                  try {
                    const parsed = JSON.parse(jsonText);
                    if (parsed && typeof parsed === 'object' && typeof parsed.content === 'string') {
                      initialChunkContent = parsed.content;
                    }
                  } catch (_) {
                    // fall back to main file only if JSON parse fails
                  }
                }
              }
              if (initialChunkContent.trim().length === 0) {
                const { data: initBytes, error: initDlErr } = await downloadFromStorage(
                  adminClient,
                  rootContrib.storage_bucket,
                  `${rootContrib.storage_path}/${rootContrib.file_name}`,
                );
                assert(!initDlErr, `Failed to download initial chunk content: ${initDlErr?.message}`);
                if (initBytes) initialChunkContent = new TextDecoder().decode(initBytes);
              }
              if (initialChunkContent.trim().length === 0) await new Promise((r) => setTimeout(r, 50));
            }
            assert(initialChunkContent.trim().length > 0, 'Initial chunk content should have been captured before assembly');
          }
        }

        // --- Execute Second Run to Process Retries and Continuations ---
        testLogger.info(`[Test] >>> Executing second run for retrying job and continuation job...`);
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
        
        // --- Verify Final States ---
        const completedJobA = await pollForJobStatus(jobA.id, 'completed', `Job A (${jobA.id}) should have status 'completed' after successful retry.`);
        assertEquals(completedJobA.attempt_count, 2, "Job A attempt count should be 2 after successful retry.");

        const completedContinuationJob = await pollForJobStatus(continuationJobData.id, 'completed', `Continuation job (${continuationJobData.id}) should have 'completed' status.`);

        // Download continuation chunk content from immutable raw JSON
        {
          const contResults = completedContinuationJob.results && typeof completedContinuationJob.results === 'string'
            ? JSON.parse(completedContinuationJob.results)
            : completedContinuationJob.results;
          if (!hasModelResultWithContributionId(contResults)) {
            assert(false, `Continuation job results missing contributionId. Got: ${JSON.stringify(contResults)}`);
          } else {
            const contContributionId = contResults.modelProcessingResult.contributionId;
            const { data: contContribRows, error: contContribErr } = await adminClient
              .from('dialectic_contributions')
              .select('id, storage_bucket, storage_path, file_name, raw_response_storage_path')
              .eq('id', contContributionId);
            assert(!contContribErr, `Error fetching continuation contribution: ${contContribErr?.message}`);
            assertExists(contContribRows, 'Continuation contribution row was not found');
            if (contContribRows && contContribRows.length === 1) {
              const contContrib = contContribRows[0];
              const contRawPath = contContrib.raw_response_storage_path;
              for (let attempt = 0; attempt < 3 && continuationChunkContent.trim().length === 0; attempt++) {
                if (typeof contRawPath === 'string' && contRawPath.length > 0) {
                  const { data: contJsonBytes, error: contJsonErr } = await downloadFromStorage(
                    adminClient,
                    contContrib.storage_bucket,
                    contRawPath,
                  );
                  assert(!contJsonErr, `Failed to download continuation chunk raw JSON: ${contJsonErr?.message}`);
                  if (contJsonBytes) {
                    const jsonText = new TextDecoder().decode(contJsonBytes);
                    try {
                      const parsed = JSON.parse(jsonText);
                      if (parsed && typeof parsed === 'object' && typeof parsed.content === 'string') {
                        continuationChunkContent = parsed.content;
                      }
                    } catch (_) {
                      // fall back to main file only if JSON parse fails
                    }
                  }
                }
                if (continuationChunkContent.trim().length === 0) {
                  const { data: contBytes, error: contDlErr } = await downloadFromStorage(
                    adminClient,
                    contContrib.storage_bucket,
                    `${contContrib.storage_path}/${contContrib.file_name}`,
                  );
                  assert(!contDlErr, `Failed to download continuation chunk content: ${contDlErr?.message}`);
                  if (contBytes) continuationChunkContent = new TextDecoder().decode(contBytes);
                }
                if (continuationChunkContent.trim().length === 0) await new Promise((r) => setTimeout(r, 50));
              }
              assert(continuationChunkContent.trim().length > 0, 'Continuation chunk content should have been captured');
            }
          }
        }

      } else {
        assert(false, "jobData or job_ids were not created correctly.");
      }
      
      // --- Act & Assert: Final State Verification ---
      await pollForCondition(async () => {
        if (!testSession) return false;
        const { data: pendingJobs } = await adminClient
          .from('dialectic_generation_jobs')
          .select('id')
          .eq('session_id', testSession.id)
          .in('status', ['pending', 'processing', 'pending_continuation', 'retrying']);
        return pendingJobs !== null && pendingJobs.length === 0;
      }, "All jobs for the session, including continuations, should be completed");

      const { data: finalContributions, error: finalContribError } = await adminClient
        .from('dialectic_contributions')
        .select('*, file_name, storage_bucket, storage_path')
        .eq('session_id', testSession.id)
        .eq('stage', 'thesis')
        .eq('is_latest_edit', true);

      assert(!finalContribError, `Error fetching final contributions: ${finalContribError?.message}`);
      assertExists(finalContributions, "No final contributions were found.");
      assertEquals(finalContributions.length, 2, "Expected exactly two final contributions where is_latest_edit is true.");

      const contributionB = finalContributions.find(c => c.model_id === modelBId);
      assertExists(contributionB, "Contribution for Model B not found.");
      
      const { data: downloadedData, error: downloadError } = await downloadFromStorage(adminClient, contributionB.storage_bucket, `${contributionB.storage_path}/${contributionB.file_name}`);
      assert(!downloadError, `Failed to download final content for contribution B: ${downloadError?.message}`);
      
      if (downloadedData) {
        const finalContent = new TextDecoder().decode(downloadedData);
        const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n\n').trim();
        const expectedContent = normalize(`${initialChunkContent}${continuationChunkContent}`);
        const actualContent = normalize(finalContent);
        assertEquals(actualContent, expectedContent, "The final content of the continued contribution is incorrect.");
      } else {
        assert(false, "Downloaded content for contribution B was null.");
      }
      
            // --- Act: Submit Responses ---
      const submitPayload: SubmitStageResponsesPayload = {
        sessionId: testSession.id,
        projectId: testSession.project_id,
        stageSlug: 'thesis',
        currentIterationNumber: 1,
        responses: finalContributions.map(c => ({
          originalContributionId: c.id,
          responseText: `This is the selected response for contribution ${c.id}.`
        }))
      };

      const submitDeps = { logger: testLogger, fileManager: testDeps.fileManager, downloadFromStorage, indexingService: testDeps.indexingService!, embeddingClient: testDeps.embeddingClient! };
      const { data: submitData, error: submitError } = await submitStageResponses(
        submitPayload,
        adminClient,
        primaryUser,
        submitDeps
      );
      
      assert(!submitError, `Error submitting responses: ${JSON.stringify(submitError)}`);
      assertExists(submitData, "Submission did not return data.");
  
      if (submitData && submitData.updatedSession) {
        assert(submitData.updatedSession.status === 'pending_antithesis', `Session status is not pending_antithesis, but ${submitData.updatedSession.status}`);
        testSession = submitData.updatedSession;
 
      } else {
        assert(false, "Submission failed to return an updated session.");
      }
    });

    await t.step({
      name: "4. should plan child jobs for the Antithesis stage",
      ignore: true,
      fn: async () => {
      // Step 1: Planning
      if (!testSession) {
        assert(testSession, "Cannot test antithesis without a session.");
        return;
      }

      // --- Arrange ---
      const generatePayload: GenerateContributionsPayload = {
        sessionId: testSession.id,
        stageSlug: "antithesis",
        iterationNumber: 1,
        projectId: testSession.project_id,
        walletId: testWalletId,
      };
      
      // --- Act ---
      const { data: jobData, error: creationError } = await generateContributions(
        adminClient,
        generatePayload,
        primaryUser,
        testDeps,
      );

      // --- Assert ---
      assert(!creationError, `Error creating parent job for antithesis: ${creationError?.message}`);
      assertExists(jobData, "Parent job creation did not return data");
      
      if (jobData && jobData.job_ids) {
        assertEquals(jobData.job_ids.length, 2, "Expected two parent jobs to be created for the antithesis stage (one per model).");
        
        const [parentJobIdA, parentJobIdB] = jobData.job_ids;
        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };

        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);

        await pollForJobStatus(parentJobIdA, 'waiting_for_children', `Parent job A (${parentJobIdA}) should have status 'waiting_for_children'.`);
        await pollForJobStatus(parentJobIdB, 'waiting_for_children', `Parent job B (${parentJobIdB}) should have status 'waiting_for_children'.`);

        const { data: childJobs, error: childJobError } = await adminClient
          .from('dialectic_generation_jobs')
          .select('id')
          .in('parent_job_id', [parentJobIdA, parentJobIdB]);
        
        assert(!childJobError, `Error fetching child jobs: ${childJobError?.message}`);
        assertExists(childJobs, "Child jobs were not created.");
        assertEquals(childJobs.length, 4, `Expected 4 child jobs to be created for the antithesis stage (2 theses * 2 models), but found ${childJobs.length}.`);
      } else {
        assert(false, "jobData or job_ids were not returned from generateContributions");
      }
    }});

    await t.step({
      name: "5. should execute child jobs and verify parent job completion",
      ignore: true,
      fn: async () => {
      if (!testSession) {
        assert(testSession, "Cannot test antithesis without a session.");
        return;
      }
        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };

      // Act: Execute the pending child jobs
      await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
      
      // Assert: Verify all jobs (parents and children) are completed
      await pollForCondition(async () => {
        if (!testSession) return false;
        const { data: pendingJobs } = await adminClient
          .from('dialectic_generation_jobs')
          .select('id')
          .eq('session_id', testSession.id)
          .eq('stage_slug', 'antithesis')
          .in('status', ['pending', 'processing', 'pending_continuation', 'retrying', 'waiting_for_children']);
        return pendingJobs !== null && pendingJobs.length === 0;
      }, "All jobs for the antithesis stage, including parents, should be completed");
    }});
    
    await t.step({
      name: "6. should verify the final antithesis artifacts",
      ignore: true,
      fn: async () => {
      if (!testSession) {
        assert(testSession, "Cannot test antithesis without a session.");
        return;
      }
      
      const { data: finalContributions, error: finalContribError } = await adminClient
        .from('dialectic_contributions')
        .select('id')
        .eq('session_id', testSession.id)
        .eq('stage', 'antithesis')
        .eq('is_latest_edit', true);

      assert(!finalContribError, `Error fetching final antithesis contributions: ${finalContribError?.message}`);
      assertExists(finalContributions, "No final antithesis contributions were found.");
      assertEquals(finalContributions.length, 4, `Expected exactly four final antithesis contributions, but found ${finalContributions.length}.`);
    }});

    await t.step({
      name: "7. should submit antithesis responses",
      ignore: true,
      fn: async () => {
      if (!testSession) {
        assert(testSession, "Cannot test antithesis without a session.");
        return;
      }
      
      const { data: antithesisContributions, error: contribError } = await adminClient
        .from('dialectic_contributions')
        .select('id')
        .eq('session_id', testSession.id)
        .eq('stage', 'antithesis')
        .eq('is_latest_edit', true);

      assert(!contribError, `Error fetching antithesis contributions for submission: ${contribError?.message}`);
      assertExists(antithesisContributions, "Could not find antithesis contributions to submit feedback for.");
      assertEquals(antithesisContributions.length, 4, "Incorrect number of antithesis contributions found for feedback submission.");

      const submitPayload: SubmitStageResponsesPayload = {
        sessionId: testSession.id,
        projectId: testSession.project_id,
        stageSlug: 'antithesis',
        currentIterationNumber: 1,
        responses: antithesisContributions.map(c => ({
          originalContributionId: c.id,
          responseText: `This is my feedback for antithesis contribution ${c.id}.`
        }))
      };
      
      const submitDeps = { logger: testLogger, fileManager: testDeps.fileManager, downloadFromStorage, indexingService: testDeps.indexingService!, embeddingClient: testDeps.embeddingClient! };
      const { data: submitData, error: submitError } = await submitStageResponses(
        submitPayload,
        adminClient,
        primaryUser,
        submitDeps
      );

      assert(!submitError, `Error submitting antithesis responses: ${JSON.stringify(submitError)}`);
      assertExists(submitData, "Antithesis submission did not return data.");
      
      if (submitData && submitData.updatedSession) {
        assert(submitData.updatedSession.status === 'pending_synthesis', `Session status should be pending_synthesis, but was ${submitData.updatedSession.status}`);
        testSession = submitData.updatedSession;

        // SUBMIT MOCK FEEDBACK FOR THE NEXT STAGE
        await submitMockFeedback(testSession.id, testSession.project_id, 'antithesis', 1, primaryUserId, testDeps.fileManager);

      } else {
        assert(false, "Submission of antithesis responses failed to return an updated session.");
      }
    }});

    await t.step({
      name: "8. should execute the multi-step Synthesis stage",
      ignore: true,
      fn: async () => {
        if (!testSession) {
            assert(testSession, "Cannot test synthesis without a session.");
            return;
        }

        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };
        
        // --- Invoke Synthesis Planner (Step 1: pairwise_by_origin) ---
        const generatePayload: GenerateContributionsPayload = {
            sessionId: testSession.id,
            stageSlug: "synthesis",
            iterationNumber: 1,
            projectId: testSession.project_id,
            walletId: testWalletId,
        };
        const { data: jobData, error: creationError } = await generateContributions(adminClient, generatePayload, primaryUser, testDeps);
        assert(!creationError, `Error creating parent job for synthesis: ${creationError?.message}`);
        assertExists(jobData?.job_ids, "Parent job creation for synthesis did not return job IDs.");
        
        if (jobData) {
            assertEquals(jobData.job_ids.length, 2, "Expected 2 parent synthesis jobs (one per model).");
    
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
            
            const { data: step1ChildJobs, error: step1ChildError } = await adminClient.from('dialectic_generation_jobs').select('id, parent_job_id').in('parent_job_id', jobData.job_ids);
            assert(!step1ChildError, `Error fetching step 1 child jobs: ${step1ChildError?.message}`);
            assertEquals(step1ChildJobs?.length, 8, "Expected 8 child jobs for Synthesis Step 1 (2 theses * 2 antitheses per thesis * 2 models = 8 pairs).");
            
            // --- Simulate Step 1 Completion & Wake Parent ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
            for (const parentJobId of jobData.job_ids) {
                await pollForJobStatus(parentJobId, 'pending_next_step', `Parent job ${parentJobId} should be pending_next_step after Step 1.`);
            }
    
            // --- Invoke Synthesis Planner (Step 2: per_source_group) ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
            const { data: step2ChildJobs, error: step2ChildError } = await adminClient.from('dialectic_generation_jobs').select('id').in('parent_job_id', jobData.job_ids).eq('payload->>prompt_template_name', 'synthesis_step2_per_thesis');
            assert(!step2ChildError, `Error fetching step 2 child jobs: ${step2ChildError?.message}`);
            assertEquals(step2ChildJobs?.length, 4, "Expected 4 child jobs for Synthesis Step 2 (2 original thesis groups * 2 models).");
    
            // --- Simulate Step 2 Completion & Wake Parent ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
            for (const parentJobId of jobData.job_ids) {
                await pollForJobStatus(parentJobId, 'pending_next_step', `Parent job ${parentJobId} should be pending_next_step after Step 2.`);
            }
    
            // --- Invoke Synthesis Planner (Step 3: all_to_one) ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
            const { data: step3ChildJobs, error: step3ChildError } = await adminClient.from('dialectic_generation_jobs').select('id').in('parent_job_id', jobData.job_ids).eq('status', 'pending');
            assert(!step3ChildError, `Error fetching step 3 child jobs: ${step3ChildError?.message}`);
            assertEquals(step3ChildJobs?.length, 2, "Expected 2 child jobs for Synthesis Step 3 (one per model, all_to_one).");
            
            // --- Simulate Final Step Completion ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
    
            // --- Final Assertions ---
            await pollForCondition(async () => {
                if (!testSession) return false;
                const { data: pendingJobs } = await adminClient.from('dialectic_generation_jobs').select('id').eq('session_id', testSession.id).eq('stage_slug', 'synthesis').in('status', ['pending', 'processing', 'retrying', 'waiting_for_children', 'pending_next_step']);
                return pendingJobs !== null && pendingJobs.length === 0;
            }, "All jobs for the synthesis stage should be completed.");
            
            const { data: finalContributions, error: finalContribError } = await adminClient.from('dialectic_contributions').select('id, contribution_type').eq('session_id', testSession.id).eq('is_latest_edit', true);
            assert(!finalContribError, "Error fetching final contributions for synthesis verification.");
            
            const pairwiseChunks = finalContributions?.filter(c => c.contribution_type === 'pairwise_synthesis_chunk');
            const reducedSyntheses = finalContributions?.filter(c => c.contribution_type === 'reduced_synthesis');
            const finalSyntheses = finalContributions?.filter(c => c.contribution_type === 'synthesis');
    
            assertEquals(pairwiseChunks?.length, 8, "Expected 8 intermediate 'pairwise_synthesis_chunk' contributions.");
            assertEquals(reducedSyntheses?.length, 4, "Expected 4 intermediate 'reduced_synthesis' contributions.");
            assertEquals(finalSyntheses?.length, 2, "Expected 2 final 'synthesis' contributions.");
        }
    }});

    await t.step({
      name: "9. should execute the Parenthesis stage",
      ignore: true,
      fn: async () => {
        if (!testSession) {
            assert(testSession, "Cannot test parenthesis without a session.");
            return;
        }

        // --- Arrange ---
        const { data: synthesisContributions, error: contribError } = await adminClient
            .from('dialectic_contributions')
            .select('id')
            .eq('session_id', testSession.id)
            .eq('stage', 'synthesis')
            .eq('is_latest_edit', true);

        assert(!contribError, "Error fetching synthesis contributions for submission.");
        assertExists(synthesisContributions, "Could not find synthesis contributions to submit feedback for.");

        const submitPayload: SubmitStageResponsesPayload = {
            sessionId: testSession.id,
            projectId: testSession.project_id,
            stageSlug: 'synthesis',
            currentIterationNumber: 1,
            responses: synthesisContributions.map(c => ({
                originalContributionId: c.id,
                responseText: `This is feedback for synthesis contribution ${c.id}.`
            }))
        };

        const submitDeps = { 
          logger: testLogger, 
          fileManager: testDeps.fileManager, 
          downloadFromStorage, 
          indexingService: testDeps.indexingService!, 
          embeddingClient: testDeps.embeddingClient!,
          ragService: testDeps.ragService!
        };
        const { data: submitData, error: submitError } = await submitStageResponses(
            submitPayload,
            adminClient,
            primaryUser,
            submitDeps
        );

        if (submitData && submitData.updatedSession) {
        assert(!submitError, `Error submitting synthesis responses: ${JSON.stringify(submitError)}`);
        assertExists(submitData, "Submission did not return data.");
            assert(submitData?.updatedSession?.status === 'pending_parenthesis', `Session status should be pending_parenthesis, but was ${submitData?.updatedSession?.status}`);
            testSession = submitData.updatedSession;
        }
        
        // --- Act ---
        const generatePayload: GenerateContributionsPayload = {
            sessionId: testSession.id,
            stageSlug: "parenthesis",
            iterationNumber: 1,
            projectId: testSession.project_id,
            walletId: testWalletId,
        };
        const { data: jobData, error: creationError } = await generateContributions(adminClient, generatePayload, primaryUser, testDeps);
        assert(!creationError, `Error creating parent job for parenthesis: ${creationError?.message}`);
        assertExists(jobData?.job_ids, "Parent job creation for parenthesis did not return job IDs.");

        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);

        // --- Assert ---
        await pollForCondition(async () => {
            if (!testSession) return false;
            const { data: pendingJobs } = await adminClient
                .from('dialectic_generation_jobs')
                .select('id')
                .eq('session_id', testSession.id)
                .eq('stage_slug', 'parenthesis')
                .in('status', ['pending', 'processing', 'retrying', 'waiting_for_children', 'pending_next_step']);
            return pendingJobs !== null && pendingJobs.length === 0;
        }, "All jobs for the parenthesis stage should be completed.");

        const { data: finalContributions, error: finalContribError } = await adminClient
            .from('dialectic_contributions')
            .select('id')
            .eq('session_id', testSession.id)
            .eq('stage', 'parenthesis')
            .eq('is_latest_edit', true);

        assert(!finalContribError, "Error fetching final parenthesis contributions.");
                assertEquals(finalContributions?.length, 2, "Expected 2 final 'parenthesis' contributions (1 per model for a simple stage).");
    }});

    await t.step({
      name: "10. should execute the Paralysis stage",
      ignore: true,
      fn: async () => {
        if (!testSession) {
            assert(testSession, "Cannot test paralysis without a session.");
            return;
        }

        // --- Arrange ---
        const { data: parenthesisContributions, error: contribError } = await adminClient
            .from('dialectic_contributions')
            .select('id')
            .eq('session_id', testSession.id)
            .eq('stage', 'parenthesis')
            .eq('is_latest_edit', true);

        assert(!contribError, "Error fetching parenthesis contributions for submission.");
        assertExists(parenthesisContributions, "Could not find parenthesis contributions to submit feedback for.");
        
        const submitPayload: SubmitStageResponsesPayload = {
            sessionId: testSession.id,
            projectId: testSession.project_id,
            stageSlug: 'parenthesis',
            currentIterationNumber: 1,
            responses: parenthesisContributions.map(c => ({
                originalContributionId: c.id,
                responseText: `This is feedback for parenthesis contribution ${c.id}.`
            }))
        };

        const submitDeps = { 
          logger: testLogger, 
          fileManager: testDeps.fileManager, 
          downloadFromStorage, 
          indexingService: testDeps.indexingService!, 
          embeddingClient: testDeps.embeddingClient!, 
          ragService: testDeps.ragService! 
        };
        const { data: submitData, error: submitError } = await submitStageResponses(
            submitPayload,
            adminClient,
            primaryUser,
            submitDeps
        );

        if (submitData && submitData.updatedSession) {
        assert(!submitError, `Error submitting parenthesis responses: ${JSON.stringify(submitError)}`);
        assertExists(submitData, "Submission did not return data.");
            assert(submitData?.updatedSession?.status === 'pending_paralysis', `Session status should be pending_paralysis, but was ${submitData?.updatedSession?.status}`);
            testSession = submitData.updatedSession;
        }
        
        // --- Act ---
        const generatePayload: GenerateContributionsPayload = {
            sessionId: testSession.id,
            stageSlug: "paralysis",
            iterationNumber: 1,
            projectId: testSession.project_id,
            walletId: testWalletId,
        };
        const { data: jobData, error: creationError } = await generateContributions(adminClient, generatePayload, primaryUser, testDeps);
        assert(!creationError, `Error creating parent job for paralysis: ${creationError?.message}`);
        assertExists(jobData?.job_ids, "Parent job creation for paralysis did not return job IDs.");

        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt);

        // --- Assert ---
        await pollForCondition(async () => {
            if (!testSession) return false;
            const { data: pendingJobs } = await adminClient
                .from('dialectic_generation_jobs')
                .select('id')
                .eq('session_id', testSession.id)
                .eq('stage_slug', 'paralysis')
                .in('status', ['pending', 'processing', 'retrying', 'waiting_for_children', 'pending_next_step']);
            return pendingJobs !== null && pendingJobs.length === 0;
        }, "All jobs for the paralysis stage should be completed.");

        const { data: finalContributions, error: finalContribError } = await adminClient
            .from('dialectic_contributions')
            .select('id')
            .eq('session_id', testSession.id)
            .eq('stage', 'paralysis')
            .eq('is_latest_edit', true);

        assert(!finalContribError, "Error fetching final paralysis contributions.");
        assertEquals(finalContributions?.length, 2, "Expected 2 final 'paralysis' contributions.");
    }});



        await t.step("Teardown", teardown);
  },
);