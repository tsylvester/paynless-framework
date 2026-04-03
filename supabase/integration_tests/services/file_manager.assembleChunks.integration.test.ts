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
  ContextForDocument,
  ContentToInclude,
} from "../../functions/dialectic-service/dialectic.interface.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";
import { startSession } from "../../functions/dialectic-service/startSession.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { constructStoragePath } from "../../functions/_shared/utils/path_constructor.ts";
import { downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { FileType, PathContext } from "../../functions/_shared/types/file_manager.types.ts";
import { isRecord } from "../../functions/_shared/utils/type_guards.ts";
import { assembleChunks } from "../../functions/_shared/utils/assembleChunks/assembleChunks.provides.ts";

/**
 * Integration test for Node 7: assembleAndSaveFinalDocument → real assembleChunks merge parity proof.
 *
 * Boundary: assembleAndSaveFinalDocument (service) → real assembleChunks (domain utility)
 *   → real sanitizeJsonContent (infrastructure utility). Real Supabase storage for chunk download
 *   and final upload. Nothing within this boundary is mocked.
 */
describe("FileManagerService.assembleAndSaveFinalDocument — assembleChunks integration", () => {
  let adminClient: SupabaseClient<Database>;
  let testUser: User;
  let testUserId: string;
  let fileManager: FileManagerService;
  let testModelId: string;
  let storageBucket: string;

  beforeAll(async () => {
    initializeTestDeps();
    adminClient = initializeSupabaseAdminClient();
    setSharedAdminClient(adminClient);

    const { userId, userClient } = await coreCreateAndSetupTestUser();
    testUserId = userId;
    const { data: { user } } = await userClient.auth.getUser();
    assertExists(user, "Test user could not be created");
    testUser = user;

    fileManager = new FileManagerService(adminClient, {
      constructStoragePath,
      logger: testLogger,
      assembleChunks,
    });

    const bucketEnv: string | undefined = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
    if (!bucketEnv) {
      throw new Error("SB_CONTENT_STORAGE_BUCKET must be set");
    }
    storageBucket = bucketEnv;

    // Fetch or create model ID
    const { data: existingModel, error: fetchError } = await adminClient
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

    await coreEnsureTestUserAndWallet(testUserId, 1000000, "local");
  });

  afterAll(async () => {
    await coreCleanupTestResources();
  });

  // --- Helpers ---

  const createUniqueProjectAndSession = async (
    testName: string,
  ): Promise<{
    project: DialecticProject;
    session: StartSessionSuccessResponse;
  }> => {
    const formData = new FormData();
    formData.append(
      "projectName",
      `assembleChunks Integration - ${testName} - ${crypto.randomUUID()}`,
    );
    formData.append("initialUserPromptText", `Test prompt for ${testName}`);
    formData.append("idempotencyKey", crypto.randomUUID());

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
    const project: DialecticProject = projectResult.data;

    const sessionPayload: StartSessionPayload = {
      projectId: project.id,
      selectedModels: [{ id: testModelId, displayName: "Test Model" }],
      idempotencyKey: crypto.randomUUID(),
    };
    const sessionResult = await startSession(testUser, adminClient, sessionPayload);
    if (sessionResult.error) {
      throw new Error(`Failed to start session: ${sessionResult.error.message}`);
    }
    if (!sessionResult.data) {
      throw new Error("Session creation returned no data");
    }
    const session: StartSessionSuccessResponse = sessionResult.data;

    return { project, session };
  };

  const cleanupProjectAndSession = async (
    projectId: string,
    sessionId: string,
  ): Promise<void> => {
    const { error: sessionError } = await adminClient
      .from("dialectic_sessions")
      .delete()
      .eq("id", sessionId);
    if (sessionError) {
      console.warn(`Failed to delete session ${sessionId}: ${sessionError.message}`);
    }
    const { error: projectError } = await adminClient
      .from("dialectic_projects")
      .delete()
      .eq("id", projectId);
    if (projectError) {
      console.warn(`Failed to delete project ${projectId}: ${projectError.message}`);
    }
  };

  /**
   * Creates a continuation chain of dialectic_contributions rows with content
   * uploaded to Supabase storage. Each contribution after the root has its
   * `target_contribution_id` set to the previous contribution, forming a linked chain.
   *
   * Returns the root contribution ID for use with `assembleAndSaveFinalDocument`.
   */
  const createContinuationChain = async (
    sessionId: string,
    projectId: string,
    chunks: { content: string }[],
  ): Promise<{ rootContributionId: string; allContributionIds: string[] }> => {
    const stageSlug = "synthesis";
    const iterationNumber = 1;
    const documentKey: FileType = FileType.synthesis_pairwise_business_case;
    const modelSlug = MOCK_MODEL_CONFIG.api_identifier;
    const allContributionIds: string[] = [];
    let previousContributionId: string | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const contributionId: string = crypto.randomUUID();

      // Construct storage path via the real path constructor
      const pathContext: PathContext = {
        projectId: projectId,
        fileType: FileType.ModelContributionRawJson,
        sessionId: sessionId,
        iteration: iterationNumber,
        stageSlug: stageSlug,
        modelSlug: modelSlug,
        attemptCount: 0,
        documentKey: documentKey,
        isContinuation: i > 0,
        turnIndex: i,
      };
      const constructed = constructStoragePath(pathContext);
      const storagePath: string = constructed.storagePath;
      const fileName: string = constructed.fileName;
      const fullPath = `${storagePath}/${fileName}`;

      // Upload chunk content to storage
      const { error: uploadError } = await adminClient.storage
        .from(storageBucket)
        .upload(fullPath, chunk.content, {
          contentType: "application/json",
          upsert: true,
        });
      assert(!uploadError, `Failed to upload chunk ${i} to ${fullPath}: ${uploadError?.message}`);

      // Insert contribution row
      const { error: insertError } = await adminClient
        .from("dialectic_contributions")
        .insert({
          id: contributionId,
          session_id: sessionId,
          user_id: testUserId,
          stage: stageSlug,
          iteration_number: iterationNumber,
          storage_bucket: storageBucket,
          storage_path: storagePath,
          file_name: fileName,
          target_contribution_id: previousContributionId,
          is_latest_edit: false,
          document_relationships: {
            document_key: documentKey,
            stage_slug: stageSlug,
          },
        });
      assert(
        !insertError,
        `Failed to insert contribution ${i} (${contributionId}): ${insertError?.message}`,
      );

      allContributionIds.push(contributionId);
      previousContributionId = contributionId;
    }

    const rootContributionId: string = allContributionIds[0];
    return { rootContributionId, allContributionIds };
  };

  // --- Tests ---

  it("raw-only chain: adjacent raw fragments are concatenated, sanitized, and merged", async () => {
    const { project, session } = await createUniqueProjectAndSession("raw-only-chain");

    try {
      // Three raw truncated JSON fragments that form one object when concatenated
      const rawChunks: { content: string }[] = [
        { content: '{"executive_summary":"The project' },
        { content: " aims to deliver" },
        { content: ' value to stakeholders"}' },
      ];

      const { rootContributionId, allContributionIds } = await createContinuationChain(
        session.id,
        project.id,
        rawChunks,
      );

      // Call assembleAndSaveFinalDocument
      const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContributionId);
      assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
      assertExists(assembleResult.finalPath, "Should return a final path");

      // Download and parse the assembled file
      const finalPath: string = assembleResult.finalPath!;
      const downloadResult = await downloadFromStorage(adminClient, storageBucket, finalPath);
      assert(!downloadResult.error, `Failed to download assembled file: ${downloadResult.error?.message}`);
      assertExists(downloadResult.data, "Assembled file should exist in storage");

      const assembledContent: string = new TextDecoder().decode(downloadResult.data!);
      let parsed: unknown;
      try {
        parsed = JSON.parse(assembledContent);
      } catch (parseErr) {
        throw new Error(
          `Assembled file is not valid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        );
      }

      assert(!Array.isArray(parsed), "Assembled JSON should be an object, not an array");
      if (!isRecord(parsed)) {
        throw new Error("Assembled JSON should be a record");
      }

      // The three raw fragments concatenated form: {"executive_summary":"The project aims to deliver value to stakeholders"}
      assertEquals(
        parsed.executive_summary,
        "The project aims to deliver value to stakeholders",
        "Raw fragments should be concatenated and parsed into a single coherent value",
      );

      // Verify is_latest_edit flags
      const { data: contributions, error: queryError } = await adminClient
        .from("dialectic_contributions")
        .select("id, is_latest_edit")
        .in("id", allContributionIds);
      assert(!queryError, `Failed to query contributions: ${queryError?.message}`);
      assertExists(contributions, "Contributions should exist");

      // Root should be marked as latest edit, all others should not
      for (const contrib of contributions) {
        if (contrib.id === rootContributionId) {
          assertEquals(contrib.is_latest_edit, true, "Root contribution should have is_latest_edit=true");
        } else {
          assertEquals(contrib.is_latest_edit, false, `Intermediary ${contrib.id} should have is_latest_edit=false`);
        }
      }

      // Verify assembled path is in _work/assembled_json/
      assert(
        finalPath.includes("/_work/assembled_json/"),
        `Assembled path should be in _work/assembled_json/, got: ${finalPath}`,
      );
    } finally {
      await cleanupProjectAndSession(project.id, session.id);
    }
  });

  it("parseable-only chain: valid JSON chunks deep-merged with continuation metadata stripped", async () => {
    const { project, session } = await createUniqueProjectAndSession("parseable-only-chain");

    try {
      const parseableChunks: { content: string }[] = [
        {
          content: JSON.stringify({
            executive_summary: "First summary",
            resolved_positions: ["position1"],
            continuation_needed: true,
            resume_cursor: { document_key: "executive_summary", section_id: "intro" },
          }),
        },
        {
          content: JSON.stringify({
            user_problem_validation: "Problem validated",
            continuation_needed: true,
            stop_reason: "max_tokens",
          }),
        },
        {
          content: JSON.stringify({
            open_questions: ["question1"],
            final_recommendation: "Proceed with caution",
          }),
        },
      ];

      const { rootContributionId } = await createContinuationChain(
        session.id,
        project.id,
        parseableChunks,
      );

      const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContributionId);
      assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
      assertExists(assembleResult.finalPath, "Should return a final path");

      const finalPath: string = assembleResult.finalPath!;
      const downloadResult = await downloadFromStorage(adminClient, storageBucket, finalPath);
      assert(!downloadResult.error, `Failed to download assembled file: ${downloadResult.error?.message}`);
      assertExists(downloadResult.data, "Assembled file should exist in storage");

      const assembledContent: string = new TextDecoder().decode(downloadResult.data!);
      const parsedRaw: unknown = JSON.parse(assembledContent);
      if (!isRecord(parsedRaw)) {
        throw new Error("Assembled JSON should be a record");
      }
      const parsed: Record<string, unknown> = parsedRaw;

      // Content keys from all 3 chunks should be present (deep-merged)
      assertEquals(parsed.executive_summary, "First summary", "executive_summary from chunk 1");
      assertEquals(parsed.user_problem_validation, "Problem validated", "user_problem_validation from chunk 2");
      assert(Array.isArray(parsed.open_questions), "open_questions should be an array");
      assertEquals(parsed.open_questions, ["question1"], "open_questions from chunk 3");
      assertEquals(parsed.final_recommendation, "Proceed with caution", "final_recommendation from chunk 3");
      assert(Array.isArray(parsed.resolved_positions), "resolved_positions should be an array");

      // Continuation metadata keys must be stripped
      assertEquals(parsed.continuation_needed, undefined, "continuation_needed should be stripped");
      assertEquals(parsed.stop_reason, undefined, "stop_reason should be stripped");
      assertEquals(parsed.resume_cursor, undefined, "resume_cursor should be stripped");
    } finally {
      await cleanupProjectAndSession(project.id, session.id);
    }
  });

  it("mixed chain: raw fragments and parseable chunks merged correctly", async () => {
    const { project, session } = await createUniqueProjectAndSession("mixed-chain");

    try {
      const mixedChunks: { content: string }[] = [
        // Chunk 1: raw truncated JSON
        { content: '{"executive_summary":"Started the analysis' },
        // Chunk 2: valid JSON with continuation metadata
        {
          content: JSON.stringify({
            user_problem_validation: "Problem is validated",
            continuation_needed: true,
          }),
        },
        // Chunk 3: raw truncated JSON
        { content: '{"open_questions":["How to proceed?"]}' },
      ];

      const { rootContributionId } = await createContinuationChain(
        session.id,
        project.id,
        mixedChunks,
      );

      const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContributionId);
      assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
      assertExists(assembleResult.finalPath, "Should return a final path");

      const finalPath: string = assembleResult.finalPath!;
      const downloadResult = await downloadFromStorage(adminClient, storageBucket, finalPath);
      assert(!downloadResult.error, `Failed to download assembled file: ${downloadResult.error?.message}`);
      assertExists(downloadResult.data, "Assembled file should exist in storage");

      const assembledContent: string = new TextDecoder().decode(downloadResult.data!);
      const parsedRaw: unknown = JSON.parse(assembledContent);
      if (!isRecord(parsedRaw)) {
        throw new Error("Assembled JSON should be a record");
      }
      const parsed: Record<string, unknown> = parsedRaw;

      // Content from all 3 chunks should be present
      // Chunk 1 (raw): executive_summary (sanitizer will close the raw fragment into a parseable object)
      assertExists(parsed.executive_summary, "executive_summary from raw chunk 1 should be present");
      // Chunk 2 (parseable): user_problem_validation
      assertEquals(parsed.user_problem_validation, "Problem is validated", "user_problem_validation from chunk 2");
      // Chunk 3 (raw but valid JSON): open_questions
      assert(Array.isArray(parsed.open_questions), "open_questions should be an array");
      assertEquals(parsed.open_questions, ["How to proceed?"], "open_questions from chunk 3");

      // Continuation metadata stripped
      assertEquals(parsed.continuation_needed, undefined, "continuation_needed should be stripped");
    } finally {
      await cleanupProjectAndSession(project.id, session.id);
    }
  });

  it("expectedSchema fill: missing keys filled with placeholder, existing keys preserved", async () => {
    const { project, session } = await createUniqueProjectAndSession("expectedSchema-fill");

    try {
      // Two parseable chunks that produce a merged object missing some expected keys
      const parseableChunks: { content: string }[] = [
        {
          content: JSON.stringify({
            executive_summary: "Complete summary here",
            resolved_positions: ["position1"],
          }),
        },
        {
          content: JSON.stringify({
            user_problem_validation: "Validated problem statement",
          }),
        },
      ];

      const { rootContributionId } = await createContinuationChain(
        session.id,
        project.id,
        parseableChunks,
      );

      // Build an expectedSchema that defines keys the model should have generated
      const expectedContentToInclude: ContentToInclude = {
        executive_summary: "",
        user_problem_validation: "",
        resolved_positions: [],
        open_questions: [],
        final_recommendation: "",
        risk_assessment: {
          severity: "",
          mitigation_plan: "",
        },
      };
      const expectedSchema: ContextForDocument = {
        document_key: FileType.synthesis_pairwise_business_case,
        content_to_include: expectedContentToInclude,
      };

      const assembleResult = await fileManager.assembleAndSaveFinalDocument(
        rootContributionId,
        expectedSchema,
      );
      assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
      assertExists(assembleResult.finalPath, "Should return a final path");

      const finalPath: string = assembleResult.finalPath!;
      const downloadResult = await downloadFromStorage(adminClient, storageBucket, finalPath);
      assert(!downloadResult.error, `Failed to download assembled file: ${downloadResult.error?.message}`);
      assertExists(downloadResult.data, "Assembled file should exist in storage");

      const assembledContent: string = new TextDecoder().decode(downloadResult.data!);
      const parsedRaw: unknown = JSON.parse(assembledContent);
      if (!isRecord(parsedRaw)) {
        throw new Error("Assembled JSON should be a record");
      }
      const parsed: Record<string, unknown> = parsedRaw;

      const placeholder = "[Continuation limit reached — value not generated]";

      // Existing keys with real values are preserved — NOT overwritten
      assertEquals(
        parsed.executive_summary,
        "Complete summary here",
        "executive_summary should be preserved (not overwritten by placeholder)",
      );
      assertEquals(
        parsed.user_problem_validation,
        "Validated problem statement",
        "user_problem_validation should be preserved",
      );

      // Missing keys are filled with the placeholder
      assertEquals(
        parsed.open_questions,
        placeholder,
        "open_questions (empty array equivalent in merged) should be filled with placeholder",
      );
      assertEquals(
        parsed.final_recommendation,
        placeholder,
        "final_recommendation (missing) should be filled with placeholder",
      );

      // Nested missing object should have placeholders for each sub-key
      const riskAssessmentRaw: unknown = parsed.risk_assessment;
      if (!isRecord(riskAssessmentRaw)) {
        throw new Error("risk_assessment should be a nested object with placeholders");
      }
      const riskAssessment: Record<string, unknown> = riskAssessmentRaw;
      assertEquals(
        riskAssessment.severity,
        placeholder,
        "risk_assessment.severity should be filled with placeholder",
      );
      assertEquals(
        riskAssessment.mitigation_plan,
        placeholder,
        "risk_assessment.mitigation_plan should be filled with placeholder",
      );
    } finally {
      await cleanupProjectAndSession(project.id, session.id);
    }
  });

  it("no expectedSchema (parity proof): missing keys remain absent, behavior unchanged from pre-refactor", async () => {
    const { project, session } = await createUniqueProjectAndSession("no-expectedSchema-parity");

    try {
      // Same 2-chunk chain as the expectedSchema test, but called without expectedSchema
      const parseableChunks: { content: string }[] = [
        {
          content: JSON.stringify({
            executive_summary: "Complete summary here",
            resolved_positions: ["position1"],
          }),
        },
        {
          content: JSON.stringify({
            user_problem_validation: "Validated problem statement",
          }),
        },
      ];

      const { rootContributionId } = await createContinuationChain(
        session.id,
        project.id,
        parseableChunks,
      );

      // Call WITHOUT expectedSchema — normal assembly path
      const assembleResult = await fileManager.assembleAndSaveFinalDocument(rootContributionId);
      assert(!assembleResult.error, `assembleAndSaveFinalDocument failed: ${assembleResult.error?.message}`);
      assertExists(assembleResult.finalPath, "Should return a final path");

      const finalPath: string = assembleResult.finalPath!;
      const downloadResult = await downloadFromStorage(adminClient, storageBucket, finalPath);
      assert(!downloadResult.error, `Failed to download assembled file: ${downloadResult.error?.message}`);
      assertExists(downloadResult.data, "Assembled file should exist in storage");

      const assembledContent: string = new TextDecoder().decode(downloadResult.data!);
      const parsedRaw: unknown = JSON.parse(assembledContent);
      if (!isRecord(parsedRaw)) {
        throw new Error("Assembled JSON should be a record");
      }
      const parsed: Record<string, unknown> = parsedRaw;

      // Existing keys are present
      assertEquals(parsed.executive_summary, "Complete summary here", "executive_summary should be present");
      assertEquals(
        parsed.user_problem_validation,
        "Validated problem statement",
        "user_problem_validation should be present",
      );
      assert(Array.isArray(parsed.resolved_positions), "resolved_positions should be an array");
      assertEquals(parsed.resolved_positions, ["position1"], "resolved_positions preserved");

      // Missing keys remain absent — no fill logic runs without expectedSchema
      assertEquals(parsed.open_questions, undefined, "open_questions should remain absent (no fill)");
      assertEquals(parsed.final_recommendation, undefined, "final_recommendation should remain absent (no fill)");
      assertEquals(parsed.risk_assessment, undefined, "risk_assessment should remain absent (no fill)");
    } finally {
      await cleanupProjectAndSession(project.id, session.id);
    }
  });
});
