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

  it("valid request with one job: original marked superseded, clone inserted as pending, returns new job ID", async () => {
    const originalJob: MockJobRow = createMockJobRow({ id: jobId1 });
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
            const idFilter = state.filters.find((f) => f.column === "id" && f.type === "eq");
            if (idFilter?.value === jobId1) {
              return { data: [originalJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: null, error: new Error("Job not found"), count: 0, status: 404, statusText: "Not Found" };
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
      jobs: [{ jobId: jobId1, modelId: "model-1" }],
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

  it("valid request with multiple jobs: all originals marked superseded, all clones inserted, returns array of new job IDs", async () => {
    const job1: MockJobRow = createMockJobRow({ id: jobId1 });
    const job2: MockJobRow = createMockJobRow({ id: jobId2 });
    const jobsById: Record<string, MockJobRow> = { [jobId1]: job1, [jobId2]: job2 };
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
            const idFilter = state.filters.find((f) => f.column === "id" && f.type === "eq");
            const job = idFilter && typeof idFilter.value === "string" ? jobsById[idFilter.value] : null;
            if (job) {
              return { data: [job], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: null, error: new Error("Job not found"), count: 0, status: 404, statusText: "Not Found" };
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
      jobs: [
        { jobId: jobId1, modelId: "model-1" },
        { jobId: jobId2, modelId: "model-2" },
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
      jobs: [{ jobId: jobId1, modelId: "model-1" }],
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

  it("job not found returns 404", async () => {
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
          select: { data: null, error: Object.assign(new Error("Job not found"), { code: "PGRST116" }), count: 0, status: 404, statusText: "Not Found" },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      jobs: [{ jobId: "non-existent-job-id", modelId: "model-1" }],
    };
    const user: User = getMockUser(userId);

    const result: RegenerateDocumentResult = await regenerateDocument(
      payload,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 404);
    assertExists(result.error);
  });

  it("job belongs to different session returns 403", async () => {
    const otherSessionId = "other-session-id";
    const jobWrongSession: MockJobRow = createMockJobRow({ id: jobId1, session_id: otherSessionId });
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
            const idFilter = state.filters.find((f) => f.column === "id" && f.type === "eq");
            if (idFilter?.value === jobId1) {
              return { data: [jobWrongSession], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: null, error: new Error("Job not found"), count: 0, status: 404, statusText: "Not Found" };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      jobs: [{ jobId: jobId1, modelId: "model-1" }],
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
    const planJob: MockJobRow = createMockJobRow({ id: jobId1, job_type: "PLAN" });
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
            const idFilter = state.filters.find((f) => f.column === "id" && f.type === "eq");
            if (idFilter?.value === jobId1) {
              return { data: [planJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: null, error: new Error("Job not found"), count: 0, status: 404, statusText: "Not Found" };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      jobs: [{ jobId: jobId1, modelId: "model-1" }],
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
    const jobOtherUser: MockJobRow = createMockJobRow({ id: jobId1, user_id: otherUserId });
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
            const idFilter = state.filters.find((f) => f.column === "id" && f.type === "eq");
            if (idFilter?.value === jobId1) {
              return { data: [jobOtherUser], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: null, error: new Error("Job not found"), count: 0, status: 404, statusText: "Not Found" };
          },
        },
      },
    };
    mockSetup = createMockSupabaseClient(userId, config);
    const payload: RegenerateDocumentPayload = {
      sessionId,
      stageSlug,
      iterationNumber,
      jobs: [{ jobId: jobId1, modelId: "model-1" }],
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
            const idFilter = state.filters.find((f) => f.column === "id" && f.type === "eq");
            if (idFilter?.value === jobId1) {
              return { data: [originalJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: null, error: new Error("Job not found"), count: 0, status: 404, statusText: "Not Found" };
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
      jobs: [{ jobId: jobId1, modelId: "model-1" }],
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
    const originalPayload = { modelId: "model-xyz", stepKey: "thesis_1" };
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
            const idFilter = state.filters.find((f) => f.column === "id" && f.type === "eq");
            if (idFilter?.value === jobId1) {
              return { data: [originalJob], error: null, count: 1, status: 200, statusText: "OK" };
            }
            return { data: null, error: new Error("Job not found"), count: 0, status: 404, statusText: "Not Found" };
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
      jobs: [{ jobId: jobId1, modelId: "model-xyz" }],
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
