/**
 * inputsRequired scoping and ChatApiRequest.resourceDocuments shape (migrated from
 * executeModelCallAndSave monolith tests: optional missing, identity fields, no undefined).
 */
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ChatApiRequest } from "../../_shared/types.ts";
import type { ResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { isResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.guard.ts";
import { buildResourceDocument } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isChatApiRequest } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import type { Database } from "../../types_db.ts";
import type {
  DialecticExecuteJobPayload,
  DialecticJobRow,
  InputRule,
  PromptConstructionPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import type { BoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.interface.ts";
import {
  isEnqueueModelCallPayload,
} from "../enqueueModelCall/enqueueModelCall.guard.ts";
import { prepareModelJob } from "./prepareModelJob.ts";
import type {
  PrepareModelJobDeps,
  PrepareModelJobParams,
  PrepareModelJobPayload,
} from "./prepareModelJob.interface.ts";
import { isPrepareModelJobSuccessReturn } from "./prepareModelJob.guard.ts";
import {
  buildDialecticExecuteJobPayload,
  buildDialecticJobRow,
  buildPromptConstructionPayload,
  buildTokenWalletRow,
} from "../../_shared/dialectic.mock.ts";
import {
  buildPrepareModelJobDeps,
  buildPrepareModelJobParams,
  buildPrepareModelJobPayload,
} from "./prepareModelJob.mock.ts";

Deno.test(
  "prepareModelJob - optional inputsRequired document missing does not throw",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
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
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const inputsRequiredOptionalFeedback: InputRule[] = [
      { type: "feedback", document_key: FileType.UserFeedback, required: false, slug: "thesis" },
    ];
    const preparePayload: PrepareModelJobPayload = buildPrepareModelJobPayload({
      job,
      inputsRequired: inputsRequiredOptionalFeedback,
    });
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assert(enqueueModelCallSpy.calls.length >= 1, "enqueueModelCall should be invoked");
  },
);

Deno.test(
  "prepareModelJob - adapter receives resourceDocuments with id, content, document_key, stage_slug, and type",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
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
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const identityDoc: ResourceDocument = buildResourceDocument({
      id: "doc-identity-1",
      content: "Identity-rich body",
      document_key: FileType.RenderedDocument,
      stage_slug: "thesis",
      type: "document",
    });
    const promptConstructionPayload: PromptConstructionPayload = buildPromptConstructionPayload({
      resourceDocuments: [identityDoc],
      source_prompt_resource_id: "source-prompt-resource-id",
    });
    const inputsRequiredRendered: InputRule[] = [
      { type: "document", document_key: FileType.RenderedDocument, required: true, slug: "thesis" },
    ];
    const preparePayload: PrepareModelJobPayload = buildPrepareModelJobPayload({
      job,
      promptConstructionPayload,
      inputsRequired: inputsRequiredRendered,
    });
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const first = enqueueModelCallSpy.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isEnqueueModelCallPayload(payloadArg)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const sent: ChatApiRequest = payloadArg.chatApiRequest;
    if (!isChatApiRequest(sent)) {
      throw new Error("Adapter should receive a ChatApiRequest");
    }
    if (!Array.isArray(sent.resourceDocuments) || sent.resourceDocuments.length === 0) {
      throw new Error("Resource documents must be a non-empty array");
    }
    if (!isResourceDocument(sent.resourceDocuments[0])) {
      throw new Error("Resource document must be a valid ResourceDocument");
    }
    const firstDoc = sent.resourceDocuments[0];
    assertEquals(sent.resourceDocuments.length, 1);
    assertEquals(firstDoc.id, "doc-identity-1");
    assertEquals(firstDoc.content, "Identity-rich body");
    assertEquals(firstDoc.document_key, FileType.RenderedDocument);
    assertEquals(firstDoc.stage_slug, "thesis");
    assertEquals(firstDoc.type, "document");
  },
);

Deno.test(
  "prepareModelJob - resourceDocuments must not have undefined document_key, stage_slug, or type",
  async () => {
    const mockSetup = createMockSupabaseClient("user-unit", {
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
    const executePayload: DialecticExecuteJobPayload = buildDialecticExecuteJobPayload();
    if (!isJson(executePayload)) throw new Error("test setup: payload is not valid Json");
    const job: DialecticJobRow = buildDialecticJobRow({ payload: executePayload });
    const params: PrepareModelJobParams = buildPrepareModelJobParams({ dbClient });
    const noUndefDoc: ResourceDocument = buildResourceDocument({
      id: "doc-no-undef",
      content: "Body for undefined-guard test",
      document_key: FileType.RenderedDocument,
      stage_slug: "thesis",
      type: "document",
    });
    const promptConstructionPayload: PromptConstructionPayload = buildPromptConstructionPayload({
      resourceDocuments: [noUndefDoc],
      source_prompt_resource_id: "source-prompt-resource-id",
    });
    const inputsRequiredRendered: InputRule[] = [
      { type: "document", document_key: FileType.RenderedDocument, required: true, slug: "thesis" },
    ];
    const preparePayload: PrepareModelJobPayload = buildPrepareModelJobPayload({
      job,
      promptConstructionPayload,
      inputsRequired: inputsRequiredRendered,
    });
    const enqueueModelCallSpy: Spy<BoundEnqueueModelCallFn> = spy(async () => ({ queued: true}));
    const deps: PrepareModelJobDeps = buildPrepareModelJobDeps({
      enqueueModelCall: enqueueModelCallSpy,
    });
    const result: unknown = await prepareModelJob(deps, params, preparePayload);
    assertEquals(isPrepareModelJobSuccessReturn(result), true);
    assertEquals(enqueueModelCallSpy.calls.length, 1);
    const first = enqueueModelCallSpy.calls[0];
    assertExists(first);
    const payloadArg: unknown = first.args[1];
    if (!isEnqueueModelCallPayload(payloadArg)) {
      throw new Error("expected EnqueueModelCallPayload");
    }
    const sent: ChatApiRequest = payloadArg.chatApiRequest;
    assert(isChatApiRequest(sent), "Adapter should receive a ChatApiRequest");
    assert(Array.isArray(sent.resourceDocuments), "resourceDocuments must be an array");
    for (const doc of sent.resourceDocuments) {
      if (!isResourceDocument(doc)) {
        throw new Error("resource document must be a valid ResourceDocument");
      }
      assert(doc.document_key !== undefined, "document_key must be defined on each resource document");
      assert(doc.stage_slug !== undefined, "stage_slug must be defined on each resource document");
      assert(doc.type !== undefined, "type must be defined on each resource document");
    }
  },
);
