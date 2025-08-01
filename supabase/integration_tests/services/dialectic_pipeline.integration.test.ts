import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type Stub, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  setSharedAdminClient,
  testLogger,
} from "../../functions/_shared/_integration.test.utils.ts";
import { type Database } from "../../functions/types_db.ts";
import { getAiProviderAdapter } from "../../functions/_shared/ai_service/factory.ts";
import { MockAiProviderAdapter } from "../../functions/_shared/ai_service/ai_provider.mock.ts";
import {
  type GenerateContributionsPayload,
  type DialecticJobRow,
  type DialecticProject,
  type SubmitStageResponsesPayload,
  type StartSessionSuccessResponse,
  type StartSessionPayload,
  ProcessSimpleJobDeps,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { isDialecticJobPayload, isDialecticJobRow } from "../../functions/_shared/utils/type_guards.ts";
import { isTokenUsage, type ChatApiRequest } from "../../functions/_shared/types.ts";
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
import { type UploadContext, IFileManager } from "../../functions/_shared/types/file_manager.types.ts";

// --- Test Suite Setup ---
let adminClient: SupabaseClient<Database>;
const mockAiAdapter = new MockAiProviderAdapter();
let testDeps: ProcessSimpleJobDeps;

const pollForCondition = async (
  condition: () => Promise<boolean>,
  timeoutMessage: string,
  interval = 1000,
  timeout = 30000,
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
    timeout = 10000,
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
    deps: ProcessSimpleJobDeps,
    authToken: string,
    mockProcessors: IJobProcessors
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
        await handleJob(adminClient, job, deps, authToken, mockProcessors);
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
            fileType: 'user_feedback',
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
    let factoryStub: Stub;
    let testProject: DialecticProject | null = null;
    let testDomainId: string;
    let testSession: StartSessionSuccessResponse | null = null;
    let modelAId: string;
    let modelBId: string;

    const setup = async () => {
        adminClient = initializeSupabaseAdminClient();
        setSharedAdminClient(adminClient);
        initializeTestDeps();
        
        const { userId, userClient, jwt } = await coreCreateAndSetupTestUser();
        primaryUserId = userId;
        primaryUserJwt = jwt;
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

        // --- Upsert AI Providers to ensure test is self-contained ---
        type AiProviderInsert = Database['public']['Tables']['ai_providers']['Insert'];
        const providersToEnsure: AiProviderInsert[] = [
          {
            api_identifier: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            provider: 'openai',
            config: { 
                provider_max_input_tokens: 128000, 
                provider_max_output_tokens: 4096,
                tokenization_strategy: {
                    type: 'tiktoken',
                    tiktoken_encoding_name: 'cl100k_base'
                }
            },
          },
          {
            api_identifier: 'claude-3-opus',
            name: 'Claude 3 Opus',
            provider: 'anthropic',
            config: { 
                provider_max_input_tokens: 200000, 
                provider_max_output_tokens: 4096,
                tokenization_strategy: {
                    type: 'anthropic_tokenizer',
                    model: 'claude-3-opus-20240229'
                }
            },
          },
        ];

        const { data: upsertedProviders, error: upsertError } = await adminClient
          .from('ai_providers')
          .upsert(providersToEnsure, { onConflict: 'api_identifier' })
          .select('id, api_identifier');
        
        assert(!upsertError, `Failed to upsert AI providers: ${upsertError?.message}`);
        assertExists(upsertedProviders, "Upserting providers did not return data.");
        assertEquals(upsertedProviders.length, 2, "Expected to upsert exactly 2 providers.");

        const modelA = upsertedProviders.find(p => p.api_identifier === 'gpt-4-turbo');
        const modelB = upsertedProviders.find(p => p.api_identifier === 'claude-3-opus');

        assertExists(modelA, "The 'gpt-4-turbo' AI provider could not be upserted.");
        modelAId = modelA.id;
        
        assertExists(modelB, "The 'claude-3-opus' AI provider could not be upserted.");
        modelBId = modelB.id;
        // --- End of AI Provider Upsert ---

        factoryStub = stub(
            { getAiProviderAdapter },
            "getAiProviderAdapter",
            () => mockAiAdapter,
        );
        mockAiAdapter.reset();

        testDeps = {
            logger: testLogger,
            fileManager: new FileManagerService(adminClient),
            downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
            deleteFromStorage: () => Promise.resolve({ error: null }), // Can remain a mock for now
            getExtensionFromMimeType: () => ".md",
            randomUUID: () => crypto.randomUUID(),
            callUnifiedAIModel: async (modelId, prompt, chatId, authToken, options) => {
                const request: ChatApiRequest = {
                    message: prompt,
                    providerId: modelId,
                    promptId: options?.currentStageSystemPromptId || '__none__',
                    chatId: chatId === null ? undefined : chatId,
                    walletId: options?.walletId,
                    max_tokens_to_generate: options?.customParameters?.max_tokens_to_generate,
                };

                // Find the api_identifier that corresponds to the modelId UUID
                const model = upsertedProviders.find(p => p.id === modelId);
                const modelIdentifier = model ? model.api_identifier : modelId; // Fallback to modelId if not found
                
                return mockAiAdapter.sendMessage(request, modelIdentifier, authToken)
                    .then(response => {
                        const tokenUsage = isTokenUsage(response.token_usage) ? response.token_usage : null;
                        return {
                            content: response.content,
                            finish_reason: response.finish_reason,
                            inputTokens: tokenUsage?.prompt_tokens,
                            outputTokens: tokenUsage?.completion_tokens,
                            tokenUsage: tokenUsage,
                            processingTimeMs: 0,
                            rawProviderResponse: {},
                            error: undefined,
                        };
                    })
                    .catch(error => ({
                        content: null,
                        error: error.message,
                    }));
            },
            getSeedPromptForStage: () => Promise.resolve({
                content: "This is the seed prompt for the stage.",
                fullPath: "seed-prompt.md",
                bucket: "seed-prompt-bucket",
                path: "seed-prompt.md",
                fileName: "seed-prompt.md",
            }),
            continueJob,
            retryJob,
            notificationService: {
                sendContributionStartedEvent: () => Promise.resolve(),
                sendDialecticContributionStartedEvent: () => Promise.resolve(),
                sendContributionReceivedEvent: () => Promise.resolve(),
                sendContributionRetryingEvent: () => Promise.resolve(),
                sendContributionFailedNotification: () => Promise.resolve(),
                sendContributionGenerationCompleteEvent: () => Promise.resolve(),
                sendContributionGenerationContinuedEvent: () => Promise.resolve(),
                sendDialecticProgressUpdateEvent: () => Promise.resolve(),
            },
            executeModelCallAndSave,
        };
    };

    const teardown = async () => {
      if (factoryStub) factoryStub.restore();
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

      // --- Arrange ---
      // FIX: Configure the mock using the correct model UUIDs.
      mockAiAdapter.setFailureForModel(modelAId, 1, new Error("Test-induced AI failure"));
      mockAiAdapter.setContinuationForModel(modelBId, 1, "This is the final continued part.");

      const generatePayload: GenerateContributionsPayload = {
        sessionId: testSession.id,
        stageSlug: "thesis",
        iterationNumber: 1,
        projectId: testSession.project_id,
        continueUntilComplete: true,
      };
      
      const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };

      // --- Act & Assert: Job Creation & Initial Processing ---
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
        
        const jobA_id = jobData.job_ids[0];
        const jobB_id = jobData.job_ids[1];

        assertExists(jobA_id, "Job A ID must exist.");
        assertExists(jobB_id, "Job B ID must exist.");

        testLogger.info(`[Test] >>> Executing first run for initial jobs...`);
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);

        // --- Verify Retry and Continuation Creation ---
        // After the first run, Job A should be 'retrying' and Job B should be 'completed' (having enqueued a continuation).
        const retryingJobA = await pollForJobStatus(jobA_id, 'retrying', `Job A (${jobA_id}) should have status 'retrying' after first failed attempt.`);
        assertEquals(retryingJobA.attempt_count, 1, "Job A attempt count should be 1 after first failure.");

        await pollForJobStatus(jobB_id, 'completed', `Original Job B (${jobB_id}) should be 'completed' after processing its first chunk.`);
        
        // Now, verify that the continuation job was created BEFORE the next execution run.
        const { data: continuationJobData, error: continuationJobError } = await adminClient
          .from('dialectic_generation_jobs')
          .select('*')
          .eq('session_id', testSession.id)
          .eq('status', 'pending_continuation')
          .single();
        
        assert(!continuationJobError, `Error fetching continuation job: ${continuationJobError?.message}`);
        assertExists(continuationJobData, "A new continuation job should have been created.");

        // Correct the assertion to look inside the payload object using a type guard.
        if (isDialecticJobPayload(continuationJobData.payload)) {
            assertExists(continuationJobData.payload.target_contribution_id, "Continuation job must have a target_contribution_id in its payload.");
            assertEquals(typeof continuationJobData.payload.target_contribution_id, 'string', "target_contribution_id should be a string.");
        } else {
            assert(false, "The continuation job's payload was not a valid DialecticJobPayload.");
        }

        // --- Execute Second Run to Process Retries and Continuations ---
        testLogger.info(`[Test] >>> Executing second run for retrying job and continuation job...`);
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
        
        // --- Verify Final States ---
        const completedJobA = await pollForJobStatus(jobA_id, 'completed', `Job A (${jobA_id}) should have status 'completed' after successful retry.`);
        assertEquals(completedJobA.attempt_count, 2, "Job A attempt count should be 2 after successful retry.");

        await pollForJobStatus(continuationJobData.id, 'completed', `Continuation job (${continuationJobData.id}) should have 'completed' status.`);

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
        const expectedContent = "This is a partial response for claude-3-opus.This is the final continued part.";
        assertEquals(finalContent, expectedContent, "The final content of the continued contribution is incorrect.");
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

      const { data: submitData, error: submitError } = await submitStageResponses(
        submitPayload,
        adminClient,
        primaryUser,
        { logger: testLogger, fileManager: testDeps.fileManager, downloadFromStorage }
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

    await t.step("4. should plan child jobs for the Antithesis stage", async () => {
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

        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);

        await pollForJobStatus(parentJobIdA, 'waiting_for_children', `Parent job A (${parentJobIdA}) should have status 'waiting_for_children'.`);
        await pollForJobStatus(parentJobIdB, 'waiting_for_children', `Parent job B (${parentJobIdB}) should have status 'waiting_for_children'.`);

        const { data: childJobs, error: childJobError } = await adminClient
          .from('dialectic_generation_jobs')
          .select('id')
          .in('parent_job_id', [parentJobIdA, parentJobIdB]);
        
        assert(!childJobError, `Error fetching child jobs: ${childJobError?.message}`);
        assertExists(childJobs, "Child jobs were not created.");
        assertEquals(childJobs.length, 4, "Expected 4 child jobs to be created for the antithesis stage (2 theses * 2 models).");
      } else {
        assert(false, "jobData or job_ids were not returned from generateContributions");
      }
    });

    await t.step("5. should execute child jobs and verify parent job completion", async () => {
      if (!testSession) {
        assert(testSession, "Cannot test antithesis without a session.");
        return;
      }
        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };

      // Act: Execute the pending child jobs
      await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
      
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
    });
    
    await t.step("6. should verify the final antithesis artifacts", async () => {
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
      assertEquals(finalContributions.length, 4, "Expected exactly four final antithesis contributions.");
    });

    await t.step("7. should submit antithesis responses", async () => {
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
      
      const { data: submitData, error: submitError } = await submitStageResponses(
        submitPayload,
        adminClient,
        primaryUser,
        { logger: testLogger, fileManager: testDeps.fileManager, downloadFromStorage }
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
    });

    await t.step("8. should execute the multi-step Synthesis stage", async () => {
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
        };
        const { data: jobData, error: creationError } = await generateContributions(adminClient, generatePayload, primaryUser, testDeps);
        assert(!creationError, `Error creating parent job for synthesis: ${creationError?.message}`);
        assertExists(jobData?.job_ids, "Parent job creation for synthesis did not return job IDs.");
        
        if (jobData) {
            assertEquals(jobData.job_ids.length, 2, "Expected 2 parent synthesis jobs (one per model).");
    
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
            
            const { data: step1ChildJobs, error: step1ChildError } = await adminClient.from('dialectic_generation_jobs').select('id, parent_job_id').in('parent_job_id', jobData.job_ids);
            assert(!step1ChildError, `Error fetching step 1 child jobs: ${step1ChildError?.message}`);
            assertEquals(step1ChildJobs?.length, 8, "Expected 8 child jobs for Synthesis Step 1 (2 theses * 2 antitheses per thesis * 2 models = 8 pairs).");
            
            // --- Simulate Step 1 Completion & Wake Parent ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
            for (const parentJobId of jobData.job_ids) {
                await pollForJobStatus(parentJobId, 'pending_next_step', `Parent job ${parentJobId} should be pending_next_step after Step 1.`);
            }
    
            // --- Invoke Synthesis Planner (Step 2: per_source_group) ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
            const { data: step2ChildJobs, error: step2ChildError } = await adminClient.from('dialectic_generation_jobs').select('id').in('parent_job_id', jobData.job_ids).eq('status', 'pending');
            assert(!step2ChildError, `Error fetching step 2 child jobs: ${step2ChildError?.message}`);
            assertEquals(step2ChildJobs?.length, 4, "Expected 4 child jobs for Synthesis Step 2 (2 original thesis groups * 2 models).");
    
            // --- Simulate Step 2 Completion & Wake Parent ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
            for (const parentJobId of jobData.job_ids) {
                await pollForJobStatus(parentJobId, 'pending_next_step', `Parent job ${parentJobId} should be pending_next_step after Step 2.`);
            }
    
            // --- Invoke Synthesis Planner (Step 3: all_to_one) ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
            const { data: step3ChildJobs, error: step3ChildError } = await adminClient.from('dialectic_generation_jobs').select('id').in('parent_job_id', jobData.job_ids).eq('status', 'pending');
            assert(!step3ChildError, `Error fetching step 3 child jobs: ${step3ChildError?.message}`);
            assertEquals(step3ChildJobs?.length, 2, "Expected 2 child jobs for Synthesis Step 3 (one per model, all_to_one).");
            
            // --- Simulate Final Step Completion ---
            await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
    
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
    });

    await t.step("9. should execute the Parenthesis stage", async () => {
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

        const { data: submitData, error: submitError } = await submitStageResponses(
            submitPayload,
            adminClient,
            primaryUser,
            { logger: testLogger, fileManager: testDeps.fileManager, downloadFromStorage }
        );

        assert(!submitError, `Error submitting synthesis responses: ${JSON.stringify(submitError)}`);
        assert(submitData?.updatedSession?.status === 'pending_parenthesis', `Session status should be pending_parenthesis, but was ${submitData?.updatedSession?.status}`);
        testSession = submitData.updatedSession;
        
        // --- Act ---
        const generatePayload: GenerateContributionsPayload = {
            sessionId: testSession.id,
            stageSlug: "parenthesis",
            iterationNumber: 1,
            projectId: testSession.project_id,
        };
        const { data: jobData, error: creationError } = await generateContributions(adminClient, generatePayload, primaryUser, testDeps);
        assert(!creationError, `Error creating parent job for parenthesis: ${creationError?.message}`);
        assertExists(jobData?.job_ids, "Parent job creation for parenthesis did not return job IDs.");

        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);

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
    });

    await t.step("10. should execute the Paralysis stage", async () => {
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

        const { data: submitData, error: submitError } = await submitStageResponses(
            submitPayload,
            adminClient,
            primaryUser,
            { logger: testLogger, fileManager: testDeps.fileManager, downloadFromStorage }
        );

        assert(!submitError, `Error submitting parenthesis responses: ${JSON.stringify(submitError)}`);
        assert(submitData?.updatedSession?.status === 'pending_paralysis', `Session status should be pending_paralysis, but was ${submitData?.updatedSession?.status}`);
        testSession = submitData.updatedSession;
        
        // --- Act ---
        const generatePayload: GenerateContributionsPayload = {
            sessionId: testSession.id,
            stageSlug: "paralysis",
            iterationNumber: 1,
            projectId: testSession.project_id,
        };
        const { data: jobData, error: creationError } = await generateContributions(adminClient, generatePayload, primaryUser, testDeps);
        assert(!creationError, `Error creating parent job for paralysis: ${creationError?.message}`);
        assertExists(jobData?.job_ids, "Parent job creation for paralysis did not return job IDs.");

        const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
        await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);

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
    });



    await t.step("Teardown", teardown);
  },
);