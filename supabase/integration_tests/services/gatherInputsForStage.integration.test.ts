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
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
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
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { deconstructStoragePath } from "../../functions/_shared/utils/path_deconstructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { NotificationService } from "../../functions/_shared/utils/notification.service.ts";
import { FileType, ModelContributionUploadContext, ModelContributionFileTypes } from "../../functions/_shared/types/file_manager.types.ts";
import { renderDocument } from "../../functions/_shared/services/document_renderer.ts";
import type { DocumentRendererDeps, RenderDocumentParams } from "../../functions/_shared/services/document_renderer.interface.ts";
import { gatherInputsForStage } from "../../functions/_shared/prompt-assembler/gatherInputsForStage.ts";
import type { ProjectContext, SessionContext, StageContext, AssemblerSourceDocument } from "../../functions/_shared/prompt-assembler/prompt-assembler.interface.ts";
import { getStageRecipe } from "../../functions/dialectic-service/getStageRecipe.ts";
import type { DialecticRecipeStep, DialecticStageRecipeStep } from "../../functions/dialectic-service/dialectic.interface.ts";

describe("gatherInputsForStage Integration Tests", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let testUserJwt: string;
  let testProject: DialecticProject;
  let testSession: StartSessionSuccessResponse;
  let fileManager: FileManagerService;
  let testModelId: string;

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

    fileManager = new FileManagerService(adminClient, { constructStoragePath });

    // Create test project using FormData
    const formData = new FormData();
    formData.append("projectName", "GatherInputsForStage Integration Test Project");
    formData.append("initialUserPromptText", "Test prompt for gatherInputsForStage integration test");
    
    // Fetch domain ID for software_development
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

    // Fetch or create model ID
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
      
      if (insertError) {
        throw new Error(`Failed to create mock model: ${insertError.message}`);
      }
      if (!newModel) {
        throw new Error("Failed to create mock model: no data returned");
      }
      if (!newModel.id) {
        throw new Error("Created model record is missing id");
      }
      model = newModel;
    } else if (fetchError) {
      throw new Error(`Failed to fetch model: ${fetchError.message}`);
    } else if (!model) {
      throw new Error(`Model with api_identifier '${MOCK_MODEL_CONFIG.api_identifier}' not found or not active/enabled`);
    }
    
    if (!model.id) {
      throw new Error("Model record is missing id");
    }
    testModelId = model.id;

    // Create test session
    const sessionPayload: StartSessionPayload = {
      projectId: testProject.id,
      selectedModelIds: [model.id],
      sessionDescription: "Test session for gatherInputsForStage integration test",
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error) {
      throw new Error(`Failed to create test session: ${sessionResult.error.message}`);
    }
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    testSession = sessionResult.data;
  });

  afterAll(async () => {
    await coreCleanupTestResources("all");
  });

  // Step 53.e.i: Test that verifies the end-to-end flow: document_renderer.renderDocument() saves a rendered document to dialectic_project_resources, and gatherInputsForStage retrieves it for a subsequent stage
  it("53.e.i: should retrieve rendered document from dialectic_project_resources for subsequent stage", async () => {
    const sourceStageSlug = "thesis";
    const targetStageSlug = "antithesis";
    const documentKey = FileType.business_case;
    const iterationNumber = 1;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const attemptCount = 0;

    // 1) Verify document template exists (should be seeded by migrations)
    const { data: projectData, error: projectError } = await adminClient
      .from("dialectic_projects")
      .select("selected_domain_id")
      .eq("id", testProject.id)
      .single();
    
    assert(!projectError, `Failed to fetch project domain: ${projectError?.message}`);
    assertExists(projectData?.selected_domain_id, "Project must have a selected_domain_id");

    // Check if template exists (templates are seeded via migrations)
    // Templates use naming convention: {stage_slug}_{document_key}
    // e.g., 'thesis_business_case' for thesis stage business_case document
    const templateName = `${sourceStageSlug}_${documentKey}`;
    const { data: templateRecord, error: templateQueryError } = await adminClient
      .from("dialectic_document_templates")
      .select("*")
      .eq("name", templateName)
      .eq("domain_id", projectData.selected_domain_id)
      .eq("is_active", true)
      .maybeSingle();

    if (templateQueryError || !templateRecord) {
      throw new Error(
        `Document template for stage '${sourceStageSlug}' and document '${documentKey}' not found. ` +
        `Templates should be seeded via database migrations. Error: ${templateQueryError?.message ?? 'not found'}`
      );
    }

    // 2) Create all four thesis stage documents using application functions
    // Thesis stage creates: business_case, feature_spec, technical_approach, and success_metrics
    const thesisDocuments: ModelContributionFileTypes[] = [
      FileType.business_case,
      FileType.feature_spec,
      FileType.technical_approach,
      FileType.success_metrics,
    ];

    const documentIdentities = new Map<ModelContributionFileTypes, string>();
    const contributionIds = new Map<ModelContributionFileTypes, string>();

    for (const docKey of thesisDocuments) {
      const docIdentity = crypto.randomUUID();
      documentIdentities.set(docKey, docIdentity);
      
      const contributionContent = JSON.stringify({
        content: `This is test content for ${docKey} document that will be rendered.`
      });

      const contributionContext: ModelContributionUploadContext = {
        pathContext: {
          fileType: docKey,
          projectId: testProject.id,
          sessionId: testSession.id,
          iteration: iterationNumber,
          stageSlug: sourceStageSlug,
          modelSlug: modelSlug,
          attemptCount: attemptCount,
          documentKey: docKey,
        },
        fileContent: contributionContent,
        mimeType: "application/json",
        sizeBytes: new TextEncoder().encode(contributionContent).length,
        userId: testUserId,
        description: `Test contribution for ${sourceStageSlug} ${docKey}`,
        contributionMetadata: {
          sessionId: testSession.id,
          modelIdUsed: testModelId,
          modelNameDisplay: modelSlug,
          stageSlug: sourceStageSlug,
          iterationNumber: iterationNumber,
          document_relationships: { [sourceStageSlug.toUpperCase()]: docIdentity },
          editVersion: 1,
          isLatestEdit: true,
        },
      };

      const contributionResult = await fileManager.uploadAndRegisterFile(contributionContext);
      assert(!contributionResult.error, `Failed to create contribution for ${docKey}: ${contributionResult.error?.message}`);
      assertExists(contributionResult.record, `Contribution record for ${docKey} was not created`);
      
      const contributionRecord = contributionResult.record;
      if (!contributionRecord || !('id' in contributionRecord)) {
        throw new Error(`Contribution record for ${docKey} is missing or missing id field`);
      }
      contributionIds.set(docKey, contributionRecord.id);
    }

    // 3) Render all three documents using document_renderer.renderDocument()
    const renderDeps: DocumentRendererDeps = {
      downloadFromStorage: (supabase: SupabaseClient, bucket: string, path: string) => downloadFromStorage(supabase, bucket, path),
      fileManager: fileManager,
      notificationService: new NotificationService(adminClient),
      notifyUserId: testUserId,
      logger: testLogger,
    };

    for (const docKey of thesisDocuments) {
      const docIdentity = documentIdentities.get(docKey);
      const contribId = contributionIds.get(docKey);
      
      if (!docIdentity || !contribId) {
        throw new Error(`Missing identity or contribution ID for ${docKey}`);
      }

      const renderParams: RenderDocumentParams = {
        projectId: testProject.id,
        sessionId: testSession.id,
        iterationNumber: iterationNumber,
        stageSlug: sourceStageSlug,
        documentIdentity: docIdentity,
        documentKey: docKey,
        sourceContributionId: contribId,
      };

      const renderResult = await renderDocument(adminClient, renderDeps, renderParams);
      assertExists(renderResult, `renderDocument should return a result for ${docKey}`);
      assertExists(renderResult.pathContext, `renderDocument should return pathContext for ${docKey}`);
    }

    // 3) Verify the rendered document is saved to dialectic_project_resources with resource_type = 'rendered_document'
    const { data: resourceRecords, error: resourceQueryError } = await adminClient
      .from("dialectic_project_resources")
      .select("*")
      .eq("session_id", testSession.id)
      .eq("iteration_number", iterationNumber)
      .eq("stage_slug", sourceStageSlug)
      .eq("resource_type", "rendered_document");

    assert(!resourceQueryError, `Failed to query resources: ${resourceQueryError?.message}`);
    assertExists(resourceRecords, "Resource query should return data");
    assert(resourceRecords.length >= 4, `At least four rendered documents should be saved to dialectic_project_resources, found ${resourceRecords.length}`);
    
    // Extract document_key from file_name using deconstructStoragePath (same approach as gatherInputsForStage)
    const renderedResource = resourceRecords.find((r) => {
      if (!r.file_name || !r.storage_path) {
        return false;
      }
      const deconstructed = deconstructStoragePath({
        storageDir: r.storage_path,
        fileName: r.file_name,
      });
      const extractedDocumentKey = deconstructed.documentKey;
      return extractedDocumentKey === documentKey;
    });
    assertExists(renderedResource, `Rendered document with document_key '${documentKey}' should exist in dialectic_project_resources`);
    assertEquals(renderedResource.resource_type, "rendered_document", "Resource type should be 'rendered_document'");
    assertEquals(renderedResource.session_id, testSession.id, "Resource session_id should match");
    assertEquals(renderedResource.iteration_number, iterationNumber, "Resource iteration_number should match");
    assertEquals(renderedResource.stage_slug, sourceStageSlug, "Resource stage_slug should match");

    // 4) Call gatherInputsForStage for a subsequent stage that requires the document as input
    // Fetch recipe steps for target stage using application function
    const recipeResult = await getStageRecipe({ stageSlug: targetStageSlug }, adminClient);
    assert(!recipeResult.error, `Failed to fetch recipe for stage '${targetStageSlug}': ${recipeResult.error?.message}`);
    assertExists(recipeResult.data, "Recipe data should exist");
    
    if (!recipeResult.data) {
      throw new Error("Recipe data is missing after assertExists check");
    }
    const recipeData = recipeResult.data;
    assert(recipeData.steps.length > 0, `Stage '${targetStageSlug}' should have at least one recipe step`);

    // Find a step that requires documents from the source stage
    // The planner step requires all thesis documents (business_case, feature_spec, technical_approach, success_metrics)
    const stepWithDocumentInput = recipeData.steps.find(step => {
      if (!step.inputs_required || !Array.isArray(step.inputs_required)) {
        return false;
      }
      
      // Get all document inputs from the source stage
      const documentInputsFromSource = step.inputs_required.filter((input: unknown) => 
        typeof input === 'object' && 
        input !== null && 
        'type' in input && 
        input.type === 'document' &&
        'slug' in input &&
        input.slug === sourceStageSlug
      );
      
      // If there are no document inputs from source stage, skip this step
      if (documentInputsFromSource.length === 0) {
        return false;
      }
      
      // Check that ALL required document inputs from source stage are documents we created
      const requiredDocumentKeys: string[] = [];
      for (const input of documentInputsFromSource) {
        if (
          typeof input === 'object' && 
          input !== null &&
          'document_key' in input &&
          typeof input.document_key === 'string'
        ) {
          requiredDocumentKeys.push(input.document_key);
        }
      }
      
      // All required document keys must be in our thesisDocuments list
      return requiredDocumentKeys.every(key => 
        thesisDocuments.some(doc => String(doc) === key)
      );
    });

    if (!stepWithDocumentInput) {
      throw new Error(
        `No recipe step found for stage '${targetStageSlug}' that requires documents from '${sourceStageSlug}'. ` +
        `Available steps: ${recipeData.steps.map(s => s.step_key).join(', ')}`
      );
    }

    // Query the database directly to get DialecticStageRecipeStep (same approach as processSimpleJob)
    const { data: recipeStepRow, error: recipeStepError } = await adminClient
      .from('dialectic_stage_recipe_steps')
      .select('*')
      .eq('id', stepWithDocumentInput.id)
      .single();
    
    assert(!recipeStepError, `Failed to fetch recipe step: ${recipeStepError?.message}`);
    assertExists(recipeStepRow, "Recipe step should exist");
    
    // Validate with type guard (same approach as processSimpleJob)
    const { isDialecticStageRecipeStep } = await import("../../functions/_shared/utils/type-guards/type_guards.dialectic.ts");
    if (!isDialecticStageRecipeStep(recipeStepRow)) {
      throw new Error("Recipe step from database is not a valid DialecticStageRecipeStep");
    }
    
    const recipeStep: DialecticStageRecipeStep = recipeStepRow;

    // Fetch stage data for target stage
    const { data: targetStageData, error: targetStageError } = await adminClient
      .from("dialectic_stages")
      .select("*")
      .eq("slug", targetStageSlug)
      .single();

    assert(!targetStageError, `Failed to fetch target stage: ${targetStageError?.message}`);
    assertExists(targetStageData, "Target stage should exist");

    const stageContext: StageContext = {
      ...targetStageData,
      recipe_step: recipeStep,
      system_prompts: null,
      domain_specific_prompt_overlays: [],
    };

    // Fetch full project row from database to ensure all required properties are present
    const { data: projectRow, error: projectRowError } = await adminClient
      .from("dialectic_projects")
      .select("*")
      .eq("id", testProject.id)
      .single();

    assert(!projectRowError, `Failed to fetch project row: ${projectRowError?.message}`);
    assertExists(projectRow, "Project row should exist");

    // Construct ProjectContext with all required properties
    const projectContext: ProjectContext = {
      ...projectRow,
      dialectic_domains: { name: "Software Development" },
      user_domain_overlay_values: projectRow.user_domain_overlay_values ?? null,
    };

    // Ensure current_stage_id is not null for SessionContext
    if (!testSession.current_stage_id) {
      throw new Error("testSession.current_stage_id must not be null");
    }
    const sessionContext: SessionContext = {
      id: testSession.id,
      project_id: testSession.project_id,
      session_description: testSession.session_description ?? null,
      user_input_reference_url: testSession.user_input_reference_url ?? null,
      iteration_count: testSession.iteration_count,
      selected_model_ids: testSession.selected_model_ids ?? null,
      status: testSession.status ?? "pending_thesis",
      created_at: testSession.created_at,
      updated_at: testSession.updated_at,
      current_stage_id: testSession.current_stage_id,
      associated_chat_id: testSession.associated_chat_id ?? null,
    };

    // Call gatherInputsForStage
    const gatheredContext = await gatherInputsForStage(
      adminClient,
      (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
      stageContext,
      projectContext,
      sessionContext,
      iterationNumber,
    );

    // 5) Assert that gatherInputsForStage finds and retrieves all required documents from dialectic_project_resources
    assertExists(gatheredContext, "gatherInputsForStage should return a result");
    assertExists(gatheredContext.sourceDocuments, "gatheredContext should have sourceDocuments");
    assert(gatheredContext.sourceDocuments.length >= 4, `Should find at least four documents (all thesis documents), found ${gatheredContext.sourceDocuments.length}`);
    
    // Verify all four thesis documents were retrieved
    const allContributionIds = Array.from(contributionIds.values());
    for (const docKey of thesisDocuments) {
      // Find the resource for this document key
      const resource: Database['public']['Tables']['dialectic_project_resources']['Row'] | undefined = resourceRecords.find((r) => {
        if (!r.file_name || !r.storage_path) {
          return false;
        }
        const deconstructed = deconstructStoragePath({
          storageDir: r.storage_path,
          fileName: r.file_name,
        });
        return deconstructed.documentKey === String(docKey);
      });
      assertExists(resource, `Resource for ${docKey} should exist`);
      
      if (!resource) {
        throw new Error(`Resource for ${docKey} not found after assertExists`);
      }
      
      const gatheredDoc: AssemblerSourceDocument | undefined = gatheredContext.sourceDocuments.find(doc => doc.id === resource.id);
      assertExists(gatheredDoc, `Document ${docKey} should be found in gatheredContext.sourceDocuments`);
      
      if (!gatheredDoc) {
        throw new Error(`Document ${docKey} not found after assertExists`);
      }
      
      assertEquals(gatheredDoc.type, "document", `Gathered document type for ${docKey} should be 'document'`);
      // The rendered document should contain the content from the contribution
      // The content is extracted from JSON and inserted into the template at {{content}}
      const expectedContentFragment = `This is test content for ${docKey} document that will be rendered.`;
      assert(gatheredDoc.content.includes(expectedContentFragment), `Gathered document content for ${docKey} should include the rendered content. Actual content length: ${gatheredDoc.content.length}, first 200 chars: ${gatheredDoc.content.substring(0, 200)}`);
      
      // Verify that the document was retrieved from resources, not contributions
      assert(!allContributionIds.includes(gatheredDoc.id), `Document ${docKey} should be retrieved from resources, not contributions`);
    }
    
    // Use business_case document for the final assertion
    const businessCaseResource: Database['public']['Tables']['dialectic_project_resources']['Row'] | undefined = resourceRecords.find((r) => {
      if (!r.file_name || !r.storage_path) {
        return false;
      }
      const deconstructed = deconstructStoragePath({
        storageDir: r.storage_path,
        fileName: r.file_name,
      });
      return deconstructed.documentKey === String(documentKey);
    });
    assertExists(businessCaseResource, `Business case resource should exist`);
    
    if (!businessCaseResource) {
      throw new Error("Business case resource not found after assertExists");
    }
    
    const gatheredBusinessCase: AssemblerSourceDocument | undefined = gatheredContext.sourceDocuments.find(doc => doc.id === businessCaseResource.id);
    assertExists(gatheredBusinessCase, "Business case document should be found in gatheredContext.sourceDocuments");
    
    if (!gatheredBusinessCase) {
      throw new Error("Business case document not found after assertExists");
    }
    
    assertEquals(gatheredBusinessCase.id, businessCaseResource.id, "Business case document ID should match the rendered resource ID");
  });
});

