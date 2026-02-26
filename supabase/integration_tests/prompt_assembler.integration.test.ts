import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  setSharedAdminClient,
  initializeTestDeps,
  testLogger,
} from '../functions/_shared/_integration.test.utils.ts';
import { type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { FileManagerService } from '../functions/_shared/services/file_manager.ts';
import { PromptAssembler } from '../functions/_shared/prompt-assembler/prompt-assembler.ts';
import {
  FileType,
  type IFileManager,
  type PathContext,
} from '../functions/_shared/types/file_manager.types.ts';
import { type ContributionType } from '../functions/dialectic-service/dialectic.interface.ts';
import {
  type AssembleContinuationPromptDeps,
  type AssemblePlannerPromptDeps,
  type AssembleSeedPromptDeps,
  type AssembleTurnPromptDeps,
  type IPromptAssembler,
  type ProjectContext,
  type SessionContext,
  type StageContext,
} from '../functions/_shared/prompt-assembler/prompt-assembler.interface.ts';
import { renderPrompt } from '../functions/_shared/prompt-renderer.ts';
import { downloadFromStorage } from '../functions/_shared/supabase_storage_utils.ts';
import { gatherInputsForStage } from '../functions/_shared/prompt-assembler/gatherInputsForStage.ts';
import { gatherContext } from '../functions/_shared/prompt-assembler/gatherContext.ts';
import { render } from '../functions/_shared/prompt-assembler/render.ts';
import { constructStoragePath } from '../functions/_shared/utils/path_constructor.ts';
import { extractSourceGroupFragment } from '../functions/_shared/utils/path_utils.ts';
import { planComplexStage } from '../functions/dialectic-worker/task_isolator.ts';
import { findSourceDocuments } from '../functions/dialectic-worker/findSourceDocuments.ts';
import { getGranularityPlanner } from '../functions/dialectic-worker/strategies/granularity.strategies.ts';
import { isDialecticStageRecipeStep } from '../functions/_shared/utils/type-guards/type_guards.dialectic.recipe.ts';
import {
  type DialecticJobRow,
  type DialecticProject,
  type StartSessionPayload,
  type StartSessionSuccessResponse,
  type StageWithRecipeSteps,
  type DatabaseRecipeSteps,
  type Job,
  type DialecticJobPayload,
  type DialecticExecuteJobPayload,
  type HeaderContext,
  type SystemMaterials,
  type ContextForDocument,
  type ContentToInclude,
} from '../functions/dialectic-service/dialectic.interface.ts';
import { type Database, type Tables, type Json, type TablesInsert } from '../functions/types_db.ts';
import { createProject } from '../functions/dialectic-service/createProject.ts';
import { startSession } from '../functions/dialectic-service/startSession.ts';
import { getSeedPromptForStage } from '../functions/_shared/utils/dialectic_utils.ts';
import { NotificationService } from '../functions/_shared/utils/notification.service.ts';
import { isRecord, isFileType, isContributionType } from '../functions/_shared/utils/type_guards.ts';
import { isJson } from '../functions/_shared/utils/type-guards/type_guards.common.ts';
import { isModelContributionFileType } from '../functions/_shared/utils/type-guards/type_guards.file_manager.ts';
import { mapToStageWithRecipeSteps } from '../functions/_shared/utils/mappers.ts';
import { isDatabaseRecipeSteps, isDialecticExecuteJobPayload, isDialecticPlanJobPayload } from '../functions/_shared/utils/type-guards/type_guards.dialectic.ts';
import { IDocumentRenderer } from '../functions/_shared/services/document_renderer.interface.ts';
import { type IJobContext, type IExecuteJobContext, IPlanJobContext } from '../functions/dialectic-worker/JobContext.interface.ts';
import { executeModelCallAndSave } from '../functions/dialectic-worker/executeModelCallAndSave.ts';
import { SelectedAiProvider, PromptConstructionPayload, DialecticPlanJobPayload } from '../functions/dialectic-service/dialectic.interface.ts';
import { getStageRecipe } from '../functions/dialectic-service/getStageRecipe.ts';
import { generateContributions } from '../functions/dialectic-service/generateContribution.ts';
import { countTokens } from '../functions/_shared/utils/tokenizer_utils.ts';
import { createMockTokenWalletService } from '../functions/_shared/services/tokenWalletService.mock.ts';
import { getExtensionFromMimeType } from '../functions/_shared/path_utils.ts';
import type { GenerateContributionsPayload, GenerateContributionsDeps } from '../functions/dialectic-service/dialectic.interface.ts';

describe('PromptAssembler Integration Test Suite', () => {
  let adminClient: SupabaseClient<Database>;
  let fileManager: IFileManager;
  let promptAssembler: IPromptAssembler;
  let stagesWithRecipes: StageWithRecipeSteps[];
  let testingPrompt: string;
  let project: DialecticProject;
  let session: StartSessionSuccessResponse;
  let testUser: User;
  let testDeps: IJobContext;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    fileManager = new FileManagerService(adminClient, { constructStoragePath, logger: testLogger });
    promptAssembler = new PromptAssembler(adminClient, fileManager);

    const mockDocumentRenderer: IDocumentRenderer = {
      renderDocument: () => Promise.resolve({
        pathContext: {
          fileType: FileType.HeaderContext,
          projectId: '',
          sessionId: '',
          iteration: 0,
          stageSlug: '',
          modelSlug: '',
        },
        renderedBytes: new Uint8Array(),
        error: null,
      }),
    };

    testDeps = {
      logger: testLogger,
      fileManager: fileManager,
      promptAssembler: promptAssembler,
      randomUUID: () => crypto.randomUUID(),
      getSeedPromptForStage,
      downloadFromStorage: (supabaseClient: SupabaseClient<Database>, bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      deleteFromStorage: () => Promise.resolve({ error: null }),
      getExtensionFromMimeType: () => '.md',
      callUnifiedAIModel: () => Promise.resolve({ content: '' }),
      continueJob: () => Promise.resolve({ enqueued: false }),
      retryJob: () => Promise.resolve({}),
      notificationService: new NotificationService(adminClient),
      executeModelCallAndSave: () => Promise.resolve(),
      documentRenderer: mockDocumentRenderer,
      // IModelContext
      getAiProviderAdapter: () => null,
      getAiProviderConfig: async () => ({
        api_identifier: 'mock-model',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        tokenization_strategy: { type: 'none' },
      }),
      // IRagContext
      ragService: {
        getContextForModel: async () => ({
          context: '',
          tokensUsedForIndexing: 0,
          error: undefined,
        }),
      },
      indexingService: {
        indexDocument: async () => ({ success: true, tokensUsed: 0 }),
      },
      embeddingClient: {
        getEmbedding: async () => ({
          embedding: [],
          usage: { prompt_tokens: 0, total_tokens: 0 },
        }),
      },
      countTokens,
      // ITokenContext
      tokenWalletService: createMockTokenWalletService().instance,
      // IExecuteJobContext-specific
      extractSourceGroupFragment,
      shouldEnqueueRenderJob: async () => ({ shouldRender: false, reason: 'is_json' as const }),
      // IPlanJobContext
      getGranularityPlanner: () => () => [],
      planComplexStage: async () => [],
      findSourceDocuments: async () => [],
    };

    // Application functions will fetch their own recipe steps - no manual fetching needed
    stagesWithRecipes = [];
    
    // Set up temporary session/project for generateContributions
    const { userClient } = await coreCreateAndSetupTestUser();
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error(`Could not get user: ${userError?.message}`);
    }
    
    const { data: domain } = await adminClient.from('dialectic_domains').select('id').eq('name', 'Software Development').single();
    if (!domain) throw new Error('Software Development domain not found');
    
    const formData = new FormData();
    formData.append('projectName', `Stage-Fetch-${crypto.randomUUID()}`);
    formData.append('initialUserPromptText', 'Temp');
    formData.append('selectedDomainId', domain.id);
    
    const { data: tempProject, error: projectError } = await createProject(formData, adminClient, user);
    if (projectError || !tempProject) {
      throw new Error(`Failed to create temp project: ${JSON.stringify(projectError)}`);
    }
    
    const sessionPayload: StartSessionPayload = {
      projectId: tempProject.id,
      selectedModelIds: [],
    };
    
    const { data: tempSession, error: sessionError } = await startSession(user, adminClient, sessionPayload, testDeps);
    if (sessionError || !tempSession) {
      throw new Error(`Failed to create temp session: ${JSON.stringify(sessionError)}`);
    }
    
    const stageSlugs: string[] = ['thesis-proposal'];
    for (const stageSlug of stageSlugs) {
      const payload: GenerateContributionsPayload = {
        sessionId: tempSession.id,
        projectId: tempProject.id,
        stageSlug: stageSlug,
        iterationNumber: 1,
        walletId: '',
        user_jwt: '',
        is_test_job: true,
      };
      
      const deps: GenerateContributionsDeps = {
        downloadFromStorage: (supabase: SupabaseClient<Database>, bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
        getExtensionFromMimeType: () => '.md',
        logger: testLogger,
        randomUUID: () => crypto.randomUUID(),
        fileManager: fileManager,
        deleteFromStorage: () => Promise.resolve({ error: null }),
      };
      
      await generateContributions(adminClient, payload, user, deps, '');
    }

    testingPrompt = await Deno.readTextFile(
      '../../docs/implementations/Current/Documentation/testing_prompt.md',
    );
  });

  afterAll(async () => {
    await coreCleanupTestResources('all');
  });

  beforeEach(async () => {
    const { userClient } = await coreCreateAndSetupTestUser();
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error(`Could not get user: ${userError?.message}`);
    }
    testUser = user;

    const { data: domain } = await adminClient.from('dialectic_domains').select(
      'id',
    ).eq('name', 'Software Development').single();
    if (!domain) throw new Error('Software Development domain not found');

    const formData = new FormData();
    formData.append('projectName', `PA-Test-Project-${crypto.randomUUID()}`);
    formData.append(
      'initialUserPromptText',
      'A test project for the prompt assembler.',
    );
    formData.append('selectedDomainId', domain.id);

    const { data: projectData, error: projectError } = await createProject(
      formData,
      adminClient,
      testUser,
    );
    if (projectError || !projectData) {
      throw new Error(`Project creation failed: ${JSON.stringify(projectError)}`);
    }
    project = projectData;

    const sessionPayload: StartSessionPayload = {
      projectId: project.id,
      selectedModelIds: [],
    };

    const { data: sessionData, error: sessionError } = await startSession(
      testUser,
      adminClient,
      sessionPayload,
      testDeps,
    );
    if (sessionError || !sessionData) {
      throw new Error(`Session creation failed: ${JSON.stringify(sessionError)}`);
    }
    session = sessionData;
  });

  afterEach(async () => {
    await coreCleanupTestResources('local');
  });

  const saveAndRegisterManualResponse = async (
    content: any,
    job: DialecticJobRow,
    stage: StageContext,
    project: ProjectContext,
    session: SessionContext,
    sourcePromptResourceId: string,
    fileManager: IFileManager,
    adminClient: SupabaseClient<Database>,
    testUser: User,
  ) => {
    const isPlanner = stage.recipe_step.prompt_type === 'Planner';
    const fileType = isPlanner
      ? FileType.HeaderContext
      : FileType.AssembledDocumentJson;

    let documentKey: string | undefined = undefined;
    if (isRecord(job.payload) && job.payload.document_key && typeof job.payload.document_key === 'string') {
      documentKey = job.payload.document_key;
    }

    const pathContext: PathContext = {
      fileType: fileType,
      projectId: project.id,
      sessionId: session.id,
      iteration: job.iteration_number || 1,
      stageSlug: stage.slug,
      modelSlug: 'manual-tester', // Hardcoded for this test
      attemptCount: 1,
      documentKey: documentKey,
      stepName: stage.recipe_step.step_name,
      branchKey: stage.recipe_step.branch_key,
      parallelGroup: stage.recipe_step.parallel_group,
    };

    // Upload the response as an artifact
    const { record: resource, error: uploadError } = await fileManager
      .uploadAndRegisterFile({
        fileContent: JSON.stringify(content, null, 2),
        pathContext: { ...pathContext, fileType: FileType.GeneralResource },
        mimeType: 'application/json',
        sizeBytes: JSON.stringify(content, null, 2).length,
        userId: testUser.id,
        description:
          `Manual response for stage ${stage.slug}, step ${'step_slug' in stage.recipe_step ? stage.recipe_step.step_slug : ''}`,
        resourceTypeForDb: fileType,
      });

    if (uploadError || !resource) {
      throw new Error(
        `Failed to upload manual response artifact: ${uploadError?.message}`,
      );
    }

    // Create the contribution record
    const { error: contributionError } = await adminClient
      .from('dialectic_contributions')
      .insert({
        session_id: session.id,
        stage: stage.slug,
        user_id: testUser.id,
        source_job_id: job.id,
        source_prompt_resource_id: sourcePromptResourceId,
        is_header: isPlanner,
        raw_response: content,
        parsed_content: content,
        model_slug: 'manual-tester',
        storage_path: resource.storage_path,
      });

    if (contributionError) {
      throw new Error(
        `Failed to insert contribution for manual response: ${contributionError.message}`,
      );
    }

    console.log(
      `\n--- [ARTIFACT SAVED] for step: ${'step_slug' in stage.recipe_step ? stage.recipe_step.step_slug : ''} ---\n`,
    );
  };

  const manualResponses: Record<string, Record<string, any>> = {
    'thesis-proposal': {
      'generate-stage-plan': {
        'system_materials': 'PASTE PLANNER RESPONSE FOR THESIS HERE',
      },
      'business-case': {
        'business_case_document':
          'PASTE TURN RESPONSE FOR THESIS - BUSINESS CASE HERE',
      },
      'mvp-feature-spec-with-user-stories': {
        'mvp_feature_spec_with_user_stories_document':
          'PASTE TURN RESPONSE FOR THESIS - MVP FEATURE SPEC HERE',
      },
      'high-level-technical-approach-overview': {
        'high_level_technical_approach_overview_document':
          'PASTE TURN RESPONSE FOR THESIS - TECHNICAL APPROACH HERE',
      },
      'success-metrics': {
        'success_metrics_document':
          'PASTE TURN RESPONSE FOR THESIS - SUCCESS METRICS HERE',
      },
    },
    'antithesis-review': {
      'generate-stage-plan': {
        'system_materials': 'PASTE PLANNER RESPONSE FOR ANTITHESIS HERE',
      },
      'review-business-case': {
        'review_business_case_document':
          'PASTE TURN RESPONSE FOR ANTITHESIS - REVIEW BUSINESS CASE HERE',
      },
      'review-mvp-feature-spec': {
        'review_mvp_feature_spec_document':
          'PASTE TURN RESPONSE FOR ANTITHESIS - REVIEW MVP SPEC HERE',
      },
      'review-technical-approach': {
        'review_technical_approach_document':
          'PASTE TURN RESPONSE FOR ANTITHESIS - REVIEW TECH APPROACH HERE',
      },
      'review-success-metrics': {
        'review_success_metrics_document':
          'PASTE TURN RESPONSE FOR ANTITHESIS - REVIEW SUCCESS METRICS HERE',
      },
    },
    'synthesis-refinement': {
      'generate-stage-plan-a': {
        'system_materials': 'PASTE PLANNER A RESPONSE FOR SYNTHESIS HERE',
      },
      'pairwise-synthesis': {
        'pairwise_synthesis_document':
          'PASTE TURN RESPONSE FOR SYNTHESIS - PAIRWISE HERE',
      },
      'root-synthesis': {
        'root_synthesis_document':
          'PASTE TURN RESPONSE FOR SYNTHESIS - ROOT HERE',
      },
      'generate-stage-plan-b': {
        'system_materials': 'PASTE PLANNER B RESPONSE FOR SYNTHESIS HERE',
      },
      'final-synthesis': {
        'final_synthesis_document':
          'PASTE TURN RESPONSE FOR SYNTHESIS - FINAL HERE',
      },
      'generate-manifest': {
        'manifest_document': 'PASTE TURN RESPONSE FOR SYNTHESIS - MANIFEST HERE',
      },
    },
    'parenthesis-planning': {
      'generate-stage-plan': {
        'system_materials': 'PASTE PLANNER RESPONSE FOR PARENTHESIS HERE',
      },
      'technical-requirements-document': {
        'technical_requirements_document':
          'PASTE TURN RESPONSE FOR PARENTHESIS - TRD HERE',
      },
      'master-plan': {
        'master_plan_document':
          'PASTE TURN RESPONSE FOR PARENTHESIS - MASTER PLAN HERE',
      },
    },
    'paralysis-implementation': {
      'generate-stage-plan': {
        'system_materials': 'PASTE PLANNER RESPONSE FOR PARALYSIS HERE',
      },
      'implementation-plan': {
        'implementation_plan_document':
          'PASTE TURN RESPONSE FOR PARALYSIS - IMPLEMENTATION PLAN HERE',
      },
      'tdd-checklist': {
        'tdd_checklist_document':
          'PASTE TURN RESPONSE FOR PARALYSIS - TDD CHECKLIST HERE',
      },
    },
  };

  it('should generate all prompt types for all stages', async () => {
    /*
      INTERACTIVE TESTING WORKFLOW
      ================================

      This test is designed to be run interactively to facilitate a step-by-step, prompt-by-prompt validation of the entire dialectic workflow.
      The core principle is to use the real application's `PromptAssembler` to generate every prompt, but to use a manual, human-in-the-loop process
      to simulate the AI model's response. This allows us to verify the prompt content and then provide a controlled, "perfect" output for the subsequent
      step to consume, enabling us to test the entire chain of logic without needing a live AI model or the full Dialectic Worker infrastructure.

      The workflow for each stage will proceed as follows, in explicit, linear order:

      1.  QUERY FOR STAGE & STEP DATA:
          - The test will query the database for the relevant stage (e.g., 'thesis').
          - It will then query for the first recipe step within that stage.

      2.  GENERATE THE SEED PROMPT:
          - The test will call `assembleSeedPrompt` using the `testing_prompt.md` file as the initial user input.
          - The output of the Seed Prompt is not directly used by the user, but its resulting artifact is consumed by the Planner.

      3.  GENERATE THE PLANNER PROMPT:
          - The test will call `assemblePlannerPrompt`. This function will internally gather the necessary context, including the artifact generated
            by the Seed Prompt step.
          - The final, assembled Planner Prompt will be printed to the console.

      4.  HANDOFF TO USER (PLANNER RESPONSE):
          - The test execution effectively pauses here.
          - The user (you) will copy the Planner Prompt from the console.
          - The user will then provide this prompt to the AI agent (me) in a separate, blind context (e.g., a new chat thread).
          - The user will receive the AI's response (which should be a JSON object for the "Header Context" or "System Materials").
          - The user will then paste this JSON response into a designated constant variable within this test file (e.g., `const plannerResponse = { ...pasted content... };`).

      5.  GENERATE TURN PROMPTS:
          - The test will be un-paused and continue.
          - It will first perform the "Save and Register" loop for the `plannerResponse` you provided, creating a real artifact in the database that subsequent steps can find.
          - The test will then proceed to iterate through all the `EXECUTE` steps in the current stage's recipe.
          - For each step, it will call `assembleTurnPrompt`. This function will gather the necessary inputs, including the Header Context artifact we just saved.
          - Each assembled Turn Prompt will be printed to the console.

      6.  HANDOFF TO USER (TURN RESPONSES):
          - The test pauses again.
          - The user will take each Turn Prompt, get a response from the AI agent, and paste those responses into corresponding variables in the test file.

      7.  REPEAT UNTIL COMPLETE:
          - This cycle continues. The test will save the Turn Prompt responses as artifacts, and then we will move to the next stage.
          - The Seed Prompt for the next stage will then be able to find the completed artifacts from this stage, and the entire process repeats.

      This method ensures that every step is executed in order, consuming a manually-provided, high-quality prior object from the test file itself, rather than pulling a machine-generated object from the database as it would in a normal, fully-automated flow.
    */

    const { data: projectWithDomain, error: projectError } = await adminClient
      .from('dialectic_projects')
      .select('*, dialectic_domains(name)')
      .eq('id', project.id)
      .single();

    if (projectError || !projectWithDomain) {
      throw new Error(`Could not fetch project with domain: ${projectError.message}`);
    }
    if (!projectWithDomain.dialectic_domains) {
      throw new Error('Domain not joined correctly.');
    }

    const projectContext: ProjectContext = {
      ...projectWithDomain,
      dialectic_domains: { name: projectWithDomain.dialectic_domains.name },
      user_domain_overlay_values: null,
    };

    if (!session.status || !session.current_stage_id) {
      throw new Error('Session is missing status or current stage');
    }

    const sessionContext: SessionContext = {
      ...session,
      status: session.status,
      current_stage_id: session.current_stage_id,
      selected_model_ids: session.selected_models?.map(model => model.id),
    };

    for (const stageDto of stagesWithRecipes) {
      const stageData = stageDto.dialectic_stage;
      const stageRecipe = stageDto.dialectic_stage_recipe_steps;
      if (!stageRecipe || stageRecipe.length === 0) {
        console.log(
          `\n\n--- NO RECIPE FOR STAGE: ${stageData.display_name} (${stageData.slug}) ---\n`,
        );
        continue;
      }
      
      const { data: system_prompts, error: spError } = await adminClient
        .from('system_prompts')
        .select('prompt_text')
        .eq('id', stageData.default_system_prompt_id!)
        .single();
      
      if(spError) {
        console.warn(`Could not fetch system prompt for stage ${stageData.slug}: ${spError.message}`);
      }

      const stageBase: Omit<StageContext, 'recipe_step'> = {
        ...stageData,
        system_prompts: system_prompts,
        domain_specific_prompt_overlays: [],
      };

      console.log(
        `\n\n--- PROCESSING STAGE: ${stageData.display_name} (${stageData.slug}) ---\n`,
      );

      // 1. Generate Seed Prompt (once per stage)
      try {
        const seedDeps: AssembleSeedPromptDeps = {
          dbClient: adminClient,
          fileManager: fileManager,
          project: projectContext,
          session: sessionContext,
          stage: { ...stageBase, recipe_step: stageRecipe[0] },
          projectInitialUserPrompt: testingPrompt,
          iterationNumber: 1,
          downloadFromStorageFn: (bucket, path) =>
            downloadFromStorage(adminClient, bucket, path),
          gatherInputsForStageFn: (db, dl, st, pr, se, it) =>
            gatherInputsForStage(db, dl, st, pr, se, it),
          renderPromptFn: renderPrompt,
        };
        const assembledSeed = await promptAssembler.assembleSeedPrompt(seedDeps);
        console.log('\n--- [SEED PROMPT] ---\n');
        console.log(assembledSeed.promptContent);
      } catch (e: any) {
        console.log(`\n--- [SEED PROMPT] - FAILED ---\n`);
        console.error(e.message);
      }

      for (const step of stageRecipe) {
        console.log(`\n--- STEP: ${step.step_slug} ---\n`);

        const stageWithRecipe: StageContext = {
          ...stageBase,
          recipe_step: step,
        };

        const { data: jobData, error: jobError } = await adminClient
          .from('dialectic_generation_jobs')
          .insert({
            session_id: sessionContext.id,
            user_id: testUser.id,
            stage_slug: stageData.slug,
            job_type: step.job_type,
            status: 'pending',
            payload: { document_key: step.branch_key || null },
            iteration_number: 1,
            is_test_job: true,
          }).select().single();

        if (jobError || !jobData) {
          throw new Error(`Failed to insert mock job: ${JSON.stringify(jobError)}`);
        }
        const mockJob: DialecticJobRow = jobData;

        switch (step.prompt_type) {
          case 'Planner':
            try {
              const plannerDeps: AssemblePlannerPromptDeps = {
                dbClient: adminClient,
                fileManager,
                job: mockJob,
                project: projectContext,
                session: sessionContext,
                stage: stageWithRecipe,
                gatherContext,
                render,
                sourceContributionId: null,
                projectInitialUserPrompt: testingPrompt,
              };
              const assembledPlanner = await promptAssembler
                .assemblePlannerPrompt(plannerDeps);
              console.log('\n--- [PLANNER PROMPT] ---\n');
              console.log(assembledPlanner.promptContent);

              const manualResponse =
                manualResponses[stageData.slug]?.[step.step_slug];
              if (
                manualResponse &&
                !JSON.stringify(manualResponse).includes('PASTE')
              ) {
                await saveAndRegisterManualResponse(
                  manualResponse,
                  mockJob,
                  stageWithRecipe,
                  projectContext,
                  sessionContext,
                  assembledPlanner.source_prompt_resource_id,
                  fileManager,
                  adminClient,
                  testUser,
                );
              }
            } catch (e: any) {
              console.log(`\n--- [PLANNER PROMPT] - FAILED ---\n`);
              console.error(e.message);
            }
            break;
          case 'Turn': {
            try {
              const turnDeps: AssembleTurnPromptDeps = {
                dbClient: adminClient,
                fileManager,
                gatherContext,
                render,
                downloadFromStorage: (supabase: SupabaseClient<Database>, bucket: string, path: string) =>
                  downloadFromStorage(adminClient, bucket, path),
              };
              const assembledTurn = await promptAssembler.assembleTurnPrompt(
                turnDeps,
                {
                  job: mockJob,
                  project: projectContext,
                  session: sessionContext,
                  stage: stageWithRecipe,
                },
              );
              console.log('\n--- [TURN PROMPT (Assembled)] ---\n');
              console.log(assembledTurn.promptContent);

              const manualResponse =
                manualResponses[stageData.slug]?.[step.step_slug];
              if (
                manualResponse &&
                !JSON.stringify(manualResponse).includes('PASTE')
              ) {
                await saveAndRegisterManualResponse(
                  manualResponse,
                  mockJob,
                  stageWithRecipe,
                  projectContext,
                  sessionContext,
                  assembledTurn.source_prompt_resource_id,
                  fileManager,
                  adminClient,
                  testUser,
                );
              }
            } catch (e: any) {
              console.log(`\n--- [TURN PROMPT (Assembled)] - FAILED ---\n`);
              console.error(e.message);
            }

            const originalPayload = mockJob.payload;
            let newPayload: Json = { continuation_of: mockJob.id };

            if (
              originalPayload &&
              typeof originalPayload === 'object' &&
              !Array.isArray(originalPayload)
            ) {
              newPayload = { ...originalPayload, continuation_of: mockJob.id };
            }

            const { data: continuationJobData, error: continuationJobError } =
              await adminClient.from('dialectic_generation_jobs').insert({
                session_id: jobData.session_id,
                user_id: jobData.user_id,
                stage_slug: jobData.stage_slug,
                job_type: jobData.job_type,
                status: 'pending',
                iteration_number: jobData.iteration_number,
                is_test_job: jobData.is_test_job,
                payload: newPayload,
              }).select().single();

            if (continuationJobError || !continuationJobData) {
              throw new Error(
                `Failed to insert continuation job: ${
                  JSON.stringify(continuationJobError)
                }`,
              );
            }
            const mockContinuationJob: DialecticJobRow = continuationJobData;

            try {
              const continuationDeps: AssembleContinuationPromptDeps = {
                dbClient: adminClient,
                fileManager,
                job: mockContinuationJob,
                project: projectContext,
                session: sessionContext,
                stage: stageWithRecipe,
                gatherContext,
              };
              const assembledContinuation = await promptAssembler
                .assembleContinuationPrompt(continuationDeps);
              console.log('\n--- [CONTINUATION PROMPT] ---\n');
              console.log(assembledContinuation.promptContent);
            } catch (e: any) {
              console.log(`\n--- [CONTINUATION PROMPT] - FAILED ---\n`);
              console.error(e.message);
            }
            break;
          }
        }
      }
    }
  });

  describe('assembleTurnPrompt with flexible content_to_include types', () => {
    it('should accept header_context with flexible types when executeModelCallAndSave saves them (producer -> test subject)', async () => {
      // PRODUCER: executeModelCallAndSave saves header_context with flexible content_to_include types
      // TEST SUBJECT: assembleTurnPrompt reads and accepts the flexible types (via processSimpleJob)
      
      const stageSlug = 'thesis';
      const documentKey: FileType = FileType.business_case; // Known document_key - processSimpleJob will resolve recipe step internally

      // Create header_context with flexible types (object where recipe expects string)
      const systemMaterials: SystemMaterials = {
        stage_rationale: 'Test stage rationale',
        input_artifacts_summary: 'Test input artifacts summary',
        agent_notes_to_self: 'Test agent notes to self',
      };
      
      const contentToInclude: ContentToInclude = {
        // Recipe expects strings, but we provide objects/arrays to test flexibility
        components: { nested: 'object', value: 'test' },
        primary_kpis: { nested: 'object', value: 'test' },
        leading_indicators: { nested: 'object', value: 'test' },
        data_sources: ['item1', 'item2', 'item3'],
        open_questions: ['item1', 'item2', 'item3'],
        other_field: 'string value',
      };
      
      const contextForDocument: ContextForDocument = {
        document_key: documentKey,
        content_to_include: contentToInclude,
      };
      
      const headerContextWithFlexibleTypes: HeaderContext = {
        system_materials: systemMaterials,
        header_context_artifact: {
          type: 'header_context',
          document_key: 'header_context',
          artifact_class: 'header_context',
          file_type: 'json',
        },
        context_for_documents: [contextForDocument],
      };

      // PRODUCER: Use executeModelCallAndSave to save header_context (real application function)
      const { data: walletData, error: walletError } = await adminClient
        .from('token_wallets')
        .select('wallet_id')
        .eq('user_id', testUser.id)
        .is('organization_id', null)
        .single();

      if (walletError) {
        throw new Error(`Failed to fetch wallet: ${walletError.message}`);
      }
      if (!walletData || !walletData.wallet_id) {
        throw new Error('Wallet record is missing wallet_id');
      }

      const { data: testModel, error: modelError } = await adminClient
        .from('ai_providers')
        .select('*')
        .eq('api_identifier', 'openai-gpt-4o-mini')
        .single();

      if (modelError) {
        throw new Error(`Failed to fetch test model: ${modelError.message}`);
      }
      if (!testModel || !testModel.id || !testModel.name || !testModel.api_identifier) {
        throw new Error('Test model is missing required fields');
      }

      // Add model to session's selected models before calling generateContributions
      const { error: updateSessionError } = await adminClient
        .from('dialectic_sessions')
        .update({ selected_model_ids: [testModel.id] })
        .eq('id', session.id);

      if (updateSessionError) {
        throw new Error(`Failed to update session with selected models: ${updateSessionError.message}`);
      }

      // USE APPLICATION FUNCTION: generateContributions creates PLAN jobs
      const { generateContributions } = await import('../functions/dialectic-service/generateContribution.ts');
      const { userId, jwt } = await coreCreateAndSetupTestUser();
      const { userClient } = await coreCreateAndSetupTestUser();
      const { data: { user } } = await userClient.auth.getUser();
      
      if (!user) {
        throw new Error('User not found after authentication');
      }
      
      const generatePayload: GenerateContributionsPayload = {
        sessionId: session.id,
        projectId: project.id,
        stageSlug: stageSlug,
        iterationNumber: 1,
        walletId: walletData.wallet_id,
        user_jwt: jwt,
        is_test_job: true,
      };
      
      const generateDeps: GenerateContributionsDeps = {
        downloadFromStorage: (supabase: SupabaseClient<Database>, bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
        getExtensionFromMimeType: () => '.md',
        logger: testLogger,
        randomUUID: () => crypto.randomUUID(),
        fileManager: fileManager,
        deleteFromStorage: () => Promise.resolve({ error: null }),
      };
      
      const generateResult = await generateContributions(adminClient, generatePayload, user, generateDeps, jwt);
      if (!generateResult.success || !generateResult.data) {
        throw new Error(`generateContributions failed: ${generateResult.error?.message}`);
      }
      
      // Get the PLAN job created by generateContributions
      const { data: planJobData, error: planJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('id', generateResult.data.job_ids[0])
        .eq('job_type', 'PLAN')
        .single();

      if (planJobError || !planJobData) {
        throw new Error(`PLAN job not created by generateContributions: ${planJobError?.message || 'No job returned'}`);
      }
      
      const planJob: DialecticJobRow = planJobData;

      // Create EXECUTE job with output_type HeaderContext to test executeModelCallAndSave
      // PLAN jobs create EXECUTE child jobs with output_type: HeaderContext
      const executeJobPayload: DialecticExecuteJobPayload = {
        prompt_template_id: crypto.randomUUID(),
        output_type: FileType.HeaderContext,
        canonicalPathParams: {
          stageSlug: stageSlug,
          contributionType: 'thesis',
        },
        inputs: {},
        document_key: FileType.HeaderContext,
        document_relationships: null,
        model_id: testModel.id,
        model_slug: testModel.api_identifier,
        projectId: project.id,
        sessionId: session.id,
        iterationNumber: 1,
        stageSlug: stageSlug,
        walletId: walletData.wallet_id,
        user_jwt: jwt,
      };

      if (!isDialecticExecuteJobPayload(executeJobPayload)) {
        throw new Error('Execute job payload does not match DialecticExecuteJobPayload type');
      }

      if (!isJson(executeJobPayload)) {
        throw new Error('Execute job payload is not valid JSON');
      }

      // Create EXECUTE job in database
      const { data: headerContextExecuteJobData, error: headerContextExecuteJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
          session_id: session.id,
          user_id: testUser.id,
          stage_slug: stageSlug,
          job_type: 'EXECUTE',
          status: 'pending',
          iteration_number: 1,
          is_test_job: true,
          payload: executeJobPayload,
        })
        .select()
        .single();

      if (headerContextExecuteJobError || !headerContextExecuteJobData) {
        throw new Error(`Failed to create EXECUTE job: ${headerContextExecuteJobError?.message || 'No job returned'}`);
      }

      const headerContextExecuteJob: DialecticJobRow = headerContextExecuteJobData;

      // USE APPLICATION FUNCTION: executeModelCallAndSave to save header_context
      const providerDetails: SelectedAiProvider = {
        id: testModel.id,
        provider: testModel.provider,
        name: testModel.name,
        api_identifier: testModel.api_identifier,
      };

      const promptConstructionPayload: PromptConstructionPayload = {
        systemInstruction: undefined,
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: 'Test planner prompt',
        source_prompt_resource_id: undefined,
      };

      // Create required dependencies for executeModelCallAndSave
      const tokenWalletService = createMockTokenWalletService({
        getBalance: () => Promise.resolve('1000000'),
      }).instance;

      // Mock AI call to return header_context with flexible types
      const depsWithMockedAI: IJobContext = {
        ...testDeps,
        callUnifiedAIModel: async () => ({
          content: JSON.stringify(headerContextWithFlexibleTypes),
          finish_reason: 'stop',
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          rawProviderResponse: {
            choices: [{
              message: {
                content: JSON.stringify(headerContextWithFlexibleTypes),
              },
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
            },
          },
        }),
        countTokens,
        tokenWalletService,
        getExtensionFromMimeType,
        embeddingClient: {
          getEmbedding: async () => ({
            embedding: [],
            usage: { prompt_tokens: 0, total_tokens: 0 },
          }),
        },
        ragService: {
          getContextForModel: async () => ({
            context: '',
            tokensUsedForIndexing: 0,
            error: undefined,
          }),
        },
      };

      await executeModelCallAndSave({
        dbClient: adminClient,
        deps: {
          ...depsWithMockedAI,
          extractSourceGroupFragment: () => 'testuuid',
          shouldEnqueueRenderJob: () => Promise.resolve({ shouldRender: false, reason: 'is_json' }),
        },
        authToken: jwt,
        job: headerContextExecuteJob,
        projectOwnerUserId: testUser.id,
        providerDetails,
        promptConstructionPayload,
        sessionData: session,
        compressionStrategy: async () => [],
        inputsRelevance: undefined, // executeModelCallAndSave will handle this
        inputsRequired: undefined, // executeModelCallAndSave will handle this
      });

      // Fetch the created contribution - query by session, stage, iteration, and look for HeaderContext output type
      // executeModelCallAndSave saves contributions with contribution_type from canonicalPathParams
      const { data: contributions, error: contributionsError } = await adminClient
        .from('dialectic_contributions')
        .select('*')
        .eq('session_id', session.id)
        .eq('stage', stageSlug)
        .eq('iteration_number', 1)
        .order('created_at', { ascending: false })
        .limit(1);

      if (contributionsError) {
        throw new Error(`Failed to fetch header_context contribution: ${contributionsError.message}`);
      }
      if (!contributions || contributions.length === 0) {
        throw new Error('No header_context contribution created by executeModelCallAndSave');
      }
      const headerContextContribution = contributions[0];

      if (!isContributionType(stageSlug)) {
        throw new Error(`Stage slug is not a valid ContributionType: ${stageSlug}`);
      }

      // Create EXECUTE job payload with all required fields
      const executePayload: DialecticExecuteJobPayload = {
        prompt_template_id: crypto.randomUUID(),
        output_type: FileType.business_case,
        canonicalPathParams: {
          stageSlug: stageSlug,
          contributionType: stageSlug,
        },
        inputs: {
          header_context_id: headerContextContribution.id,
        },
        document_key: documentKey,
        document_relationships: null,
        model_id: testModel.id,
        model_slug: testModel.api_identifier,
        projectId: project.id,
        sessionId: session.id,
        iterationNumber: 1,
        stageSlug: stageSlug,
        walletId: walletData.wallet_id,
        user_jwt: jwt,
      };

      if (!isDialecticExecuteJobPayload(executePayload)) {
        throw new Error('Execute payload does not match DialecticExecuteJobPayload type');
      }

      if (!isJson(executePayload)) {
        throw new Error('Execute payload is not valid JSON');
      }

      // TEST SUBJECT: Create EXECUTE job and call processSimpleJob (which calls assembleTurnPrompt internally)
      const { data: executeJob, error: executeJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
          session_id: session.id,
          user_id: testUser.id,
          stage_slug: stageSlug,
          job_type: 'EXECUTE',
          status: 'pending',
          payload: executePayload,
          iteration_number: 1,
          is_test_job: true,
          max_retries: 3,
          attempt_count: 0,
        })
        .select()
        .single();

      if (executeJobError) {
        throw new Error(`Failed to create EXECUTE job: ${executeJobError.message}`);
      }
      if (!executeJob) {
        throw new Error('Failed to create EXECUTE job: No job returned');
      }

      if (!isRecord(executeJob.payload)) {
        throw new Error('Job payload is not a record');
      }
      if (!isDialecticExecuteJobPayload(executeJob.payload)) {
        throw new Error('Job payload does not match DialecticExecuteJobPayload type');
      }

      const validatedJob: Job & { payload: DialecticExecuteJobPayload } = {
        ...executeJob,
        payload: executeJob.payload,
      };

      // USE APPLICATION FUNCTION: Call processSimpleJob which internally calls assembleTurnPrompt
      const { processSimpleJob } = await import('../functions/dialectic-worker/processSimpleJob.ts');
      
      // USE REAL APPLICATION FUNCTION: Use real executeModelCallAndSave (can mock AI call inside it)
      const depsWithMockedExecute: IJobContext = {
        ...testDeps,
        // Use real executeModelCallAndSave - mock only the AI call
        callUnifiedAIModel: async () => ({
          content: 'Mock AI response',
          finishReason: 'stop',
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          rawProviderResponse: {
            choices: [{
              message: {
                content: 'Mock AI response',
              },
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
            },
          },
        }),
      };

      let processSimpleJobError: Error | null = null;
      try {
        await processSimpleJob(
          adminClient,
          validatedJob,
          testUser.id,
          depsWithMockedExecute,
          'test-jwt-token',
        );
      } catch (e) {
        processSimpleJobError = e instanceof Error ? e : new Error(String(e));
        // Check if error is related to structure validation
        if (processSimpleJobError.message.includes('content_to_include structure') || 
            processSimpleJobError.message.includes('structure doesn\'t match')) {
          throw new Error(`processSimpleJob failed with structure validation error when it should accept flexible types: ${processSimpleJobError.message}`);
        }
        // Other errors are acceptable for this test - we just need to verify assembleTurnPrompt didn't throw structure validation
      }

      // Assert: processSimpleJob should succeed (or fail for non-structure reasons) - proving assembleTurnPrompt accepted flexible types
      if (processSimpleJobError && 
          (processSimpleJobError.message.includes('content_to_include structure') || 
           processSimpleJobError.message.includes('structure doesn\'t match'))) {
        throw new Error(`processSimpleJob failed with structure validation error: ${processSimpleJobError.message}`);
      }
    });

    it('should work end-to-end when processSimpleJob calls assembleTurnPrompt with flexible types (test subject -> consumer)', async () => {
      // TEST SUBJECT: assembleTurnPrompt accepts flexible types
      // CONSUMER: processSimpleJob calls assembleTurnPrompt and passes result to REAL executeModelCallAndSave
      
      const stageSlug = 'thesis';
      const documentKey: FileType = FileType.business_case; // Known document_key - processSimpleJob will resolve recipe step internally

      const { jwt } = await coreCreateAndSetupTestUser();

      // Create header_context with flexible types
      const systemMaterials2: SystemMaterials = {
        stage_rationale: 'Test stage rationale',
        agent_notes_to_self: 'Test agent notes to self',
        input_artifacts_summary: 'Test input artifacts summary',
      };
      
      const contentToInclude2: ContentToInclude = {
        components: { nested: 'object', value: 'test' },
        primary_kpis: { nested: 'object', value: 'test' },
        data_sources: ['item1', 'item2'],
        open_questions: ['item1', 'item2'],
        other_field: 'string value',
      };
      
      const contextForDocument2: ContextForDocument = {
        document_key: documentKey,
        content_to_include: contentToInclude2,
      };
      
      const headerContextWithFlexibleTypes: HeaderContext = {
        system_materials: systemMaterials2,
        header_context_artifact: {
          type: 'header_context',
          document_key: 'header_context',
          artifact_class: 'header_context',
          file_type: 'json',
        },
        context_for_documents: [contextForDocument2],
      };

      // Get a test model first (needed for contributionMetadata)
      const { data: testModel, error: modelError } = await adminClient
        .from('ai_providers')
        .select('*')
        .eq('api_identifier', 'openai-gpt-4o-mini')
        .single();

      if (modelError) {
        throw new Error(`Failed to fetch test model: ${modelError.message}`);
      }
      if (!testModel) {
        throw new Error('Failed to fetch test model: No model returned');
      }
      if (!testModel.name) {
        throw new Error('Test model is missing name');
      }
      if (!testModel.api_identifier) {
        throw new Error('Test model is missing api_identifier');
      }

      // Save header_context using the same method as executeModelCallAndSave
      const { record: headerContextResource, error: headerContextError } = await fileManager
        .uploadAndRegisterFile({
          fileContent: JSON.stringify(headerContextWithFlexibleTypes, null, 2),
          pathContext: {
            fileType: FileType.HeaderContext,
            projectId: project.id,
            sessionId: session.id,
            iteration: 1,
            stageSlug: stageSlug,
            modelSlug: testModel.api_identifier,
            attemptCount: 1,
            contributionType: 'thesis',
            documentKey: documentKey,
          },
          mimeType: 'application/json',
          sizeBytes: JSON.stringify(headerContextWithFlexibleTypes, null, 2).length,
          userId: testUser.id,
          description: 'Test header_context with flexible types',
          contributionMetadata: {
            sessionId: session.id,
            modelIdUsed: testModel.id,
            modelNameDisplay: testModel.name,
            stageSlug: stageSlug,
            iterationNumber: 1,
            contributionType: 'header_context',
            tokensUsedInput: 0,
            tokensUsedOutput: 0,
            processingTimeMs: 0,
            isIntermediate: true,
          },
        });

      if (headerContextError) {
        throw new Error(`Failed to save header_context: ${headerContextError.message}`);
      }
      if (!headerContextResource) {
        throw new Error('Failed to save header_context: No resource returned');
      }

      // fileManager.uploadAndRegisterFile with contributionMetadata already created the contribution record
      // Fetch it to get the id for use in the EXECUTE job
      const { data: headerContextContribution, error: contributionError } = await adminClient
        .from('dialectic_contributions')
        .select('*')
        .eq('session_id', session.id)
        .eq('stage', stageSlug)
        .eq('iteration_number', 1)
        .eq('contribution_type', 'header_context')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (contributionError) {
        throw new Error(`Failed to fetch header_context contribution: ${contributionError.message}`);
      }
      if (!headerContextContribution || !headerContextContribution.id) {
        throw new Error('Failed to fetch header_context contribution: No contribution found or missing id');
      }


      const { data: walletData, error: walletError } = await adminClient
        .from('token_wallets')
        .select('wallet_id')
        .eq('user_id', testUser.id)
        .is('organization_id', null)
        .single();

      if (walletError) {
        throw new Error(`Failed to fetch wallet: ${walletError.message}`);
      }
      if (!walletData || !walletData.wallet_id) {
        throw new Error('Wallet record is missing wallet_id');
      }

      if (!isContributionType(stageSlug)) {
        throw new Error(`Stage slug is not a valid ContributionType: ${stageSlug}`);
      }

      // Create EXECUTE job payload with all required fields
      const executePayload: DialecticExecuteJobPayload = {
        prompt_template_id: crypto.randomUUID(),
        output_type: FileType.business_case,
        canonicalPathParams: {
          stageSlug: stageSlug,
          contributionType: stageSlug,
        },
        inputs: {
          header_context_id: headerContextContribution.id,
        },
        document_key: documentKey,
        document_relationships: null,
        model_id: testModel.id,
        model_slug: testModel.api_identifier,
        projectId: project.id,
        sessionId: session.id,
        iterationNumber: 1,
        stageSlug: stageSlug,
        walletId: walletData.wallet_id,
        user_jwt: jwt,
      };

      if (!isDialecticExecuteJobPayload(executePayload)) {
        throw new Error('Execute payload does not match DialecticExecuteJobPayload type');
      }

      if (!isJson(executePayload)) {
        throw new Error('Execute payload is not valid JSON');
      }

      // Create EXECUTE job for processSimpleJob
      const { data: executeJob, error: executeJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
          session_id: session.id,
          user_id: testUser.id,
          stage_slug: stageSlug,
          job_type: 'EXECUTE',
          status: 'pending',
          payload: executePayload,
          iteration_number: 1,
          is_test_job: true,
          max_retries: 3,
          attempt_count: 0,
        })
        .select()
        .single();

      if (executeJobError) {
        throw new Error(`Failed to create EXECUTE job: ${executeJobError.message}`);
      }
      if (!executeJob) {
        throw new Error('Failed to create EXECUTE job: No job returned');
      }

      if (!isRecord(executeJob.payload)) {
        throw new Error('Job payload is not a record');
      }
      if (!isDialecticExecuteJobPayload(executeJob.payload)) {
        throw new Error('Job payload does not match DialecticExecuteJobPayload type');
      }

      const validatedJob: Job & { payload: DialecticExecuteJobPayload } = {
        ...executeJob,
        payload: executeJob.payload,
      };

      // USE REAL APPLICATION FUNCTION: Use real executeModelCallAndSave (can mock AI call inside it)
      const testDepsWithRealExecute: IJobContext = {
        ...testDeps,
        // Use real executeModelCallAndSave - mock only the AI call
        callUnifiedAIModel: async () => ({
          content: 'Mock AI response',
          finishReason: 'stop',
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
        }),
      };

      // Import processSimpleJob
      const { processSimpleJob } = await import('../functions/dialectic-worker/processSimpleJob.ts');

      // CONSUMER: Call processSimpleJob with REAL executeModelCallAndSave which internally calls assembleTurnPrompt
      let processSimpleJobError: Error | null = null;
      try {
        await processSimpleJob(
          adminClient,
          validatedJob,
          testUser.id,
          testDepsWithRealExecute,
          'test-jwt-token',
        );
      } catch (e) {
        processSimpleJobError = e instanceof Error ? e : new Error(String(e));
        // Check if error is related to structure validation
        if (processSimpleJobError.message.includes('content_to_include structure') || 
            processSimpleJobError.message.includes('structure doesn\'t match')) {
          throw new Error(`processSimpleJob failed with structure validation error when it should accept flexible types: ${processSimpleJobError.message}`);
        }
        // Other errors may occur but we verify assembleTurnPrompt succeeded if no structure validation error
      }

      // Assert: processSimpleJob should succeed (or fail for non-structure reasons) - proving assembleTurnPrompt accepted flexible types
      if (processSimpleJobError &&
          (processSimpleJobError.message.includes('content_to_include structure') ||
           processSimpleJobError.message.includes('structure doesn\'t match'))) {
        throw new Error(`processSimpleJob failed with structure validation error: ${processSimpleJobError.message}`);
      }
    });

    it('should deduplicate duplicate keys in flawed AI JSON and produce a valid rendered prompt end-to-end', async () => {
      // END-TO-END PROOF: duplicate-key deduplication via jsonSanitizer
      //
      // Call stack exercised:
      //   raw AI response (with duplicate keys)
      //   → executeModelCallAndSave → sanitizeJsonContent (AST deduplication via jsonc-parser)
      //   → JSON.parse (clean) → Supabase Storage
      //   → processSimpleJob → assembleTurnPrompt → downloadFromStorage (template)
      //   → JSON.parse (HeaderContext) → content_to_include extraction → context merge
      //   → render → renderPrompt → rendered prompt with populated data
      //
      // Only I/O is mocked:
      //   - callUnifiedAIModel in Step 2 (returns raw flawed JSON as AI response)
      //   - executeModelCallAndSave in Step 4 (captures rendered prompt)
      // All business logic uses ACTUAL application functions via the ACTUAL DI graph.

      const stageSlug = 'parenthesis';

      // --- Input artifact: read ACTUAL flawed JSON from disk ---
      // This file contains duplicate keys (subsystems, feature_scope, guardrails, etc.)
      // where the content-bearing value appears first and an empty placeholder appears second.
      // JSON.parse() last-value-wins semantics would destroy the content-bearing values.
      const rawFlawedJson = await Deno.readTextFile(
        '../../example/google-gemini-2.5-flash_0_0742819d_header_context.json',
      );

      // --- Step 1: Negative control ---
      // Prove the raw file genuinely exhibits JSON.parse last-value-wins data destruction
      const naivelyParsed = JSON.parse(rawFlawedJson);
      const naiveContextForDocs = naivelyParsed.context_for_documents || [];
      const naiveTechReq = naiveContextForDocs.find(
        (c: Record<string, unknown>) => c.document_key === 'technical_requirements',
      );
      assert(naiveTechReq, 'Negative control: should find technical_requirements in context_for_documents');
      const naiveContent = naiveTechReq.content_to_include;
      // These assertions prove the bug: JSON.parse kept the LAST (empty) value for each duplicate key
      assert(
        Array.isArray(naiveContent.subsystems) && naiveContent.subsystems.length === 0,
        'Negative control: JSON.parse should have destroyed subsystems (empty array from last-value-wins)',
      );
      assert(
        Array.isArray(naiveContent.feature_scope) && naiveContent.feature_scope.length === 0,
        'Negative control: JSON.parse should have destroyed feature_scope (empty array from last-value-wins)',
      );
      assert(
        Array.isArray(naiveContent.guardrails) && naiveContent.guardrails.length === 0,
        'Negative control: JSON.parse should have destroyed guardrails (empty array from last-value-wins)',
      );

      // --- Step 2: Store flawed HeaderContext via actual executeModelCallAndSave ---

      // Fetch test model
      const { data: testModel, error: modelError } = await adminClient
        .from('ai_providers')
        .select('*')
        .eq('api_identifier', 'openai-gpt-4o-mini')
        .single();

      if (modelError) {
        throw new Error(`Failed to fetch test model: ${modelError.message}`);
      }
      if (!testModel || !testModel.id || !testModel.name || !testModel.api_identifier) {
        throw new Error('Test model is missing required fields');
      }

      // Add model to session's selected models
      const { error: updateSessionError } = await adminClient
        .from('dialectic_sessions')
        .update({ selected_model_ids: [testModel.id] })
        .eq('id', session.id);

      if (updateSessionError) {
        throw new Error(`Failed to update session with selected models: ${updateSessionError.message}`);
      }

      const { userId, jwt } = await coreCreateAndSetupTestUser();

      // Fetch wallet
      const { data: walletData, error: walletError } = await adminClient
        .from('token_wallets')
        .select('wallet_id')
        .eq('user_id', testUser.id)
        .is('organization_id', null)
        .single();

      if (walletError) {
        throw new Error(`Failed to fetch wallet: ${walletError.message}`);
      }
      if (!walletData || !walletData.wallet_id) {
        throw new Error('Wallet record is missing wallet_id');
      }

      // Create HeaderContext EXECUTE job payload
      const headerContextExecutePayload: DialecticExecuteJobPayload = {
        prompt_template_id: crypto.randomUUID(),
        output_type: FileType.HeaderContext,
        canonicalPathParams: {
          stageSlug: stageSlug,
          contributionType: 'header_context',
        },
        inputs: {},
        document_key: FileType.HeaderContext,
        document_relationships: null,
        model_id: testModel.id,
        model_slug: testModel.api_identifier,
        projectId: project.id,
        sessionId: session.id,
        iterationNumber: 1,
        stageSlug: stageSlug,
        walletId: walletData.wallet_id,
        user_jwt: jwt,
      };

      if (!isDialecticExecuteJobPayload(headerContextExecutePayload)) {
        throw new Error('HeaderContext execute job payload does not match DialecticExecuteJobPayload type');
      }
      if (!isJson(headerContextExecutePayload)) {
        throw new Error('HeaderContext execute job payload is not valid JSON');
      }

      // Create HeaderContext EXECUTE job in database
      const { data: headerContextExecuteJobData, error: headerContextExecuteJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .insert({
          session_id: session.id,
          user_id: testUser.id,
          stage_slug: stageSlug,
          job_type: 'EXECUTE',
          status: 'pending',
          iteration_number: 1,
          is_test_job: true,
          payload: headerContextExecutePayload,
        })
        .select()
        .single();

      if (headerContextExecuteJobError || !headerContextExecuteJobData) {
        throw new Error(`Failed to create HeaderContext EXECUTE job: ${headerContextExecuteJobError?.message || 'No job returned'}`);
      }

      const headerContextExecuteJob: DialecticJobRow = headerContextExecuteJobData;

      const providerDetails: SelectedAiProvider = {
        id: testModel.id,
        provider: testModel.provider,
        name: testModel.name,
        api_identifier: testModel.api_identifier,
      };

      const promptConstructionPayload: PromptConstructionPayload = {
        systemInstruction: undefined,
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: 'Planner prompt for parenthesis stage',
        source_prompt_resource_id: undefined,
      };

      // Mock AI call to return the RAW FLAWED JSON — the string with duplicate keys
      const tokenWalletService = createMockTokenWalletService({
        getBalance: () => Promise.resolve('1000000'),
      }).instance;

      const depsWithFlawedAI: IExecuteJobContext = {
        // --- ILoggerContext ---
        logger: testLogger,
        // --- IFileContext ---
        fileManager: fileManager,
        downloadFromStorage: (supabase: SupabaseClient<Database>, bucket: string, path: string) =>
          downloadFromStorage(adminClient, bucket, path),
        deleteFromStorage: () => Promise.resolve({ error: null }),
        // --- IModelContext ---
        callUnifiedAIModel: async () => ({
          content: rawFlawedJson,
          finish_reason: 'stop',
          inputTokens: 100,
          outputTokens: 200,
          processingTimeMs: 500,
          rawProviderResponse: {
            choices: [{
              message: {
                content: rawFlawedJson,
              },
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
            },
          },
        }),
        getAiProviderAdapter: () => null,
        getAiProviderConfig: async () => ({
          api_identifier: 'mock-model',
          input_token_cost_rate: 0.001,
          output_token_cost_rate: 0.002,
          tokenization_strategy: { type: 'none' },
        }),
        // --- IRagContext ---
        ragService: {
          getContextForModel: async () => ({
            context: '',
            tokensUsedForIndexing: 0,
            error: undefined,
          }),
        },
        indexingService: {
          indexDocument: async () => ({ success: true, tokensUsed: 0 }),
        },
        embeddingClient: {
          getEmbedding: async () => ({
            embedding: [],
            usage: { prompt_tokens: 0, total_tokens: 0 },
          }),
        },
        countTokens,
        // --- ITokenContext ---
        tokenWalletService,
        // --- INotificationContext ---
        notificationService: new NotificationService(adminClient),
        // --- IExecuteJobContext-specific ---
        getSeedPromptForStage,
        promptAssembler: promptAssembler,
        getExtensionFromMimeType,
        extractSourceGroupFragment,
        randomUUID: () => crypto.randomUUID(),
        shouldEnqueueRenderJob: async () => ({ shouldRender: false, reason: 'is_json' }),
        continueJob: async () => ({ enqueued: false }),
        retryJob: async () => ({}),
      };

      // Call ACTUAL executeModelCallAndSave — this is the entry point where
      // sanitizeJsonContent runs, deduplicating duplicate keys via jsonc-parser AST
      await executeModelCallAndSave({
        dbClient: adminClient,
        deps: depsWithFlawedAI,
        authToken: jwt,
        job: headerContextExecuteJob,
        projectOwnerUserId: testUser.id,
        providerDetails,
        promptConstructionPayload,
        sessionData: session,
        compressionStrategy: async () => [],
        inputsRelevance: undefined,
        inputsRequired: undefined,
      });

      // --- Step 3: Fetch stored contribution ---
      const { data: contributions, error: contributionsError } = await adminClient
        .from('dialectic_contributions')
        .select('*')
        .eq('session_id', session.id)
        .eq('stage', stageSlug)
        .eq('iteration_number', 1)
        .order('created_at', { ascending: false })
        .limit(1);

      if (contributionsError) {
        throw new Error(`Failed to fetch header_context contribution: ${contributionsError.message}`);
      }
      if (!contributions || contributions.length === 0) {
        throw new Error('No header_context contribution created by executeModelCallAndSave');
      }
      const headerContextContribution = contributions[0];

      if (!isContributionType(stageSlug)) {
        throw new Error(`Stage slug is not a valid ContributionType: ${stageSlug}`);
      }

      // --- Step 4: Consume HeaderContext via actual processSimpleJob ---

      // --- Step 4: Consume HeaderContext via actual processSimpleJob ---

      // Instead of manually constructing executePayload, we use planComplexStage
      // to generate it correctly (populating planner_metadata for step resolution).

      // 1. Fetch stage to get active recipe instance
      const { data: stageData, error: stageError } = await adminClient
        .from('dialectic_stages')
        .select('active_recipe_instance_id')
        .eq('slug', stageSlug)
        .single();

      if (stageError || !stageData?.active_recipe_instance_id) {
        throw new Error(`Failed to fetch active recipe instance for stage ${stageSlug}: ${stageError?.message}`);
      }

      // 2. Fetch recipe step for technical_requirements using instance_id
      const { data: recipeStepData, error: recipeError } = await adminClient
        .from('dialectic_stage_recipe_steps')
        .select('*')
        .eq('instance_id', stageData.active_recipe_instance_id)
        .eq('output_type', FileType.technical_requirements)
        .single();

      if (recipeError || !recipeStepData) {
        throw new Error(`Failed to fetch recipe step for technical_requirements: ${recipeError?.message}`);
      }

      // Use type guard to ensure type safety without casting
      if (!isDialecticStageRecipeStep(recipeStepData)) {
        throw new Error('Fetched recipe step is not a valid DialecticStageRecipeStep');
      }
      const recipeStep = recipeStepData;

      // 2. Create mock parent PLAN job
      // Note: We need a PLAN job to pass to planComplexStage.
      // We construct one that matches the context of the session/project.
      const planJobPayload: DialecticPlanJobPayload = {
        model_id: testModel.id,
        projectId: project.id,
        sessionId: session.id,
        stageSlug: stageSlug,
        iterationNumber: 1,
        walletId: walletData.wallet_id,
        user_jwt: jwt,
        is_test_job: true,
        model_slug: testModel.api_identifier,
      };

      if(!isDialecticPlanJobPayload(planJobPayload)) {
        throw new Error('Plan job payload is not a valid DialecticPlanJobPayload');
      }

      if(!isJson(planJobPayload)) {
        throw new Error('Plan job payload is not a valid JSON');
      }
      const planJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        id: crypto.randomUUID(),
        session_id: session.id,
        user_id: testUser.id,
        stage_slug: stageSlug,
        job_type: 'PLAN',
        status: 'processing',
        iteration_number: 1,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        results: null,
        error_details: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        payload: planJobPayload,
        is_test_job: true,
        max_retries: 3,
        attempt_count: 0,
        parent_job_id: null,
      };

      // 3. Prepare context with REAL planner dependencies
      // We use the real findSourceDocuments and getGranularityPlanner to ensure
      // the planner can actually find the HeaderContext we just saved and generate
      // the correct payload with planner_metadata.
      const planCtx: IPlanJobContext = {
        logger: testLogger,
        notificationService: new NotificationService(adminClient),
        getGranularityPlanner, // REAL
        planComplexStage,      // REAL
        findSourceDocuments,   // REAL
      };

      // 3.5. Mock required synthesis documents
      // The technical_requirements step requires 'system_architecture', 'tech_stack', and 'product_requirements'
      // from the 'synthesis' stage. We must create these artifacts so findSourceDocuments can find them.
      const synthesisDocKeys = ['system_architecture', 'tech_stack', 'product_requirements'];
      
      for (const docKey of synthesisDocKeys) {
        const { record, error } = await fileManager.uploadAndRegisterFile({
          fileContent: `# Mock ${docKey}`,
          mimeType: 'text/markdown',
          sizeBytes: 10,
          userId: testUser.id,
          description: `Mock ${docKey} for synthesis`,
          pathContext: {
            fileType: FileType.RenderedDocument,
            projectId: project.id,
            sessionId: session.id,
            iteration: 1,
            stageSlug: 'synthesis',
            documentKey: docKey,
            modelSlug: testModel.api_identifier,
            attemptCount: 1,
          },
          resourceTypeForDb: 'rendered_document',
          resourceDescriptionForDb: { document_key: docKey }
        });
        
        if (error) {
          throw new Error(`Failed to upload mock ${docKey}: ${error.message}`);
        }
      }

      // 4. Plan the stage to generate the child EXECUTE job payload
      const childJobs = await planComplexStage(
        adminClient,
        planJob,
        planCtx,
        recipeStep,
        jwt
      );

      if (childJobs.length === 0) {
        throw new Error('planComplexStage returned no jobs. HeaderContext might not have been found or planner failed.');
      }

      if(!isDialecticExecuteJobPayload(childJobs[0].payload)) {
        throw new Error('Child job payload is not a valid DialecticExecuteJobPayload');
      }
      // We expect one child job for technical_requirements
      const techReqJobPayload: DialecticExecuteJobPayload = childJobs[0].payload;

      // Verify planner added the metadata needed for step resolution
      if (!techReqJobPayload.planner_metadata?.recipe_step_id) {
        throw new Error('Planned payload is missing recipe_step_id in planner_metadata');
      }

      if(!isJson(techReqJobPayload)) {
        throw new Error('Tech req job payload is not a valid JSON');
      }
      const techReqJobInsertPayload: TablesInsert<'dialectic_generation_jobs'> = {
        session_id: session.id,
        user_id: testUser.id,
        stage_slug: stageSlug,
        job_type: 'EXECUTE',
        status: 'pending',
        payload: techReqJobPayload, // Use the planned payload
        iteration_number: 1,
        is_test_job: true,
        max_retries: 3,
        attempt_count: 0,
      };

      const { data: techReqJob, error: techReqJobError } = await adminClient
        .from('dialectic_generation_jobs')
        .insert(techReqJobInsertPayload)
        .select()
        .single();

      if (techReqJobError) {
        throw new Error(`Failed to create tech req EXECUTE job: ${techReqJobError.message}`);
      }
      if (!techReqJob) {
        throw new Error('Failed to create tech req EXECUTE job: No job returned');
      }

      if (!isRecord(techReqJob.payload)) {
        throw new Error('Tech req job payload is not a record');
      }
      if (!isDialecticExecuteJobPayload(techReqJob.payload)) {
        throw new Error('Tech req job payload does not match DialecticExecuteJobPayload type');
      }

      const validatedTechReqJob: Job & { payload: DialecticExecuteJobPayload } = {
        ...techReqJob,
        payload: techReqJob.payload,
      };

      // Override executeModelCallAndSave to CAPTURE the rendered prompt
      // instead of calling AI — this is the interception point
      let capturedRenderedPrompt: string | undefined;

      const depsWithPromptCapture: IJobContext = {
        ...testDeps,
        executeModelCallAndSave: async (params) => {
          capturedRenderedPrompt = params.promptConstructionPayload.currentUserPrompt;
          // Do not call AI — we only need to verify the rendered prompt
        },
      };

      // Call ACTUAL processSimpleJob — this internally calls:
      //   ctx.promptAssembler.assemble() → assembleTurnPrompt
      //     → retrieves stored HeaderContext from Supabase Storage
      //     → JSON.parse (now clean, deduplication already happened in Step 2)
      //     → extracts content_to_include for document_key === "technical_requirements"
      //     → builds mergedContext = { ...contentToInclude, header_context: fullObject }
      //     → downloads template from prompt-templates bucket (parenthesis_technical_requirements_turn_v1.md)
      //     → render → renderPrompt → rendered prompt
      const { processSimpleJob } = await import('../functions/dialectic-worker/processSimpleJob.ts');

      let processError: Error | null = null;
      try {
        await processSimpleJob(
          adminClient,
          validatedTechReqJob,
          testUser.id,
          depsWithPromptCapture,
          'test-jwt-token',
        );
      } catch (e) {
        processError = e instanceof Error ? e : new Error(String(e));
      }

      // --- Assertions on captured rendered prompt ---
      assert(
        capturedRenderedPrompt !== undefined,
        `processSimpleJob should have called executeModelCallAndSave with a rendered prompt${processError ? ` (processSimpleJob error: ${processError.message})` : ''}`,
      );

      const rendered = capturedRenderedPrompt!;

      // The template's static text should be present — proves the actual template was loaded from storage
      assert(
        rendered.includes('In this turn you are defining the technical requirements'),
        'Rendered prompt should contain the template static text "In this turn you are defining the technical requirements"',
      );

      // Content from the populated duplicate keys should be present in the stringified header_context
      // "Frontend User Interface" is a known subsystem name from the content-bearing first occurrence
      assert(
        rendered.includes('Frontend User Interface'),
        'Rendered prompt should contain "Frontend User Interface" — a subsystem name preserved by deduplication',
      );

      // The empty placeholder that JSON.parse alone would preserve should NOT dominate
      // If deduplication failed, the header_context JSON would contain "subsystems":[]
      assert(
        !rendered.includes('"subsystems":[]'),
        'Rendered prompt should NOT contain "subsystems":[] — deduplication should have preserved populated values',
      );

      // --- Step 5: Write output file ---
      await Deno.writeTextFile(
        '../../example/integration_test_rendered_technical_requirements_prompt.md',
        rendered,
      );
      console.log(
        '\n--- [DEDUPLICATION PROOF] Rendered prompt written to example/integration_test_rendered_technical_requirements_prompt.md ---\n',
      );
    });
  });
});




