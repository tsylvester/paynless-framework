import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertStringIncludes,
  assert,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  coreEnsureTestUserAndWallet,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  testLogger,
  MOCK_MODEL_CONFIG,
} from "../../functions/_shared/_integration.test.utils.ts";
import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import {
  DialecticProject,
  StartSessionPayload,
  StartSessionSuccessResponse,
  DialecticJobRow,
  DialecticRenderJobPayload,
  DialecticStageRecipeStep,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { assemblePlannerPrompt } from "../../functions/_shared/prompt-assembler/assemblePlannerPrompt.ts";
import { gatherContext } from "../../functions/_shared/prompt-assembler/gatherContext.ts";
import { render } from "../../functions/_shared/prompt-assembler/render.ts";
import type {
  ProjectContext,
  SessionContext,
  StageContext,
} from "../../functions/_shared/prompt-assembler/prompt-assembler.interface.ts";
import { isDialecticRecipeStep } from "../../functions/_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { processRenderJob } from "../../functions/dialectic-worker/processRenderJob.ts";
import { FileType, ModelContributionUploadContext } from "../../functions/_shared/types/file_manager.types.ts";
import { IRenderJobContext } from "../../functions/dialectic-worker/JobContext.interface.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import { deleteFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { submitStageDocumentFeedback } from "../../functions/dialectic-service/submitStageDocumentFeedback.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { isJson, isRecord } from "../../functions/_shared/utils/type_guards.ts";

/**
 * Integration test for assemblePlannerPrompt with real thesis documents and feedback.
 *
 * This REAL integration test:
 * - Creates thesis documents and feedback in beforeAll using production functions
 * - Queries ACTUAL recipe from the database (no fabricated inputs_required)
 * - Calls assemblePlannerPrompt which exercises: gatherContext → gatherInputsForStage →
 *   dot-notation variable construction → render → renderPrompt
 * - Asserts the rendered prompt has populated Thesis Documents and Thesis Feedback sections
 * - Proves the full pipeline renders correctly with production-like data
 */

describe("assemblePlannerPrompt sourceDocuments REAL Integration", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testSession: StartSessionSuccessResponse;
  let testModelId: string;
  let testWalletId: string;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userId, jwt, userClient } = await coreCreateAndSetupTestUser();
    testUserId = userId;
    testUserJwt = jwt;
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Test user could not be created");
    testUser = user;

    // Create test project
    const formData = new FormData();
    formData.append("projectName", "AssemblePlannerPrompt Real Integration Test");
    formData.append("initialUserPromptText", "Build a SaaS platform with AI-powered features");

    const { data: domain, error: domainError } = await adminClient
      .from("dialectic_domains")
      .select("id")
      .eq("name", "Software Development")
      .single();
    if (domainError) throw new Error(`Failed to fetch domain: ${domainError.message}`);
    if (!domain) throw new Error("Software Development domain must exist");
    formData.append("selectedDomainId", domain.id);

    const projectResult = await createProject(formData, adminClient, testUser);
    if (projectResult.error) {
      throw new Error(`Failed to create test project: ${projectResult.error.message}`);
    }
    if (!projectResult.data) {
      throw new Error("Project creation returned no data");
    }
    testProject = projectResult.data;

    // Get or create model
    const { data: existingModel } = await adminClient
      .from("ai_providers")
      .select("id")
      .eq("api_identifier", MOCK_MODEL_CONFIG.api_identifier)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .maybeSingle();

    let model = existingModel;
    if (!model) {
      const { data: newModel, error: insertError } = await adminClient
        .from("ai_providers")
        .insert({
          name: "Mock Model",
          api_identifier: MOCK_MODEL_CONFIG.api_identifier,
          description: "Mock model for integration tests",
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

      if (insertError) throw new Error(`Failed to create mock model: ${insertError.message}`);
      if (!newModel) throw new Error("Failed to create mock model");
      model = newModel;
    }

    if (!model?.id) throw new Error("Model ID must exist");
    testModelId = model.id;

    // Ensure wallet exists for test user
    await coreEnsureTestUserAndWallet(testUserId, 1000000, 'local');

    // Get wallet ID
    const { data: walletData, error: walletError } = await adminClient
      .from("token_wallets")
      .select("wallet_id")
      .eq("user_id", testUserId)
      .is("organization_id", null)
      .single();

    if (walletError) throw new Error(`Failed to fetch wallet: ${walletError.message}`);
    if (!walletData) throw new Error("Wallet should exist");
    testWalletId = walletData.wallet_id;

    // Start session
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [model.id],
      sessionDescription: "Real integration test session",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error) {
      throw new Error(`Failed to start session: ${sessionResult.error.message}`);
    }
    if (!sessionResult.data) throw new Error("Session creation returned no data");
    testSession = sessionResult.data;

    // Create thesis stage rendered documents using actual production functions
    const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });
    const stageSlug = "thesis";
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;

    // Query thesis recipe to get template filenames from outputs_required.files_to_generate
    const { data: thesisStage, error: thesisStageError } = await adminClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", stageSlug)
      .single();

    if (thesisStageError) throw new Error(`Failed to fetch thesis stage: ${thesisStageError.message}`);
    if (!thesisStage?.active_recipe_instance_id) throw new Error("Thesis stage must have active_recipe_instance_id");

    const { data: thesisRecipeSteps, error: thesisStepsError } = await adminClient
      .from("dialectic_stage_recipe_steps")
      .select("*")
      .eq("instance_id", thesisStage.active_recipe_instance_id);

    if (thesisStepsError) throw new Error(`Failed to fetch thesis recipe steps: ${thesisStepsError.message}`);
    if (!thesisRecipeSteps || thesisRecipeSteps.length === 0) throw new Error("Thesis recipe must have steps");

    // Find ALL EXECUTE steps to get template filenames (one per document type)
    const thesisExecuteSteps = thesisRecipeSteps.filter((step) => step.job_type === "EXECUTE");
    if (thesisExecuteSteps.length === 0) throw new Error("Thesis recipe must have at least one EXECUTE step");

    // Build template filename mapping from ALL EXECUTE steps
    const templateFilenames: Record<string, string> = {};
    for (const executeStep of thesisExecuteSteps) {
      if (!executeStep.outputs_required) continue;

      const outputsRequired = executeStep.outputs_required;
      if (!isRecord(outputsRequired)) continue;

      const filesToGenerate = outputsRequired.files_to_generate;
      if (!Array.isArray(filesToGenerate)) continue;

      for (const file of filesToGenerate) {
        if (!isRecord(file)) {
          throw new Error("Each file in files_to_generate must be an object");
        }
        if (typeof file.from_document_key !== "string") {
          throw new Error("from_document_key must be a string");
        }
        if (typeof file.template_filename !== "string") {
          throw new Error("template_filename must be a string");
        }
        templateFilenames[file.from_document_key] = file.template_filename;
      }
    }

    // Create helper function for creating and rendering a document
    async function createAndRenderDocument(
      documentKey: FileType.business_case | FileType.feature_spec | FileType.technical_approach | FileType.success_metrics,
      content: Record<string, string>
    ): Promise<string> {
      const docIdentity = crypto.randomUUID();
      const contributionContent = JSON.stringify({ content });

      const contributionContext: ModelContributionUploadContext = {
        pathContext: {
          fileType: documentKey,
          projectId: testProject.id,
          sessionId: testSession.id,
          iteration: iterationNumber,
          stageSlug: stageSlug,
          modelSlug: modelSlug,
          attemptCount: 0,
          documentKey: documentKey,
        },
        fileContent: contributionContent,
        mimeType: "application/json",
        sizeBytes: new TextEncoder().encode(contributionContent).length,
        userId: testUserId,
        description: `Test contribution for ${stageSlug} ${documentKey}`,
        contributionMetadata: {
          sessionId: testSession.id,
          modelIdUsed: testModelId,
          modelNameDisplay: modelSlug,
          stageSlug: stageSlug,
          iterationNumber: iterationNumber,
          document_relationships: { [stageSlug]: docIdentity },
          editVersion: 1,
          isLatestEdit: true,
        },
      };

      const uploadResult = await fileManager.uploadAndRegisterFile(contributionContext);
      if (uploadResult.error) {
        throw new Error(`Failed to upload contribution for ${documentKey}: ${uploadResult.error.message}`);
      }
      if (!uploadResult.record) {
        throw new Error(`No record returned for ${documentKey} contribution`);
      }

      const contributionId = uploadResult.record.id;

      // Update document_relationships to use the actual contribution ID
      const { error: updateError } = await adminClient
        .from("dialectic_contributions")
        .update({ document_relationships: { [stageSlug]: contributionId } })
        .eq("id", contributionId);

      if (updateError) {
        throw new Error(`Failed to update document_relationships for ${documentKey}: ${updateError.message}`);
      }

      // 2. Render the contribution into a document
      const template_filename = templateFilenames[documentKey];
      if (!template_filename) {
        throw new Error(`No template filename found for document key: ${documentKey}`);
      }

      const renderPayload: DialecticRenderJobPayload = {
        projectId: testProject.id,
        sessionId: testSession.id,
        iterationNumber: iterationNumber,
        stageSlug: stageSlug,
        model_id: testModelId,
        documentKey: documentKey,
        sourceContributionId: contributionId,
        documentIdentity: contributionId,
        template_filename: template_filename,
        walletId: testWalletId,
        user_jwt: testUserJwt,
      };

      if (!isJson(renderPayload)) {
        throw new Error("RENDER job payload is not a JSON object");
      }

      const jobInsert: Database["public"]["Tables"]["dialectic_generation_jobs"]["Insert"] = {
        job_type: "RENDER",
        session_id: testSession.id,
        iteration_number: iterationNumber,
        stage_slug: stageSlug,
        status: "pending",
        payload: renderPayload,
        user_id: testUserId,
      };

      const { data: renderJob, error: renderJobError } = await adminClient
        .from("dialectic_generation_jobs")
        .insert(jobInsert)
        .select("*")
        .single();

      assert(!renderJobError, `Failed to create RENDER job for ${documentKey}: ${renderJobError?.message}`);
      assertExists(renderJob, `RENDER job should be created for ${documentKey}`);

      const typedRenderJob: DialecticJobRow = renderJob;

      // Build render job context
      const renderJobDeps: IRenderJobContext = {
        documentRenderer: {
          renderDocument: renderDocument,
        },
        downloadFromStorage: downloadFromStorage,
        deleteFromStorage: deleteFromStorage,
        fileManager: fileManager,
        notificationService: new NotificationService(adminClient),
        logger: testLogger,
      };

      // Call processRenderJob with correct signature (5 parameters)
      await processRenderJob(adminClient, typedRenderJob, testUserId, renderJobDeps, testUserJwt);

      return contributionId;
    }

    // Create all 4 thesis documents, capturing contribution IDs for feedback creation
    const businessCaseContributionId = await createAndRenderDocument(FileType.business_case, {
      executive_summary: "Test business case executive summary",
      market_opportunity: "Test market opportunity",
      user_problem_validation: "Test user problem validation",
      competitive_analysis: "Test competitive analysis",
      differentiation_value_proposition: "Test differentiation",
      risks_mitigation: "Test risks and mitigation",
      strengths: "Test strengths",
      weaknesses: "Test weaknesses",
      opportunities: "Test opportunities",
      threats: "Test threats",
      next_steps: "Test next steps",
      proposal_references: "Test references",
    });

    const featureSpecContributionId = await createAndRenderDocument(FileType.feature_spec, {
      feature_name: "Test Feature",
      feature_objective: "Test objective",
      user_stories: "Test user stories",
      acceptance_criteria: "Test acceptance criteria",
      dependencies: "Test dependencies",
      success_metrics: "Test success metrics",
    });

    const technicalApproachContributionId = await createAndRenderDocument(FileType.technical_approach, {
      architecture: "Test architecture",
      components: "Test components",
      data: "Test data model",
      deployment: "Test deployment",
      sequencing: "Test sequencing",
      risk_mitigation: "Test risk mitigation",
      open_questions: "Test open questions",
    });

    const successMetricsContributionId = await createAndRenderDocument(FileType.success_metrics, {
      outcome_alignment: "Test outcome alignment",
      north_star_metric: "Test north star metric",
      primary_kpis: "Test KPIs",
      leading_indicators: "Test leading indicators",
      lagging_indicators: "Test lagging indicators",
      guardrails: "Test guardrails",
      measurement_plan: "Test measurement plan",
      risk_signals: "Test risk signals",
      next_steps: "Test next steps",
      data_sources: "Test data sources",
      reporting_cadence: "Test reporting cadence",
      ownership: "Test ownership",
      escalation_plan: "Test escalation plan",
    });

    testLogger.info(`Created and rendered 4 thesis documents using production functions`);

    // Create thesis feedback for each document using production submitStageDocumentFeedback
    const feedbackDeps = { fileManager, logger: testLogger };
    const feedbackEntries: { documentKey: string; contributionId: string; feedbackContent: string }[] = [
      { documentKey: "business_case", contributionId: businessCaseContributionId, feedbackContent: "The business case needs stronger competitive differentiation analysis and market sizing methodology." },
      { documentKey: "feature_spec", contributionId: featureSpecContributionId, feedbackContent: "The feature spec should include more detailed acceptance criteria and edge case handling." },
      { documentKey: "technical_approach", contributionId: technicalApproachContributionId, feedbackContent: "The technical approach should address scalability concerns and provide concrete deployment architecture." },
      { documentKey: "success_metrics", contributionId: successMetricsContributionId, feedbackContent: "The success metrics need clearer leading indicators and more specific measurement thresholds." },
    ];

    for (const entry of feedbackEntries) {
      const feedbackResult = await submitStageDocumentFeedback({
        sessionId: testSession.id,
        stageSlug: "thesis",
        iterationNumber: 1,
        documentKey: entry.documentKey,
        modelId: testModelId,
        feedbackContent: entry.feedbackContent,
        feedbackType: "critique",
        userId: testUserId,
        projectId: testProject.id,
        sourceContributionId: entry.contributionId,
      }, adminClient, feedbackDeps);

      if (feedbackResult.error) {
        throw new Error(`Failed to create thesis feedback for ${entry.documentKey}: ${feedbackResult.error.message}`);
      }
    }

    testLogger.info(`Created thesis feedback for all 4 documents using production submitStageDocumentFeedback`);
    testLogger.info(`Test setup complete. Project: ${testProject.id}, Session: ${testSession.id}`);
  });

  afterAll(async () => {
    await coreCleanupTestResources("all");
  });

  it("renders planner prompt with populated thesis documents and feedback using assemblePlannerPrompt", async () => {
    // --- ARRANGE: Get ACTUAL antithesis recipe from database ---

    const { data: antithesisStage, error: stageError } = await adminClient
      .from("dialectic_stages")
      .select("*")
      .eq("slug", "antithesis")
      .single();

    if (stageError) throw new Error(`Failed to fetch antithesis stage: ${stageError.message}`);
    if (!antithesisStage) throw new Error("Antithesis stage must exist in database");
    if (!antithesisStage.active_recipe_instance_id) throw new Error("Antithesis stage must have active_recipe_instance_id");

    // Query recipe steps directly from database
    const { data: recipeSteps, error: stepsError } = await adminClient
      .from("dialectic_stage_recipe_steps")
      .select("*")
      .eq("instance_id", antithesisStage.active_recipe_instance_id);

    if (stepsError) throw new Error(`Failed to fetch recipe steps: ${stepsError.message}`);
    if (!recipeSteps || recipeSteps.length === 0) throw new Error("Recipe must have at least one step");

    // Find the PLAN step (planner prompt)
    const planStep = recipeSteps.find((step) => step.job_type === "PLAN");
    if (!planStep) throw new Error("Antithesis recipe must have a PLAN step");
    if (!planStep.inputs_required) throw new Error("Plan step must have inputs_required");
    if (!Array.isArray(planStep.inputs_required)) throw new Error("Plan step inputs_required must be an array");

    // Prove planStep is valid DialecticRecipeStep using type guard
    if (!isDialecticRecipeStep(planStep)) {
      throw new Error(`Plan step is not a valid DialecticRecipeStep: ${JSON.stringify(planStep)}`);
    }

    testLogger.info(`Using ACTUAL recipe with ${planStep.inputs_required.length} input rules`);

    // --- Build contexts ---
    if (!testProject.selected_domain_id) throw new Error("Test setup failed: project missing selected_domain_id");
    if (!testProject.process_template?.id) throw new Error("Test setup failed: project missing process_template.id");
    if (!testProject.initial_prompt_resource_id) throw new Error("Test setup failed: project missing initial_prompt_resource_id");

    // Fetch initial user prompt from storage
    const { data: promptResource, error: promptResourceError } = await adminClient
      .from("dialectic_project_resources")
      .select("storage_bucket, storage_path, file_name")
      .eq("id", testProject.initial_prompt_resource_id)
      .single();

    if (promptResourceError) throw new Error(`Failed to fetch prompt resource: ${promptResourceError.message}`);
    if (!promptResource) throw new Error("Prompt resource must exist");
    if (!promptResource.storage_bucket) throw new Error("Prompt resource must have storage_bucket");
    if (!promptResource.storage_path) throw new Error("Prompt resource must have storage_path");
    if (!promptResource.file_name) throw new Error("Prompt resource must have file_name");

    const fullPath = `${promptResource.storage_path}/${promptResource.file_name}`;
    const promptDownloadResult = await downloadFromStorage(adminClient, promptResource.storage_bucket, fullPath);
    if (promptDownloadResult.error) throw new Error(`Failed to download prompt: ${promptDownloadResult.error}`);
    if (!promptDownloadResult.data) throw new Error("Prompt download returned no data");

    const initialUserPrompt = new TextDecoder().decode(promptDownloadResult.data);

    // Query domain-specific prompt overlays for the antithesis stage
    const { data: overlayData, error: overlayError } = await adminClient
      .from("domain_specific_prompt_overlays")
      .select("overlay_values")
      .eq("domain_id", testProject.selected_domain_id)
      .eq("is_active", true);

    if (overlayError) {
      testLogger.warn(`Could not fetch domain overlays: ${overlayError.message}. Proceeding without overlays.`);
    }
    const domainOverlays = overlayData ?? [];

    const project: ProjectContext = {
      id: testProject.id,
      user_id: testUserId,
      project_name: testProject.project_name,
      initial_user_prompt: initialUserPrompt,
      initial_prompt_resource_id: testProject.initial_prompt_resource_id,
      selected_domain_id: testProject.selected_domain_id,
      dialectic_domains: { name: antithesisStage.slug },
      process_template_id: testProject.process_template.id,
      selected_domain_overlay_id: testProject.selected_domain_overlay_id ?? null,
      user_domain_overlay_values: null,
      repo_url: testProject.repo_url,
      status: testProject.status,
      created_at: testProject.created_at,
      updated_at: testProject.updated_at,
    };

    const session: SessionContext = {
      id: testSession.id,
      project_id: testProject.id,
      selected_model_ids: [testModelId],
      created_at: testSession.created_at,
      updated_at: testSession.updated_at,
      current_stage_id: antithesisStage.id,
      iteration_count: 1,
      session_description: testSession.session_description ?? null,
      status: "pending_antithesis",
      associated_chat_id: testSession.associated_chat_id ?? null,
      user_input_reference_url: testSession.user_input_reference_url ?? null,
    };

    const stage: StageContext = {
      id: antithesisStage.id,
      slug: antithesisStage.slug,
      display_name: antithesisStage.display_name,
      description: antithesisStage.description,
      system_prompts: null,
      domain_specific_prompt_overlays: domainOverlays,
      created_at: antithesisStage.created_at,
      default_system_prompt_id: antithesisStage.default_system_prompt_id,
      recipe_step: planStep,
      active_recipe_instance_id: antithesisStage.active_recipe_instance_id,
      recipe_template_id: antithesisStage.recipe_template_id,
      expected_output_template_ids: antithesisStage.expected_output_template_ids,
    };

    // --- Create PLAN job row in database ---
    const { data: planJob, error: planJobError } = await adminClient
      .from("dialectic_generation_jobs")
      .insert({
        job_type: "PLAN",
        session_id: testSession.id,
        iteration_number: 1,
        stage_slug: "antithesis",
        status: "in_progress",
        payload: {
          projectId: testProject.id,
          sessionId: testSession.id,
          stageSlug: "antithesis",
          iterationNumber: 1,
          model_id: testModelId,
          model_slug: MOCK_MODEL_CONFIG.api_identifier,
          walletId: testWalletId,
          user_jwt: testUserJwt,
        },
        user_id: testUserId,
        is_test_job: true,
      })
      .select("*")
      .single();

    if (planJobError) throw new Error(`Failed to create PLAN job: ${planJobError.message}`);
    assertExists(planJob, "PLAN job must be created");

    const typedPlanJob: DialecticJobRow = planJob;

    // Create FileManager for the assemblePlannerPrompt call
    const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });

    // --- ACT: Call assemblePlannerPrompt with REAL pipeline ---
    // This exercises: gatherContext → gatherInputsForStage → dot-notation transform → render → renderPrompt
    const result = await assemblePlannerPrompt({
      dbClient: adminClient,
      fileManager: fileManager,
      job: typedPlanJob,
      project: project,
      session: session,
      stage: stage,
      projectInitialUserPrompt: initialUserPrompt,
      gatherContext: gatherContext,
      render: render,
    });

    testLogger.info(`assemblePlannerPrompt returned promptContent length: ${result.promptContent.length}`);
    testLogger.info(`assemblePlannerPrompt returned source_prompt_resource_id: ${result.source_prompt_resource_id}`);

    // --- ASSERT: Rendered prompt is non-empty and was persisted ---
    assert(result.promptContent.length > 0, "Rendered prompt must not be empty");
    assert(result.source_prompt_resource_id.length > 0, "source_prompt_resource_id must not be empty");

    // --- ASSERT: Thesis Documents section is populated ---
    // The thesis documents were created in beforeAll with known test content values.
    // Content flows: JSON contribution → processRenderJob → rendered markdown in storage →
    //   gatherInputsForStage → assemblePlannerPrompt dot-notation vars → renderPrompt substitution.
    assertStringIncludes(result.promptContent, "Test business case executive summary",
      "Rendered prompt must contain thesis business case content");
    assertStringIncludes(result.promptContent, "Test architecture",
      "Rendered prompt must contain thesis technical approach content");
    assertStringIncludes(result.promptContent, "Test Feature",
      "Rendered prompt must contain thesis feature spec content");
    assertStringIncludes(result.promptContent, "Test outcome alignment",
      "Rendered prompt must contain thesis success metrics content");

    // --- ASSERT: Thesis Feedback section is populated ---
    // Feedback was created in beforeAll via submitStageDocumentFeedback for all 4 document types.
    assertStringIncludes(result.promptContent, "The business case needs stronger competitive differentiation",
      "Rendered prompt must contain thesis business case feedback");
    assertStringIncludes(result.promptContent, "The feature spec should include more detailed acceptance criteria",
      "Rendered prompt must contain thesis feature spec feedback");
    assertStringIncludes(result.promptContent, "The technical approach should address scalability concerns",
      "Rendered prompt must contain thesis technical approach feedback");
    assertStringIncludes(result.promptContent, "The success metrics need clearer leading indicators",
      "Rendered prompt must contain thesis success metrics feedback");

    // --- ASSERT: No unresolved thesis placeholders remain ---
    assert(!result.promptContent.includes("{{thesis_documents."),
      "No unresolved {{thesis_documents.*}} placeholders should remain");
    assert(!result.promptContent.includes("{{thesis_feedback."),
      "No unresolved {{thesis_feedback.*}} placeholders should remain");

    // --- ASSERT: Section tags were correctly processed (removed after evaluation) ---
    assert(!result.promptContent.includes("{{#section:thesis_feedback}}"),
      "Section open tag {{#section:thesis_feedback}} should be removed after rendering");
    assert(!result.promptContent.includes("{{/#section:thesis_feedback}}"),
      "Section close tag {{/#section:thesis_feedback}} should be removed after rendering");

    // --- ASSERT: Template structural labels survived rendering ---
    assertStringIncludes(result.promptContent, "Business Case:",
      "Template label 'Business Case:' must appear in rendered prompt");
    assertStringIncludes(result.promptContent, "Feature Specification:",
      "Template label 'Feature Specification:' must appear in rendered prompt");
    assertStringIncludes(result.promptContent, "Technical Approach:",
      "Template label 'Technical Approach:' must appear in rendered prompt");
    assertStringIncludes(result.promptContent, "Success Metrics:",
      "Template label 'Success Metrics:' must appear in rendered prompt");

    // --- ASSERT: outputs_required was substituted (from recipe step, injected by render) ---
    assertStringIncludes(result.promptContent, "header_context",
      "Rendered prompt must contain outputs_required content referencing header_context artifact");

    testLogger.info("✓ REAL integration test passed: assemblePlannerPrompt renders populated thesis documents and feedback");
  });
});
