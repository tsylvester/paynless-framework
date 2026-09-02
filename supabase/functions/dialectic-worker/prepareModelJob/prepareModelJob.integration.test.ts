// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.integration.test.ts

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { PostgrestError, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import { isJson, isRecord } from "../../_shared/utils/type_guards.ts";
import type {
  DialecticJobRow,
} from "../../dialectic-service/dialectic.interface.ts";
import {
  buildDialecticExecuteJobPayload,
  buildDialecticJobRow,
  buildInputRule,
  buildPromptConstructionPayload,
  buildRelevanceRule,
  buildTokenWalletRow,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { calculateAffordability } from "../calculateAffordability/calculateAffordability.ts";
import type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityParams,
  CalculateAffordabilityReturn,
} from "../calculateAffordability/calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityErrorReturn,
  buildCalculateAffordabilityWithinBudgetReturn,
} from "../calculateAffordability/calculateAffordability.mock.ts";
import { compressPrompt } from "../compressPrompt/compressPrompt.ts";
import type {
  BoundCompressPromptFn,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptReturn,
} from "../compressPrompt/compressPrompt.interface.ts";
import {
  buildCompressPromptDeps,
} from "../compressPrompt/compressPrompt.mock.ts";
import { buildResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import {
  buildCompressionCandidate,
  buildGetSortedCompressionCandidatesSuccessReturn,
} from "../../_shared/utils/vector_utils/vector_utils.provides.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type {
  BoundEnqueueModelCallFn,
  EnqueueModelCallParams,
} from "../enqueueModelCall/enqueueModelCall.interface.ts";
import { isEnqueueModelCallPayload } from "../enqueueModelCall/enqueueModelCall.guard.ts";
import {
  isCalculateAffordabilityWithinBudgetReturn,
  isCalculateAffordabilityOverBudgetReturn,
} from "../calculateAffordability/calculateAffordability.guard.ts";
import { countTokens } from "../../_shared/utils/tokenizer_utils.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
} from "./prepareModelJob.interface.ts";
import {
  isPrepareModelJobSuccessReturn,
  isPrepareModelJobErrorReturn,
  isPrepareModelJobQueuedReturn,
  isPrepareModelJobPendingReturn,
} from "./prepareModelJob.guard.ts";
import { buildPrepareModelJobDeps } from "./prepareModelJob.mock.ts";

function buildEnqueueModelCallSuccessSpy(): Spy<BoundEnqueueModelCallFn> {
  return spy(async () => ({ queued: true as const }));
}

/**
 * Contract: a within-budget working set reaches enqueueModelCall with the cap
 *   the affordability verdict resolved and the provenance recorded on the row.
 * Boundary: prepareModelJob composes real calculateAffordability behind the
 *   dispatcher; Supabase (tier cap, wallet, dialectic_generation_jobs update)
 *   and the queue (enqueueModelCall) are mocked.
 * Mocked: Supabase client; enqueueModelCall (queue). calculateAffordability and
 *   its countTokens/getMaxOutputTokens deps run real; compressPrompt is never
 *   reached on this path.
 */
Deno.test(
  "integration: within-budget EXECUTE reaches enqueueModelCall with affordability-resolved cap and provenance recorded",
  async () => {
    const projectOwnerUserId: string = "owner-int-within-budget";
    const tierOutputCapTokens: Tables<"tier_definitions">["output_cap_tokens"] = 32768;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: tierOutputCapTokens,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: [{ id: "job-within-budget-int" }],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const affordDeps = buildCalculateAffordabilityDeps({ countTokens });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (params, payload) => {
      return calculateAffordability(affordDeps, params, payload);
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundCalculateAffordability);

    const compressPromptFn: BoundCompressPromptFn = async (
      _params: CompressPromptParams,
      _payload: CompressPromptPayload,
    ): Promise<CompressPromptReturn> => {
      throw new Error("compressPrompt must not be called on within-budget path");
    };
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(compressPromptFn);

    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const userTokenWalletService = createMockUserTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
      tokenWalletService: userTokenWalletService,
    });

    const executePayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload({
        source_prompt_resource_id: "source-prompt-int-within-budget",
      }),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(isPrepareModelJobQueuedReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(compressPromptSpy.calls.length, 0);
    assertEquals(enqueueModelCallSpy.calls.length, 1);

    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    assertEquals(affordParams.userConfig.tier_output_cap_tokens, tierOutputCapTokens);

    const affordResult: CalculateAffordabilityReturn = await affordEntry.returned;
    assertEquals(isCalculateAffordabilityWithinBudgetReturn(affordResult), true);
    if (!isCalculateAffordabilityWithinBudgetReturn(affordResult)) {
      throw new Error("expected CalculateAffordabilityWithinBudgetReturn");
    }

    const enqueueEntry: (typeof enqueueModelCallSpy.calls)[number] = enqueueModelCallSpy.calls[0];
    assertExists(enqueueEntry);
    const enqueuePayload: unknown = enqueueEntry.args[1];
    assertEquals(isEnqueueModelCallPayload(enqueuePayload), true);
    if (!isEnqueueModelCallPayload(enqueuePayload)) throw new Error("expected EnqueueModelCallPayload");
    assertEquals(enqueuePayload.chatApiRequest.max_tokens_to_generate, affordResult.maxOutputTokens);

    // Provenance recorded on the row.
    const updateSpies = mockSetup.spies.getLatestQueryBuilderSpies("dialectic_generation_jobs");
    assertExists(updateSpies?.update);
    assertEquals(updateSpies!.update!.calls.length >= 1, true);
    const updateCallArg: unknown = updateSpies!.update!.calls[0].args[0];
    if (!isRecord(updateCallArg)) throw new Error("expected update call data to be a record");
    const payloadArg: unknown = updateCallArg["payload"];
    if (!isRecord(payloadArg)) throw new Error("expected update payload to be a record");
    assertEquals(payloadArg["source_prompt_resource_id"], "source-prompt-int-within-budget");
  },
);

/**
 * Contract: an over-budget EXECUTE working set reaches compressPrompt and
 *   returns the deferral ({ waiting_for_children: true }) without enqueueing.
 * Boundary: prepareModelJob composes real calculateAffordability and real
 *   compressPrompt behind the dispatcher; Supabase and the queue are mocked.
 * Mocked: Supabase client; enqueueModelCall (queue). calculateAffordability and
 *   compressPrompt run real (compressPrompt's own deps are mocked at its
 *   boundary via buildCompressPromptDeps).
 */
Deno.test(
  "integration: over-budget EXECUTE reaches compressPrompt and returns waiting_for_children without enqueueing",
  async () => {
    const projectOwnerUserId: string = "owner-int-overbudget-execute";
    const limitedExtended = buildExtendedModelConfig({
      tokenization_strategy: { type: "rough_char_count" },
      context_window_tokens: 50,
    });
    if (!isJson(limitedExtended)) throw new Error("test setup: limitedExtended is not Json");
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider({ config: limitedExtended })],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: [{ id: "job-overbudget-execute-int" }],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const resourceDoc = buildResourceDocument({
      id: "doc-overbudget-execute",
      content: "x".repeat(400),
    });
    const candidate = buildCompressionCandidate({
      id: resourceDoc.id,
      content: resourceDoc.content,
      sourceType: "resource",
    });
    const compressDeps = buildCompressPromptDeps({
      countTokens,
      getSortedCompressionCandidates: async () =>
        buildGetSortedCompressionCandidatesSuccessReturn({ candidates: [candidate] }),
    });
    const boundCompressPrompt: BoundCompressPromptFn = async (params, payload) => {
      return compressPrompt(compressDeps, params, payload);
    };
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(boundCompressPrompt);

    const affordDeps = buildCalculateAffordabilityDeps({ countTokens });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (params, payload) => {
      return calculateAffordability(affordDeps, params, payload);
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundCalculateAffordability);

    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const userTokenWalletService = createMockUserTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
      tokenWalletService: userTokenWalletService,
    });

    const executePayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider({ config: limitedExtended }),
      promptConstructionPayload: buildPromptConstructionPayload({
        systemInstruction: "SYS: over-budget EXECUTE",
        conversationHistory: [
          { role: "assistant", content: "History A" },
          { role: "user", content: "Please continue." },
        ],
        resourceDocuments: [resourceDoc],
        currentUserPrompt: "User for over-budget EXECUTE",
        source_prompt_resource_id: "source-prompt-int-overbudget-execute",
      }),
      inputsRelevance: [buildRelevanceRule({ relevance: 0.5 })],
      inputsRequired: [buildInputRule()],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(isPrepareModelJobPendingReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(compressPromptSpy.calls.length, 1);
    assertEquals(enqueueModelCallSpy.calls.length, 0);

    const affordResult: CalculateAffordabilityReturn = await affordabilitySpy.calls[0].returned;
    assertEquals(isCalculateAffordabilityOverBudgetReturn(affordResult), true);
  },
);

/**
 * Contract: an over-budget COMPRESS row returns the recursion-guard error
 *   having called neither compressPrompt nor enqueueModelCall.
 * Boundary: prepareModelJob composes real calculateAffordability behind the
 *   dispatcher; Supabase and the queue are mocked. compressPrompt is wired
 *   but must not be reached on the COMPRESS arm.
 * Mocked: Supabase client; enqueueModelCall (queue). calculateAffordability
 *   runs real; compressPrompt is never reached on this path.
 */
Deno.test(
  "integration: over-budget COMPRESS returns recursion-guard error without calling compressPrompt or enqueueModelCall",
  async () => {
    const projectOwnerUserId: string = "owner-int-overbudget-compress";
    const limitedExtended = buildExtendedModelConfig({
      tokenization_strategy: { type: "rough_char_count" },
      context_window_tokens: 50,
    });
    if (!isJson(limitedExtended)) throw new Error("test setup: limitedExtended is not Json");
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider({ config: limitedExtended })],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () => {
            throw new Error("provenance update must not occur on over-budget COMPRESS recursion guard");
          },
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const affordDeps = buildCalculateAffordabilityDeps({ countTokens });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (params, payload) => {
      return calculateAffordability(affordDeps, params, payload);
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundCalculateAffordability);

    const compressPromptFn: BoundCompressPromptFn = async (
      _params: CompressPromptParams,
      _payload: CompressPromptPayload,
    ): Promise<CompressPromptReturn> => {
      throw new Error("compressPrompt must not be called on over-budget COMPRESS recursion guard");
    };
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(compressPromptFn);

    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const userTokenWalletService = createMockUserTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
      tokenWalletService: userTokenWalletService,
    });

    // Build a COMPRESS job row whose payload will drive calculateAffordability
    // to an over-budget verdict given the tiny context window.
    const { buildDialecticCompressJobPayload } = await import("../enqueueCompressJobs/enqueueCompressJobs.mock.ts");
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({
      payload: compressPayload,
      job_type: "COMPRESS",
      user_id: projectOwnerUserId,
    });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider({ config: limitedExtended }),
      promptConstructionPayload: buildPromptConstructionPayload({
        currentUserPrompt: "x".repeat(400),
        source_prompt_resource_id: "source-prompt-int-overbudget-compress",
      }),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected PrepareModelJobErrorReturn");
    assertEquals(result.retriable, false);
    assertEquals(compressPromptSpy.calls.length, 0);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: calculateAffordability error return propagates without calling
 *   enqueueModelCall or compressPrompt.
 * Boundary: prepareModelJob composes a mocked-affordability-verdict behind
 *   the dispatcher; Supabase and the queue are mocked.
 * Mocked: Supabase client; enqueueModelCall (queue); calculateAffordability
 *   (to force the error verdict). compressPrompt is never reached.
 */
Deno.test(
  "integration: calculateAffordability error return propagates without calling enqueueModelCall or compressPrompt",
  async () => {
    const projectOwnerUserId: string = "owner-int-afford-error";
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const affordError = buildCalculateAffordabilityErrorReturn({
      error: new Error("Insufficient funds: integration test"),
      retriable: false,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async () => affordError;
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundCalculateAffordability);

    const compressPromptFn: BoundCompressPromptFn = async (
      _params: CompressPromptParams,
      _payload: CompressPromptPayload,
    ): Promise<CompressPromptReturn> => {
      throw new Error("compressPrompt must not be called on affordability error path");
    };
    const compressPromptSpy: Spy<BoundCompressPromptFn> = spy(compressPromptFn);

    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptSpy,
    });

    const executePayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "Insufficient funds: integration test");
    assertEquals(result.retriable, false);
    assertEquals(compressPromptSpy.calls.length, 0);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: calculateAffordability succeeds, enqueueModelCall returns error →
 *   error propagated with the same identity and retriable flag.
 * Boundary: prepareModelJob composes a mocked-affordability-verdict behind
 *   the dispatcher; Supabase and the queue are mocked.
 * Mocked: Supabase client; enqueueModelCall (queue, returning error);
 *   calculateAffordability (to force the within-budget verdict). compressPrompt
 *   is never reached.
 */
Deno.test(
  "integration: enqueueModelCall error propagates after successful affordability check",
  async () => {
    const projectOwnerUserId: string = "owner-int-enqueue-error";
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: [{ id: "job-enqueue-error-int" }],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const withinBudget = buildCalculateAffordabilityWithinBudgetReturn({
      maxOutputTokens: 200,
      resolvedInputTokenCount: 75,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async () => withinBudget;

    const enqueueModelCallErrorSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({
      error: new Error("enqueueModelCall failure: integration test"),
      retriable: true,
    }));

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallErrorSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    const executePayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload({
        source_prompt_resource_id: "source-prompt-int-enqueue-error",
      }),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "enqueueModelCall failure: integration test");
    assertEquals(result.retriable, true);
    assertEquals(enqueueModelCallErrorSpy.calls.length, 1);
  },
);

/**
 * Contract: tier output cap 32768 from mocked user_subscriptions reaches
 *   calculateAffordability and enqueueModelCall.
 * Boundary: prepareModelJob composes a mocked-affordability-verdict behind
 *   the dispatcher; Supabase (tier cap, wallet, provenance update) and the
 *   queue are mocked.
 * Mocked: Supabase client; enqueueModelCall (queue); calculateAffordability
 *   (to capture the cap it received). compressPrompt is never reached.
 */
Deno.test(
  "integration: tier output cap 32768 from mocked user_subscriptions reaches calculateAffordability and enqueueModelCall",
  async () => {
    const projectOwnerUserId: string = "owner-int-tier-cap-32768";
    const outputCap: Tables<"tier_definitions">["output_cap_tokens"] = 32768;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: outputCap,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: [{ id: "job-tier-cap-int" }],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const withinBudget = buildCalculateAffordabilityWithinBudgetReturn({
      maxOutputTokens: 200,
      resolvedInputTokenCount: 75,
    });
    const boundAffordability: BoundCalculateAffordabilityFn = async () => withinBudget;
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });

    const executePayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload({
        source_prompt_resource_id: "source-prompt-int-tier-cap",
      }),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(enqueueModelCallSpy.calls.length, 1);

    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    assertEquals(affordParams.userConfig.tier_output_cap_tokens, 32768);

    const enqueueEntry: (typeof enqueueModelCallSpy.calls)[number] = enqueueModelCallSpy.calls[0];
    assertExists(enqueueEntry);
    const enqueueParams: EnqueueModelCallParams = enqueueEntry.args[0];
    assertEquals(enqueueParams.userConfig.tier_output_cap_tokens, 32768);
  },
);

/**
 * Contract: job maxOutputTokens below tier DB cap flows through real
 *   calculateAffordability with effective cap binding.
 * Boundary: prepareModelJob composes real calculateAffordability behind the
 *   dispatcher; Supabase (tier cap, wallet, provenance update) and the queue
 *   are mocked.
 * Mocked: Supabase client; enqueueModelCall (queue). calculateAffordability
 *   and its countTokens/getMaxOutputTokens deps run real; compressPrompt is
 *   never reached on this path.
 */
Deno.test(
  "integration: job maxOutputTokens below tier DB cap flows through real calculateAffordability with effective cap binding",
  async () => {
    const projectOwnerUserId: string = "owner-int-effective-cap-user-below-tier";
    const tierOutputCapTokens: Tables<"tier_definitions">["output_cap_tokens"] = 32768;
    const userChosenMaxOutputTokens: number = 8192;
    const effectiveCap: number = userChosenMaxOutputTokens;
    const tierDefEmbed: Pick<Tables<"tier_definitions">, "output_cap_tokens"> = {
      output_cap_tokens: tierOutputCapTokens,
    };
    const userSubSelectRow: { tier_definitions: Pick<Tables<"tier_definitions">, "output_cap_tokens"> } = {
      tier_definitions: tierDefEmbed,
    };
    const extendedModelConfig = buildExtendedModelConfig({
      hard_cap_output_tokens: 200_000,
      provider_max_output_tokens: 200_000,
    });
    if (!isJson(extendedModelConfig)) throw new Error("test setup: extendedModelConfig is not Json");
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider({ config: extendedModelConfig })],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: [userSubSelectRow],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: [{ id: "job-effective-cap-int" }],
              error: null,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const compressPromptFn: BoundCompressPromptFn = async (
      _params: CompressPromptParams,
      _payload: CompressPromptPayload,
    ): Promise<CompressPromptReturn> => {
      throw new Error("compressPrompt must not be called on effective-cap binding path");
    };

    const affordDeps = buildCalculateAffordabilityDeps({ countTokens });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async (params, payload) => {
      return calculateAffordability(affordDeps, params, payload);
    };
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundCalculateAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const userTokenWalletService = createMockUserTokenWalletService({
      getBalance: () => Promise.resolve("1000000"),
    }).instance;

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
      compressPrompt: compressPromptFn,
      tokenWalletService: userTokenWalletService,
    });

    const executePayload = buildDialecticExecuteJobPayload({
      maxOutputTokens: userChosenMaxOutputTokens,
    });
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider({ config: extendedModelConfig }),
      promptConstructionPayload: buildPromptConstructionPayload({
        source_prompt_resource_id: "source-prompt-int-effective-cap",
      }),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(affordabilitySpy.calls.length, 1);
    assertEquals(enqueueModelCallSpy.calls.length, 1);

    const affordEntry: (typeof affordabilitySpy.calls)[number] = affordabilitySpy.calls[0];
    assertExists(affordEntry);
    const affordParams: CalculateAffordabilityParams = affordEntry.args[0];
    assertEquals(affordParams.userConfig.tier_output_cap_tokens, effectiveCap);

    const affordResult: CalculateAffordabilityReturn = await affordEntry.returned;
    assertEquals(isCalculateAffordabilityWithinBudgetReturn(affordResult), true);
    if (!isCalculateAffordabilityWithinBudgetReturn(affordResult)) {
      throw new Error("expected CalculateAffordabilityWithinBudgetReturn");
    }
    assertEquals(affordResult.maxOutputTokens, effectiveCap);

    const enqueuePayload: unknown = enqueueModelCallSpy.calls[0].args[1];
    assertEquals(isEnqueueModelCallPayload(enqueuePayload), true);
    if (!isEnqueueModelCallPayload(enqueuePayload)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    assertEquals(enqueuePayload.chatApiRequest.max_tokens_to_generate, effectiveCap);
  },
);

/**
 * Contract: tier cap user_subscriptions query error yields retriable error
 *   without calculateAffordability or enqueueModelCall.
 * Boundary: prepareModelJob hits the Supabase tier-cap query, which is mocked
 *   to return an error; the queue is mocked.
 * Mocked: Supabase client (tier cap query returns error); enqueueModelCall
 *   (queue). calculateAffordability and compressPrompt are never reached.
 */
Deno.test(
  "integration: tier cap user_subscriptions query error yields retriable error without calculateAffordability or enqueueModelCall",
  async () => {
    const projectOwnerUserId: string = "owner-int-tier-cap-db-error";
    const tierCapDbErr: PostgrestError = new PostgrestError({
      message: "simulated tier cap integration failure",
      code: "PGRST000",
      details: "",
      hint: "",
    });
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        user_subscriptions: {
          select: () =>
            Promise.resolve({
              data: null,
              error: tierCapDbErr,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const boundAffordability: BoundCalculateAffordabilityFn = async () =>
      buildCalculateAffordabilityWithinBudgetReturn({ maxOutputTokens: 200, resolvedInputTokenCount: 75 });
    const affordabilitySpy: Spy<BoundCalculateAffordabilityFn> = spy(boundAffordability);
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: affordabilitySpy,
    });

    const executePayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload(),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) {
      throw new Error("expected PrepareModelJobErrorReturn");
    }
    assertEquals(result.retriable, true);
    assertEquals(result.error.message, tierCapDbErr.message);
    assertEquals(affordabilitySpy.calls.length, 0);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);

/**
 * Contract: provenance write failure on the within-budget path returns a
 *   retriable error and enqueues nothing.
 * Boundary: prepareModelJob composes a mocked-affordability-verdict behind
 *   the dispatcher; Supabase (tier cap, wallet, provenance update returning
 *   error) and the queue are mocked.
 * Mocked: Supabase client (provenance update returns error); enqueueModelCall
 *   (queue); calculateAffordability (to force the within-budget verdict).
 *   compressPrompt is never reached.
 */
Deno.test(
  "integration: provenance write failure on within-budget path returns retriable error and enqueues nothing",
  async () => {
    const projectOwnerUserId: string = "owner-int-provenance-write-failure";
    const provenanceError: Error = new Error("provenance write integration failure");
    const mockSetup = createMockSupabaseClient(projectOwnerUserId, {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildMockProvider()],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow()],
              error: null,
            }),
        },
        dialectic_generation_jobs: {
          update: () =>
            Promise.resolve({
              data: null,
              error: provenanceError,
            }),
        },
      },
    });
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;

    const withinBudget = buildCalculateAffordabilityWithinBudgetReturn({
      maxOutputTokens: 200,
      resolvedInputTokenCount: 75,
    });
    const boundCalculateAffordability: BoundCalculateAffordabilityFn = async () => withinBudget;

    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = buildEnqueueModelCallSuccessSpy();

    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
      calculateAffordability: boundCalculateAffordability,
    });

    const executePayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload, user_id: projectOwnerUserId });
    const params: PrepareModelJobParams = { dbClient };
    const preparePayload: PrepareModelJobPayload = {
      job,
      providerRow: buildMockProvider(),
      promptConstructionPayload: buildPromptConstructionPayload({
        source_prompt_resource_id: "source-prompt-int-provenance-failure",
      }),
      inputsRelevance: [],
    };

    const result: PrepareModelJobReturn = await prepareModelJob(deps, params, preparePayload);

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected PrepareModelJobErrorReturn");
    assertEquals(result.retriable, true);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
  },
);
