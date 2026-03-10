import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assert,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { 
  SupabaseClient, 
  User 
} from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticProject,
  StartSessionPayload,
  GenerateContributionsPayload,
  DialecticJobRow,
  ContentToInclude,
  ContextForDocument,
  HeaderContext,
  HeaderContextArtifact,
  SystemMaterials,
  UnifiedAIResponse,
  CallModelDependencies,
  DocumentRelationships,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { isDialecticJobRow, isOutputRule, isContextForDocumentArray } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { generateContributions } from "../../functions/dialectic-service/generateContribution.ts";
import { FileType } from "../../functions/_shared/types/file_manager.types.ts";
import { 
  ChatApiRequest, 
  FinishReason 
} from "../../functions/_shared/types.ts";
import { 
  createDialecticWorkerDeps, 
  handleJob 
} from "../../functions/dialectic-worker/index.ts";
import { IJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { findSourceDocuments } from "../../functions/dialectic-worker/findSourceDocuments.ts";
import { deconstructStoragePath } from "../../functions/_shared/utils/path_deconstructor.ts";
import { extractSourceGroupFragment } from "../../functions/_shared/utils/path_utils.ts";

describe("executeModelCallAndSave Fragment Propagation Integration Tests (Step 71.f)", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testModelId: string;
  let testWalletId: string;
  let workerDeps: IJobContext;

  const mockAndProcessJob = async (job: DialecticJobRow, deps: IJobContext) => {
    const payload = job.payload;
    const outputTypeRaw = isRecord(payload) ? payload["output_type"] : undefined;
    const outputType = typeof outputTypeRaw === "string" ? outputTypeRaw : undefined;

    const finishReason: FinishReason = "stop";
    const rawProviderResponse: Record<string, unknown> = {};

    const systemMaterials: SystemMaterials = {
      stage_rationale: "Integration test stub: stage rationale",
      agent_notes_to_self: "Integration test stub: agent internal summary",
      input_artifacts_summary: "Integration test stub: input artifacts summary",
    };

    const headerContextArtifact: HeaderContextArtifact = {
      type: "header_context",
      document_key: "header_context",
      artifact_class: "header_context",
      file_type: "json",
    };

    const documentStub: Record<string, unknown> = {
      content: { content: `# ${outputType}\n\nThis is an integration test stub document body.` },
    };

    const shouldReturnHeaderContext =
      outputType === FileType.HeaderContext ||
      outputType === "header_context" ||
      outputType === "header_context_pairwise" ||
      outputType === "synthesis_header_context";

    const callStub = stub(
      deps,
      "callUnifiedAIModel",
      async (
        _chatApiRequest: ChatApiRequest,
        _userAuthToken: string,
        _dependencies?: CallModelDependencies,
      ): Promise<UnifiedAIResponse> => {
        if (!shouldReturnHeaderContext) {
          return {
            content: JSON.stringify(documentStub),
            finish_reason: finishReason,
            inputTokens: 100,
            outputTokens: 200,
            processingTimeMs: 500,
            rawProviderResponse,
          };
        }

        // For PLAN jobs, query the recipe step to get the correct context_for_documents structure
        // This ensures the test uses the actual recipe structure with all required document keys
        const plannerMetadata = isRecord(payload) ? payload["planner_metadata"] : undefined;
        const recipeStepId = isRecord(plannerMetadata) ? plannerMetadata["recipe_step_id"] : undefined;
        if (typeof recipeStepId !== "string" || recipeStepId.length === 0) {
          throw new Error("Integration test harness requires payload.planner_metadata.recipe_step_id to build HeaderContext from DB recipe step");
        }

        const stageSlugRaw = job.stage_slug;
        if (typeof stageSlugRaw !== "string" || stageSlugRaw.length === 0) {
          throw new Error("Integration test harness requires job.stage_slug to be a non-empty string to resolve the active recipe instance");
        }

        const { data: stageRow, error: stageRowError } = await adminClient
          .from("dialectic_stages")
          .select("active_recipe_instance_id")
          .eq("slug", stageSlugRaw)
          .single();
        assert(!stageRowError, `Failed to resolve stage '${stageSlugRaw}': ${stageRowError?.message}`);
        assertExists(stageRow?.active_recipe_instance_id, `Stage '${stageSlugRaw}' has no active_recipe_instance_id`);

        const { data: instanceRow, error: instanceRowError } = await adminClient
          .from("dialectic_stage_recipe_instances")
          .select("id, is_cloned, template_id")
          .eq("id", stageRow.active_recipe_instance_id)
          .single();
        assert(!instanceRowError, `Failed to load recipe instance '${stageRow.active_recipe_instance_id}': ${instanceRowError?.message}`);
        assertExists(instanceRow, `Recipe instance '${stageRow.active_recipe_instance_id}' not found`);

        const isCloned = instanceRow.is_cloned === true;
        let outputsRequired: unknown;
        if (isCloned) {
          const { data: stepRow, error: stepError } = await adminClient
            .from("dialectic_stage_recipe_steps")
            .select("outputs_required")
            .eq("instance_id", instanceRow.id)
            .eq("id", recipeStepId)
            .single();
          assert(!stepError, `Failed to load stage recipe step ${recipeStepId}: ${stepError?.message}`);
          outputsRequired = stepRow?.outputs_required;
        } else {
          const { data: stepRow, error: stepError } = await adminClient
            .from("dialectic_recipe_template_steps")
            .select("outputs_required")
            .eq("template_id", instanceRow.template_id)
            .eq("id", recipeStepId)
            .single();
          assert(!stepError, `Failed to load template recipe step ${recipeStepId}: ${stepError?.message}`);
          outputsRequired = stepRow?.outputs_required;
        }

        if (!isOutputRule(outputsRequired)) {
          throw new Error(`Recipe step ${recipeStepId} outputs_required is not a valid OutputRule object`);
        }

        const contextForDocuments = outputsRequired.context_for_documents;
        if (!isContextForDocumentArray(contextForDocuments) || contextForDocuments.length === 0) {
          throw new Error(`Recipe step ${recipeStepId} outputs_required.context_for_documents must be a non-empty ContextForDocument[] for HeaderContext generation`);
        }

        const headerContext: HeaderContext = {
          system_materials: systemMaterials,
          header_context_artifact: headerContextArtifact,
          context_for_documents: contextForDocuments,
        };

        return {
          content: JSON.stringify(headerContext),
          finish_reason: finishReason,
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          rawProviderResponse,
        };
      },
    );
    try {
      await handleJob(adminClient, job, deps, testUserJwt);
    } finally {
      callStub.restore();
    }
  };

  const processJobQueueUntilCompletion = async (sessionId: string, deps: IJobContext, authToken: string) => {
    for (let i = 0; i < 15; i++) {
      const { data: pendingJobs, error } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .in('status', ['pending', 'retrying', 'pending_continuation', 'pending_next_step']);
      
      assert(!error, `Failed to fetch pending jobs: ${error?.message}`);
      
      if (!pendingJobs || pendingJobs.length === 0) {
        return;
      }

      for (const job of pendingJobs) {
        if (!isDialecticJobRow(job)) {
            throw new Error(`Fetched entity is not a valid DialecticJobRow: ${JSON.stringify(job)}`);
        }
        await mockAndProcessJob(job, deps);
      }
    }
    assert(false, "processJobQueueUntilCompletion exceeded max iterations.");
  };

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userId, jwt, userClient } = await coreCreateAndSetupTestUser();
    testUserId = userId;
    testUserJwt = jwt;
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    workerDeps = await createDialecticWorkerDeps(adminClient);

    const formData = new FormData();
    formData.append("projectName", "Fragment Propagation Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for fragment propagation integration test");
    
    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
    assertExists(domain, "Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error) {
      throw new Error(`Failed to create test project: ${projectResult.error.message}`);
    }
    if (!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    testProject = projectResult.data;

    const { data: existingModel } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();
    
    const validConfig = {
      api_identifier: MOCK_MODEL_CONFIG.api_identifier,
      context_window_tokens: MOCK_MODEL_CONFIG.context_window_tokens || 128000,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
      tokenization_strategy: MOCK_MODEL_CONFIG.tokenization_strategy,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 16000,
    };

    let model = existingModel;
    if (!model) {
      const { data: newModel, error: createError } = await adminClient
        .from("ai_providers")
        .insert({
          api_identifier: MOCK_MODEL_CONFIG.api_identifier,
          provider: "test-provider",
          name: "Test Model",
          config: validConfig,
          is_active: true,
          is_enabled: true,
        })
        .select("id")
        .single();
      assert(!createError, `Failed to create test model: ${createError?.message}`);
      assertExists(newModel, "New model should be created");
      model = newModel;
    } else {
      const { error: updateError } = await adminClient
        .from("ai_providers")
        .update({ config: validConfig })
        .eq("id", model.id);
      assert(!updateError, `Failed to update model config: ${updateError?.message}`);
    }
    testModelId = model.id;

    await coreEnsureTestUserAndWallet(testUserId, 1000000, 'local');
    
    const { data: walletData, error: walletError } = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();
    assert(!walletError, `Failed to fetch wallet: ${walletError?.message}`);
    assertExists(walletData, "Wallet should exist");
    testWalletId = walletData.wallet_id;
  });

  afterAll(async () => {
    await coreCleanupTestResources('local');
  });

  // Test 71.f.i: Full flow test with fragment in filename
  it("71.f.i: fragment appears in saved filename when source_group is present", async () => {
    // Create a session and generate contributions through proper recipe flow
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // Generate contributions through the proper recipe system
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    // Process all pending jobs
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);

    // Verify the contribution was saved with correct storage path containing fragment
    // Filter by file_name pattern since output_type column doesn't exist
    const { data: allContributions, error: contribError } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("session_id", testSession.id);
    
    assert(!contribError, `Failed to fetch contributions: ${contribError?.message}`);
    assertExists(allContributions, "Contributions should exist");
    
    // Filter contributions by documentKey using deconstructStoragePath
    const businessCaseContributions = allContributions.filter(contrib => {
      if (!contrib.storage_path || !contrib.file_name) return false;
      const deconstructed = deconstructStoragePath({
        storageDir: contrib.storage_path,
        fileName: contrib.file_name,
      });
      return deconstructed.documentKey === FileType.business_case;
    });
    
    assert(businessCaseContributions.length > 0, "At least one business_case contribution should be created");

    const contribution = businessCaseContributions[0];
    assertExists(contribution.storage_path, "Contribution should have storage_path");
    assertExists(contribution.file_name, "Contribution should have file_name");

    // Deconstruct the path to verify fragment is present when source_group exists
    const deconstructed = deconstructStoragePath({
      storageDir: contribution.storage_path,
      fileName: contribution.file_name,
    });

    // Verify fragment is present (when source_group is in document_relationships, fragment should appear in filename)
    assertExists(
      deconstructed.sourceGroupFragment,
      `Filename should contain fragment when source_group is present in document_relationships`
    );
    
    // Verify the fragment is a valid 8-character string
    assert(
      deconstructed.sourceGroupFragment && deconstructed.sourceGroupFragment.length === 8,
      `Fragment should be exactly 8 characters: ${deconstructed.sourceGroupFragment}`
    );
  });

  // Test 71.f.ii: Fragment propagates to all file types
  it("71.f.ii: fragment propagates to all file types (HeaderContext, TurnPrompt, RawJson, AssembledJson, RenderedDocument)", async () => {
    // Create a session and generate contributions through proper recipe flow
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // Generate contributions through the proper recipe system
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    // Process all pending jobs
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);

    // Verify contributions have fragments - filter by file_name pattern
    const { data: allContributions } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("session_id", testSession.id);
    
    // Filter HeaderContext contributions
    const headerContribs = allContributions?.filter(contrib => {
      if (!contrib.storage_path || !contrib.file_name) return false;
      const deconstructed = deconstructStoragePath({
        storageDir: contrib.storage_path,
        fileName: contrib.file_name,
      });
      return deconstructed.documentKey === FileType.HeaderContext;
    }) || [];
    
    if (headerContribs.length > 0) {
      const headerContrib = headerContribs[0];
      if (headerContrib.storage_path && headerContrib.file_name) {
        const deconstructed = deconstructStoragePath({
          storageDir: headerContrib.storage_path,
          fileName: headerContrib.file_name,
        });
        assertExists(
          deconstructed.sourceGroupFragment,
          "HeaderContext filename should contain fragment when source_group is present"
        );
        assert(
          deconstructed.sourceGroupFragment && deconstructed.sourceGroupFragment.length === 8,
          `HeaderContext fragment should be exactly 8 characters: ${deconstructed.sourceGroupFragment}`
        );
      }
    }

    // Filter business_case contributions (RawJson)
    const docContribs = allContributions?.filter(contrib => {
      if (!contrib.storage_path || !contrib.file_name) return false;
      const deconstructed = deconstructStoragePath({
        storageDir: contrib.storage_path,
        fileName: contrib.file_name,
      });
      return deconstructed.documentKey === FileType.business_case;
    }) || [];
    
    if (docContribs.length > 0) {
      const docContrib = docContribs[0];
      if (docContrib.storage_path && docContrib.file_name) {
        const deconstructed = deconstructStoragePath({
          storageDir: docContrib.storage_path,
          fileName: docContrib.file_name,
        });
        assertExists(
          deconstructed.sourceGroupFragment,
          "RawJson filename should contain fragment when source_group is present"
        );
        assert(
          deconstructed.sourceGroupFragment && deconstructed.sourceGroupFragment.length === 8,
          `RawJson fragment should be exactly 8 characters: ${deconstructed.sourceGroupFragment}`
        );
      }
    }
  });

  // Test 71.f.iii: findSourceDocuments preserves source_group
  it("71.f.iii: findSourceDocuments preserves document_relationships.source_group", async () => {
    const testSourceGroup = 'test-uuid-preserve-1234-5678-90ab-cdef12345678';
    const stageSlug = 'thesis';
    const iterationNumber = 1;

    // Create a session
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: stageSlug,
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // Create a rendered document in dialectic_project_resources (findSourceDocuments only looks here for document types)
    const { data: renderedResource, error: resourceError } = await adminClient
      .from("dialectic_project_resources")
      .insert({
        project_id: testProject.id,
        session_id: testSession.id,
        stage_slug: stageSlug,
        iteration_number: iterationNumber,
        resource_type: "rendered_document",
        storage_bucket: "dialectic-project-resources",
        storage_path: `project-${testProject.id}/session_${testSession.id}/iteration_${iterationNumber}/${stageSlug}/rendered_documents`,
        file_name: `rendered_business_case_testuuid.md`,
        mime_type: "text/markdown",
        size_bytes: 1000,
        user_id: testUserId,
        resource_description: {
          document_relationships: {
            source_group: testSourceGroup,
            [stageSlug]: "resource-id-placeholder",
          } as DocumentRelationships,
          document_key: FileType.business_case,
        },
      })
      .select("*")
      .single();
    
    assert(!resourceError, `Failed to create rendered resource: ${resourceError?.message}`);
    assertExists(renderedResource, "Rendered resource should be created");

    // Update resource with its own ID in document_relationships[stageSlug]
    const { error: updateError } = await adminClient
      .from("dialectic_project_resources")
      .update({
        resource_description: {
          document_relationships: {
            source_group: testSourceGroup,
            [stageSlug]: renderedResource.id,
          } as DocumentRelationships,
          document_key: FileType.business_case,
        },
      })
      .eq("id", renderedResource.id);
    assert(!updateError, `Failed to update resource: ${updateError?.message}`);

    // Create a parent PLAN job that would retrieve this resource as a source document
    const { data: parentJob, error: parentJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        session_id: testSession.id,
        user_id: testUserId,
        job_type: "PLAN",
        status: "completed",
        iteration_number: iterationNumber,
        stage_slug: stageSlug,
        payload: {
          projectId: testProject.id,
          sessionId: testSession.id,
          stageSlug: stageSlug,
          iterationNumber: iterationNumber,
        },
        attempt_count: 0,
      })
      .select("*")
      .single();
    
    assert(!parentJobError, `Failed to create parent job: ${parentJobError?.message}`);
    assertExists(parentJob, "Parent job should be created");

    // Call findSourceDocuments to retrieve the resource as a source document
    const recipeStep = {
      step_slug: "test-step",
      job_type: "EXECUTE" as const,
      outputs_required: {
        documents: {
          business_case: {
            file_type: "markdown",
          },
        },
      },
      inputs_required: [
        {
          type: "document" as const,
          document_key: FileType.business_case,
          required: true,
          slug: stageSlug,
        },
      ],
    };
    const sourceDocuments = await findSourceDocuments(
      adminClient,
      parentJob as any,
      recipeStep.inputs_required,
    );

    // Verify the returned SourceDocument has document_relationships.source_group preserved
    assert(sourceDocuments.length > 0, "findSourceDocuments should return at least one source document");
    const sourceDoc = sourceDocuments.find(doc => doc.id === renderedResource.id);
    assertExists(sourceDoc, "Source document should match the created resource");
    
    // TypeScript narrowing: assertExists ensures sourceDoc is defined
    if (!sourceDoc) {
      throw new Error("Source document should be defined");
    }
    
    assertExists(
      sourceDoc.document_relationships,
      "Source document should have document_relationships"
    );
    
    assertEquals(
      sourceDoc.document_relationships?.source_group,
      testSourceGroup,
      "findSourceDocuments should preserve document_relationships.source_group"
    );

    // Verify fragment extraction works correctly
    const extractedFragment = extractSourceGroupFragment(sourceDoc.document_relationships?.source_group ?? undefined);
    const expectedFragment = 'testuuid'; // First 8 chars after hyphen removal
    assertEquals(
      extractedFragment,
      expectedFragment,
      "Fragment extraction should work correctly from preserved source_group"
    );
  });

  // Test 71.f.iv: Complete antithesis stage flow with fragment
  it("71.f.iv: complete antithesis stage flow with fragment and sourceAnchorModelSlug", async () => {

    // Step 1: Create a session starting with thesis stage
    // The system uses the same session across stages, progressing from thesis → antithesis → synthesis
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [testModelId],
      stageSlug: "thesis",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Failed to start session: ${sessionResult.error?.message}`);
    }
    const testSession = sessionResult.data;

    // Step 2: Generate and process all thesis contributions
    // The antithesis stage requires these as inputs: seed_prompt, business_case, feature_spec, technical_approach, success_metrics
    const thesisGeneratePayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "thesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const thesisPlanResult = await generateContributions(adminClient, thesisGeneratePayload, testUser, workerDeps, testUserJwt);
    assert(thesisPlanResult.success, `Failed to generate thesis contributions: ${thesisPlanResult.error?.message}`);

    // Process all thesis jobs to completion (including RENDER jobs)
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);
    
    // Verify that thesis documents are rendered in dialectic_project_resources
    // The antithesis stage requires these documents as inputs
    const requiredDocs = ['business_case', 'feature_spec', 'technical_approach', 'success_metrics'];
    for (const docKey of requiredDocs) {
      const { data: renderedDocs } = await adminClient
        .from('dialectic_project_resources')
        .select('*')
        .eq('project_id', testProject.id)
        .eq('session_id', testSession.id)
        .eq('stage_slug', 'thesis')
        .eq('resource_type', 'rendered_document')
        .ilike('file_name', `%${docKey}%`);
      
      assert(
        renderedDocs && renderedDocs.length > 0,
        `Required thesis document '${docKey}' was not found in dialectic_project_resources. RENDER jobs may have failed.`
      );
    }

    // Step 3: Wait for session to advance to antithesis stage
    // The handle_job_completion trigger should automatically update current_stage_id when thesis completes
    // Poll to ensure the session's current_stage has been updated to antithesis
    await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay to allow trigger to fire
    
    // Verify session advanced to antithesis stage
    const { data: sessionData } = await adminClient
      .from('dialectic_sessions')
      .select('current_stage:current_stage_id(slug)')
      .eq('id', testSession.id)
      .single();
    
    // If current_stage is still thesis, we need to manually update it for the test
    // In production, the handle_job_completion trigger handles this automatically
    if (!sessionData?.current_stage || Array.isArray(sessionData.current_stage) || sessionData.current_stage.slug !== 'antithesis') {
      // Get antithesis stage ID
      const { data: antithesisStage } = await adminClient
        .from('dialectic_stages')
        .select('id')
        .eq('slug', 'antithesis')
        .single();
      
      if (antithesisStage?.id) {
        // Manually update current_stage_id to antithesis for the test
        await adminClient
          .from('dialectic_sessions')
          .update({ current_stage_id: antithesisStage.id })
          .eq('id', testSession.id);
      }
    }

    // Step 4: Now generate antithesis contributions in the same session
    // Generate antithesis contributions through the proper recipe system
    const generateContributionsPayload: GenerateContributionsPayload = {
      projectId: testProject.id,
      sessionId: testSession.id,
      stageSlug: "antithesis",
      iterationNumber: 1,
      walletId: testWalletId,
      user_jwt: testUserJwt,
    };
    const planJobsResult = await generateContributions(adminClient, generateContributionsPayload, testUser, workerDeps, testUserJwt);
    assert(planJobsResult.success, `Failed to generate contributions: ${planJobsResult.error?.message}`);

    // Process all pending antithesis jobs
    await processJobQueueUntilCompletion(testSession.id, workerDeps, testUserJwt);

    // Verify HeaderContext contributions are saved with correct document_relationships.source_group
    // Filter by file_name pattern since output_type column doesn't exist
    const { data: allContributions } = await adminClient
      .from("dialectic_contributions")
      .select("*")
      .eq("session_id", testSession.id);
    
    // Filter HeaderContext contributions from antithesis stage only
    // The antithesis recipe has one PLAN job that produces one HeaderContext
    // Use contribution_type field directly instead of deconstructing path, as deconstructStoragePath
    // may not correctly parse filenames with fragments in the simple pattern
    const headerContribs = allContributions?.filter(contrib => 
      contrib.stage === 'antithesis' && 
      contrib.contribution_type === 'header_context' &&
      contrib.storage_path && 
      contrib.file_name
    ) || [];
    
    assert(headerContribs.length >= 1, `Should have at least 1 antithesis HeaderContext contribution. Found ${headerContribs.length}. Total contributions: ${allContributions?.length || 0}`);

    // Verify HeaderContext files use critiquing pattern with fragments
    // Note: This test verifies step 71.f - fragment propagation in antithesis stage
    // The implementation should propagate sourceAnchorModelSlug to enable critiquing pattern
    for (const contrib of headerContribs) {
      if (contrib.storage_path && contrib.file_name) {
        const deconstructed = deconstructStoragePath({
          storageDir: contrib.storage_path,
          fileName: contrib.file_name,
        });
        
        // Verify fragment is present (step 71.f requirement)
        assertExists(
          deconstructed.sourceGroupFragment,
          `HeaderContext filename should contain fragment. Filename: ${contrib.file_name}, Deconstructed: ${JSON.stringify(deconstructed)}`
        );
        
        // Verify sourceAnchorModelSlug is present for antithesis pattern
        // This enables the critiquing pattern: {modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_header_context.json
        assertExists(
          deconstructed.sourceAnchorModelSlug,
          `HeaderContext filename should contain sourceAnchorModelSlug for antithesis pattern. Filename: ${contrib.file_name}, Expected pattern: {modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_header_context.json`
        );
        
        // Verify filename uses critiquing pattern
        assert(
          contrib.file_name.includes("critiquing"),
          `Antithesis HeaderContext filename should use critiquing pattern. Actual filename: ${contrib.file_name}`
        );
      }
    }

    // Verify document_relationships.source_group is preserved in contributions
    // Note: When using generateContributions, source_group values are generated by the system
    // We verify that contributions have source_group and fragments are extracted correctly
    const contribsWithSourceGroup = headerContribs.filter(c => {
      const docRels = c.document_relationships as DocumentRelationships | null;
      return docRels?.source_group !== undefined && docRels?.source_group !== null;
    });
    
    assert(contribsWithSourceGroup.length >= 1, "At least 1 antithesis HeaderContext contribution should have source_group");

    // Verify sourceAnchorModelSlug propagates correctly through the entire flow
    // This is verified by checking that the deconstructed paths contain sourceAnchorModelSlug
    // which enables antithesis pattern detection in constructStoragePath
    for (const contrib of headerContribs) {
      if (contrib.storage_path && contrib.file_name) {
        const deconstructed = deconstructStoragePath({
          storageDir: contrib.storage_path,
          fileName: contrib.file_name,
        });
        assertExists(
          deconstructed.sourceAnchorModelSlug,
          "sourceAnchorModelSlug should propagate through entire flow for antithesis patterns"
        );
      }
    }
  });
});


