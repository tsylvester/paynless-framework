import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type {
  DialecticExecuteJobPayload,
  DialecticJobRow,
  InputRule,
  RelevanceRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobReturn,
  PrepareModelJobSuccessReturn,
} from "./prepareModelJob.interface.ts";
import {
  buildBoundExecuteModelCallAndSaveStub,
  buildBoundEnqueueRenderJobStub,
  buildDialecticContributionRow,
  buildDialecticJobRow,
  buildDialecticSessionRow,
  buildExecuteJobPayload,
  buildInterfaceContractAiProvidersRow,
  buildPrepareModelJobDepsStructuralContract,
  buildPromptConstructionPayload,
  contractCompressionStrategy,
} from "./prepareModelJob.mock.ts";

Deno.test(
  "`PrepareModelJobDeps` structural contract: required keys and shapes (interface is source of truth)",
  async (t) => {
    await t.step("valid: every keyof PrepareModelJobDeps present with expected runtime shapes", () => {
      const deps: PrepareModelJobDeps = buildPrepareModelJobDepsStructuralContract();

      const requiredKeys: (keyof PrepareModelJobDeps)[] = [
        "logger",
        "applyInputsRequiredScope",
        "tokenWalletService",
        "validateWalletBalance",
        "validateModelCostRates",
        "calculateAffordability",
        "executeModelCallAndSave",
        "enqueueRenderJob",
      ];
      for (const key of requiredKeys) {
        assertEquals(key in deps, true);
      }

      assertEquals(typeof deps.logger, "object");
      assertEquals(typeof deps.logger.info, "function");
      assertEquals(typeof deps.applyInputsRequiredScope, "function");
      assertEquals(typeof deps.tokenWalletService, "object");
      assertEquals(typeof deps.validateWalletBalance, "function");
      assertEquals(typeof deps.validateModelCostRates, "function");
      assertEquals(typeof deps.calculateAffordability, "function");
      assertEquals(typeof deps.executeModelCallAndSave, "function");
      assertEquals(typeof deps.enqueueRenderJob, "function");

      assertEquals("pickLatest" in deps, false);
      assertEquals("downloadFromStorage" in deps, false);
      assertEquals("countTokens" in deps, false);
      assertEquals("ragService" in deps, false);
      assertEquals("embeddingClient" in deps, false);
    });

    await t.step("invalid: object with only executeModelCallAndSave omits other required keys", () => {
      const partial: Record<string, unknown> = {
        executeModelCallAndSave: buildBoundExecuteModelCallAndSaveStub(),
      };
      assertEquals("logger" in partial, false);
      assertEquals("calculateAffordability" in partial, false);
      assertEquals("enqueueRenderJob" in partial, false);
    });

    await t.step("invalid: object with only enqueueRenderJob omits other required keys", () => {
      const partial: Record<string, unknown> = {
        enqueueRenderJob: buildBoundEnqueueRenderJobStub(),
      };
      assertEquals("logger" in partial, false);
      assertEquals("calculateAffordability" in partial, false);
      assertEquals("executeModelCallAndSave" in partial, false);
    });
  },
);

Deno.test(
  "`PrepareModelJobParams` structural contract: required keys and shapes",
  async (t) => {
    await t.step("valid: all keyof PrepareModelJobParams present", () => {
      const mockSetup = createMockSupabaseClient(undefined, {});
      const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
      const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
      const job: DialecticJobRow = buildDialecticJobRow(executePayload);

      const params: PrepareModelJobParams = {
        dbClient,
        authToken: "token-contract",
        job,
        projectOwnerUserId: "owner-contract",
        providerRow: buildInterfaceContractAiProvidersRow(),
        sessionData: buildDialecticSessionRow(),
      };

      const requiredKeys: (keyof PrepareModelJobParams)[] = [
        "dbClient",
        "authToken",
        "job",
        "projectOwnerUserId",
        "providerRow",
        "sessionData",
      ];
      for (const key of requiredKeys) {
        assertEquals(key in params, true);
      }

      assertEquals(typeof params.dbClient.from, "function");
      assertEquals(typeof params.authToken, "string");
      assertEquals(params.job.id, job.id);
      assertEquals(params.projectOwnerUserId, "owner-contract");
      assertEquals(params.providerRow.id, "model-contract");
      assertEquals(params.sessionData.id, "session-contract");
    });

    await t.step("invalid: empty object has no PrepareModelJobParams keys", () => {
      const empty: Record<string, unknown> = {};
      assertEquals("dbClient" in empty, false);
      assertEquals("authToken" in empty, false);
      assertEquals("job" in empty, false);
    });

    await t.step("invalid: null is not a params record", () => {
      const candidate: unknown = null;
      assertEquals(candidate === null, true);
    });
  },
);

Deno.test(
  "`PrepareModelJobPayload` structural contract: required and optional keys",
  async (t) => {
    await t.step("valid: minimal payload has required keys only", () => {
      const payload: PrepareModelJobPayload = {
        promptConstructionPayload: buildPromptConstructionPayload(),
        compressionStrategy: contractCompressionStrategy,
      };

      assertEquals("promptConstructionPayload" in payload, true);
      assertEquals("compressionStrategy" in payload, true);
      assertEquals(typeof payload.compressionStrategy, "function");
      assertEquals("inputsRelevance" in payload, false);
      assertEquals("inputsRequired" in payload, false);
    });

    await t.step("valid: payload may include optional inputsRelevance and inputsRequired", () => {
      const inputsRelevance: RelevanceRule[] = [
        { document_key: FileType.HeaderContext, relevance: 0.5 },
      ];
      const inputsRequired: InputRule[] = [
        { type: "document", slug: "thesis", required: true },
      ];

      const payload: PrepareModelJobPayload = {
        promptConstructionPayload: buildPromptConstructionPayload(),
        compressionStrategy: contractCompressionStrategy,
        inputsRelevance,
        inputsRequired,
      };

      assertEquals("inputsRelevance" in payload, true);
      assertEquals("inputsRequired" in payload, true);
      assertEquals(payload.inputsRelevance?.length, 1);
      assertEquals(payload.inputsRequired?.length, 1);
    });

    await t.step("invalid: empty object lacks required payload keys", () => {
      const empty: Record<string, unknown> = {};
      assertEquals("promptConstructionPayload" in empty, false);
      assertEquals("compressionStrategy" in empty, false);
    });
  },
);

Deno.test(
  "`PrepareModelJobSuccessReturn` structural contract: success branch keys only",
  async (t) => {
    await t.step("valid: contribution, needsContinuation, renderJobId (string or null)", () => {
      const withId: PrepareModelJobSuccessReturn = {
        contribution: buildDialecticContributionRow(),
        needsContinuation: false,
        renderJobId: "render-job-1",
      };
      const skipped: PrepareModelJobSuccessReturn = {
        contribution: buildDialecticContributionRow(),
        needsContinuation: true,
        renderJobId: null,
      };

      const keys: (keyof PrepareModelJobSuccessReturn)[] = [
        "contribution",
        "needsContinuation",
        "renderJobId",
      ];
      for (const key of keys) {
        assertEquals(key in withId, true);
        assertEquals(key in skipped, true);
      }

      assertEquals(typeof withId.needsContinuation, "boolean");
      assertEquals(typeof skipped.needsContinuation, "boolean");
      assertEquals(withId.renderJobId, "render-job-1");
      assertEquals(skipped.renderJobId, null);
      assertEquals("error" in withId, false);
      assertEquals("error" in skipped, false);
    });

    await t.step("invalid: missing renderJobId is not the success shape", () => {
      const incomplete: Record<string, unknown> = {
        contribution: buildDialecticContributionRow(),
        needsContinuation: false,
      };
      assertEquals("renderJobId" in incomplete, false);
    });
  },
);

Deno.test(
  "`PrepareModelJobErrorReturn` structural contract: error branch keys only",
  async (t) => {
    await t.step("valid: error and retriable only", () => {
      const notRetriable: PrepareModelJobErrorReturn = {
        error: new Error("prepare contract failure"),
        retriable: false,
      };
      const retriable: PrepareModelJobErrorReturn = {
        error: new Error("transient failure"),
        retriable: true,
      };

      assertEquals("error" in notRetriable, true);
      assertEquals("retriable" in notRetriable, true);
      assertEquals("error" in retriable, true);
      assertEquals("retriable" in retriable, true);
      assertEquals(notRetriable.error instanceof Error, true);
      assertEquals(retriable.error instanceof Error, true);
      assertEquals(typeof notRetriable.retriable, "boolean");
      assertEquals(typeof retriable.retriable, "boolean");
      assertEquals("contribution" in notRetriable, false);
      assertEquals("contribution" in retriable, false);
    });

    await t.step("invalid: missing retriable is not the error shape", () => {
      const incomplete: Record<string, unknown> = {
        error: new Error("x"),
      };
      assertEquals("retriable" in incomplete, false);
    });
  },
);

Deno.test(
  "`PrepareModelJobReturn` structural contract: success xor error branch keys",
  () => {
    const success: PrepareModelJobReturn = {
      contribution: buildDialecticContributionRow(),
      needsContinuation: false,
      renderJobId: "job-1",
    };
    const failure: PrepareModelJobReturn = {
      error: new Error("failure"),
      retriable: false,
    };

    assertEquals("renderJobId" in success, true);
    assertEquals("error" in success, false);
    assertEquals("contribution" in success, true);
    assertEquals("error" in failure, true);
    assertEquals("retriable" in failure, true);
    assertEquals("contribution" in failure, false);
    assertEquals("renderJobId" in failure, false);
  },
);

Deno.test(
  "`PrepareModelJobFn` structural contract: (deps, params, payload) => Promise<PrepareModelJobReturn>",
  async (t) => {
    const mockSetup = createMockSupabaseClient(undefined, {});
    const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
    const executePayload: DialecticExecuteJobPayload = buildExecuteJobPayload();
    const job: DialecticJobRow = buildDialecticJobRow(executePayload);

    const deps: PrepareModelJobDeps = buildPrepareModelJobDepsStructuralContract();

    const params: PrepareModelJobParams = {
      dbClient,
      authToken: "token-fn",
      job,
      projectOwnerUserId: "owner-fn",
      providerRow: buildInterfaceContractAiProvidersRow(),
      sessionData: buildDialecticSessionRow(),
    };

    const payload: PrepareModelJobPayload = {
      promptConstructionPayload: buildPromptConstructionPayload(),
      compressionStrategy: contractCompressionStrategy,
    };

    await t.step("implementation may resolve to success-shaped return", async () => {
      const fn: PrepareModelJobFn = async () => ({
        contribution: buildDialecticContributionRow(),
        needsContinuation: false,
        renderJobId: null,
      });

      const result: PrepareModelJobReturn = await fn(deps, params, payload);
      assertEquals("contribution" in result, true);
      assertEquals("needsContinuation" in result, true);
      assertEquals("renderJobId" in result, true);
      assertEquals("error" in result, false);
      if ("renderJobId" in result) {
        assertEquals(result.renderJobId, null);
      }
    });

    await t.step("implementation may resolve to error-shaped return", async () => {
      const fn: PrepareModelJobFn = async () => ({
        error: new Error("contract fn error"),
        retriable: true,
      });

      const result: PrepareModelJobReturn = await fn(deps, params, payload);
      assertEquals("error" in result, true);
      assertEquals("retriable" in result, true);
      assertEquals("contribution" in result, false);
    });
  },
);
