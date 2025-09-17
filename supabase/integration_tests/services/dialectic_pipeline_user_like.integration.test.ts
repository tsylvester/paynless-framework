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
import { getAiProviderAdapter } from "../../functions/_shared/ai_service/factory.ts";
import {
  type GenerateContributionsPayload,
  type DialecticProject,
  type SubmitStageResponsesPayload,
  type StartSessionSuccessResponse,
  type StartSessionPayload,
  IDialecticJobDeps,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { submitStageResponses } from "../../functions/dialectic-service/submitStageResponses.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { callUnifiedAIModel } from "../../functions/dialectic-service/callModel.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { RagService } from "../../functions/_shared/services/rag_service.ts";
import { IndexingService, LangchainTextSplitter, EmbeddingClient } from "../../functions/_shared/services/indexing_service.ts";
import { countTokens } from '../../functions/_shared/utils/tokenizer_utils.ts';
import { getAiProviderConfig } from '../../functions/dialectic-worker/processComplexJob.ts';
import { PromptAssembler } from "../../functions/_shared/prompt-assembler.ts";
import { DummyAdapter } from "../../functions/_shared/ai_service/dummy_adapter.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { TokenWalletService } from "../../functions/_shared/services/tokenWalletService.ts";
import { continueJob } from "../../functions/dialectic-worker/continueJob.ts";
import { retryJob } from "../../functions/dialectic-worker/retryJob.ts";
import { executeModelCallAndSave } from "../../functions/dialectic-worker/executeModelCallAndSave.ts";
import { planComplexStage } from "../../functions/dialectic-worker/task_isolator.ts";
import { getGranularityPlanner } from '../../functions/dialectic-worker/strategies/granularity.strategies.ts';
import { getSeedPromptForStage } from '../../functions/_shared/utils/dialectic_utils.ts';

// --- Test Suite Setup ---
let adminClient: SupabaseClient<Database>;
let primaryUserClient: SupabaseClient<Database>;
let testDeps: IDialecticJobDeps;

const pollForCondition = async (
  condition: () => Promise<boolean>,
  timeoutMessage: string,
  interval = 500,
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

Deno.test(
  "Dialectic Pipeline User-Like Integration Test",
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
      testLogger.info("[Test Setup] Initializing test environment...");
      
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

      const { data: domain, error: domainError } = await adminClient
        .from('dialectic_domains')
        .select('id')
        .eq('name', 'Software Development')
        .single();
      assert(!domainError, `Failed to fetch test domain: ${domainError?.message}`);
      assertExists(domain, "The 'Software Development' domain must exist in the database for this test to run.");
      testDomainId = domain.id;

      // Get specific known chat providers
      const { data: fetchedProviders, error: providersError } = await adminClient
        .from('ai_providers')
        .select('id, api_identifier')
        .in('api_identifier', ['openai-gpt-4.1', 'anthropic-claude-3-7-sonnet-20250219'])
        .eq('is_active', true)
        .eq('is_default_embedding', false);

      assert(!providersError, `Failed to fetch AI providers: ${providersError?.message}`);
      assert(fetchedProviders && fetchedProviders.length === 2, 
        `Could not find both required providers. Found: ${fetchedProviders?.map(p => p.api_identifier).join(', ') || 'none'}`);

      const modelA = fetchedProviders.find(p => p.api_identifier === 'openai-gpt-4.1');
      const modelB = fetchedProviders.find(p => p.api_identifier === 'anthropic-claude-3-7-sonnet-20250219');
      
      assertExists(modelA, "openai-gpt-4.1 provider not found");
      assertExists(modelB, "anthropic-claude-3-7-sonnet-20250219 provider not found");
      
      modelAId = modelA.id;
      modelBId = modelB.id;
      
      testLogger.info(`[Test Setup] Using providers: ${modelA.api_identifier} (${modelAId}) and ${modelB.api_identifier} (${modelBId})`);

      const { data: embeddingProvider, error: embeddingProviderError } = await adminClient
        .from('ai_providers')
        .select('*')
        .eq('is_default_embedding', true)
        .single();

      assert(!embeddingProviderError, `Failed to fetch default embedding provider: ${embeddingProviderError?.message}`);
      assertExists(embeddingProvider, "No default embedding provider found in the database.");
      
      const embeddingAdapter = getAiProviderAdapter({
        provider: embeddingProvider,
        apiKey: "sk-dummy-key-for-embedding",
        logger: testLogger
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
        getSeedPromptForStage,
        fileManager: new FileManagerService(adminClient, { constructStoragePath }),
        downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
        deleteFromStorage: () => Promise.resolve({ error: null }),
        getExtensionFromMimeType: () => ".md",
        randomUUID: () => crypto.randomUUID(),
        callUnifiedAIModel: (chatApiRequest, userAuthToken, deps) => {
          return callUnifiedAIModel(chatApiRequest, userAuthToken, { ...(deps || {}), isTest: true });
        },
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

      await coreEnsureTestUserAndWallet(primaryUserId, 1000000000, 'local');
      const contextWallet = await realWallet.getWalletForContext(primaryUserId, undefined);
      if (!contextWallet) {
        throw new Error("A token wallet must exist for the test user.");
      }
      testWalletId = contextWallet.walletId;

      testLogger.info("[Test Setup] Test environment initialized successfully");
    };

    const teardown = async () => {
      testLogger.info("[Test Teardown] Cleaning up test resources...");
      await coreCleanupTestResources();
      testProject = null;
      testSession = null;
      testLogger.info("[Test Teardown] Cleanup completed");
    };

    await t.step("Setup", setup);

    await t.step("1. Create Project", async () => {
      testLogger.info("[User Action] Creating new dialectic project...");
      
      const formData = new FormData();
      formData.append("projectName", "User-Like E2E Test Project");
      formData.append("initialUserPromptText", "This is the initial prompt for our user-like E2E test.");
      formData.append("selectedDomainId", testDomainId);
      formData.append("defaultProviderId", "165dfcb3-a0f7-521a-8707-3a1a66f275cc");

      const { data, error } = await createProject(
        formData,
        adminClient,
        primaryUser
      );

      assert(!error, `Failed to create project: ${JSON.stringify(error)}`);
      assertExists(data, "Project creation did not return data.");

      if (data) {
        assert(data.project_name === "User-Like E2E Test Project", "Project name does not match.");
        assertExists(data.initial_prompt_resource_id, "Initial prompt resource was not created.");
        testProject = data;
        testLogger.info(`[User Action] Project created successfully: ${data.id}`);
      }
    });

    await t.step("2. Start Session", async () => {
      if (!testProject) {
        assert(testProject, "Cannot start session without a project.");
        return;
      }

      testLogger.info("[User Action] Starting new session...");

      const payload: StartSessionPayload = {
        projectId: testProject.id,
        selectedModelIds: [modelAId, modelBId],
        sessionDescription: "User-Like E2E Test Session",
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
        testLogger.info(`[User Action] Session started successfully: ${data.id}`);
      }
    });

    await t.step({
      name: "3. Thesis Stage",
      ignore: false,
      fn: async () => {
        if (!testSession) {
          assert(testSession, "Cannot test thesis stage without a session.");
          return;
        }

        testLogger.info("[Stage] Starting Thesis stage...");

        // Use the actual generateContributions function
        const generatePayload: GenerateContributionsPayload = {
          sessionId: testSession.id,
          stageSlug: "thesis",
          iterationNumber: 1,
          projectId: testSession.project_id,
          continueUntilComplete: true,
          walletId: testWalletId,
          is_test_job: false, // Use production flow
        };

        const { data: jobData, error: creationError } = await generateContributions(
          adminClient,
          generatePayload,
          primaryUser,
          testDeps,
          primaryUserJwt,
        );

        if(!jobData) {
          throw new Error("Job creation for thesis did not return data");
        }

        assert(!creationError, `Error creating jobs for thesis: ${creationError?.message}`);
        assertExists(jobData, `Job creation for thesis did not return data`);
        assertExists(jobData.job_ids, `Job creation for thesis did not return job_ids`);

        testLogger.info(`[User Action] Created ${jobData.job_ids.length} jobs for thesis stage: ${jobData.job_ids.join(', ')}`);

        // Wait for jobs to complete using the actual database
        await pollForCondition(async () => {
          const { data: pendingJobs } = await adminClient
            .from('dialectic_generation_jobs')
            .select('id, status')
            .eq('session_id', testSession!.id)
            .eq('stage_slug', 'thesis')
            .eq('iteration_number', 1)
            .in('status', ['pending', 'processing', 'retrying', 'pending_continuation', 'pending_next_step', 'waiting_for_children']);
          
          if (pendingJobs && pendingJobs.length > 0) {
            testLogger.info(`[Job Monitor] ${pendingJobs.length} jobs still pending for thesis: ${pendingJobs.map(j => `${j.id}(${j.status})`).join(', ')}`);
            return false;
          }
          return true;
        }, "All jobs for thesis stage should complete");

        // Verify contributions exist using the actual database
        const { data: contributions, error: contribError } = await adminClient
          .from('dialectic_contributions')
          .select('*')
          .eq('session_id', testSession.id)
          .eq('stage', 'thesis')
          .eq('iteration_number', 1)
          .eq('is_latest_edit', true);

        assert(!contribError, `Failed to fetch contributions for thesis: ${contribError?.message}`);
        assertExists(contributions, "No contributions found for thesis stage");
        assertEquals(contributions.length, 2, `Expected 2 contributions for thesis stage, but found ${contributions.length}`);

        testLogger.info(`[Stage Verification] Found ${contributions.length} contributions for thesis stage`);

        // Use the actual submitStageResponses function
        const submitPayload: SubmitStageResponsesPayload = {
          sessionId: testSession.id,
          projectId: testSession.project_id,
          stageSlug: 'thesis',
          currentIterationNumber: 1,
          responses: contributions.map(c => ({
            originalContributionId: c.id,
            responseText: `User feedback for thesis contribution ${c.id}. This is simulated user feedback.`
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
        
        const { data: submitData, error: submitError, status: submitStatus } = await submitStageResponses(
          submitPayload,
          adminClient,
          primaryUser,
          submitDeps
        );
        
        assert(!submitError, `Error submitting thesis responses: ${JSON.stringify(submitError)}`);
        assertExists(submitData, `Thesis submission did not return data`);
        
        testLogger.info(`[User Action] Thesis stage feedback submitted successfully. Status: ${submitStatus}`);

        // Wait for session to advance using the actual database
        await pollForCondition(async () => {
          const { data: sessionData, error } = await adminClient
            .from('dialectic_sessions')
            .select('current_stage:current_stage_id(slug)')
            .eq('id', testSession!.id)
            .single();
          
          if (error || !sessionData || !sessionData.current_stage || Array.isArray(sessionData.current_stage)) {
            return false;
          }
          
          const currentStage = sessionData.current_stage.slug;
          testLogger.info(`[Session Monitor] Current stage: ${currentStage}, Expected: antithesis`);
          return currentStage === 'antithesis';
        }, "Session should advance to antithesis stage after thesis submission");

        testLogger.info("[Stage] Thesis stage completed successfully");
      }
    });

    await t.step({
      name: "4. Antithesis Stage",
      ignore: true,
      fn: async () => {
        if (!testSession) {
          assert(testSession, "Cannot test antithesis stage without a session.");
          return;
        }

        testLogger.info("[Stage] Starting Antithesis stage...");

        // Use the actual generateContributions function
        const generatePayload: GenerateContributionsPayload = {
          sessionId: testSession.id,
          stageSlug: "antithesis",
          iterationNumber: 1,
          projectId: testSession.project_id,
          continueUntilComplete: true,
          walletId: testWalletId,
          is_test_job: false, // Use production flow
        };

        const { data: jobData, error: creationError } = await generateContributions(
          adminClient,
          generatePayload,
          primaryUser,
          testDeps,
          primaryUserJwt,
        );

        if (!jobData) {
          throw new Error("Job creation for antithesis did not return data");
        }

        assert(!creationError, `Error creating jobs for antithesis: ${creationError?.message}`);
        assertExists(jobData, `Job creation for antithesis did not return data`);
        assertExists(jobData.job_ids, `Job creation for antithesis did not return job_ids`);

        testLogger.info(`[User Action] Created ${jobData.job_ids.length} jobs for antithesis stage: ${jobData.job_ids.join(', ')}`);

        // Wait for jobs to complete using the actual database
        await pollForCondition(async () => {
          const { data: pendingJobs } = await adminClient
            .from('dialectic_generation_jobs')
            .select('id, status')
            .eq('session_id', testSession!.id)
            .eq('stage_slug', 'antithesis')
            .eq('iteration_number', 1)
            .in('status', ['pending', 'processing', 'retrying', 'pending_continuation', 'pending_next_step', 'waiting_for_children']);
          
          if (pendingJobs && pendingJobs.length > 0) {
            testLogger.info(`[Job Monitor] ${pendingJobs.length} jobs still pending for antithesis: ${pendingJobs.map(j => `${j.id}(${j.status})`).join(', ')}`);
            return false;
          }
          return true;
        }, "All jobs for antithesis stage should complete");

        // Verify contributions exist using the actual database
        const { data: contributions, error: contribError } = await adminClient
          .from('dialectic_contributions')
          .select('*')
          .eq('session_id', testSession.id)
          .eq('stage', 'antithesis')
          .eq('iteration_number', 1)
          .eq('is_latest_edit', true);

        assert(!contribError, `Failed to fetch contributions for antithesis: ${contribError?.message}`);
        assertExists(contributions, "No contributions found for antithesis stage");
        assertEquals(contributions.length, 4, `Expected 4 contributions for antithesis stage, but found ${contributions.length}`);

        testLogger.info(`[Stage Verification] Found ${contributions.length} contributions for antithesis stage`);

        // Use the actual submitStageResponses function
        const submitPayload: SubmitStageResponsesPayload = {
          sessionId: testSession.id,
          projectId: testSession.project_id,
          stageSlug: 'antithesis',
          currentIterationNumber: 1,
          responses: contributions.map(c => ({
            originalContributionId: c.id,
            responseText: `User feedback for antithesis contribution ${c.id}. This is simulated user feedback.`
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
        
        const { data: submitData, error: submitError, status: submitStatus } = await submitStageResponses(
          submitPayload,
          adminClient,
          primaryUser,
          submitDeps
        );
        
        assert(!submitError, `Error submitting antithesis responses: ${JSON.stringify(submitError)}`);
        assertExists(submitData, `Antithesis submission did not return data`);
        
        testLogger.info(`[User Action] Antithesis stage feedback submitted successfully. Status: ${submitStatus}`);

        // Wait for session to advance using the actual database
        await pollForCondition(async () => {
          const { data: sessionData, error } = await adminClient
            .from('dialectic_sessions')
            .select('current_stage:current_stage_id(slug)')
            .eq('id', testSession!.id)
            .single();
          
          if (error || !sessionData || !sessionData.current_stage || Array.isArray(sessionData.current_stage)) {
            return false;
          }
          
          const currentStage = sessionData.current_stage.slug;
          testLogger.info(`[Session Monitor] Current stage: ${currentStage}, Expected: synthesis`);
          return currentStage === 'synthesis';
        }, "Session should advance to synthesis stage after antithesis submission");

        testLogger.info("[Stage] Antithesis stage completed successfully");
      }
    });

    await t.step({
      name: "5. Synthesis Stage",
      ignore: true,
      fn: async () => {
        if (!testSession) {
          assert(testSession, "Cannot test synthesis stage without a session.");
          return;
        }

        testLogger.info("[Stage] Starting Synthesis stage...");

        // Use the actual generateContributions function
        const generatePayload: GenerateContributionsPayload = {
          sessionId: testSession.id,
          stageSlug: "synthesis",
          iterationNumber: 1,
          projectId: testSession.project_id,
          continueUntilComplete: true,
          walletId: testWalletId,
          is_test_job: false, // Use production flow
        };

        const { data: jobData, error: creationError } = await generateContributions(
          adminClient,
          generatePayload,
          primaryUser,
          testDeps,
          primaryUserJwt,
        );

        if (!jobData) {
          throw new Error("Job creation for synthesis did not return data");
        }

        assert(!creationError, `Error creating jobs for synthesis: ${creationError?.message}`);
        assertExists(jobData, `Job creation for synthesis did not return data`);
        assertExists(jobData.job_ids, `Job creation for synthesis did not return job_ids`);

        testLogger.info(`[User Action] Created ${jobData.job_ids.length} jobs for synthesis stage: ${jobData.job_ids.join(', ')}`);

        // Wait for jobs to complete using the actual database
        await pollForCondition(async () => {
          const { data: pendingJobs } = await adminClient
            .from('dialectic_generation_jobs')
            .select('id, status')
            .eq('session_id', testSession!.id)
            .eq('stage_slug', 'synthesis')
            .eq('iteration_number', 1)
            .in('status', ['pending', 'processing', 'retrying', 'pending_continuation', 'pending_next_step', 'waiting_for_children']);
          
          if (pendingJobs && pendingJobs.length > 0) {
            testLogger.info(`[Job Monitor] ${pendingJobs.length} jobs still pending for synthesis: ${pendingJobs.map(j => `${j.id}(${j.status})`).join(', ')}`);
            return false;
          }
          return true;
        }, "All jobs for synthesis stage should complete");

        // Verify contributions exist using the actual database
        const { data: contributions, error: contribError } = await adminClient
          .from('dialectic_contributions')
          .select('*')
          .eq('session_id', testSession.id)
          .eq('stage', 'synthesis')
          .eq('iteration_number', 1)
          .eq('is_latest_edit', true);

        assert(!contribError, `Failed to fetch contributions for synthesis: ${contribError?.message}`);
        assertExists(contributions, "No contributions found for synthesis stage");
        assertEquals(contributions.length, 2, `Expected 2 contributions for synthesis stage, but found ${contributions.length}`);

        testLogger.info(`[Stage Verification] Found ${contributions.length} contributions for synthesis stage`);

        // Use the actual submitStageResponses function
        const submitPayload: SubmitStageResponsesPayload = {
          sessionId: testSession.id,
          projectId: testSession.project_id,
          stageSlug: 'synthesis',
          currentIterationNumber: 1,
          responses: contributions.map(c => ({
            originalContributionId: c.id,
            responseText: `User feedback for synthesis contribution ${c.id}. This is simulated user feedback.`
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
        
        const { data: submitData, error: submitError, status: submitStatus } = await submitStageResponses(
          submitPayload,
          adminClient,
          primaryUser,
          submitDeps
        );
        
        assert(!submitError, `Error submitting synthesis responses: ${JSON.stringify(submitError)}`);
        assertExists(submitData, `Synthesis submission did not return data`);
        
        testLogger.info(`[User Action] Synthesis stage feedback submitted successfully. Status: ${submitStatus}`);

        // Wait for session to advance using the actual database
        await pollForCondition(async () => {
          const { data: sessionData, error } = await adminClient
            .from('dialectic_sessions')
            .select('current_stage:current_stage_id(slug)')
            .eq('id', testSession!.id)
            .single();
          
          if (error || !sessionData || !sessionData.current_stage || Array.isArray(sessionData.current_stage)) {
            return false;
          }
          
          const currentStage = sessionData.current_stage.slug;
          testLogger.info(`[Session Monitor] Current stage: ${currentStage}, Expected: parenthesis`);
          return currentStage === 'parenthesis';
        }, "Session should advance to parenthesis stage after synthesis submission");

        testLogger.info("[Stage] Synthesis stage completed successfully");
      }
    });

    await t.step({
      name: "6. Parenthesis Stage",
      ignore: true,
      fn: async () => {
        if (!testSession) {
          assert(testSession, "Cannot test parenthesis stage without a session.");
          return;
        }

        testLogger.info("[Stage] Starting Parenthesis stage...");

        // Use the actual generateContributions function
        const generatePayload: GenerateContributionsPayload = {
          sessionId: testSession.id,
          stageSlug: "parenthesis",
          iterationNumber: 1,
          projectId: testSession.project_id,
          continueUntilComplete: true,
          walletId: testWalletId,
          is_test_job: false, // Use production flow
        };

        const { data: jobData, error: creationError } = await generateContributions(
          adminClient,
          generatePayload,
          primaryUser,
          testDeps,
          primaryUserJwt,
        );

        if (!jobData) {
          throw new Error("Job creation for parenthesis did not return data");
        }

        assert(!creationError, `Error creating jobs for parenthesis: ${creationError?.message}`);
        assertExists(jobData, `Job creation for parenthesis did not return data`);
        assertExists(jobData.job_ids, `Job creation for parenthesis did not return job_ids`);

        testLogger.info(`[User Action] Created ${jobData.job_ids.length} jobs for parenthesis stage: ${jobData.job_ids.join(', ')}`);

        // Wait for jobs to complete using the actual database
        await pollForCondition(async () => {
          const { data: pendingJobs } = await adminClient
            .from('dialectic_generation_jobs')
            .select('id, status')
            .eq('session_id', testSession!.id)
            .eq('stage_slug', 'parenthesis')
            .eq('iteration_number', 1)
            .in('status', ['pending', 'processing', 'retrying', 'pending_continuation', 'pending_next_step', 'waiting_for_children']);
          
          if (pendingJobs && pendingJobs.length > 0) {
            testLogger.info(`[Job Monitor] ${pendingJobs.length} jobs still pending for parenthesis: ${pendingJobs.map(j => `${j.id}(${j.status})`).join(', ')}`);
            return false;
          }
          return true;
        }, "All jobs for parenthesis stage should complete");

        // Verify contributions exist using the actual database
        const { data: contributions, error: contribError } = await adminClient
          .from('dialectic_contributions')
          .select('*')
          .eq('session_id', testSession.id)
          .eq('stage', 'parenthesis')
          .eq('iteration_number', 1)
          .eq('is_latest_edit', true);

        assert(!contribError, `Failed to fetch contributions for parenthesis: ${contribError?.message}`);
        assertExists(contributions, "No contributions found for parenthesis stage");
        assertEquals(contributions.length, 2, `Expected 2 contributions for parenthesis stage, but found ${contributions.length}`);

        testLogger.info(`[Stage Verification] Found ${contributions.length} contributions for parenthesis stage`);

        // Use the actual submitStageResponses function
        const submitPayload: SubmitStageResponsesPayload = {
          sessionId: testSession.id,
          projectId: testSession.project_id,
          stageSlug: 'parenthesis',
          currentIterationNumber: 1,
          responses: contributions.map(c => ({
            originalContributionId: c.id,
            responseText: `User feedback for parenthesis contribution ${c.id}. This is simulated user feedback.`
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
        
        const { data: submitData, error: submitError, status: submitStatus } = await submitStageResponses(
          submitPayload,
          adminClient,
          primaryUser,
          submitDeps
        );
        
        assert(!submitError, `Error submitting parenthesis responses: ${JSON.stringify(submitError)}`);
        assertExists(submitData, `Parenthesis submission did not return data`);
        
        testLogger.info(`[User Action] Parenthesis stage feedback submitted successfully. Status: ${submitStatus}`);

        // Wait for session to advance using the actual database
        await pollForCondition(async () => {
          const { data: sessionData, error } = await adminClient
            .from('dialectic_sessions')
            .select('current_stage:current_stage_id(slug)')
            .eq('id', testSession!.id)
            .single();
          
          if (error || !sessionData || !sessionData.current_stage || Array.isArray(sessionData.current_stage)) {
            return false;
          }
          
          const currentStage = sessionData.current_stage.slug;
          testLogger.info(`[Session Monitor] Current stage: ${currentStage}, Expected: paralysis`);
          return currentStage === 'paralysis';
        }, "Session should advance to paralysis stage after parenthesis submission");

        testLogger.info("[Stage] Parenthesis stage completed successfully");
      }
    });

    await t.step({
      name: "7. Paralysis Stage",
      ignore: true,
      fn: async () => {
        if (!testSession) {
          assert(testSession, "Cannot test paralysis stage without a session.");
          return;
        }

        testLogger.info("[Stage] Starting Paralysis stage...");

        // Use the actual generateContributions function
        const generatePayload: GenerateContributionsPayload = {
          sessionId: testSession.id,
          stageSlug: "paralysis",
          iterationNumber: 1,
          projectId: testSession.project_id,
          continueUntilComplete: true,
          walletId: testWalletId,
          is_test_job: false, // Use production flow
        };

        const { data: jobData, error: creationError } = await generateContributions(
          adminClient,
          generatePayload,
          primaryUser,
          testDeps,
          primaryUserJwt,
        );

        if (!jobData) {
          throw new Error("Job creation for paralysis did not return data");
        }

        assert(!creationError, `Error creating jobs for paralysis: ${creationError?.message}`);
        assertExists(jobData, `Job creation for paralysis did not return data`);
        assertExists(jobData.job_ids, `Job creation for paralysis did not return job_ids`);

        testLogger.info(`[User Action] Created ${jobData.job_ids.length} jobs for paralysis stage: ${jobData.job_ids.join(', ')}`);

        // Wait for jobs to complete using the actual database
        await pollForCondition(async () => {
          const { data: pendingJobs } = await adminClient
            .from('dialectic_generation_jobs')
            .select('id, status')
            .eq('session_id', testSession!.id)
            .eq('stage_slug', 'paralysis')
            .eq('iteration_number', 1)
            .in('status', ['pending', 'processing', 'retrying', 'pending_continuation', 'pending_next_step', 'waiting_for_children']);
          
          if (pendingJobs && pendingJobs.length > 0) {
            testLogger.info(`[Job Monitor] ${pendingJobs.length} jobs still pending for paralysis: ${pendingJobs.map(j => `${j.id}(${j.status})`).join(', ')}`);
            return false;
          }
          return true;
        }, "All jobs for paralysis stage should complete");

        // Verify contributions exist using the actual database
        const { data: contributions, error: contribError } = await adminClient
          .from('dialectic_contributions')
          .select('*')
          .eq('session_id', testSession.id)
          .eq('stage', 'paralysis')
          .eq('iteration_number', 1)
          .eq('is_latest_edit', true);

        assert(!contribError, `Failed to fetch contributions for paralysis: ${contribError?.message}`);
        assertExists(contributions, "No contributions found for paralysis stage");
        assertEquals(contributions.length, 2, `Expected 2 contributions for paralysis stage, but found ${contributions.length}`);

        testLogger.info(`[Stage Verification] Found ${contributions.length} contributions for paralysis stage`);

        // Use the actual submitStageResponses function
        const submitPayload: SubmitStageResponsesPayload = {
          sessionId: testSession.id,
          projectId: testSession.project_id,
          stageSlug: 'paralysis',
          currentIterationNumber: 1,
          responses: contributions.map(c => ({
            originalContributionId: c.id,
            responseText: `User feedback for paralysis contribution ${c.id}. This is simulated user feedback.`
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
        
        const { data: submitData, error: submitError, status: submitStatus } = await submitStageResponses(
          submitPayload,
          adminClient,
          primaryUser,
          submitDeps
        );
        
        assert(!submitError, `Error submitting paralysis responses: ${JSON.stringify(submitError)}`);
        assertExists(submitData, `Paralysis submission did not return data`);
        
        testLogger.info(`[User Action] Paralysis stage feedback submitted successfully. Status: ${submitStatus}`);

        testLogger.info("[Stage] Paralysis stage completed successfully");
      }
    });

    await t.step({
      name: "8. Final Verification",
      ignore: true,
      fn: async () => {
        if (!testSession) {
          assert(testSession, "Cannot perform final verification without a session.");
          return;
        }

        testLogger.info("[Final Verification] Verifying complete pipeline execution...");

        // Verify all stages have contributions using the actual database
        const stages = ["thesis", "antithesis", "synthesis", "parenthesis", "paralysis"];
        let totalContributions = 0;

        for (const stage of stages) {
          const { data: contributions, error: contribError } = await adminClient
            .from('dialectic_contributions')
            .select('*')
            .eq('session_id', testSession.id)
            .eq('stage', stage)
            .eq('iteration_number', 1)
            .eq('is_latest_edit', true);

          if (!contribError && contributions) {
            totalContributions += contributions.length;
            testLogger.info(`[Final Verification] ${stage} stage: ${contributions.length} contributions`);
          }
        }

        testLogger.info(`[Final Verification] Total contributions across all stages: ${totalContributions}`);
        assert(totalContributions > 0, "No contributions were generated across all stages");

        // Verify session status using the actual database
        const { data: finalSession, error: sessionError } = await adminClient
          .from('dialectic_sessions')
          .select('status, current_stage:current_stage_id(slug)')
          .eq('id', testSession.id)
          .single();

        assert(!sessionError, `Failed to fetch final session status: ${sessionError?.message}`);
        assertExists(finalSession, "Final session data not found");

        testLogger.info(`[Final Verification] Final session status: ${finalSession.status}`);
        testLogger.info(`[Final Verification] Final session stage: ${finalSession.current_stage?.slug || 'unknown'}`);

        testLogger.info("[Final Verification] Complete pipeline verification successful");
      }
    });

    await t.step("Teardown", teardown);
  },
);
