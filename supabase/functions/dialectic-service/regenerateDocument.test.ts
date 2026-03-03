import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  describe,
  it,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js";
import type {
  RegenerateDocumentPayload,
  RegenerateDocumentResponse,
  RegenerateDocumentResult,
} from "./dialectic.interface.ts";
import { regenerateDocument } from "./regenerateDocument.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
  type MockQueryBuilderState,
} from "../_shared/supabase.mock.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";

function getMockUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

const sessionId = "550e8400-e29b-41d4-a716-446655440000";
const stageSlug = "thesis";
const iterationNumber = 1;
const userId = "user-owner-id";
const jobId1 = "job-id-1";
const jobId2 = "job-id-2";
const cloneId1 = "clone-id-1";
const cloneId2 = "clone-id-2";

interface MockJobRow {
  id: string;
  created_at: string;
  session_id: string;
  user_id: string;
  stage_slug: string;
  iteration_number: number;
  payload: Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_retries: number;
  job_type: string;
  parent_job_id: string | null;
  prerequisite_job_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  results: unknown;
  error_details: unknown;
  target_contribution_id: string | null;
  is_test_job: boolean;
}

function getDocIdentityFromSelectState(state: MockQueryBuilderState): { documentKey: string; modelId: string } | null {
  const docKeyF = state.filters.find((f) => f.type === "filter" && f.column === "payload->>document_key");
  const modelIdF = state.filters.find((f) => f.type === "filter" && f.column === "payload->>model_id");
  if (!docKeyF?.value || !modelIdF?.value || typeof docKeyF.value !== "string" || typeof modelIdF.value !== "string")
    return null;
  return { documentKey: docKeyF.value, modelId: modelIdF.value };
}

function createMockJobRow(overrides: Partial<MockJobRow> & { id: string }): MockJobRow {
  return {
    id: overrides.id,
    created_at: overrides.created_at ?? new Date().toISOString(),
    session_id: overrides.session_id ?? sessionId,
    user_id: overrides.user_id ?? userId,
    stage_slug: overrides.stage_slug ?? stageSlug,
    iteration_number: overrides.iteration_number ?? iterationNumber,
    payload: overrides.payload ?? { modelId: "model-1" },
    status: overrides.status ?? "completed",
    attempt_count: overrides.attempt_count ?? 1,
    max_retries: overrides.max_retries ?? 3,
    job_type: overrides.job_type ?? "EXECUTE",
    parent_job_id: overrides.parent_job_id ?? null,
    prerequisite_job_id: overrides.prerequisite_job_id ?? null,
    started_at: overrides.started_at ?? null,
    completed_at: overrides.completed_at ?? null,
    results: overrides.results ?? null,
    error_details: overrides.error_details ?? null,
    target_contribution_id: overrides.target_contribution_id ?? null,
    is_test_job: overrides.is_test_job ?? false,
  };
}

describe("regenerateDocument", () => {
  let mockSetup: MockSupabaseClientSetup | null = null;

  afterEach(() => {
    mockSetup?.clearAllStubs?.();
  });

  it("valid request with one document: original marked superseded, clone inserted as pending, returns new job ID", async () => {
    const documentKey = "business_case";
    const modelId = "model-1";
    const originalJob: MockJobRow = createMockJobRow({
      id: jobId1,
      payload: { document_key: documentKey, model_id: modelId },
    });
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: async (state: MockQueryBuilderState) => {
            const docId = getDocIdentityFromSelectState(state);
            if (docId && docId.documentKey === documentKey && docId.modelId === modelId) {
              return { data: [originalJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          },
          update: { data: [originalJob], error: null, count: 1, status: 200, statusText: "OK" },
          insert: {
            data: [{ ...originalJob, id: cloneId1, status: "pending", attempt_count: 0, started_at: null, completed_at: null, results: null, error_details: null, target_contribution_id: null }],
            error: null,
            count: 1,
            status: 201,
            statusText: "Created",
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey, modelId }],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 200);
    assertExists(result.data);
    const data: RegenerateDocumentResponse = result.data;
    assertEquals(data.jobIds.length, 1);
    assertEquals(data.jobIds[0], cloneId1);
    const updateSpy = mockSetup.client.getSpiesForTableQueryMethod("dialectic_generation_jobs", "update", 1);
    assertExists(updateSpy);
    assertEquals(updateSpy.calls[0]?.args[0]?.status, "superseded");
  });

  it("valid request with multiple documents: all originals marked superseded, all clones inserted, returns array of new job IDs", async () => {
    const job1: MockJobRow = createMockJobRow({
      id: jobId1,
      payload: { document_key: "business_case", model_id: "model-1" },
    });
    const job2: MockJobRow = createMockJobRow({
      id: jobId2,
      payload: { document_key: "feature_spec", model_id: "model-2" },
    });
    const jobsByDocIdentity: Record<string, MockJobRow> = {
      "business_case_model-1": job1,
      "feature_spec_model-2": job2,
    };
    const cloneIdsToReturn: string[] = [cloneId1, cloneId2];
    let insertCallCount = 0;
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: async (state: MockQueryBuilderState) => {
            const docId = getDocIdentityFromSelectState(state);
            const job = docId ? jobsByDocIdentity[`${docId.documentKey}_${docId.modelId}`] ?? null : null;
            if (job) {
              return { data: [job], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          },
          update: { data: [], error: null, count: 1, status: 200, statusText: "OK" },
          insert: async (state: MockQueryBuilderState) => {
            const insertData = state.insertData;
            const newId = cloneIdsToReturn[insertCallCount];
            insertCallCount += 1;
            return { data: [{ ...insertData, id: newId }], error: null, count: 1, status: 201, statusText: "Created" };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [
        { documentKey: "business_case", modelId: "model-1" },
        { documentKey: "feature_spec", modelId: "model-2" },
      ],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 200);
    assertExists(result.data);
    assertEquals(result.data.jobIds.length, 2);
    assertEquals(result.data.jobIds, [cloneId1, cloneId2]);
  });

  it("stage mismatch (requested stage ≠ session current stage) returns 400, no jobs modified", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: "antithesis" } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey: "business_case", modelId: "model-1" }],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 400);
    assertExists(result.error);
    assertEquals(result.error?.message.includes("stage") || result.error?.message.includes("Stage"), true);
    const fromSpy = mockSetup.spies.fromSpy;
    assertEquals(fromSpy.calls.some((c) => c.args[0] === "dialectic_generation_jobs"), false);
  });

  it("no matching EXECUTE job for documentKey and modelId returns 404", async () => {
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: { data: [], error: null, count: 0, status: 200, statusText: "OK" },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey: "business_case", modelId: "model-1" }],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 404);
    assertExists(result.error);
    assert(result.error?.message?.includes("business_case") || result.error?.message?.includes("model-1"), "error message should identify documentKey or modelId");
  });

  it("job belongs to different session returns 403", async () => {
    const otherSessionId = "other-session-id";
    const jobWrongSession: MockJobRow = createMockJobRow({
      id: jobId1,
      session_id: otherSessionId,
      payload: { document_key: "business_case", model_id: "model-1" },
    });
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: async (state: MockQueryBuilderState) => {
            const docId = getDocIdentityFromSelectState(state);
            if (docId && docId.documentKey === "business_case" && docId.modelId === "model-1") {
              return { data: [jobWrongSession], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey: "business_case", modelId: "model-1" }],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 403);
    assertExists(result.error);
  });

  it("job is not an EXECUTE job returns 400", async () => {
    const planJob: MockJobRow = createMockJobRow({
      id: jobId1,
      job_type: "PLAN",
      payload: { document_key: "business_case", model_id: "model-1" },
    });
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: async (state: MockQueryBuilderState) => {
            const docId = getDocIdentityFromSelectState(state);
            if (docId && docId.documentKey === "business_case" && docId.modelId === "model-1") {
              return { data: [planJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey: "business_case", modelId: "model-1" }],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 400);
    assertExists(result.error);
  });

  it("user does not own the job returns 403", async () => {
    const otherUserId = "other-user-id";
    const jobOtherUser: MockJobRow = createMockJobRow({
      id: jobId1,
      user_id: otherUserId,
      payload: { document_key: "business_case", model_id: "model-1" },
    });
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: async (state: MockQueryBuilderState) => {
            const docId = getDocIdentityFromSelectState(state);
            if (docId && docId.documentKey === "business_case" && docId.modelId === "model-1") {
              return { data: [jobOtherUser], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey: "business_case", modelId: "model-1" }],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 403);
    assertExists(result.error);
  });

  it("cloned job has attempt_count 0, status pending, and preserves parent_job_id and prerequisite_job_id from original", async () => {
    const originalJob: MockJobRow = createMockJobRow({
      id: jobId1,
      parent_job_id: "parent-id",
      prerequisite_job_id: "prereq-id",
      attempt_count: 2,
      status: "failed",
      payload: { document_key: "business_case", model_id: "model-1" },
    });
    let capturedInsert: object | unknown[] | null = null;
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: async (state: MockQueryBuilderState) => {
            const docId = getDocIdentityFromSelectState(state);
            if (docId && docId.documentKey === "business_case" && docId.modelId === "model-1") {
              return { data: [originalJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          },
          update: { data: [], error: null, count: 1, status: 200, statusText: "OK" },
          insert: async (state: MockQueryBuilderState) => {
            capturedInsert = state.insertData;
            return {
              data: [{ ...state.insertData, id: cloneId1 }],
              error: null,
              count: 1,
              status: 201,
              statusText: "Created",
            };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      documents: [{ documentKey: "business_case", modelId: "model-1" }],
    };
    const user: User = getMockUser(userId);

    await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertExists(capturedInsert);
    assert(isRecord(capturedInsert), "insert data must be a record");
    assertEquals(capturedInsert["parent_job_id"], "parent-id");
    assertEquals(capturedInsert["prerequisite_job_id"], "prereq-id");
    assertEquals(capturedInsert["attempt_count"], 0);
    assertEquals(capturedInsert["status"], "pending");
  });

  it("cloned job preserves original payload, stage_slug, iteration_number, session_id, job_type, max_retries", async () => {
    const originalPayload: Record<string, unknown> = { document_key: "business_case", model_id: "model-xyz", stepKey: "thesis_1" };
    const originalJob: MockJobRow = createMockJobRow({
      id: jobId1,
      payload: originalPayload,
      stage_slug: "thesis",
      iteration_number: 2,
      session_id: sessionId,
      job_type: "EXECUTE",
      max_retries: 5,
    });
    let capturedInsert: object | unknown[] | null = null;
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{ id: sessionId, current_stage: { slug: stageSlug } }],
            error: null,
            count: 1,
            status: 200,
            statusText: "OK",
          },
        },
        dialectic_generation_jobs: {
          select: async (state: MockQueryBuilderState) => {
            const docId = getDocIdentityFromSelectState(state);
            if (docId && docId.documentKey === "business_case" && docId.modelId === "model-xyz") {
              return { data: [originalJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
          },
          update: { data: [], error: null, count: 1, status: 200, statusText: "OK" },
          insert: async (state: MockQueryBuilderState) => {
            capturedInsert = state.insertData;
            return {
              data: [{ ...state.insertData, id: cloneId1 }],
              error: null,
              count: 1,
              status: 201,
              statusText: "Created",
            };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber: 2,
      documents: [{ documentKey: "business_case", modelId: "model-xyz" }],
    };
    const user: User = getMockUser(userId);

    await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertExists(capturedInsert);
    assert(isRecord(capturedInsert), "insert data must be a record");
    assertEquals(capturedInsert["payload"], originalPayload);
    assertEquals(capturedInsert["stage_slug"], originalJob.stage_slug);
    assertEquals(capturedInsert["iteration_number"], originalJob.iteration_number);
    assertEquals(capturedInsert["session_id"], originalJob.session_id);
    assertEquals(capturedInsert["job_type"], originalJob.job_type);
    assertEquals(capturedInsert["max_retries"], originalJob.max_retries);
  });
});
