import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getEncoding } from "npm:js-tiktoken@1.0.7";
import { countTokens as countTokensAnthropicLib } from "npm:@anthropic-ai/tokenizer@0.0.4";
import type { Database, Tables } from "../../types_db.ts";
import type { AiModelExtendedConfig, Messages } from "../../_shared/types.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient, type MockQueryBuilderState } from "../../_shared/supabase.mock.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import type { CompressionSourceType, ModelContributionFileTypes, IFileManager } from "../../_shared/types/file_manager.types.ts";
import { isRecord } from "../../_shared/utils/type_guards.ts";
import { isKnownTiktokenEncoding } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { renderPrompt } from "../../_shared/prompt-renderer.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { constructStoragePath, sanitizeForPath } from "../../_shared/utils/path_constructor.ts";
import { enqueueCompressJobs } from "../enqueueCompressJobs/enqueueCompressJobs.ts";
import { isDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.guard.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import { assembleCompressionPrompt } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.ts";
import { assembleContinuationPrompt, MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON } from "../../_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.ts";
import { processCompressJob } from "./processCompressJob.ts";
import {
  buildenqueueCompressJobsDeps,
  buildenqueueCompressJobsParams,
} from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
  buildProcessCompressJobParams,
} from "./processCompressJob.mock.ts";
import {
  buildDialecticJobRow,
  buildDialecticStageRecipeStep,
  buildDialecticRecipeTemplateStep,
  buildDialecticExecuteJobPayload,
  buildOutputRule,
  buildStageWithRecipeSteps,
} from "../../_shared/dialectic.mock.ts";
import { MOCK_MODEL_CONFIG } from "../../_shared/_integration.test.utils.ts";
import type {
  AssembleCompressionPromptDeps,
  BoundAssembleCompressionPromptFn,
} from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type {
  AssembleContinuationPromptDeps,
  BoundAssembleContinuationPromptFn,
} from "../../_shared/prompt-assembler/prompt-assembler.interface.ts";
import type {
  ProcessCompressJobDeps,
} from "./processCompressJob.interface.ts";
import type {
  PrepareModelJobParams,
  PrepareModelJobPayload,
  BoundPrepareModelJobFn,
} from "../prepareModelJob/prepareModelJob.interface.ts";
import { isModelContributionFileType } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { createMockFileManagerService, buildFileRecord } from "../../_shared/services/file_manager.mock.ts";
import type { DownloadStorageResult } from "../../_shared/supabase_storage_utils.ts";

const PROVIDER_MAX_INPUT_TOKENS = 1000;
const TOKEN_BUDGET = PROVIDER_MAX_INPUT_TOKENS - 500 - 32;

const realModelConfig: AiModelExtendedConfig = {
  ...MOCK_MODEL_CONFIG,
  provider_max_input_tokens: PROVIDER_MAX_INPUT_TOKENS,
  provider_max_output_tokens: 100,
  tokenization_strategy: {
    type: "tiktoken",
    tiktoken_encoding_name: "cl100k_base",
  },
};

if(!isJson(realModelConfig)){
  throw new Error(`modelConfig is invalid: ${JSON.stringify(realModelConfig, null, 2)}`);
}

const tokenizerDeps: CountTokensDeps = {
  getEncoding: (encodingName: string) => {
    if (!isKnownTiktokenEncoding(encodingName)) {
      throw new Error(`Unknown tiktoken encoding: ${encodingName}`);
    }
    return getEncoding(encodingName);
  },
  countTokensAnthropic: (text: string) => countTokensAnthropicLib(text),
  logger: new MockLogger(),
};

function realTokenCount(content: string): number {
  return countTokens(tokenizerDeps, { message: content }, realModelConfig);
}

function buildBoundaryContents(): { justUnder: string; justOver: string } {
  let index = 1;
  let content = `word${index}`;
  let previous = content;
  while (realTokenCount(content) <= TOKEN_BUDGET) {
    previous = content;
    index += 1;
    content = `${content} word${index}`;
  }
  return { justUnder: previous, justOver: content };
}

const UUID_SYSTEM_PROMPT = "a000000a-0000-4000-a000-00000000000a";

const compressionContextPromptText = `You are compressing a source that is context for a downstream agent. That agent will use the compressed result, alongside other documents, to populate the target schema below. Your output must preserve every fact that could contribute to any field of the target schema.

{{#section:json_mode}}
The source is a completed JSON structure. Return EXACTLY the same JSON structure with its values compressed:
- Every key must be present in your output. Do not add, rename, remove, or reorder keys.
- Object shapes must not change.
- Arrays may lose low-value elements; keep every element that could contribute to the target schema.
- Condense string values in place.
Return ONLY the compressed JSON.
{{/section:json_mode}}
{{#section:text_mode}}
The source is a document. Return ONLY the compressed document text.
{{/section:text_mode}}

Remove: duplicated information, examples, narrative, historical discussion, intermediate reasoning.
Preserve: requirements, constraints, assumptions, accepted decisions, identifiers, user corrections, unresolved questions.

Stage intent: {{stage_intent}}

Target schema (what the downstream agent must populate):
{{outputs_required}}

{{#section:chunk_context}}
The source is chunk {{chunk_index}} of {{chunk_total}} of a larger document. Compress this chunk on its own terms; do not attempt to summarize the whole document.
{{/section:chunk_context}}

Source:
{{source_content}}`;

const baseSystemPrompt: Tables<"system_prompts"> = {
  id: UUID_SYSTEM_PROMPT,
  name: "compression_context_v1",
  prompt_text: compressionContextPromptText,
  description: null,
  is_active: true,
  user_selectable: false,
  version: 1,
  document_template_id: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const baseProviderRow: Tables<"ai_providers"> = {
  id: "model-1",
  provider: "mock-provider",
  name: "Mock AI",
  api_identifier: realModelConfig.api_identifier,
  config: realModelConfig,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: null,
  is_active: true,
  is_enabled: true,
  is_default_embedding: false,
  is_default_generation: false,
  min_plan_tier_level: 0,
};



function buildIntegrationProcessDeps(
  dbClient: SupabaseClient<Database>,
  continuationDeps?: {
    fileManager: IFileManager;
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>;
  },
): {
  deps: ProcessCompressJobDeps;
  dispatchCalls: { params: PrepareModelJobParams; payload: PrepareModelJobPayload }[];
} {
  const dispatchCalls: { params: PrepareModelJobParams; payload: PrepareModelJobPayload }[] = [];

  const compressionFileManager = createMockFileManagerService();
  compressionFileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "compression-prompt-resource-id" }), null);

  const assembleDeps: AssembleCompressionPromptDeps = {
    dbClient,
    renderPromptFn: renderPrompt,
    logger: new MockLogger(),
    fileManager: compressionFileManager,
    constructStoragePath,
  };
  const boundAssemble: BoundAssembleCompressionPromptFn = (params, payload) =>
    assembleCompressionPrompt(assembleDeps, params, payload);

  const boundContinuation: BoundAssembleContinuationPromptFn = (job) => {
    if (!continuationDeps) {
      throw new Error("continuationDeps not provided to buildIntegrationProcessDeps");
    }
    const fullDeps: AssembleContinuationPromptDeps = {
      dbClient,
      fileManager: continuationDeps.fileManager,
      job,
      downloadFromStorage: continuationDeps.downloadFromStorage,
      constructStoragePath,
    };
    return assembleContinuationPrompt(fullDeps);
  };

  const boundPrepareModelJob: BoundPrepareModelJobFn = async (params, payload) => {
    dispatchCalls.push({ params, payload });
    return { queued: true };
  };

  const deps: ProcessCompressJobDeps = {
    assembleCompressionPrompt: boundAssemble,
    assembleContinuationPrompt: boundContinuation,
    prepareModelJob: boundPrepareModelJob,
    constructStoragePath,
    logger: new MockLogger(),
  };

  return { deps, dispatchCalls };
}

function buildMockSupabaseForFullChain(
  dbClient: SupabaseClient<Database>,
  isCloned: boolean,
): ReturnType<typeof createMockSupabaseClient> {
  const stageWithSteps = buildStageWithRecipeSteps();
  const stageRow = { ...stageWithSteps.dialectic_stage, active_recipe_instance_id: "instance-1" };
  const instanceRow = { ...stageWithSteps.dialectic_stage_recipe_instances, id: "instance-1", is_cloned: isCloned };
  return createMockSupabaseClient("user-789", {
    genericMockResults: {
      dialectic_project_resources: {
        select: { data: [], error: null },
      },
      dialectic_generation_jobs: {
        insert: { data: [], error: null },
        update: { data: [{}], error: null },
      },
      dialectic_stages: {
        select: { data: [stageRow], error: null },
      },
      dialectic_stage_recipe_instances: {
        select: { data: [instanceRow], error: null },
      },
      dialectic_stage_recipe_steps: {
        select: isCloned
          ? { data: [buildDialecticStageRecipeStep({
              step_description: "compress the contribution for business_case",
              output_type: FileType.business_case,
              outputs_required: buildOutputRule({
                files_to_generate: [{
                  from_document_key: "business_case",
                  template_filename: "business_case.md",
                }],
              }),
            })!], error: null }
          : { data: [], error: null },
      },
      dialectic_recipe_template_steps: {
        select: isCloned
          ? { data: [], error: null }
          : { data: [buildDialecticRecipeTemplateStep({
              step_description: "compress the contribution from template",
              output_type: FileType.business_case,
              outputs_required: buildOutputRule({
                files_to_generate: [{
                  from_document_key: "business_case",
                  template_filename: "business_case.md",
                }],
              }),
            })], error: null },
      },
      ai_providers: {
        select: { data: [baseProviderRow], error: null },
      },
      system_prompts: {
        select: { data: [baseSystemPrompt], error: null },
      },
    },
  });
}

async function runSpawnProcessSeam(
  mockSetup: ReturnType<typeof createMockSupabaseClient>,
  victimPayload: {
    mode: "json" | "text";
    content: string;
    sourceType: CompressionSourceType;
    sourceId?: string;
    role?: Messages['role'];
    documentKey?: FileType;
    docType?: ModelContributionFileTypes;
    sourceStageSlug?: DialecticStageSlug;
    continuation_count?: number;
  },
  output_type = FileType.business_case,
  continuationDeps?: {
    fileManager: IFileManager;
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>;
  },
): Promise<{
  enqueueResult: Awaited<ReturnType<typeof enqueueCompressJobs>>;
  capturedPayload: DialecticCompressJobPayload;
  processResult: Awaited<ReturnType<typeof processCompressJob>>;
  capturedDispatchPayload: PrepareModelJobPayload;
  capturedDispatchParams: PrepareModelJobParams;
  processJob: DialecticJobRow;
}> {

  if(!isModelContributionFileType(output_type))
  {
    throw new Error("Target key must be a model contribution file type");
  }
  const { continuation_count, ...victimForEnqueue } = victimPayload;
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

  const parentPayload = buildDialecticExecuteJobPayload({ output_type });
  if (!isJson(parentPayload)) {
    throw new Error("Test setup failed: parent payload is not Json-compatible.");
  }
  const parentJob = buildDialecticJobRow({
    job_type: "EXECUTE",
    payload: parentPayload,
    session_id: "session-abc",
  });

  const enqueueParams = buildenqueueCompressJobsParams({ dbClient });
  const enqueueResult = await enqueueCompressJobs(
    buildenqueueCompressJobsDeps({ countTokens }),
    enqueueParams,
    { victim: victimForEnqueue, parentJob, modelConfig: realModelConfig },
  );

  assert("createdCount" in enqueueResult, "enqueueCompressJobs returned an error");
  assertExists(enqueueResult.createdCount);
  assert(enqueueResult.createdCount === 1, "expected exactly one child compress job");

  const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
    "dialectic_generation_jobs",
    "insert",
  );
  assertExists(insertCalls);
  assertEquals(insertCalls.callCount, 1);
  const insertRows = insertCalls.callsArgs[0][0];
  assert(Array.isArray(insertRows));
  assertEquals(insertRows.length, 1);
  const row = insertRows[0];
  assert(isRecord(row));
  assert(isDialecticCompressJobPayload(row.payload));
  const basePayload = row.payload;
  const capturedPayload: DialecticCompressJobPayload = continuation_count !== undefined
    ? { ...basePayload, continuation_count }
    : basePayload;

  if (!isJson(capturedPayload)) {
    throw new Error("Test setup failed: captured payload is not Json-compatible.");
  }
  const processJob = buildDialecticJobRow({
    id: "compress-job-1",
    created_at: "2024-01-01T00:00:00.000Z",
    job_type: "COMPRESS",
    status: "pending",
    payload: capturedPayload,
    session_id: "session-abc",
  });
  const processParams = buildProcessCompressJobParams({ dbClient });

  const { deps, dispatchCalls } = buildIntegrationProcessDeps(dbClient, continuationDeps);

  const processResult = await processCompressJob(deps, processParams, { job: processJob });

  assertEquals(dispatchCalls.length, 1);
  const capturedDispatchPayload = dispatchCalls[0].payload;
  const capturedDispatchParams = dispatchCalls[0].params;

  return {
    enqueueResult,
    capturedPayload,
    processResult,
    capturedDispatchPayload,
    capturedDispatchParams,
    processJob,
  };
}

Deno.test("processCompressJob integration: spawn->process seam with a real json victim under budget", async () => {
  const victimContent = JSON.stringify({ product: "widget", price: 100 });
  const mockSetup = buildMockSupabaseForFullChain(
    undefined as unknown as SupabaseClient<Database>,
    false,
  );

  const {
    processResult,
    capturedDispatchPayload,
    capturedDispatchParams,
    processJob,
  } = await runSpawnProcessSeam(mockSetup, {
    mode: "json",
    content: victimContent,
    sourceType: "contribution",
    documentKey: FileType.business_case,
    docType: FileType.business_case,
    sourceStageSlug: DialecticStageSlug.Thesis,
  });

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");

  const prompt = capturedDispatchPayload.promptConstructionPayload.currentUserPrompt;
  assert(prompt.includes(victimContent), "prompt should contain the victim content");
  const filesToGenerate = [{ from_document_key: "business_case", template_filename: "business_case.md" }];
  assert(
    prompt.includes(JSON.stringify(filesToGenerate)),
    "prompt should contain stringified files_to_generate",
  );
  assert(prompt.includes("Return EXACTLY the same JSON structure"), "json_mode instruction present");
  assert(!prompt.includes("Return ONLY the compressed document text"), "text_mode instruction absent");

  assertEquals(Object.keys(capturedDispatchParams).length, 1, "dispatch params should have only dbClient");
  assert("dbClient" in capturedDispatchParams, "dispatch params should have dbClient");
  assert(capturedDispatchPayload.job === processJob, "captured job should be reference-equal to fed job");
  assertEquals(capturedDispatchPayload.providerRow, baseProviderRow, "captured providerRow should be the ai_providers row");
  assertEquals(capturedDispatchPayload.promptConstructionPayload.conversationHistory, [], "conversationHistory should be empty");
  assertEquals(capturedDispatchPayload.promptConstructionPayload.resourceDocuments, [], "resourceDocuments should be empty");
  assert(
    typeof capturedDispatchPayload.promptConstructionPayload.source_prompt_resource_id === "string"
      && capturedDispatchPayload.promptConstructionPayload.source_prompt_resource_id.length > 0,
    "source_prompt_resource_id should be a non-empty string",
  );
});

Deno.test("processCompressJob integration: dedup coherence across layers", async () => {
  const mockSetup = createMockSupabaseClient("user-789", {
    genericMockResults: {
      dialectic_project_resources: {
        select: (state: MockQueryBuilderState) => {
          const fileNameFilter = state.filters.find(
            (f) => f.type === "eq" && f.column === "file_name",
          );
          if (
            fileNameFilter &&
            fileNameFilter.value === `${sanitizeForPath("business_case")}_compressed_for_${sanitizeForPath("business_case")}.md`
          ) {
            return Promise.resolve({
              data: [{
                id: "existing-artifact",
                storage_path: constructStoragePath({
                  fileType: FileType.CompressedContext,
                  projectId: "project-xyz",
                  sessionId: "session-abc",
                  iteration: 1,
                  stageSlug: DialecticStageSlug.Thesis,
                  output_type: FileType.business_case,
                  sourceType: "contribution",
                  documentKey: FileType.business_case,
                }).storagePath,
                file_name: `${sanitizeForPath("business_case")}_compressed_for_${sanitizeForPath("business_case")}.md`,
              }],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
      },
      dialectic_generation_jobs: {
        insert: { data: [], error: null },
        update: { data: [{}], error: null },
      },
    },
  });
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

  const parentPayload = buildDialecticExecuteJobPayload({ output_type: FileType.business_case });
  if (!isJson(parentPayload)) {
    throw new Error("Test setup failed: parent payload is not Json-compatible.");
  }
  const parentJob = buildDialecticJobRow({
    job_type: "EXECUTE",
    payload: parentPayload,
    session_id: "session-abc",
  });

  const enqueueResult = await enqueueCompressJobs(
    buildenqueueCompressJobsDeps({ countTokens }),
    buildenqueueCompressJobsParams({ dbClient }),
    {
      victim: {
        mode: "text",
        content: "compress me",
        sourceType: "contribution",
        documentKey: FileType.business_case,
      },
      parentJob,
      modelConfig: realModelConfig,
    },
  );

  assert("createdCount" in enqueueResult);
  assertEquals(enqueueResult.createdCount, 0);

  const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
    "dialectic_generation_jobs",
    "insert",
  );
  assertExists(insertCalls);
  assertEquals(insertCalls.callCount, 0);

  const dedupPayload: DialecticCompressJobPayload = {
    ...buildDialecticCompressJobPayload({ output_type: FileType.business_case }),
    mode: "text",
    content: "compress me",
    sourceType: "contribution",
    documentKey: FileType.business_case,
  };
  if (!isJson(dedupPayload)) {
    throw new Error("Test setup failed: dedup payload is not Json-compatible.");
  }
  const dedupJob = buildDialecticJobRow({
    id: "dedup-job-1",
    created_at: "2024-01-01T00:00:00.000Z",
    job_type: "COMPRESS",
    status: "pending",
    payload: dedupPayload,
    session_id: "session-abc",
  });
  const processParams = buildProcessCompressJobParams({ dbClient });
  const { deps, dispatchCalls } = buildIntegrationProcessDeps(dbClient);

  const processResult = await processCompressJob(deps, processParams, { job: dedupJob });

  assert("queued" in processResult && processResult.queued === false, "expected queued=false");
  assertEquals(dispatchCalls.length, 0, "should not call prepareModelJob when dedup hits");

  const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
    "dialectic_generation_jobs",
    "update",
  );
  assertExists(updateCalls);
  assert(updateCalls.callCount > 0, "expected a completed status update");
});

Deno.test("processCompressJob integration: chunked seam produces text chunks and a chunk posts through the full stack", async () => {
  const { justOver } = buildBoundaryContents();
  const mockSetup = buildMockSupabaseForFullChain(
    undefined as unknown as SupabaseClient<Database>,
    false,
  );

  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

  const parentPayload = buildDialecticExecuteJobPayload({ output_type: FileType.business_case });
  if (!isJson(parentPayload)) {
    throw new Error("Test setup failed: parent payload is not Json-compatible.");
  }
  const parentJob = buildDialecticJobRow({
    job_type: "EXECUTE",
    payload: parentPayload,
    session_id: "session-abc",
  });

  const enqueueResult = await enqueueCompressJobs(
    buildenqueueCompressJobsDeps({ countTokens }),
    buildenqueueCompressJobsParams({ dbClient }),
    {
      victim: {
        mode: "json",
        content: justOver,
        sourceType: "contribution",
        documentKey: FileType.business_case,
        docType: FileType.business_case,
        sourceStageSlug: DialecticStageSlug.Thesis,
      },
      parentJob,
      modelConfig: realModelConfig,
    },
  );

  assert("createdCount" in enqueueResult);
  assertExists(enqueueResult.createdCount);
  assert(enqueueResult.createdCount > 1, "expected the real splitter to produce multiple chunks");

  const insertCalls = mockSetup.spies.getHistoricQueryBuilderSpies(
    "dialectic_generation_jobs",
    "insert",
  );
  assertExists(insertCalls);
  assertEquals(insertCalls.callCount, 1);
  const insertRows = insertCalls.callsArgs[0][0];
  assert(Array.isArray(insertRows));

  const chunkRow = insertRows[0];
  assert(isRecord(chunkRow));
  assert(isDialecticCompressJobPayload(chunkRow.payload));
  const chunkPayload = chunkRow.payload;
  assert(typeof chunkPayload.chunk_index === "number");
  assert(typeof chunkPayload.chunk_total === "number");
  assertEquals(chunkPayload.mode, "text", "chunk payload must be forced to text mode");

  if (!isJson(chunkPayload)) {
    throw new Error("Test setup failed: chunk payload is not Json-compatible.");
  }
  const chunkJob = buildDialecticJobRow({
    id: "chunk-job-1",
    created_at: "2024-01-01T00:00:00.000Z",
    job_type: "COMPRESS",
    status: "pending",
    payload: chunkPayload,
    session_id: "session-abc",
  });
  const processParams = buildProcessCompressJobParams({ dbClient });

  const { deps, dispatchCalls } = buildIntegrationProcessDeps(dbClient);
  const processResult = await processCompressJob(deps, processParams, { job: chunkJob });

  assert("queued" in processResult && processResult.queued === true, "expected chunk to queue");
  assertEquals(dispatchCalls.length, 1);

  const capturedDispatchPayload = dispatchCalls[0].payload;
  const prompt = capturedDispatchPayload.promptConstructionPayload.currentUserPrompt;
  assert(prompt.includes(chunkPayload.content), "chunk prompt should contain chunk content");
  assert(
    prompt.includes(`The source is chunk ${chunkPayload.chunk_index} of ${chunkPayload.chunk_total}`),
    "chunk prompt should contain substituted chunk_context text",
  );
  assert(!prompt.includes("Return EXACTLY the same JSON structure"), "json_mode instruction absent in text chunk");
});

Deno.test("processCompressJob integration: is_cloned=true branch runs spawn->process->POST using stage recipe steps", async () => {
  const mockSetup = buildMockSupabaseForFullChain(
    undefined as unknown as SupabaseClient<Database>,
    true,
  );

  const {
    processResult,
    capturedDispatchPayload,
    capturedDispatchParams,
    processJob,
  } = await runSpawnProcessSeam(
    mockSetup,
    {
      mode: "text",
      content: "stage clone source content",
      sourceType: "contribution",
      documentKey: FileType.business_case,
    },
    FileType.business_case,
  );

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");
  assertEquals(Object.keys(capturedDispatchParams).length, 1, "dispatch params should have only dbClient");
  assert(capturedDispatchPayload.job === processJob);

  const prompt = capturedDispatchPayload.promptConstructionPayload.currentUserPrompt;
  const filesToGenerate = [{ from_document_key: "business_case", template_filename: "business_case.md" }];
  assert(prompt.includes(JSON.stringify(filesToGenerate)), "prompt should contain stringified files_to_generate");
  assert(
    prompt.includes("compress the contribution for business_case"),
    "prompt should contain the stage step_description",
  );
});

Deno.test("processCompressJob integration: is_cloned=false branch runs spawn->process->POST using template recipe steps", async () => {
  const mockSetup = buildMockSupabaseForFullChain(
    undefined as unknown as SupabaseClient<Database>,
    false,
  );

  const {
    processResult,
    capturedDispatchPayload,
    capturedDispatchParams,
    processJob,
  } = await runSpawnProcessSeam(
    mockSetup,
    {
      mode: "text",
      content: "template source content",
      sourceType: "contribution",
      documentKey: FileType.business_case,
    },
    FileType.business_case,
  );

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");
  assertEquals(Object.keys(capturedDispatchParams).length, 1, "dispatch params should have only dbClient");
  assert(capturedDispatchPayload.job === processJob);

  const prompt = capturedDispatchPayload.promptConstructionPayload.currentUserPrompt;
  const filesToGenerate = [{ from_document_key: "business_case", template_filename: "business_case.md" }];
  assert(prompt.includes(JSON.stringify(filesToGenerate)), "prompt should contain stringified files_to_generate");
  assert(
    prompt.includes("compress the contribution from template"),
    "prompt should contain the template step_description",
  );
});

Deno.test("processCompressJob integration: history victim runs end to end through dedup layer 2, assembly and enqueue", async () => {
  const mockSetup = buildMockSupabaseForFullChain(
    undefined as unknown as SupabaseClient<Database>,
    false,
  );

  const {
    processResult,
    capturedDispatchPayload,
  } = await runSpawnProcessSeam(
    mockSetup,
    {
      mode: "text",
      content: "history content to compress",
      sourceType: "history",
      sourceId: "history-1",
      role: "assistant",
    },
    FileType.business_case,
  );

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");

  const prompt = capturedDispatchPayload.promptConstructionPayload.currentUserPrompt;
  assert(prompt.includes("history content to compress"), "prompt should contain the victim content");
});

Deno.test("processCompressJob integration: continuation victim reaches the continuation assembler and dispatches with the continuation prompt", async () => {
  const firstPassPromptText = "You are compressing a source. Source: compress me";
  const partialResponseText = '{"product": "widget", "price":';

  const stageWithSteps = buildStageWithRecipeSteps();
  const stageRow = { ...stageWithSteps.dialectic_stage, active_recipe_instance_id: "instance-1" };
  const instanceRow = { ...stageWithSteps.dialectic_stage_recipe_instances, id: "instance-1", is_cloned: false };

  const mockSetup = createMockSupabaseClient("user-789", {
    genericMockResults: {
      dialectic_project_resources: {
        select: (state: MockQueryBuilderState) => {
          const storagePathFilter = state.filters.find(
            (f) => f.type === "eq" && f.column === "storage_path",
          );
          if (storagePathFilter && typeof storagePathFilter.value === "string") {
            if (storagePathFilter.value.includes("_work/prompts")) {
              return Promise.resolve({
                data: [buildFileRecord({
                  storage_bucket: "content",
                  storage_path: storagePathFilter.value,
                })],
                error: null,
              });
            }
            if (storagePathFilter.value.includes("_work/raw_responses")) {
              return Promise.resolve({
                data: [buildFileRecord({
                  storage_bucket: "content",
                  storage_path: storagePathFilter.value,
                })],
                error: null,
              });
            }
          }
          return Promise.resolve({ data: [], error: null });
        },
      },
      dialectic_generation_jobs: {
        insert: { data: [], error: null },
        update: { data: [{}], error: null },
      },
      dialectic_stages: {
        select: { data: [stageRow], error: null },
      },
      dialectic_stage_recipe_instances: {
        select: { data: [instanceRow], error: null },
      },
      dialectic_stage_recipe_steps: {
        select: { data: [], error: null },
      },
      dialectic_recipe_template_steps: {
        select: { data: [buildDialecticRecipeTemplateStep({
          step_description: "compress the contribution from template",
          output_type: FileType.business_case,
          outputs_required: buildOutputRule({
            files_to_generate: [{
              from_document_key: "business_case",
              template_filename: "business_case.md",
            }],
          }),
        })], error: null },
      },
      ai_providers: {
        select: { data: [baseProviderRow], error: null },
      },
      system_prompts: {
        select: { data: [baseSystemPrompt], error: null },
      },
    },
  });

  const downloadFromStorage = async (_bucket: string, path: string): Promise<DownloadStorageResult> => {
    if (path.includes("/prompts/")) {
      const encoded = new TextEncoder().encode(firstPassPromptText);
      const buffer = new ArrayBuffer(encoded.byteLength);
      new Uint8Array(buffer).set(encoded);
      return { data: buffer, error: null };
    }
    if (path.includes("/raw_responses/")) {
      const encoded = new TextEncoder().encode(partialResponseText);
      const buffer = new ArrayBuffer(encoded.byteLength);
      new Uint8Array(buffer).set(encoded);
      return { data: buffer, error: null };
    }
    return { data: null, error: new Error("Unexpected download path") };
  };

  const fileManager = createMockFileManagerService();
  fileManager.setUploadAndRegisterFileResponse(buildFileRecord({ id: "continuation-prompt-resource-id" }), null);

  const {
    processResult,
    capturedDispatchPayload,
  } = await runSpawnProcessSeam(
    mockSetup,
    {
      mode: "text",
      content: "compress me",
      sourceType: "contribution",
      documentKey: FileType.business_case,
      docType: FileType.business_case,
      sourceStageSlug: DialecticStageSlug.Thesis,
      continuation_count: 1,
    },
    FileType.business_case,
    { fileManager, downloadFromStorage },
  );

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");

  const prompt = capturedDispatchPayload.promptConstructionPayload.currentUserPrompt;
  assert(prompt.includes(MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON), "prompt should contain the continuation instruction");
  assert(prompt.includes(partialResponseText), "prompt should contain the partial response");
});
