import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  afterEach,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  DialecticJobRow,
  DialecticPlanJobPayload,
  DialecticExecuteJobPayload,
  DialecticRecipeStep,
  SourceDocument,
} from "../functions/dialectic-service/dialectic.interface.ts";
import { planAllToOne } from "../functions/dialectic-worker/strategies/planners/planAllToOne.ts";
import { planPerModel } from "../functions/dialectic-worker/strategies/planners/planPerModel.ts";
import {
  coreCleanupTestResources,
  coreCreateAndSetupTestUser,
  initializeSupabaseAdminClient,
  initializeTestDeps,
  registerUndoAction,
} from "../functions/_shared/_integration.test.utils.ts";
import {
  isDialecticExecuteJobPayload,
  isDialecticPlanJobPayload,
  isDialecticRecipeStep,
  isDialecticStageRecipeStep,
} from "../functions/_shared/utils/type-guards/type_guards.dialectic.ts";
import { constructStoragePath } from "../functions/_shared/utils/path_constructor.ts";
import { FileType, type PathContext } from "../functions/_shared/types/file_manager.types.ts";

describe(
  "planAllToOne Integration Test",
  {
    sanitizeOps: false,
    sanitizeResources: false,
  },
  () => {
    let adminClient: SupabaseClient;
    let user: User;
    let authToken: string;
    let projectId: string;
    let sessionId: string;
    let sessionModelId: string;

    beforeEach(async () => {
      initializeTestDeps();
      adminClient = initializeSupabaseAdminClient();
      const { userClient, jwt } = await coreCreateAndSetupTestUser();
      const { data: { user: testUser }, error: userError } = await userClient.auth.getUser();
      if (userError || !testUser) {
        throw new Error(`Could not get user: ${userError?.message}`);
      }
      user = testUser;
      authToken = jwt;

      const { data: domain } = await adminClient
        .from("dialectic_domains")
        .select("id")
        .eq("name", "Software Development")
        .single();
      if (!domain) throw new Error("Software Development domain not found");

      const { data: project, error: projectError } = await adminClient
        .from("dialectic_projects")
        .insert({
          user_id: user.id,
          project_name: `planAllToOne-Test-Project-${crypto.randomUUID()}`,
          initial_user_prompt: "Test prompt",
          selected_domain_id: domain.id,
          status: "active",
        })
        .select()
        .single();

      if (projectError) throw projectError;
      projectId = project.id;
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_projects',
        criteria: { id: projectId },
        scope: 'local',
      });

      const { data: stage } = await adminClient
        .from("dialectic_stages")
        .select("id")
        .eq("slug", "synthesis")
        .single();
      if (!stage) throw new Error("synthesis stage not found");

      const { data: session, error: sessionError } = await adminClient
        .from("dialectic_sessions")
        .insert({
          project_id: projectId,
          status: "running",
          current_stage_id: stage.id,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      sessionId = session.id;
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_sessions',
        criteria: { id: sessionId },
        scope: 'local',
      });

      const { data: sessionModel, error: sessionModelError } = await adminClient
        .from("dialectic_session_models")
        .insert({
          session_id: sessionId,
          model_id: "claude-3-opus-20240229",
        })
        .select()
        .single();

      if (sessionModelError) throw sessionModelError;
      sessionModelId = sessionModel.id;
    });

    afterEach(async () => {
      await coreCleanupTestResources("local");
    });

    it("uses relevance-selected anchor for canonical path params", async () => {
      const { data: stage, error: stageError } = await adminClient
        .from("dialectic_stages")
        .select("active_recipe_instance_id")
        .eq("slug", "synthesis")
        .single();

      assert(!stageError, `Failed to fetch synthesis stage: ${stageError?.message || 'unknown error'}`);
      assertExists(stage?.active_recipe_instance_id, "Synthesis stage must have active recipe instance");
      if (!stage || !stage.active_recipe_instance_id) {
        throw new Error("Stage or active_recipe_instance_id is null after assertExists");
      }

      const { data: instance, error: instanceError } = await adminClient
        .from("dialectic_stage_recipe_instances")
        .select("id, is_cloned, template_id")
        .eq("id", stage.active_recipe_instance_id)
        .single();

      assert(!instanceError, `Failed to fetch recipe instance: ${instanceError?.message || 'unknown error'}`);
      assertExists(instance, "Recipe instance must exist");
      if (!instance) {
        throw new Error("Instance is null after assertExists");
      }

      const isCloned = instance.is_cloned === true;
      let recipeStep: DialecticRecipeStep | null = null;

      if (isCloned) {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_stage_recipe_steps")
          .select("*")
          .eq("instance_id", instance.id)
          .eq("step_key", "generate_final_synthesis_header")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_stage_recipe_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticStageRecipeStep(step)) {
          recipeStep = step;
        }
      } else {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_recipe_template_steps")
          .select("*")
          .eq("template_id", instance.template_id)
          .eq("step_key", "generate_final_synthesis_header")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_recipe_template_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticRecipeStep(step)) {
          recipeStep = step;
        }
      }

      assertExists(recipeStep, "Recipe step 'generate_final_synthesis_header' not found");
      if (!recipeStep) {
        throw new Error("Recipe step is null after assertExists");
      }

      const doc1PathContext: PathContext = {
        projectId: projectId,
        sessionId: sessionId,
        iteration: 1,
        stageSlug: "synthesis",
        contributionType: "synthesis",
        modelSlug: "claude-3-opus-20240229",
        attemptCount: 0,
        documentKey: FileType.synthesis_document_success_metrics,
        fileType: FileType.synthesis_document_success_metrics,
      };
      const doc1Path = constructStoragePath(doc1PathContext);
      const { data: doc1Data, error: docError1 } = await adminClient
        .from("dialectic_contributions")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          session_model_id: sessionModelId,
          stage: "synthesis",
          iteration_number: 1,
          file_name: doc1Path.fileName,
          storage_path: doc1Path.storagePath,
          contribution_type: "synthesis",
        })
        .select()
        .single();

      if (docError1) throw docError1;
      assertExists(doc1Data);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_contributions',
        criteria: { id: doc1Data.id },
        scope: 'local',
      });

      const doc2PathContext: PathContext = {
        projectId: projectId,
        sessionId: sessionId,
        iteration: 1,
        stageSlug: "synthesis",
        contributionType: "synthesis",
        modelSlug: "claude-3-opus-20240229",
        attemptCount: 0,
        documentKey: FileType.synthesis_document_business_case,
        fileType: FileType.synthesis_document_business_case,
      };
      const doc2Path = constructStoragePath(doc2PathContext);
      const { data: doc2Data, error: docError2 } = await adminClient
        .from("dialectic_contributions")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          session_model_id: sessionModelId,
          stage: "synthesis",
          iteration_number: 1,
          file_name: doc2Path.fileName,
          storage_path: doc2Path.storagePath,
          contribution_type: "synthesis",
        })
        .select()
        .single();

      if (docError2) throw docError2;
      assertExists(doc2Data);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_contributions',
        criteria: { id: doc2Data.id },
        scope: 'local',
      });

      const doc1SourceDocument: SourceDocument = {
        id: doc1Data.id,
        session_id: doc1Data.session_id,
        user_id: doc1Data.user_id,
        stage: doc1Data.stage,
        iteration_number: doc1Data.iteration_number,
        file_name: doc1Data.file_name,
        storage_path: doc1Data.storage_path,
        contribution_type: doc1Data.contribution_type,
        citations: doc1Data.citations,
        created_at: doc1Data.created_at,
        edit_version: doc1Data.edit_version,
        error: doc1Data.error,
        is_header: doc1Data.is_header,
        is_latest_edit: doc1Data.is_latest_edit,
        mime_type: doc1Data.mime_type,
        model_id: doc1Data.model_id,
        model_name: doc1Data.model_name,
        original_model_contribution_id: doc1Data.original_model_contribution_id,
        processing_time_ms: doc1Data.processing_time_ms,
        prompt_template_id_used: doc1Data.prompt_template_id_used,
        raw_response_storage_path: doc1Data.raw_response_storage_path,
        seed_prompt_url: doc1Data.seed_prompt_url,
        size_bytes: doc1Data.size_bytes,
        source_prompt_resource_id: doc1Data.source_prompt_resource_id,
        storage_bucket: doc1Data.storage_bucket,
        target_contribution_id: doc1Data.target_contribution_id,
        tokens_used_input: doc1Data.tokens_used_input,
        tokens_used_output: doc1Data.tokens_used_output,
        updated_at: doc1Data.updated_at,
        content: "Success metrics content",
        document_relationships: doc1Data.document_relationships,
      };
      const doc2SourceDocument: SourceDocument = {
        id: doc2Data.id,
        session_id: doc2Data.session_id,
        user_id: doc2Data.user_id,
        stage: doc2Data.stage,
        iteration_number: doc2Data.iteration_number,
        file_name: doc2Data.file_name,
        storage_path: doc2Data.storage_path,
        contribution_type: doc2Data.contribution_type,
        citations: doc2Data.citations,
        created_at: doc2Data.created_at,
        edit_version: doc2Data.edit_version,
        error: doc2Data.error,
        is_header: doc2Data.is_header,
        is_latest_edit: doc2Data.is_latest_edit,
        mime_type: doc2Data.mime_type,
        model_id: doc2Data.model_id,
        model_name: doc2Data.model_name,
        original_model_contribution_id: doc2Data.original_model_contribution_id,
        processing_time_ms: doc2Data.processing_time_ms,
        prompt_template_id_used: doc2Data.prompt_template_id_used,
        raw_response_storage_path: doc2Data.raw_response_storage_path,
        seed_prompt_url: doc2Data.seed_prompt_url,
        size_bytes: doc2Data.size_bytes,
        source_prompt_resource_id: doc2Data.source_prompt_resource_id,
        storage_bucket: doc2Data.storage_bucket,
        target_contribution_id: doc2Data.target_contribution_id,
        tokens_used_input: doc2Data.tokens_used_input,
        tokens_used_output: doc2Data.tokens_used_output,
        updated_at: doc2Data.updated_at,
        content: "Business case content",
        document_relationships: doc2Data.document_relationships,
      };
      const sourceDocs: SourceDocument[] = [
        doc1SourceDocument,
        doc2SourceDocument,
      ];

      const parentJobPayloadObject: DialecticPlanJobPayload = {
        projectId: projectId,
        sessionId: sessionId,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: "claude-3-opus-20240229",
        user_jwt: authToken,
        walletId: crypto.randomUUID(),
        is_test_job: true,
      };

      const { data: parentJobData, error: jobError } = await adminClient
        .from("dialectic_generation_jobs")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          payload: parentJobPayloadObject,
          status: "pending",
          job_type: "PLAN",
          stage_slug: "synthesis",
          iteration_number: 1,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      assertExists(parentJobData);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_generation_jobs',
        criteria: { id: parentJobData.id },
        scope: 'local',
      });

      if (!isDialecticPlanJobPayload(parentJobData.payload)) {
        throw new Error("Payload from DB does not match DialecticPlanJobPayload");
      }

      const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        ...parentJobData,
        payload: parentJobData.payload,
      };

      const results = planAllToOne(
        sourceDocs,
        parentJob,
        recipeStep,
        authToken,
      );

      assertExists(results);
      assertEquals(results.length, 1);
      const [jobPayload] = results;

      assertExists(jobPayload, "Job payload should exist");
      if (!isDialecticExecuteJobPayload(jobPayload)) {
        throw new Error(
          "Job payload from planner is not a valid DialecticExecuteJobPayload",
        );
      }

      const params = jobPayload.canonicalPathParams;
      assertExists(params, "canonical_path_params should exist");

      assertEquals(
        params?.sourceAnchorModelSlug,
        "claude-3-opus-20240229",
        "104.j.i: sourceAnchorModelSlug should be extracted from highest-relevance source document filename (claude-3-opus-20240229 from claude-3-opus-20240229_0_synthesis_document_business_case.md)",
      );
    });
    it("handles null anchor when no relevant documents are found", async () => {
      const { data: stage, error: stageError } = await adminClient
        .from("dialectic_stages")
        .select("active_recipe_instance_id")
        .eq("slug", "synthesis")
        .single();

      assert(!stageError, `Failed to fetch synthesis stage: ${stageError?.message || 'unknown error'}`);
      assertExists(stage?.active_recipe_instance_id, "Synthesis stage must have active recipe instance");
      if (!stage || !stage.active_recipe_instance_id) {
        throw new Error("Stage or active_recipe_instance_id is null after assertExists");
      }

      const { data: instance, error: instanceError } = await adminClient
        .from("dialectic_stage_recipe_instances")
        .select("id, is_cloned, template_id")
        .eq("id", stage.active_recipe_instance_id)
        .single();

      assert(!instanceError, `Failed to fetch recipe instance: ${instanceError?.message || 'unknown error'}`);
      assertExists(instance, "Recipe instance must exist");
      if (!instance) {
        throw new Error("Instance is null after assertExists");
      }

      const isCloned = instance.is_cloned === true;
      let recipeStep: DialecticRecipeStep | null = null;

      if (isCloned) {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_stage_recipe_steps")
          .select("*")
          .eq("instance_id", instance.id)
          .eq("step_key", "generate_final_synthesis_header")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_stage_recipe_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticStageRecipeStep(step)) {
          recipeStep = step;
        }
      } else {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_recipe_template_steps")
          .select("*")
          .eq("template_id", instance.template_id)
          .eq("step_key", "generate_final_synthesis_header")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_recipe_template_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticRecipeStep(step)) {
          recipeStep = step;
        }
      }

      assertExists(recipeStep, "Recipe step 'generate_final_synthesis_header' not found");
      if (!recipeStep) {
        throw new Error("Recipe step is null after assertExists");
      }

      // Intentionally create documents that do NOT match the recipe's input requirements
      const doc1Path = constructStoragePath({
        projectId: projectId,
        sessionId: sessionId,
        iteration: 1,
        stageSlug: "synthesis",
        contributionType: "synthesis",
        modelSlug: "claude-3-opus-20240229",
        attemptCount: 0,
        documentKey: FileType.business_case,
        fileType: FileType.business_case,
      });
      const { data: doc1Data, error: docError1 } = await adminClient
        .from("dialectic_contributions")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          session_model_id: sessionModelId,
          stage: "synthesis",
          iteration_number: 1,
          file_name: doc1Path.fileName,
          storage_path: doc1Path.storagePath,
          contribution_type: "synthesis",
        })
        .select()
        .single();

      if (docError1) throw docError1;
      assertExists(doc1Data);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_contributions',
        criteria: { id: doc1Data.id },
        scope: 'local',
      });

      const doc1SourceDocument: SourceDocument = {
        id: doc1Data.id,
        session_id: doc1Data.session_id,
        user_id: doc1Data.user_id,
        stage: doc1Data.stage,
        iteration_number: doc1Data.iteration_number,
        file_name: doc1Data.file_name,
        storage_path: doc1Data.storage_path,
        contribution_type: doc1Data.contribution_type,
        citations: doc1Data.citations,
        created_at: doc1Data.created_at,
        edit_version: doc1Data.edit_version,
        error: doc1Data.error,
        is_header: doc1Data.is_header,
        is_latest_edit: doc1Data.is_latest_edit,
        mime_type: doc1Data.mime_type,
        model_id: doc1Data.model_id,
        model_name: doc1Data.model_name,
        original_model_contribution_id: doc1Data.original_model_contribution_id,
        processing_time_ms: doc1Data.processing_time_ms,
        prompt_template_id_used: doc1Data.prompt_template_id_used,
        raw_response_storage_path: doc1Data.raw_response_storage_path,
        seed_prompt_url: doc1Data.seed_prompt_url,
        size_bytes: doc1Data.size_bytes,
        source_prompt_resource_id: doc1Data.source_prompt_resource_id,
        storage_bucket: doc1Data.storage_bucket,
        target_contribution_id: doc1Data.target_contribution_id,
        tokens_used_input: doc1Data.tokens_used_input,
        tokens_used_output: doc1Data.tokens_used_output,
        updated_at: doc1Data.updated_at,
        content: "Some other content",
        document_relationships: doc1Data.document_relationships,
      };
      const sourceDocs: SourceDocument[] = [
        doc1SourceDocument,
      ];

      const parentJobPayloadObject: DialecticPlanJobPayload = {
        projectId: projectId,
        sessionId: sessionId,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: "claude-3-opus-20240229",
        user_jwt: authToken,
        walletId: crypto.randomUUID(),
        is_test_job: true,
      };

      const { data: parentJobData, error: jobError } = await adminClient
        .from("dialectic_generation_jobs")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          payload: parentJobPayloadObject,
          status: "pending",
          job_type: "PLAN",
          stage_slug: "synthesis",
          iteration_number: 1,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      assertExists(parentJobData);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_generation_jobs',
        criteria: { id: parentJobData.id },
        scope: 'local',
      });

      if (!isDialecticPlanJobPayload(parentJobData.payload)) {
        throw new Error("Payload from DB does not match DialecticPlanJobPayload");
      }

      const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        ...parentJobData,
        payload: parentJobData.payload,
      };

      const results = planAllToOne(
        sourceDocs,
        parentJob,
        recipeStep,
        authToken,
      );

      assertExists(results);
      assertEquals(results.length, 1);
      const [jobPayload] = results;

      assertExists(jobPayload, "Job payload should exist");
      if (!isDialecticExecuteJobPayload(jobPayload)) {
        throw new Error(
          "Job payload from planner is not a valid DialecticExecuteJobPayload",
        );
      }

      const params = jobPayload.canonicalPathParams;
      assertExists(params, "canonical_path_params should exist");

      assertEquals(
        params?.sourceAnchorModelSlug,
        undefined,
        "sourceAnchorModelSlug should be undefined when no anchor is found",
      );
    });

    it("104.j.ii: EXECUTE job with per_model creates job with canonicalPathParams.sourceAnchorModelSlug extracted from highest-relevance source document filename", async () => {
      const { data: stage, error: stageError } = await adminClient
        .from("dialectic_stages")
        .select("active_recipe_instance_id")
        .eq("slug", "synthesis")
        .single();

      if (stageError) {
        throw new Error(`Failed to fetch synthesis stage: ${stageError.message} (code: ${stageError.code})`);
      }
      assertExists(stage?.active_recipe_instance_id, "Synthesis stage must have active recipe instance");

      const { data: instance, error: instanceError } = await adminClient
        .from("dialectic_stage_recipe_instances")
        .select("id, is_cloned, template_id")
        .eq("id", stage.active_recipe_instance_id)
        .single();

      if (instanceError) {
        throw new Error(`Failed to fetch recipe instance: ${instanceError.message} (code: ${instanceError.code})`);
      }
      assertExists(instance, "Recipe instance must exist");

      const isCloned = instance.is_cloned === true;
      let recipeStep: DialecticRecipeStep | null = null;

      if (isCloned) {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_stage_recipe_steps")
          .select("*")
          .eq("instance_id", instance.id)
          .eq("step_key", "synthesis_document_business_case")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_stage_recipe_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticStageRecipeStep(step)) {
          recipeStep = step;
        }
      } else {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_recipe_template_steps")
          .select("*")
          .eq("template_id", instance.template_id)
          .eq("step_key", "synthesis_document_business_case")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_recipe_template_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticRecipeStep(step)) {
          recipeStep = step;
        }
      }

      assertExists(recipeStep, "Recipe step 'synthesis_document_business_case' not found");
      if (!recipeStep) {
        throw new Error("Recipe step is null after assertExists");
      }

      const doc1Path = constructStoragePath({
        projectId: projectId,
        sessionId: sessionId,
        iteration: 1,
        stageSlug: "synthesis",
        contributionType: "synthesis",
        modelSlug: "gemini-1.5-pro",
        attemptCount: 0,
        documentKey: FileType.synthesis_document_success_metrics,
        fileType: FileType.synthesis_document_success_metrics,
      });
      const { data: doc1Data, error: docError1 } = await adminClient
        .from("dialectic_contributions")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          session_model_id: sessionModelId,
          stage: "synthesis",
          iteration_number: 1,
          file_name: doc1Path.fileName,
          storage_path: doc1Path.storagePath,
          contribution_type: "synthesis",
        })
        .select()
        .single();

      if (docError1) throw docError1;
      assertExists(doc1Data);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_contributions',
        criteria: { id: doc1Data.id },
        scope: 'local',
      });

      const doc2PathContext: PathContext = {
        projectId: projectId,
        sessionId: sessionId,
        iteration: 1,
        stageSlug: "synthesis",
        contributionType: "synthesis",
        modelSlug: "claude-3-opus-20240229",
        attemptCount: 0,
        documentKey: FileType.synthesis_document_business_case,
        fileType: FileType.synthesis_document_business_case,
      };
      const doc2Path = constructStoragePath(doc2PathContext);
      const { data: doc2Data, error: docError2 } = await adminClient
        .from("dialectic_contributions")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          session_model_id: sessionModelId,
          stage: "synthesis",
          iteration_number: 1,
          file_name: doc2Path.fileName,
          storage_path: doc2Path.storagePath,
          contribution_type: "synthesis",
        })
        .select()
        .single();

      if (docError2) throw docError2;
      assertExists(doc2Data);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_contributions',
        criteria: { id: doc2Data.id },
        scope: 'local',
      });

      const doc1SourceDocument: SourceDocument = {
        id: doc1Data.id,
        session_id: doc1Data.session_id,
        user_id: doc1Data.user_id,
        stage: doc1Data.stage,
        iteration_number: doc1Data.iteration_number,
        file_name: doc1Data.file_name,
        storage_path: doc1Data.storage_path,
        contribution_type: doc1Data.contribution_type,
        citations: doc1Data.citations,
        created_at: doc1Data.created_at,
        edit_version: doc1Data.edit_version,
        error: doc1Data.error,
        is_header: doc1Data.is_header,
        is_latest_edit: doc1Data.is_latest_edit,
        mime_type: doc1Data.mime_type,
        model_id: doc1Data.model_id,
        model_name: doc1Data.model_name,
        original_model_contribution_id: doc1Data.original_model_contribution_id,
        processing_time_ms: doc1Data.processing_time_ms,
        prompt_template_id_used: doc1Data.prompt_template_id_used,
        raw_response_storage_path: doc1Data.raw_response_storage_path,
        seed_prompt_url: doc1Data.seed_prompt_url,
        size_bytes: doc1Data.size_bytes,
        source_prompt_resource_id: doc1Data.source_prompt_resource_id,
        storage_bucket: doc1Data.storage_bucket,
        target_contribution_id: doc1Data.target_contribution_id,
        tokens_used_input: doc1Data.tokens_used_input,
        tokens_used_output: doc1Data.tokens_used_output,
        updated_at: doc1Data.updated_at,
        content: "Success metrics content",
        document_relationships: doc1Data.document_relationships,
      };
      const doc2SourceDocument: SourceDocument = {
        id: doc2Data.id,
        session_id: doc2Data.session_id,
        user_id: doc2Data.user_id,
        stage: doc2Data.stage,
        iteration_number: doc2Data.iteration_number,
        file_name: doc2Data.file_name,
        storage_path: doc2Data.storage_path,
        contribution_type: doc2Data.contribution_type,
        citations: doc2Data.citations,
        created_at: doc2Data.created_at,
        edit_version: doc2Data.edit_version,
        error: doc2Data.error,
        is_header: doc2Data.is_header,
        is_latest_edit: doc2Data.is_latest_edit,
        mime_type: doc2Data.mime_type,
        model_id: doc2Data.model_id,
        model_name: doc2Data.model_name,
        original_model_contribution_id: doc2Data.original_model_contribution_id,
        processing_time_ms: doc2Data.processing_time_ms,
        prompt_template_id_used: doc2Data.prompt_template_id_used,
        raw_response_storage_path: doc2Data.raw_response_storage_path,
        seed_prompt_url: doc2Data.seed_prompt_url,
        size_bytes: doc2Data.size_bytes,
        source_prompt_resource_id: doc2Data.source_prompt_resource_id,
        storage_bucket: doc2Data.storage_bucket,
        target_contribution_id: doc2Data.target_contribution_id,
        tokens_used_input: doc2Data.tokens_used_input,
        tokens_used_output: doc2Data.tokens_used_output,
        updated_at: doc2Data.updated_at,
        content: "Business case content",
        document_relationships: doc2Data.document_relationships,
      };
      const sourceDocs: SourceDocument[] = [
        doc1SourceDocument,
        doc2SourceDocument,
      ];

      const parentJobPayloadObject: DialecticPlanJobPayload = {
        projectId: projectId,
        sessionId: sessionId,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: "claude-3-opus-20240229",
        user_jwt: authToken,
        walletId: crypto.randomUUID(),
        is_test_job: true,
      };

      const { data: parentJobData, error: jobError } = await adminClient
        .from("dialectic_generation_jobs")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          payload: parentJobPayloadObject,
          status: "pending",
          job_type: "PLAN",
          stage_slug: "synthesis",
          iteration_number: 1,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      assertExists(parentJobData);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_generation_jobs',
        criteria: { id: parentJobData.id },
        scope: 'local',
      });

      if (!isDialecticPlanJobPayload(parentJobData.payload)) {
        throw new Error("Payload from DB does not match DialecticPlanJobPayload");
      }

      const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        ...parentJobData,
        payload: parentJobData.payload,
      };

      const results = planPerModel(
        sourceDocs,
        parentJob,
        recipeStep,
        authToken,
      );

      assertExists(results);
      assertEquals(results.length, 1);
      const [jobPayload] = results;

      assertExists(jobPayload, "Job payload should exist");
      if (!isDialecticExecuteJobPayload(jobPayload)) {
        throw new Error(
          "Job payload from planner is not a valid DialecticExecuteJobPayload",
        );
      }

      const params = jobPayload.canonicalPathParams;
      assertExists(params, "canonical_path_params should exist");

      assertEquals(
        params?.sourceAnchorModelSlug,
        "claude-3-opus-20240229",
        "104.j.ii: sourceAnchorModelSlug should be extracted from highest-relevance source document filename (claude-3-opus-20240229 from claude-3-opus-20240229_0_synthesis_document_business_case.md)",
      );
    });

    it("104.j.iii: File paths generated using canonicalPathParams correctly include model slug from anchor document", async () => {
      const { data: stage, error: stageError } = await adminClient
        .from("dialectic_stages")
        .select("active_recipe_instance_id")
        .eq("slug", "synthesis")
        .single();

      assert(!stageError, `Failed to fetch synthesis stage: ${stageError?.message || 'unknown error'}`);
      assertExists(stage?.active_recipe_instance_id, "Synthesis stage must have active recipe instance");
      if (!stage || !stage.active_recipe_instance_id) {
        throw new Error("Stage or active_recipe_instance_id is null after assertExists");
      }

      const { data: instance, error: instanceError } = await adminClient
        .from("dialectic_stage_recipe_instances")
        .select("id, is_cloned, template_id")
        .eq("id", stage.active_recipe_instance_id)
        .single();

      assert(!instanceError, `Failed to fetch recipe instance: ${instanceError?.message || 'unknown error'}`);
      assertExists(instance, "Recipe instance must exist");
      if (!instance) {
        throw new Error("Instance is null after assertExists");
      }

      const isCloned = instance.is_cloned === true;
      let recipeStep: DialecticRecipeStep | null = null;

      if (isCloned) {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_stage_recipe_steps")
          .select("*")
          .eq("instance_id", instance.id)
          .eq("step_key", "generate_final_synthesis_header")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_stage_recipe_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticStageRecipeStep(step)) {
          recipeStep = step;
        }
      } else {
        const { data: step, error: stepError } = await adminClient
          .from("dialectic_recipe_template_steps")
          .select("*")
          .eq("template_id", instance.template_id)
          .eq("step_key", "generate_final_synthesis_header")
          .single();
        assert(!stepError, `Failed to fetch recipe step from dialectic_recipe_template_steps: ${stepError?.message || 'unknown error'}`);
        if (step && isDialecticRecipeStep(step)) {
          recipeStep = step;
        }
      }

      assertExists(recipeStep, "Recipe step 'generate_final_synthesis_header' not found");
      if (!recipeStep) {
        throw new Error("Recipe step is null after assertExists");
      }

      const doc1PathContext: PathContext = {
        projectId: projectId,
        sessionId: sessionId,
        iteration: 1,
        stageSlug: "synthesis",
        contributionType: "synthesis",
        modelSlug: "claude-3-opus-20240229",
        attemptCount: 0,
        documentKey: FileType.synthesis_document_success_metrics,
        fileType: FileType.synthesis_document_success_metrics,
      };
      const doc1Path = constructStoragePath(doc1PathContext);
      const { data: doc1Data, error: docError1 } = await adminClient
        .from("dialectic_contributions")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          session_model_id: sessionModelId,
          stage: "synthesis",
          iteration_number: 1,
          file_name: doc1Path.fileName,
          storage_path: doc1Path.storagePath,
          contribution_type: "synthesis",
        })
        .select()
        .single();

      if (docError1) throw docError1;
      assertExists(doc1Data);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_contributions',
        criteria: { id: doc1Data.id },
        scope: 'local',
      });

      const doc2PathContext: PathContext = {
        projectId: projectId,
        sessionId: sessionId,
        iteration: 1,
        stageSlug: "synthesis",
        contributionType: "synthesis",
        modelSlug: "claude-3-opus-20240229",
        attemptCount: 0,
        documentKey: FileType.synthesis_document_business_case,
        fileType: FileType.synthesis_document_business_case,
      };
      const doc2Path = constructStoragePath(doc2PathContext);
      const { data: doc2Data, error: docError2 } = await adminClient
        .from("dialectic_contributions")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          session_model_id: sessionModelId,
          stage: "synthesis",
          iteration_number: 1,
          file_name: doc2Path.fileName,
          storage_path: doc2Path.storagePath,
          contribution_type: "synthesis",
        })
        .select()
        .single();

      if (docError2) throw docError2;
      assertExists(doc2Data);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_contributions',
        criteria: { id: doc2Data.id },
        scope: 'local',
      });

      const doc1SourceDocument: SourceDocument = {
        id: doc1Data.id,
        session_id: doc1Data.session_id,
        user_id: doc1Data.user_id,
        stage: doc1Data.stage,
        iteration_number: doc1Data.iteration_number,
        file_name: doc1Data.file_name,
        storage_path: doc1Data.storage_path,
        contribution_type: doc1Data.contribution_type,
        citations: doc1Data.citations,
        created_at: doc1Data.created_at,
        edit_version: doc1Data.edit_version,
        error: doc1Data.error,
        is_header: doc1Data.is_header,
        is_latest_edit: doc1Data.is_latest_edit,
        mime_type: doc1Data.mime_type,
        model_id: doc1Data.model_id,
        model_name: doc1Data.model_name,
        original_model_contribution_id: doc1Data.original_model_contribution_id,
        processing_time_ms: doc1Data.processing_time_ms,
        prompt_template_id_used: doc1Data.prompt_template_id_used,
        raw_response_storage_path: doc1Data.raw_response_storage_path,
        seed_prompt_url: doc1Data.seed_prompt_url,
        size_bytes: doc1Data.size_bytes,
        source_prompt_resource_id: doc1Data.source_prompt_resource_id,
        storage_bucket: doc1Data.storage_bucket,
        target_contribution_id: doc1Data.target_contribution_id,
        tokens_used_input: doc1Data.tokens_used_input,
        tokens_used_output: doc1Data.tokens_used_output,
        updated_at: doc1Data.updated_at,
        content: "Success metrics content",
        document_relationships: doc1Data.document_relationships,
      };
      const doc2SourceDocument: SourceDocument = {
        id: doc2Data.id,
        session_id: doc2Data.session_id,
        user_id: doc2Data.user_id,
        stage: doc2Data.stage,
        iteration_number: doc2Data.iteration_number,
        file_name: doc2Data.file_name,
        storage_path: doc2Data.storage_path,
        contribution_type: doc2Data.contribution_type,
        citations: doc2Data.citations,
        created_at: doc2Data.created_at,
        edit_version: doc2Data.edit_version,
        error: doc2Data.error,
        is_header: doc2Data.is_header,
        is_latest_edit: doc2Data.is_latest_edit,
        mime_type: doc2Data.mime_type,
        model_id: doc2Data.model_id,
        model_name: doc2Data.model_name,
        original_model_contribution_id: doc2Data.original_model_contribution_id,
        processing_time_ms: doc2Data.processing_time_ms,
        prompt_template_id_used: doc2Data.prompt_template_id_used,
        raw_response_storage_path: doc2Data.raw_response_storage_path,
        seed_prompt_url: doc2Data.seed_prompt_url,
        size_bytes: doc2Data.size_bytes,
        source_prompt_resource_id: doc2Data.source_prompt_resource_id,
        storage_bucket: doc2Data.storage_bucket,
        target_contribution_id: doc2Data.target_contribution_id,
        tokens_used_input: doc2Data.tokens_used_input,
        tokens_used_output: doc2Data.tokens_used_output,
        updated_at: doc2Data.updated_at,
        content: "Business case content",
        document_relationships: doc2Data.document_relationships,
      };
      const sourceDocs: SourceDocument[] = [
        doc1SourceDocument,
        doc2SourceDocument,
      ];

      const parentJobPayloadObject: DialecticPlanJobPayload = {
        projectId: projectId,
        sessionId: sessionId,
        stageSlug: "synthesis",
        iterationNumber: 1,
        model_id: "claude-3-opus-20240229",
        user_jwt: authToken,
        walletId: crypto.randomUUID(),
        is_test_job: true,
      };

      const { data: parentJobData, error: jobError } = await adminClient
        .from("dialectic_generation_jobs")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          payload: parentJobPayloadObject,
          status: "pending",
          job_type: "PLAN",
          stage_slug: "synthesis",
          iteration_number: 1,
        })
        .select()
        .single();

      if (jobError) throw jobError;
      assertExists(parentJobData);
      registerUndoAction({
        type: 'DELETE_CREATED_ROW',
        tableName: 'dialectic_generation_jobs',
        criteria: { id: parentJobData.id },
        scope: 'local',
      });

      if (!isDialecticPlanJobPayload(parentJobData.payload)) {
        throw new Error("Payload from DB does not match DialecticPlanJobPayload");
      }

      const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        ...parentJobData,
        payload: parentJobData.payload,
      };

      const results = planAllToOne(
        sourceDocs,
        parentJob,
        recipeStep,
        authToken,
      );

      assertExists(results);
      assertEquals(results.length, 1);
      const [jobPayload] = results;

      assertExists(jobPayload, "Job payload should exist");
      if (!isDialecticExecuteJobPayload(jobPayload)) {
        throw new Error(
          "Job payload from planner is not a valid DialecticExecuteJobPayload",
        );
      }

      const params = jobPayload.canonicalPathParams;
      assertExists(params, "canonical_path_params should exist");
      assertExists(
        params?.sourceAnchorModelSlug,
        "sourceAnchorModelSlug should be defined in canonicalPathParams",
      );

      assertEquals(
        params.sourceAnchorModelSlug,
        "claude-3-opus-20240229",
        "104.j.iii: canonicalPathParams.sourceAnchorModelSlug should be extracted from anchor document filename (claude-3-opus-20240229 from claude-3-opus-20240229_0_synthesis_document_business_case.md). This ensures file paths generated using canonicalPathParams will correctly include model slug from anchor document.",
      );
    });
  },
);