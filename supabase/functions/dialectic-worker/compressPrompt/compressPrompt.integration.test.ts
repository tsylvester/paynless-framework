/**
 * Integration tests for `compressPrompt`: real `compressPrompt`, real `countTokens`,
 * real `constructStoragePath`, real `downloadFromStorage` against real Supabase storage.
 * Boundary-only fakes: `getSortedCompressionCandidates`, `enqueueCompressJobs`,
 * `resolveCompressionSource` — the scorer, enqueue and resolver collaborators this
 * function dispatches to but does not own.
 */
import {
    afterAll,
    beforeAll,
    describe,
    it,
  } from "https://deno.land/std@0.208.0/testing/bdd.ts";
  import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
  import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
  import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
  import {
    coreCleanupTestResources,
    coreCreateAndSetupTestUser,
    coreEnsureTestUserAndWallet,
    initializeSupabaseAdminClient,
    initializeTestDeps,
    registerUndoAction,
    setSharedAdminClient,
    testLogger,
    MOCK_MODEL_CONFIG,
  } from "../../_shared/_integration.test.utils.ts";
  import type { Database } from "../../types_db.ts";
  import { compressPrompt } from "./compressPrompt.ts";
  import type {
    CompressPromptDeps,
    CompressPromptParams,
    CompressPromptPayload,
  } from "./compressPrompt.interface.ts";
  import {
    isCompressPromptErrorReturn,
    isCompressPromptFitsReturn,
    isCompressPromptPendingReturn,
  } from "./compressPrompt.guard.ts";
  import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
  import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
  import { downloadFromStorage } from "../../_shared/supabase_storage_utils.ts";
  import { ContextWindowError } from "../../_shared/utils/errors.ts";
  import { buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
  import { createProject } from "../../dialectic-service/createProject.ts";
  import { startSession } from "../../dialectic-service/startSession.ts";
  import type {
    DialecticProject,
    StartSessionPayload,
  } from "../../dialectic-service/dialectic.interface.ts";
  import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
  import {
    buildDialecticJobRow,
    buildDialecticExecuteJobPayload,
  } from "../../_shared/dialectic.mock.ts";
  import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
  import {
    buildResourceDocument,
  } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
  import type { ResourceDocuments } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.interface.ts";
  import type {
    BoundGetSortedCompressionCandidatesFn,
  } from "../../_shared/utils/vector_utils/vector_utils.provides.ts";
  import type {
    BoundenqueueCompressJobsFn,
  } from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
  import type {
    BoundResolveCompressionSourceFn,
  } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
  import {
    buildCompressionCandidate,
    buildGetSortedCompressionCandidatesSuccessReturn,
  } from "../../_shared/utils/vector_utils/vector_utils.provides.ts";
  import {
    buildenqueueCompressJobsSuccessReturn,
  } from "../enqueueCompressJobs/enqueueCompressJobs.provides.ts";
  import {
    buildCompressibleSourceReturn,
  } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
  import { FileType } from "../../_shared/types/file_manager.types.ts";

  describe("compressPrompt integration (real DB client, real tokenizer, boundary mocks)", () => {
    let adminClient: SupabaseClient<Database>;
    let testUser: User;
    let testUserId: string;
    let testProject: DialecticProject;
    let testSessionId: string;
    let testModelId: string;

    beforeAll(async () => {
      initializeTestDeps();
      adminClient = initializeSupabaseAdminClient();
      setSharedAdminClient(adminClient);

      const { userId, jwt, userClient } = await coreCreateAndSetupTestUser();
      const { data: { user } } = await userClient.auth.getUser();
      assertExists(user, "Test user could not be created");
      testUser = user;
      testUserId = userId;
      void jwt;

      await coreEnsureTestUserAndWallet(testUserId, 1_000_000, "local");

      const formData = new FormData();
      formData.append("projectName", "compressPrompt integration project");
      formData.append("initialUserPromptText", "integration seed prompt");
      formData.append("idempotencyKey", crypto.randomUUID());

      const { data: domain, error: domainError } = await adminClient
        .from("dialectic_domains")
        .select("id")
        .eq("name", "Software Development")
        .single();
      if (domainError || !domain) {
        throw new Error(`Software Development domain required: ${domainError?.message}`);
      }
      formData.append("selectedDomainId", domain.id);

      const associationResponse = await adminClient
        .from("domain_process_associations")
        .select("process_template_id")
        .eq("domain_id", domain.id)
        .eq("is_default_for_domain", true)
        .single();
      if (associationResponse.error !== null) {
        throw associationResponse.error;
      }
      if (associationResponse.data === null) {
        throw new Error("Default domain_process_associations row not found for Software Development");
      }
      const defaultProcessTemplateId: string = associationResponse.data.process_template_id;
      formData.append("processTemplateId", defaultProcessTemplateId);

      const projectResult = await createProject(formData, adminClient, testUser);
      if (projectResult.error || !projectResult.data) {
        throw new Error(`createProject failed: ${projectResult.error?.message}`);
      }
      testProject = projectResult.data;

      const { data: existingModel, error: fetchError } = await adminClient
        .from("ai_providers")
        .select("id")
        .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
        .eq("is_active", true)
        .eq("is_enabled", true)
        .maybeSingle();

      let model = existingModel;
      if (!model && !fetchError) {
        const { data: newModel, error: insertError } = await adminClient
          .from("ai_providers")
          .insert({
            name: "Mock Model",
            api_identifier: MOCK_MODEL_CONFIG.api_identifier,
            description: "compressPrompt integration",
            is_active: true,
            is_enabled: true,
            provider: "dummy",
            config: {
              api_identifier: MOCK_MODEL_CONFIG.api_identifier,
              context_window_tokens: 128000,
              input_token_cost_rate: 0,
              output_token_cost_rate: 0,
              tokenization_strategy: { type: "none" },
              hard_cap_output_tokens: 16000,
              provider_max_input_tokens: 128000,
              provider_max_output_tokens: 16000,
            },
          })
          .select("id")
          .single();
        if (insertError || !newModel?.id) {
          throw new Error(`Failed to create mock model: ${insertError?.message}`);
        }
        model = newModel;
      } else if (fetchError) {
        throw new Error(`Failed to fetch model: ${fetchError.message}`);
      }
      if (!model?.id) {
        throw new Error("Model id missing for startSession");
      }
      testModelId = model.id;

      const sessionPayload: StartSessionPayload = {
        projectId: testProject.id,
        selectedModels: [{ id: testModelId, displayName: "Mock Model" }],
        idempotencyKey: crypto.randomUUID(),
        sessionDescription: "compressPrompt integration session",
      };
      const sessionResult = await startSession(testUser, adminClient, userClient, sessionPayload);
      if (sessionResult.error || !sessionResult.data) {
        throw new Error(`startSession failed: ${sessionResult.error?.message}`);
      }
      testSessionId = sessionResult.data.id;
    });

    afterAll(async () => {
      await coreCleanupTestResources("all");
    });

    it("fits path: small working set with no artifacts returns fits arm with real token count", async () => {
      const modelConfig = buildExtendedModelConfig({
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0001,
        hard_cap_output_tokens: 100_000,
        provider_max_output_tokens: 100_000,
      });

      const doc = buildResourceDocument({
        content: "short content",
        document_key: FileType.HeaderContext,
        stage_slug: "thesis",
        type: "document",
      });
      const resourceDocuments: ResourceDocuments = [doc];

      const executeJobPayload = buildDialecticExecuteJobPayload({
        projectId: testProject.id,
        sessionId: testSessionId,
        model_id: testModelId,
      });
      if (!isJson(executeJobPayload)) throw new Error("executeJobPayload must be Json-compatible");
      const parentJob: DialecticJobRow = buildDialecticJobRow({
        payload: executeJobPayload,
        session_id: testSessionId,
        user_id: testUserId,
      });

      const deps: CompressPromptDeps = {
        logger: testLogger,
        getSortedCompressionCandidates: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [] }),
        enqueueCompressJobs: async () => buildenqueueCompressJobsSuccessReturn(),
        resolveCompressionSource: () => buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case }),
        constructStoragePath,
        downloadFromStorage,
        countTokens,
      };

      const params: CompressPromptParams = {
        dbClient: adminClient,
        isContinuationFlowInitial: false,
        finalTargetThreshold: 50_000,
        balanceAfterCompression: 50_000_000,
        walletBalance: 50_000_000,
      };

      const payload: CompressPromptPayload = {
        parentJob,
        extendedModelConfig: modelConfig,
        inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
        resourceDocuments,
        conversationHistory: [],
        currentUserPrompt: "integration user message",
      };

      const result = await compressPrompt(deps, params, payload);
      assertEquals(isCompressPromptFitsReturn(result), true);
      if (!isCompressPromptFitsReturn(result)) {
        throw new Error("expected fits branch");
      }
      assertEquals(typeof result.resolvedInputTokenCount, "number");
      assertEquals(result.resolvedInputTokenCount > 0, true);
      assertEquals(result.resourceDocuments[0].content, "short content");
    });

    it("over-budget path: large working set enqueues one child and returns pending with parent status updated", async () => {
      const modelConfig = buildExtendedModelConfig({
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0001,
        hard_cap_output_tokens: 100_000,
        provider_max_output_tokens: 100_000,
      });

      const longBody: string = "word ".repeat(200_000);
      const docId: string = crypto.randomUUID();
      const doc = buildResourceDocument({
        id: docId,
        content: longBody,
        document_key: FileType.HeaderContext,
        stage_slug: "thesis",
        type: "document",
      });
      const resourceDocuments: ResourceDocuments = [doc];

      const candidate = buildCompressionCandidate({
        id: docId,
        content: longBody,
        sourceType: "resource",
      });

      const executeJobPayload = buildDialecticExecuteJobPayload({
        projectId: testProject.id,
        sessionId: testSessionId,
        model_id: testModelId,
      });
      if (!isJson(executeJobPayload)) throw new Error("executeJobPayload must be Json-compatible");
      const parentJob: DialecticJobRow = buildDialecticJobRow({
        payload: executeJobPayload,
        session_id: testSessionId,
        user_id: testUserId,
      });

      const { data: insertedJob, error: insertJobErr } = await adminClient
        .from("dialectic_generation_jobs")
        .insert({
          id: parentJob.id,
          session_id: testSessionId,
          user_id: testUserId,
          job_type: "EXECUTE",
          status: "processing",
          payload: executeJobPayload,
          iteration_number: 1,
          stage_slug: "thesis",
          attempt_count: 0,
          max_retries: 3,
          idempotency_key: parentJob.idempotency_key,
          is_test_job: false,
        })
        .select("id")
        .single();
      if (insertJobErr || !insertedJob) {
        throw new Error(`Failed to insert parent job: ${insertJobErr?.message}`);
      }
      registerUndoAction({
        type: "DELETE_CREATED_ROW",
        tableName: "dialectic_generation_jobs",
        criteria: { id: parentJob.id },
        scope: "local",
      });

      const fns: {
        scorer: BoundGetSortedCompressionCandidatesFn;
        enqueue: BoundenqueueCompressJobsFn;
        resolver: BoundResolveCompressionSourceFn;
      } = {
        scorer: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
        enqueue: async () => buildenqueueCompressJobsSuccessReturn(),
        resolver: () => buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.HeaderContext }),
      };
      const enqueueSpy = spy(fns, "enqueue");

      const deps: CompressPromptDeps = {
        logger: testLogger,
        getSortedCompressionCandidates: fns.scorer,
        enqueueCompressJobs: fns.enqueue,
        resolveCompressionSource: fns.resolver,
        constructStoragePath,
        downloadFromStorage,
        countTokens,
      };

      const params: CompressPromptParams = {
        dbClient: adminClient,
        isContinuationFlowInitial: false,
        finalTargetThreshold: 500,
        balanceAfterCompression: 50_000_000,
        walletBalance: 50_000_000,
      };

      const payload: CompressPromptPayload = {
        parentJob,
        extendedModelConfig: modelConfig,
        inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
        resourceDocuments,
        conversationHistory: [],
        currentUserPrompt: "integration user message",
      };

      const result = await compressPrompt(deps, params, payload);
      assertEquals(isCompressPromptPendingReturn(result), true);
      assertEquals(enqueueSpy.calls.length, 1);

      const { data: updatedJob, error: fetchJobErr } = await adminClient
        .from("dialectic_generation_jobs")
        .select("status")
        .eq("id", parentJob.id)
        .single();
      if (fetchJobErr || !updatedJob) {
        throw new Error(`Failed to fetch updated parent job: ${fetchJobErr?.message}`);
      }
      assertEquals(updatedJob.status, "waiting_for_children");
    });

    it("over-budget path with no eligible candidates returns ContextWindowError", async () => {
      const modelConfig = buildExtendedModelConfig({
        input_token_cost_rate: 0.0001,
        output_token_cost_rate: 0.0001,
      });

      const longBody: string = "word ".repeat(200_000);
      const doc = buildResourceDocument({
        content: longBody,
        document_key: FileType.HeaderContext,
        stage_slug: "thesis",
        type: "document",
      });
      const resourceDocuments: ResourceDocuments = [doc];

      const executeJobPayload = buildDialecticExecuteJobPayload({
        projectId: testProject.id,
        sessionId: testSessionId,
        model_id: testModelId,
      });
      if (!isJson(executeJobPayload)) throw new Error("executeJobPayload must be Json-compatible");
      const parentJob: DialecticJobRow = buildDialecticJobRow({
        payload: executeJobPayload,
        session_id: testSessionId,
        user_id: testUserId,
      });

      const deps: CompressPromptDeps = {
        logger: testLogger,
        getSortedCompressionCandidates: async () => buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [] }),
        enqueueCompressJobs: async () => buildenqueueCompressJobsSuccessReturn(),
        resolveCompressionSource: () => buildCompressibleSourceReturn({ sourceType: "resource", documentKey: FileType.business_case }),
        constructStoragePath,
        downloadFromStorage,
        countTokens,
      };

      const params: CompressPromptParams = {
        dbClient: adminClient,
        isContinuationFlowInitial: false,
        finalTargetThreshold: 500,
        balanceAfterCompression: 50_000_000,
        walletBalance: 50_000_000,
      };

      const payload: CompressPromptPayload = {
        parentJob,
        extendedModelConfig: modelConfig,
        inputsRelevance: [{ document_key: FileType.HeaderContext, relevance: 1 }],
        resourceDocuments,
        conversationHistory: [],
        currentUserPrompt: "integration user message",
      };

      const result = await compressPrompt(deps, params, payload);
      assertEquals(isCompressPromptErrorReturn(result), true);
      if (!isCompressPromptErrorReturn(result)) {
        throw new Error("expected error branch");
      }
      assertEquals(result.error instanceof ContextWindowError, true);
      assertEquals(result.retriable, false);
    });
  });
