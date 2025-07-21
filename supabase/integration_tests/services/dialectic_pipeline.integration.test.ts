import { assert, assertExists, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type Stub, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { type SupabaseClient, type User, type PostgrestSingleResponse } from "npm:@supabase/supabase-js@2";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  setSharedAdminClient,
  testLogger,
} from "../../functions/_shared/_integration.test.utils.ts";
import { type Database, type Json } from "../../functions/types_db.ts";
import { getAiProviderAdapter } from "../../functions/_shared/ai_service/factory.ts";
import { MockAiProviderAdapter } from "../../functions/_shared/ai_service/ai_provider.mock.ts";
import {
  type GenerateContributionsDeps,
  type GenerateContributionsPayload,
  type DialecticJobRow,
  type DialecticProject,
  type SubmitStageResponsesPayload,
  type StartSessionSuccessResponse,
  type StartSessionPayload,
  ProcessSimpleJobDeps,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { isJobResultsWithModelProcessing, isDialecticJobPayload, isDialecticJobRow } from "../../functions/_shared/utils/type_guards.ts";
import { isTokenUsage, type ChatApiRequest } from "../../functions/_shared/types.ts";
import { type IJobProcessors } from "../../functions/dialectic-worker/processJob.ts";
import { processSimpleJob } from "../../functions/dialectic-worker/processSimpleJob.ts";
import { processComplexJob } from "../../functions/dialectic-worker/processComplexJob.ts";
import { planComplexStage } from "../../functions/dialectic-worker/task_isolator.ts";
import { handleJob } from "../../functions/dialectic-worker/index.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";

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
        .in('status', ['pending', 'retrying']);

    assert(!error, `Failed to fetch pending jobs: ${error?.message}`);
    assertExists(pendingJobs, "No pending jobs found to execute.");
    
    testLogger.info(`[Test Helper] Found ${pendingJobs.length} pending jobs to execute.`);

    for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
            throw new Error(`Fetched job is not a valid DialecticJobRow: ${JSON.stringify(job)}`);
        }
        testLogger.info(`[Test Helper] Executing job ${job.id} with status ${job.status}`);
        await handleJob(adminClient, job, deps, authToken, mockProcessors);
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

        const { data: modelA, error: modelAError } = await adminClient
          .from('ai_providers')
          .select('id')
          .eq('api_identifier', 'gpt-4-turbo')
          .single();
        assert(!modelAError, `Failed to fetch gpt-4-turbo provider: ${modelAError?.message}`);
        assertExists(modelA, "The 'gpt-4-turbo' AI provider must exist in the database.");
        modelAId = modelA.id;

        const { data: modelB, error: modelBError } = await adminClient
          .from('ai_providers')
          .select('id')
          .eq('api_identifier', 'claude-3-opus')
          .single();
        assert(!modelBError, `Failed to fetch claude-3-opus provider: ${modelBError?.message}`);
        assertExists(modelB, "The 'claude-3-opus' AI provider must exist in the database.");
        modelBId = modelB.id;

        factoryStub = stub(
            { getAiProviderAdapter },
            "getAiProviderAdapter",
            () => mockAiAdapter,
        );
        mockAiAdapter.reset();

        testDeps = {
            logger: testLogger,
            fileManager: new FileManagerService(adminClient),
            downloadFromStorage: (client, bucket, path) => downloadFromStorage(client, bucket, path),
            deleteFromStorage: () => Promise.resolve({ error: null }), // Can remain a mock for now
            getExtensionFromMimeType: () => ".md",
            randomUUID: () => crypto.randomUUID(),
            callUnifiedAIModel: (modelId, prompt, chatId, authToken, options) => {
                const request: ChatApiRequest = {
                    message: prompt,
                    providerId: modelId,
                    promptId: options?.currentStageSystemPromptId || '__none__',
                    chatId: chatId === null ? undefined : chatId,
                    walletId: options?.walletId,
                    max_tokens_to_generate: options?.customParameters?.max_tokens_to_generate,
                };
                
                return mockAiAdapter.sendMessage(request, modelId, authToken)
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
            continueJob: () => Promise.resolve({ enqueued: true, error: undefined }),
            retryJob: () => Promise.resolve({ error: undefined }),
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

      // Configure mock AI adapter for failures and continuations
      mockAiAdapter.setFailureForModel(modelAId, 1, new Error("Test-induced AI failure"));
      mockAiAdapter.setContinuationForModel(modelBId, 1, "This is the final continued part.");

      const generatePayload: GenerateContributionsPayload = {
        sessionId: testSession.id,
        stageSlug: "thesis",
        iterationNumber: 1,
        projectId: testSession.project_id,
        selectedModelIds: testSession.selected_model_ids || [],
      };

      const { data: jobData, error: creationError } = await generateContributions(
        adminClient,
        generatePayload,
        primaryUser,
        testDeps,
      );
      assert(!creationError, `Error creating jobs: ${creationError?.message}`);
      assertExists(jobData, "Job creation did not return data");
      assertExists(jobData?.job_ids, "Job creation data did not include job_ids");
      assertEquals(jobData?.job_ids?.length, generatePayload.selectedModelIds.length, "The number of created jobs does not match the number of selected models.");

      // Manually invoke the worker for all created jobs, simulating the DB webhook.
      const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };
      await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
        
      // Now, poll until ALL jobs for this session are resolved.
      // This validates that the initial jobs, retries, AND any trigger-invoked continuation jobs have completed.
      await pollForCondition(async () => {
        if (!testSession) return false;
        const { data: pendingJobs } = await adminClient
          .from('dialectic_generation_jobs')
          .select('id')
          .eq('session_id', testSession.id)
          .in('status', ['pending', 'processing', 'pending_continuation', 'retrying']);
        return pendingJobs !== null && pendingJobs.length === 0;
      }, "All jobs for the session, including continuations, should be completed");

      // Fetch the generated contributions to prepare for submission
      const { data: contributions, error: contribError } = await adminClient
        .from('dialectic_contributions')
        .select('*')
        .eq('session_id', testSession.id)
        .eq('stage', 'thesis');

      assert(!contribError, `Error fetching contributions: ${contribError?.message}`);
      assertExists(contributions, "No contributions were generated for the thesis stage.");
      assert(contributions.length > 0, "Contribution array is empty.");

      // Submit the responses
      const submitPayload: SubmitStageResponsesPayload = {
        sessionId: testSession.id,
        projectId: testSession.project_id,
        stageSlug: 'thesis',
        currentIterationNumber: 1,
        responses: contributions.map(c => ({
          originalContributionId: c.id,
          responseText: `This is the selected response for contribution ${c.id}.`
        }))
      };

      const { data: submitData, error: submitError } = await submitStageResponses(
        submitPayload,
        adminClient,
        primaryUser,
        { logger: testLogger, fileManager: testDeps.fileManager, downloadFromStorage: testDeps.downloadFromStorage }
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

    await t.step("4. should FAIL to generate contributions for Antithesis stage", async () => {
       if (!testSession) {
        assert(testSession, "Cannot test antithesis without a session.");
        return;
      }
      
      const generatePayload: GenerateContributionsPayload = {
        sessionId: testSession.id,
        stageSlug: "antithesis",
        iterationNumber: 1,
        projectId: testSession.project_id,
        selectedModelIds: testSession.selected_model_ids || [],
      };

      try {
        const { data: jobData, error: creationError } = await generateContributions(
          adminClient,
          generatePayload,
          primaryUser,
          testDeps,
        );
        assert(!creationError);
        assertExists(jobData);

        if (jobData) {
          const mockProcessors: IJobProcessors = { processSimpleJob, processComplexJob, planComplexStage };
          await executePendingDialecticJobs(testSession.id, testDeps, primaryUserJwt, mockProcessors);
        }
        
        assert(false, "Antithesis generation was expected to fail but succeeded.");

      } catch (e) {
        if (e instanceof Error) {
          assert(e.message.includes("Task Isolation strategy not yet implemented"), `Error message did not match expected failure reason. Got: ${e.message}`);
        } else {
          assert(false, "An unexpected non-Error type was thrown.");
        }
      }
    });

    await t.step("5. should submit antithesis responses", async () => {
      assert(false, "Not yet implemented");
    });

    await t.step("6. should generate contributions for Synthesis stage", async () => {
      assert(false, "Not yet implemented");
    });


    await t.step("Teardown", teardown);
  },
);