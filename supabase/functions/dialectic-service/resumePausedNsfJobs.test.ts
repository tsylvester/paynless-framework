import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.208.0/testing/mock.ts";
import {
  describe,
  it,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js";
import type {
  ResumePausedNsfJobsPayload,
  ResumePausedNsfJobsResponse,
  ResumePausedNsfJobsResult,
  ResumePausedNsfJobsParams,
  ResumePausedNsfJobsDeps,
} from "./dialectic.interface.ts";
import { handleResumePausedNsfJobs } from "./resumePausedNsfJobs.ts";
import { logger } from "../_shared/logger.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
  type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";
import type { Database, TablesUpdate } from "../types_db.ts";

function isDialecticGenerationJobsUpdate(u: unknown): u is TablesUpdate<"dialectic_generation_jobs"> {
  return typeof u === "object" && u !== null;
}

function getMockUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

const validPayload: ResumePausedNsfJobsPayload = {
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  stageSlug: "thesis",
  iterationNumber: 1,
};

const validAuthToken = "mock-jwt-token";

function validParams(user: User): ResumePausedNsfJobsParams {
  return { user, authToken: validAuthToken };
}

function depsFromSetup(mockSetup: MockSupabaseClientSetup): ResumePausedNsfJobsDeps {
  return {
    adminClient: mockSetup.client as unknown as SupabaseClient<Database>,
  };
}

describe("handleResumePausedNsfJobs", () => {
  let mockSetup: MockSupabaseClientSetup | null = null;

  afterEach(() => {
    mockSetup?.clearAllStubs?.();
  });

  it("returns 401 when params.user is null", async () => {
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        resume_paused_nsf_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: 0, error: null }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const params: ResumePausedNsfJobsParams = { user: null, authToken: validAuthToken };
    const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

    const result: ResumePausedNsfJobsResult = await handleResumePausedNsfJobs(
      validPayload,
      params,
      deps,
    );

    assertEquals(result.status, 401);
    assertExists(result.error);
    assertEquals(result.error?.message, "User not authenticated");
    assertEquals(result.error?.code, "USER_AUTH_FAILED");
    assertEquals(mockSetup.spies.rpcSpy.calls.length, 0);
  });

  it("returns 401 when params.authToken is missing", async () => {
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        resume_paused_nsf_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: 0, error: null }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");
    const params: ResumePausedNsfJobsParams = { user, authToken: "" };
    const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

    const result: ResumePausedNsfJobsResult = await handleResumePausedNsfJobs(
      validPayload,
      params,
      deps,
    );

    assertEquals(result.status, 401);
    assertExists(result.error);
    assertEquals(result.error?.code, "AUTH_TOKEN_MISSING");
    assertEquals(mockSetup.spies.rpcSpy.calls.length, 0);
  });

  it("calls adminClient.rpc('resume_paused_nsf_jobs', { p_session_id, p_stage_slug, p_iteration_number }) with correct parameters", async () => {
    const resumedCount: number = 2;
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        resume_paused_nsf_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: resumedCount, error: null }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");
    const params: ResumePausedNsfJobsParams = validParams(user);
    const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

    await handleResumePausedNsfJobs(validPayload, params, deps);

    assertEquals(mockSetup.spies.rpcSpy.calls.length, 1);
    assertEquals(mockSetup.spies.rpcSpy.calls[0].args[0], "resume_paused_nsf_jobs");
    assertEquals(mockSetup.spies.rpcSpy.calls[0].args[1], {
      p_session_id: validPayload.sessionId,
      p_stage_slug: validPayload.stageSlug,
      p_iteration_number: validPayload.iterationNumber,
    });
  });

  it("returns { resumedCount: N } and status 200 on success where N is the RPC return value", async () => {
    const resumedCount: number = 3;
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        resume_paused_nsf_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: resumedCount, error: null }),
      },
      genericMockResults: {
        dialectic_generation_jobs: {
          update: { data: [], error: null, count: 1, status: 200, statusText: "OK" },
        },
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");
    const params: ResumePausedNsfJobsParams = validParams(user);
    const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

    const result: ResumePausedNsfJobsResult = await handleResumePausedNsfJobs(
      validPayload,
      params,
      deps,
    );

    assertEquals(result.status, 200);
    assertExists(result.data);
    const data: ResumePausedNsfJobsResponse = result.data;
    assertEquals(data.resumedCount, resumedCount);
    assertEquals(result.error, undefined);
  });

  it("returns 500 when RPC fails and logs the error", async () => {
    const errorStub = stub(logger, "error", () => {});
    try {
      const rpcError: Error = new Error("resume_paused_nsf_jobs failed");
      const config: MockSupabaseDataConfig = {
        rpcResults: {
          resume_paused_nsf_jobs: () =>
            Promise.resolve({ data: null, error: rpcError }),
        },
      };
      mockSetup = createMockSupabaseClient("user-id", config);
      const user: User = getMockUser("user-id");
      const params: ResumePausedNsfJobsParams = validParams(user);
      const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

      const result: ResumePausedNsfJobsResult = await handleResumePausedNsfJobs(
        validPayload,
        params,
        deps,
      );

      assertEquals(result.status, 500);
      assertExists(result.error);
      assertEquals(result.error?.message, rpcError.message);
      assertEquals(result.error?.code, "RESUME_FAILED");
      assertEquals(errorStub.calls.length, 1);
    } finally {
      errorStub.restore();
    }
  });

  it("returns 500 when RPC returns non-number result", async () => {
    const errorStub = stub(logger, "error", () => {});
    try {
      const config: MockSupabaseDataConfig = {
        rpcResults: {
          resume_paused_nsf_jobs: (): Promise<{ data: object; error: null }> =>
            Promise.resolve({ data: {}, error: null }),
        },
      };
      mockSetup = createMockSupabaseClient("user-id", config);
      const user: User = getMockUser("user-id");
      const params: ResumePausedNsfJobsParams = validParams(user);
      const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

      const result: ResumePausedNsfJobsResult = await handleResumePausedNsfJobs(
        validPayload,
        params,
        deps,
      );

      assertEquals(result.status, 500);
      assertExists(result.error);
      assertEquals(result.error?.code, "RESUME_FAILED");
      assertEquals(errorStub.calls.length, 1);
    } finally {
      errorStub.restore();
    }
  });

  it("after RPC succeeds, updates dialectic_generation_jobs payload with user_jwt for resumed jobs", async () => {
    const resumedCount: number = 2;
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        resume_paused_nsf_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: resumedCount, error: null }),
      },
      genericMockResults: {
        dialectic_generation_jobs: {
          select: { data: [{ id: "job-resumed-1", payload: {} }], error: null, count: 1, status: 200, statusText: "OK" },
          update: { data: [], error: null, count: resumedCount, status: 200, statusText: "OK" },
        },
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");
    const params: ResumePausedNsfJobsParams = validParams(user);
    const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

    await handleResumePausedNsfJobs(validPayload, params, deps);

    const updateSpy = mockSetup.client.getSpiesForTableQueryMethod("dialectic_generation_jobs", "update", 1);
    assertExists(updateSpy);
    assertEquals(updateSpy.calls.length, 1);
    const raw: unknown = updateSpy.calls[0]?.args[0];
    assertExists(raw);
    if (!isDialecticGenerationJobsUpdate(raw)) {
      throw new Error("expected dialectic_generation_jobs update");
    }
    const updateData: TablesUpdate<"dialectic_generation_jobs"> = raw;
    assertExists(updateData.payload);
    if (typeof updateData.payload !== "object" || updateData.payload === null || Array.isArray(updateData.payload)) {
      throw new Error("expected payload object");
    }
    assertEquals(updateData.payload.user_jwt, validAuthToken);
  });

  it("when JWT update fails, logs warning but still returns success", async () => {
    const warnStub = stub(logger, "warn", () => {});
    try {
      const resumedCount: number = 1;
      const config: MockSupabaseDataConfig = {
        rpcResults: {
          resume_paused_nsf_jobs: (): Promise<{ data: number; error: null }> =>
            Promise.resolve({ data: resumedCount, error: null }),
        },
        genericMockResults: {
          dialectic_generation_jobs: {
            select: { data: [{ id: "job-resumed-1", payload: {} }], error: null, count: 1, status: 200, statusText: "OK" },
            update: { data: null, error: new Error("update failed"), count: null, status: 500, statusText: "Error" },
          },
        },
      };
      mockSetup = createMockSupabaseClient("user-id", config);
      const user: User = getMockUser("user-id");
      const params: ResumePausedNsfJobsParams = validParams(user);
      const deps: ResumePausedNsfJobsDeps = depsFromSetup(mockSetup);

      const result: ResumePausedNsfJobsResult = await handleResumePausedNsfJobs(
        validPayload,
        params,
        deps,
      );

      assertEquals(result.status, 200);
      assertExists(result.data);
      assertEquals(result.data?.resumedCount, resumedCount);
      assertEquals(result.error, undefined);
      assertEquals(warnStub.calls.length, 1);
    } finally {
      warnStub.restore();
    }
  });
});
