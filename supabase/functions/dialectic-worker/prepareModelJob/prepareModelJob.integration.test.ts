// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.integration.test.ts

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { ChatApiRequest } from "../../_shared/types.ts";
import type {
  DialecticExecuteJobPayload,
  DialecticJobRow,
} from "../../dialectic-service/dialectic.interface.ts";
import type { BoundCalculateAffordabilityFn } from "../calculateAffordability/calculateAffordability.interface.ts";
import {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
  buildMockBoundCalculateAffordabilityFn,
} from "../calculateAffordability/calculateAffordability.mock.ts";
import { buildChatApiRequest, buildResourceDocument } from "../compressPrompt/compressPrompt.mock.ts";
import type { BoundExecuteModelCallAndSaveFn } from "../executeModelCallAndSave/executeModelCallAndSave.interface.ts";
import { isExecuteModelCallAndSavePayload } from "../executeModelCallAndSave/executeModelCallAndSave.interface.guard.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from "./prepareModelJob.interface.ts";
import { isPrepareModelJobSuccessReturn, isPrepareModelJobErrorReturn } from "./prepareModelJob.guard.ts";
import {
  buildAiProviderRow,
  buildDefaultAiProvidersRow,
  buildDialecticContributionRow,
  buildDialecticJobRow,
  buildDialecticSessionRow,
  buildExecuteJobPayload,
  buildExtendedModelFixture,
  buildPrepareModelJobDeps,
  buildPromptConstructionPayload,
  buildTokenWalletRow,
} from "./prepareModelJob.mock.ts";

function buildParams(dbClient: SupabaseClient<Database>): PrepareModelJobParams {
  const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
  const job: DialecticJobRow = buildDialecticJobRow(executePayload);
  return {
    dbClient,
    authToken: "jwt.integration",
    job,
    projectOwnerUserId: "owner-int",
    providerRow: buildDefaultAiProvidersRow(),
    sessionData: buildDialecticSessionRow(),
  };
}

function buildPayload(): PrepareModelJobPayload {
  return {
    promptConstructionPayload: buildPromptConstructionPayload(),
    compressionStrategy: async () => [],
  };
}

function buildEmcasSuccessSpy(): Spy<BoundExecuteModelCallAndSaveFn> {
  return spy(async () => ({
    contribution: buildDialecticContributionRow(),
    needsContinuation: false,
    stageRelationshipForStage: undefined,
    documentKey: undefined,
    fileType: FileType.HeaderContext,
    storageFileType: FileType.ModelContributionRawJson,
  }));
}

function buildEnqueueSuccessSpy(): Spy<BoundEnqueueRenderJobFn> {
  return spy(async () => ({ renderJobId: "render-int-1" }));
}

// Path 1: Direct return → EMCAS → enqueueRenderJob → success
Deno.test(
  "integration: calculateAffordability direct return flows through EMCAS and enqueueRenderJob to success",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueue = buildEnqueueSuccessSpy();
    const directReturn = buildCalculateAffordabilityDirectReturn(200, 75);
    const calculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(directReturn);

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    if (!isPrepareModelJobSuccessReturn(result)) throw new Error("expected success");
    assertExists(result.contribution);
    assertEquals(result.renderJobId, "render-int-1");

    assertEquals(emcas.calls.length, 1);
    const emcasPayload: unknown = emcas.calls[0].args[1];
    assertEquals(isExecuteModelCallAndSavePayload(emcasPayload), true);
    if (!isExecuteModelCallAndSavePayload(emcasPayload)) throw new Error("expected EMCAS payload");
    assertEquals(emcasPayload.preflightInputTokens, 75);
    assertEquals(emcasPayload.chatApiRequest.max_tokens_to_generate, 200);

    assertEquals(enqueue.calls.length, 1);
  },
);

// Path 2: Compressed return → chatApiRequest passed through unchanged
Deno.test(
  "integration: calculateAffordability compressed return passes chatApiRequest through to EMCAS unchanged",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueue = buildEnqueueSuccessSpy();

    const compressedDocs = [buildResourceDocument()];
    const compressedChat: ChatApiRequest = buildChatApiRequest(compressedDocs, "compressed prompt");
    compressedChat.max_tokens_to_generate = 999;
    const compressedReturn = buildCalculateAffordabilityCompressedReturn({
      resolvedInputTokenCount: 42,
      chatApiRequest: compressedChat,
      resourceDocuments: compressedDocs,
    });
    const calculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(compressedReturn);

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(emcas.calls.length, 1);

    const emcasPayload: unknown = emcas.calls[0].args[1];
    assertEquals(isExecuteModelCallAndSavePayload(emcasPayload), true);
    if (!isExecuteModelCallAndSavePayload(emcasPayload)) throw new Error("expected EMCAS payload");
    assertEquals(emcasPayload.preflightInputTokens, 42);
    assertEquals(emcasPayload.chatApiRequest, compressedChat);
    assertEquals(emcasPayload.chatApiRequest.max_tokens_to_generate, 999);

    assertEquals(enqueue.calls.length, 1);
  },
);

// Path 3: calculateAffordability error → early return, no EMCAS call
Deno.test(
  "integration: calculateAffordability error return propagates without calling EMCAS or enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueue = buildEnqueueSuccessSpy();

    const affordError = buildCalculateAffordabilityErrorReturn(
      new Error("Insufficient funds: integration test"),
      false,
    );
    const calculateAffordability: BoundCalculateAffordabilityFn =
      buildMockBoundCalculateAffordabilityFn(affordError);

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueue,
      calculateAffordability,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "Insufficient funds: integration test");
    assertEquals(result.retriable, false);

    assertEquals(emcas.calls.length, 0);
    assertEquals(enqueue.calls.length, 0);
  },
);

// Path 4: calculateAffordability succeeds, EMCAS returns error → error propagated, no enqueueRenderJob
Deno.test(
  "integration: EMCAS error propagates without calling enqueueRenderJob",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcasError: BoundExecuteModelCallAndSaveFn = spy(async () => ({
      error: new Error("EMCAS failure: integration test"),
      retriable: true,
    }));
    const enqueue = buildEnqueueSuccessSpy();

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcasError,
      enqueueRenderJob: enqueue,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "EMCAS failure: integration test");
    assertEquals(result.retriable, true);

    assertEquals(enqueue.calls.length, 0);
  },
);

// Path 5: EMCAS succeeds, enqueueRenderJob returns error → error propagated
Deno.test(
  "integration: enqueueRenderJob error propagates after successful EMCAS",
  async () => {
    const mockSetup = createMockSupabaseClient("user-int", {
      genericMockResults: {
        ai_providers: {
          select: () =>
            Promise.resolve({
              data: [buildAiProviderRow(buildExtendedModelFixture())],
              error: null,
            }),
        },
        token_wallets: {
          select: () =>
            Promise.resolve({
              data: [buildTokenWalletRow({})],
              error: null,
            }),
        },
      },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const emcas = buildEmcasSuccessSpy();
    const enqueueError: BoundEnqueueRenderJobFn = spy(async () => ({
      error: new Error("enqueue failure: integration test"),
      retriable: false,
    }));

    const deps = buildPrepareModelJobDeps({
      executeModelCallAndSave: emcas,
      enqueueRenderJob: enqueueError,
    });

    const result = await prepareModelJob(deps, buildParams(dbClient), buildPayload());

    assertEquals(isPrepareModelJobErrorReturn(result), true);
    if (!isPrepareModelJobErrorReturn(result)) throw new Error("expected error");
    assertEquals(result.error.message, "enqueue failure: integration test");
    assertEquals(result.retriable, false);

    assertEquals(emcas.calls.length, 1);
  },
);
