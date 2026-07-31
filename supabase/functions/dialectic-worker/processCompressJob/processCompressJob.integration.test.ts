import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getEncoding } from "npm:js-tiktoken@1.0.7";
import { countTokens as countTokensAnthropicLib } from "npm:@anthropic-ai/tokenizer@0.0.4";
import type { Database, Tables } from "../../types_db.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient, type MockQueryBuilderState } from "../../_shared/supabase.mock.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import { isRecord } from "../../_shared/utils/type_guards.ts";
import { isChatApiRequest, isKnownTiktokenEncoding } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { renderPrompt } from "../../_shared/prompt-renderer.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { constructStoragePath, sanitizeForPath } from "../../_shared/utils/path_constructor.ts";
import { enqueueCompressJobs } from "../enqueueCompressJobs/enqueueCompressJobs.ts";
import { isDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.guard.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import { assembleCompressionPrompt } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.ts";
import { enqueueModelCall } from "../enqueueModelCall/enqueueModelCall.ts";
import { processCompressJob } from "./processCompressJob.ts";
import {
  createMockJobRow,
} from "../saveResponse/saveResponse.mock.ts";
import {
  buildenqueueCompressJobsDeps,
  buildenqueueCompressJobsParams,
} from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
  buildProcessCompressJobDeps,
  buildProcessCompressJobParams,
} from "./processCompressJob.mock.ts";
import {
  buildDialecticStageRecipeStep,
  buildDialecticRecipeTemplateStep,
  buildOutputRule,
  buildStageWithRecipeSteps,
} from "../../_shared/dialectic.mock.ts";
import { createComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.ts";
import { MOCK_MODEL_CONFIG } from "../../_shared/_integration.test.utils.ts";
import type {
  EnqueueModelCallDeps,
  EnqueueModelCallParams,
  EnqueueModelCallPayload,
  BoundEnqueueModelCallFn,
} from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type {
  AssembleCompressionPromptDeps,
  BoundAssembleCompressionPromptFn,
} from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type {
  ProcessCompressJobDeps,
} from "./processCompressJob.interface.ts";
import { isModelContributionFileType } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";

const computeJobSig = await createComputeJobSig("integration-secret");

const PROVIDER_MAX_INPUT_TOKENS = 1000;
const PROVIDER_MAX_OUTPUT_TOKENS = 100;
const TOKEN_BUDGET = PROVIDER_MAX_INPUT_TOKENS - 500 - 32;

const NETLIFY_QUEUE_URL = "https://integration.netlify/.netlify/functions/async-workloads-router";
const NETLIFY_API_KEY = "integration-awl-api-key";

const realModelConfig: AiModelExtendedConfig = {
  ...MOCK_MODEL_CONFIG,
  provider_max_input_tokens: PROVIDER_MAX_INPUT_TOKENS,
  provider_max_output_tokens: PROVIDER_MAX_OUTPUT_TOKENS,
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
): {
  deps: ProcessCompressJobDeps;
  enqueueCalls: { params: EnqueueModelCallParams; payload: EnqueueModelCallPayload }[];
} {
  const enqueueCalls: { params: EnqueueModelCallParams; payload: EnqueueModelCallPayload }[] = [];

  const assembleDeps: AssembleCompressionPromptDeps = {
    dbClient,
    renderPromptFn: renderPrompt,
    logger: new MockLogger(),
  };
  const boundAssemble: BoundAssembleCompressionPromptFn = (params, payload) =>
    assembleCompressionPrompt(assembleDeps, params, payload);

  const enqueueModelCallDeps: EnqueueModelCallDeps = {
    logger: new MockLogger(),
    computeJobSig,
    netlifyQueueUrl: NETLIFY_QUEUE_URL,
    netlifyApiKey: NETLIFY_API_KEY,
    apiKeyForProvider: (_apiIdentifier: string) => "integration-provider-api-key",
  };
  const boundEnqueue: BoundEnqueueModelCallFn = async (params, payload) => {
    enqueueCalls.push({ params, payload });
    return enqueueModelCall(enqueueModelCallDeps, params, payload);
  };

  const deps = buildProcessCompressJobDeps({
    assembleCompressionPrompt: boundAssemble,
    enqueueModelCall: boundEnqueue,
    countTokens,
    getEncoding: tokenizerDeps.getEncoding,
    countTokensAnthropic: tokenizerDeps.countTokensAnthropic,
  });

  return { deps, enqueueCalls };
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
  victimPayload: { mode: "json" | "text"; content: string; sourceType: "contribution" | "resource" | "history"; documentKey: string; docType?: string; sourceStageSlug?: string },
  targetKey = FileType.business_case,
): Promise<{
  enqueueResult: Awaited<ReturnType<typeof enqueueCompressJobs>>;
  capturedPayload: DialecticCompressJobPayload;
  processResult: Awaited<ReturnType<typeof processCompressJob>>;
  capturedEnqueuePayload: EnqueueModelCallPayload;
  capturedEnqueueParams: EnqueueModelCallParams;
  processJob: ReturnType<typeof createMockJobRow>;
}> {

  if(!isModelContributionFileType(targetKey))
  {
    throw new Error("Target key must be a model contribution file type");
  }
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const enqueueParams = buildenqueueCompressJobsParams({
    dbClient,
    sessionId: "session-abc",
    projectId: "project-xyz",
    modelConfig: realModelConfig,
    tokenizerDeps,
    targetKey,
  });
  const enqueueResult = await enqueueCompressJobs(
    buildenqueueCompressJobsDeps({ countTokens }),
    enqueueParams,
    { victim: victimPayload },
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
  const capturedPayload = row.payload;

  const processJob = createMockJobRow(
    capturedPayload,
    {
      id: "compress-job-1",
      created_at: "2024-01-01T00:00:00.000Z",
      job_type: "COMPRESS",
      status: "pending",
    },
  );
  const processParams = buildProcessCompressJobParams({
    dbClient,
    job: processJob,
    projectOwnerUserId: "owner-1",
    authToken: "auth-token-1",
  });

  const { deps, enqueueCalls } = buildIntegrationProcessDeps(dbClient);

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response("{}", { status: 200 }))
  );

  const processResult = await processCompressJob(deps, processParams, capturedPayload);

  assertEquals(enqueueCalls.length, 1);
  const capturedEnqueuePayload = enqueueCalls[0].payload;
  const capturedEnqueueParams = enqueueCalls[0].params;

  fetchStub.restore();

  return {
    enqueueResult,
    capturedPayload,
    processResult,
    capturedEnqueuePayload,
    capturedEnqueueParams,
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
    capturedPayload,
    capturedEnqueuePayload,
    capturedEnqueueParams,
    processJob,
  } = await runSpawnProcessSeam(mockSetup, {
    mode: "json",
    content: victimContent,
    sourceType: "contribution",
    documentKey: FileType.business_case,
    docType: "business_case",
    sourceStageSlug: DialecticStageSlug.Thesis,
  });

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");

  const prompt = capturedEnqueuePayload.chatApiRequest.message;
  assert(prompt.includes(victimContent), "prompt should contain the victim content");
  const filesToGenerate = [{ from_document_key: "business_case", template_filename: "business_case.md" }];
  assert(
    prompt.includes(JSON.stringify(filesToGenerate)),
    "prompt should contain stringified files_to_generate",
  );
  assert(prompt.includes("Return EXACTLY the same JSON structure"), "json_mode instruction present");
  assert(!prompt.includes("Return ONLY the compressed document text"), "text_mode instruction absent");

  assertEquals(capturedEnqueueParams.output_type, FileType.CompressedContext);
  assert(capturedEnqueueParams.job === processJob, "captured job should be reference-equal to fed job");

  const independentlyCounted = countTokens(
    tokenizerDeps,
    { message: prompt },
    realModelConfig,
  );
  assertEquals(capturedEnqueuePayload.preflightInputTokens, independentlyCounted);

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response("{}", { status: 200 }))
  );

  await enqueueModelCall(
    {
      logger: new MockLogger(),
      computeJobSig,
      netlifyQueueUrl: NETLIFY_QUEUE_URL,
      netlifyApiKey: NETLIFY_API_KEY,
      apiKeyForProvider: () => "integration-provider-api-key",
    },
    capturedEnqueueParams,
    capturedEnqueuePayload,
  );

  assertEquals(fetchStub.calls.length, 1);
  const [, init] = fetchStub.calls[0].args;
  assert(isRecord(init) && typeof init.body === "string");
  const posted = JSON.parse(init.body);
  assert(isRecord(posted));
  assertEquals(posted.eventName, "ai-stream-background");
  assert(isRecord(posted.data));
  const postedData = posted.data;
  const chatApiRequest = postedData.chat_api_request;
  if(!isChatApiRequest(chatApiRequest)){
    throw new Error("")
  }
  assert(typeof chatApiRequest.message === "string");
  assertEquals(chatApiRequest.message, prompt);

  fetchStub.restore();
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
                  targetKey: FileType.business_case,
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

  const enqueueResult = await enqueueCompressJobs(
    buildenqueueCompressJobsDeps({ countTokens }),
    buildenqueueCompressJobsParams({
      dbClient,
      sessionId: "session-abc",
      projectId: "project-xyz",
      modelConfig: realModelConfig,
      tokenizerDeps,
      targetKey: FileType.business_case,
    }),
    {
      victim: {
        mode: "text",
        content: "compress me",
        sourceType: "contribution",
        documentKey: "business_case",
      },
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
    job_type: "COMPRESS",
    sessionId: "session-abc",
    projectId: "project-xyz",
    stageSlug: DialecticStageSlug.Thesis,
    targetKey: FileType.business_case,
    iterationNumber: 1,
    model_id: "model-1",
    mode: "text",
    content: "compress me",
    sourceType: "contribution",
    documentKey: FileType.business_case,
    walletId: "wallet-1",
    user_id: "user-789",
    model_slug: "some-model"
  };
  const dedupJob = createMockJobRow(
    dedupPayload,
    {
      id: "dedup-job-1",
      created_at: "2024-01-01T00:00:00.000Z",
      job_type: "COMPRESS",
      status: "pending",
    },
  );
  const processParams = buildProcessCompressJobParams({
    dbClient,
    job: dedupJob,
    projectOwnerUserId: "owner-1",
    authToken: "auth-token-1",
  });
  const { deps, enqueueCalls } = buildIntegrationProcessDeps(dbClient);

  const processResult = await processCompressJob(deps, processParams, dedupPayload);

  assert("queued" in processResult && processResult.queued === false, "expected queued=false");
  assertEquals(enqueueCalls.length, 0, "should not call enqueueModelCall when dedup hits");

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
  const enqueueResult = await enqueueCompressJobs(
    buildenqueueCompressJobsDeps({ countTokens }),
    buildenqueueCompressJobsParams({
      dbClient,
      sessionId: "session-abc",
      projectId: "project-xyz",
      modelConfig: realModelConfig,
      tokenizerDeps,
      targetKey: FileType.business_case,
    }),
    {
      victim: {
        mode: "json",
        content: justOver,
        sourceType: "contribution",
        documentKey: FileType.business_case,
        docType: "business_case",
        sourceStageSlug: DialecticStageSlug.Thesis,
      },
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

  const chunkJob = createMockJobRow(
    chunkPayload,
    {
      id: "chunk-job-1",
      created_at: "2024-01-01T00:00:00.000Z",
      job_type: "COMPRESS",
      status: "pending",
    },
  );
  const processParams = buildProcessCompressJobParams({
    dbClient,
    job: chunkJob,
    projectOwnerUserId: "owner-1",
    authToken: "auth-token-1",
  });

  const { deps, enqueueCalls } = buildIntegrationProcessDeps(dbClient);
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response("{}", { status: 200 }))
  );
  const processResult = await processCompressJob(deps, processParams, chunkPayload);
  fetchStub.restore();

  assert("queued" in processResult && processResult.queued === true, "expected chunk to queue");
  assertEquals(enqueueCalls.length, 1);

  const capturedEnqueuePayload = enqueueCalls[0].payload;
  const prompt = capturedEnqueuePayload.chatApiRequest.message;
  assert(prompt.includes(chunkPayload.content), "chunk prompt should contain chunk content");
  assert(
    prompt.includes(`The source is chunk ${chunkPayload.chunk_index} of ${chunkPayload.chunk_total}`),
    "chunk prompt should contain substituted chunk_context text",
  );
  assert(!prompt.includes("Return EXACTLY the same JSON structure"), "json_mode instruction absent in text chunk");

  const independentlyCounted = countTokens(
    tokenizerDeps,
    { message: prompt },
    realModelConfig,
  );
  assertEquals(capturedEnqueuePayload.preflightInputTokens, independentlyCounted);
});

Deno.test("processCompressJob integration: is_cloned=true branch runs spawn->process->POST using stage recipe steps", async () => {
  const mockSetup = buildMockSupabaseForFullChain(
    undefined as unknown as SupabaseClient<Database>,
    true,
  );

  const {
    processResult,
    capturedEnqueuePayload,
    capturedEnqueueParams,
    processJob,
  } = await runSpawnProcessSeam(
    mockSetup,
    {
      mode: "text",
      content: "stage clone source content",
      sourceType: "contribution",
      documentKey: "business_case",
    },
    FileType.business_case,
  );

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");
  assertEquals(capturedEnqueueParams.output_type, FileType.CompressedContext);
  assert(capturedEnqueueParams.job === processJob);

  const prompt = capturedEnqueuePayload.chatApiRequest.message;
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
    capturedEnqueuePayload,
    capturedEnqueueParams,
    processJob,
  } = await runSpawnProcessSeam(
    mockSetup,
    {
      mode: "text",
      content: "template source content",
      sourceType: "contribution",
      documentKey: "business_case",
    },
    FileType.business_case,
  );

  assert("queued" in processResult && processResult.queued === true, "expected queued=true");
  assertEquals(capturedEnqueueParams.output_type, FileType.CompressedContext);
  assert(capturedEnqueueParams.job === processJob);

  const prompt = capturedEnqueuePayload.chatApiRequest.message;
  const filesToGenerate = [{ from_document_key: "business_case", template_filename: "business_case.md" }];
  assert(prompt.includes(JSON.stringify(filesToGenerate)), "prompt should contain stringified files_to_generate");
  assert(
    prompt.includes("compress the contribution from template"),
    "prompt should contain the template step_description",
  );
});
