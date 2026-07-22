import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import { DialecticStageSlug } from "../../../types/file_manager.types.ts";
import { createMockSupabaseClient } from "../../../supabase.mock.ts";
import {
  buildAssembleContributionChainPayload,
  buildContributionRow,
} from "./assembleContributionChain.mock.ts";
import {
  assembleContributionChain,
  ContributionChainAssemblyError,
} from "./assembleContributionChain.ts";

const MOCK_STORAGE_DIR = "project_123/session_abc/iteration_1/thesis/raw_responses";
const ROOT_FILE_NAME = "gpt-4o-mini_0_business_case_raw.json";

function asDbClient(client: unknown): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}

Deno.test("assembleContributionChain - orders two related chunks and excludes an unrelated row", async () => {
  const rootId = "root-order-1";
  const sessionId = "session_order_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const root = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
    created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
  });
  const later = buildContributionRow({
    id: "cont-2",
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: "gpt-4o-mini_1_business_case_raw.json",
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/gpt-4o-mini_1_business_case_raw.json`,
    target_contribution_id: rootId,
    edit_version: 2,
    created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
  });
  const unrelated = buildContributionRow({
    id: "unrelated",
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: "another-root" },
    storage_path: MOCK_STORAGE_DIR,
    file_name: "gpt-4o-mini_2_other_doc_raw.json",
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/gpt-4o-mini_2_other_doc_raw.json`,
    target_contribution_id: null,
    edit_version: 1,
    created_at: new Date(2025, 0, 1, 11, 59, 0).toISOString(),
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [root, later, unrelated], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("orderedChunks" in result);
  assertEquals(result.orderedChunks.length, 2);
  assertEquals(result.orderedChunks[0].id, rootId);
  assertEquals(result.orderedChunks[1].id, "cont-2");
  assertEquals(result.modelSlug, "gpt-4o-mini");
  assertEquals(result.attemptCount, 0);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - walks the chain in target_contribution_id order", async () => {
  const rootId = "root-walk-1";
  const sessionId = "session_walk_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const base = buildContributionRow({
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
  });

  const root = buildContributionRow({
    ...base,
    id: rootId,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
    created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
  });
  const c1 = buildContributionRow({
    ...base,
    id: "c1",
    file_name: "gpt-4o-mini_1_business_case_raw.json",
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/gpt-4o-mini_1_business_case_raw.json`,
    target_contribution_id: rootId,
    edit_version: 2,
    created_at: new Date(2025, 0, 1, 12, 2, 0).toISOString(),
  });
  const c2 = buildContributionRow({
    ...base,
    id: "c2",
    file_name: "gpt-4o-mini_2_business_case_raw.json",
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/gpt-4o-mini_2_business_case_raw.json`,
    target_contribution_id: "c1",
    edit_version: 3,
    created_at: new Date(2025, 0, 1, 12, 1, 0).toISOString(),
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [c1, c2, root], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("orderedChunks" in result);
  assertEquals(result.orderedChunks.length, 3);
  assertEquals(result.orderedChunks[0].id, rootId);
  assertEquals(result.orderedChunks[1].id, "c1");
  assertEquals(result.orderedChunks[2].id, "c2");

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - prefers the latest user edit over the model chunk with the same file_name", async () => {
  const rootId = "root-dedup-1";
  const sessionId = "session_dedup_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const modelChunk = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
  });
  const userEdit = buildContributionRow({
    id: "edit-1",
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 2,
    is_latest_edit: true,
    original_model_contribution_id: rootId,
    created_at: new Date(2025, 0, 1, 12, 5, 0).toISOString(),
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [modelChunk, userEdit], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("orderedChunks" in result);
  assertEquals(result.orderedChunks.length, 1);
  assertEquals(result.orderedChunks[0].id, "edit-1");

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - applies the expected DB-side filtering predicates", async () => {
  const rootId = "root-filter-1";
  const sessionId = "session_filter_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const contribution = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
  });

  const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [contribution], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    iterationNumber: 1,
    documentIdentity: rootId,
  });

  await assembleContributionChain({}, { dbClient }, payload);

  const eqCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "eq");
  const containsCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "contains");
  const orderCalls = spies.getHistoricQueryBuilderSpies("dialectic_contributions", "order");

  assert(eqCalls && eqCalls.callCount >= 2, "expected eq filters");
  const eqArgs = eqCalls?.callsArgs || [];
  assert(eqArgs.some((args) => args[0] === "session_id" && args[1] === sessionId), "expected eq session_id");
  assert(eqArgs.some((args) => args[0] === "iteration_number" && args[1] === 1), "expected eq iteration_number");

  assert(containsCalls && containsCalls.callCount >= 1, "expected contains filter");
  const hasContains = (containsCalls?.callsArgs || []).some((args) => {
    if (!Array.isArray(args)) return false;
    const [col, val] = args;
    if (col !== "document_relationships") return false;
    if (typeof val !== "object" || val === null) return false;
    return JSON.stringify(val).includes(`"${stageSlug}":"${rootId}"`);
  });
  assert(hasContains, "expected contains document_relationships");

  assert(orderCalls && orderCalls.callCount >= 2, "expected order calls");
  const orderArgs = orderCalls?.callsArgs || [];
  assert(orderArgs.some((args) => Array.isArray(args) && args[0] === "edit_version"), "expected order edit_version");
  assert(orderArgs.some((args) => Array.isArray(args) && args[0] === "created_at"), "expected order created_at");

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - resolves a single root chunk as orderedChunks[0]", async () => {
  const rootId = "root-single-1";
  const sessionId = "session_single_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const root = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [root], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("orderedChunks" in result);
  assertEquals(result.orderedChunks.length, 1);
  assertEquals(result.orderedChunks[0].id, rootId);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - resolves the root chain from documentIdentity regardless of triggering chunk", async () => {
  const rootId = "root-cont-1";
  const continuationId = "continuation-1";
  const sessionId = "session_cont_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const root = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
  });
  const continuation = buildContributionRow({
    id: continuationId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: "gpt-4o-mini_1_business_case_raw.json",
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/gpt-4o-mini_1_business_case_raw.json`,
    target_contribution_id: rootId,
    edit_version: 2,
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [root, continuation], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("orderedChunks" in result);
  assertEquals(result.orderedChunks.length, 2);
  assertEquals(result.orderedChunks[0].id, rootId);
  assertEquals(result.orderedChunks[1].id, continuationId);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - extracts the first hyphen-delimited segment of source_group", async () => {
  const rootId = "root-fragment-1";
  const sessionId = "session_fragment_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const root = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId, source_group: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [root], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("sourceGroupFragment" in result);
  assertEquals(result.sourceGroupFragment, "a1b2c3d4");

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - returns undefined sourceGroupFragment when source_group is absent", async () => {
  const rootId = "root-nofragment-1";
  const sessionId = "session_nofragment_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const root = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [root], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("sourceGroupFragment" in result);
  assertEquals(result.sourceGroupFragment, undefined);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - returns the received query error unchanged", async () => {
  const rootId = "root-error-1";
  const sessionId = "session_error_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const queryError = new Error("select went boom");

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: null, error: queryError, count: null, status: 500, statusText: "Internal Server Error" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("error" in result);
  assertEquals(result.error, queryError);
  assertEquals(result.retriable, false);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - fresh error: no contribution chunks found", async () => {
  const rootId = "root-empty-1";
  const sessionId = "session_empty_1";

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("error" in result);
  assert(result.error instanceof ContributionChainAssemblyError);
  assertEquals(result.error.message, "No contribution chunks found for requested document");
  assertEquals(result.retriable, false);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - fresh error: no matching contribution chunks found", async () => {
  const rootId = "root-nomatch-1";
  const sessionId = "session_nomatch_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const unrelated = buildContributionRow({
    id: "unrelated",
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: "another-root" },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [unrelated], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("error" in result);
  assert(result.error instanceof ContributionChainAssemblyError);
  assertEquals(result.error.message, "No matching contribution chunks found for requested document");
  assertEquals(result.retriable, false);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - fresh error: no root contribution found", async () => {
  const rootId = "root-noroot-1";
  const sessionId = "session_noroot_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const nonRoot = buildContributionRow({
    id: "non-root",
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: "some-other-id",
    edit_version: 1,
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [nonRoot], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("error" in result);
  assert(result.error instanceof ContributionChainAssemblyError);
  assert(result.error.message.includes("No root contribution found for document identity"));
  assert(result.error.message.includes(rootId));
  assertEquals(result.retriable, false);

  clearAllStubs?.();
});

Deno.test("assembleContributionChain - bounded subsystem end-to-end chain walk", async () => {
  const rootId = "root-bounded-1";
  const editId = "edit-bounded-1";
  const continuationId = "cont-bounded-1";
  const sessionId = "session_bounded_1";
  const stageSlug = DialecticStageSlug.Thesis;

  const root = buildContributionRow({
    id: rootId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId, source_group: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
    storage_path: MOCK_STORAGE_DIR,
    file_name: ROOT_FILE_NAME,
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/${ROOT_FILE_NAME}`,
    target_contribution_id: null,
    edit_version: 1,
  });
  const edit = buildContributionRow({
    id: editId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: "gpt-4o-mini_1_business_case_raw.json",
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/gpt-4o-mini_1_business_case_raw.json`,
    target_contribution_id: rootId,
    original_model_contribution_id: rootId,
    edit_version: 2,
  });
  const continuation = buildContributionRow({
    id: continuationId,
    session_id: sessionId,
    stage: "THESIS",
    document_relationships: { [stageSlug]: rootId },
    storage_path: MOCK_STORAGE_DIR,
    file_name: "gpt-4o-mini_2_business_case_raw.json",
    raw_response_storage_path: `${MOCK_STORAGE_DIR}/gpt-4o-mini_2_business_case_raw.json`,
    target_contribution_id: editId,
    edit_version: 3,
  });

  const { client, clearAllStubs } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: [edit, continuation, root], error: null, count: null, status: 200, statusText: "OK" },
      },
    },
  });
  const dbClient = asDbClient(client);
  const payload = buildAssembleContributionChainPayload({
    sessionId,
    documentIdentity: rootId,
  });

  const result = await assembleContributionChain({}, { dbClient }, payload);

  assert("orderedChunks" in result);
  assertEquals(result.orderedChunks.length, 3);
  assertEquals(result.orderedChunks[0].id, rootId);
  assertEquals(result.orderedChunks[1].id, editId);
  assertEquals(result.orderedChunks[2].id, continuationId);
  assertEquals(result.modelSlug, "gpt-4o-mini");
  assertEquals(result.attemptCount, 0);
  assertEquals(result.sourceGroupFragment, "a1b2c3d4");
  assertEquals(result.sourceAnchorModelSlug, undefined);

  clearAllStubs?.();
});
