import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
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
import {
  type DialecticJobRow,
  type DialecticProject,
  type IDialecticJobDeps,
  type StartSessionPayload,
  type StartSessionSuccessResponse,
  type StageWithRecipeSteps,
  type DatabaseRecipeSteps,
} from '../functions/dialectic-service/dialectic.interface.ts';
import { type Database, type Tables, type Json } from '../functions/types_db.ts';
import { createProject } from '../functions/dialectic-service/createProject.ts';
import { startSession } from '../functions/dialectic-service/startSession.ts';
import { getSeedPromptForStage } from '../functions/_shared/utils/dialectic_utils.ts';
import { NotificationService } from '../functions/_shared/utils/notification.service.ts';
import { isRecord } from '../functions/_shared/utils/type_guards.ts';
import { mapToStageWithRecipeSteps } from '../functions/_shared/utils/mappers.ts';
import { IDocumentRenderer } from '../functions/_shared/services/document_renderer.interface.ts';

describe('PromptAssembler Integration Test Suite', () => {
  let adminClient: SupabaseClient<Database>;
  let fileManager: IFileManager;
  let promptAssembler: IPromptAssembler;
  let stagesWithRecipes: StageWithRecipeSteps[];
  let testingPrompt: string;
  let project: DialecticProject;
  let session: StartSessionSuccessResponse;
  let testUser: User;
  let testDeps: IDialecticJobDeps;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    fileManager = new FileManagerService(adminClient, { constructStoragePath });
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
      downloadFromStorage: (bucket: string, path: string) =>
        downloadFromStorage(adminClient, bucket, path),
      deleteFromStorage: () => Promise.resolve({ error: null }),
      getExtensionFromMimeType: () => '.md',
      callUnifiedAIModel: () => Promise.resolve({ content: '' }),
      continueJob: () => Promise.resolve({ enqueued: true }),
      retryJob: () => Promise.resolve({}),
      notificationService: new NotificationService(adminClient),
      executeModelCallAndSave: () => Promise.resolve(),
      documentRenderer: mockDocumentRenderer,
    };

    const { data: stageDbData, error } = await adminClient
      .from('dialectic_stages')
      .select(
        '*, dialectic_stage_recipe_instances!inner(*, dialectic_stage_recipe_steps!inner(*))',
      );

    if (error) {
      throw new Error(
        `Could not fetch stages and recipes for test setup: ${error.message}`,
      );
    }
    const dbStages: DatabaseRecipeSteps[] = stageDbData;
    stagesWithRecipes = dbStages.map(mapToStageWithRecipeSteps);

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
        project_id: project.id,
        session_id: session.id,
        stage_id: stage.id,
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
            project_id: projectContext.id,
            session_id: sessionContext.id,
            user_id: testUser.id,
            stage_id: stageData.id,
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
                job: mockJob,
                project: projectContext,
                session: sessionContext,
                stage: stageWithRecipe,
                gatherContext,
                render,
              };
              const assembledTurn = await promptAssembler.assembleTurnPrompt(
                turnDeps,
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
                project_id: jobData.project_id,
                session_id: jobData.session_id,
                user_id: jobData.user_id,
                stage_id: jobData.stage_id,
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
                continuationContent: '{"incomplete_json":',
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
});
