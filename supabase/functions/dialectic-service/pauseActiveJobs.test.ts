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
  PauseActiveJobsPayload,
  PauseActiveJobsResponse,
  PauseActiveJobsResult,
  PauseActiveJobsDeps,
} from "./dialectic.interface.ts";
import { handlePauseActiveJobs } from "./pauseActiveJobs.ts";
import { logger } from "../_shared/logger.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
  type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";

function getMockUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

const validPayload: PauseActiveJobsPayload = {
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  stageSlug: "thesis",
  iterationNumber: 1,
};

const emptyDeps: PauseActiveJobsDeps = {};

describe("handlePauseActiveJobs", () => {
  let mockSetup: MockSupabaseClientSetup | null = null;
  let errorStub: { restore: () => void; calls: { length: number } } | undefined = undefined;

  afterEach(() => {
    if (errorStub) errorStub.restore();
    mockSetup?.clearAllStubs?.();
  });

  it("returns 401 when user is null", async () => {
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        pause_active_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: 0, error: null }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const userOrNull: User | null = null;

    const result: PauseActiveJobsResult = await handlePauseActiveJobs(
      validPayload,
      emptyDeps,
      mockSetup.client as unknown as SupabaseClient,
      userOrNull,
    );

    assertEquals(result.status, 401);
    assertExists(result.error);
    assertEquals(result.error?.message, "User not authenticated");
    assertEquals(mockSetup.spies.rpcSpy.calls.length, 0);
  });

  it("calls adminClient.rpc('pause_active_jobs', { p_session_id, p_stage_slug, p_iteration_number }) with correct parameters", async () => {
    const pausedCount: number = 2;
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        pause_active_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: pausedCount, error: null }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");

    await handlePauseActiveJobs(
      validPayload,
      emptyDeps,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(mockSetup.spies.rpcSpy.calls.length, 1);
    assertEquals(mockSetup.spies.rpcSpy.calls[0].args[0], "pause_active_jobs");
    assertEquals(mockSetup.spies.rpcSpy.calls[0].args[1], {
      p_session_id: validPayload.sessionId,
      p_stage_slug: validPayload.stageSlug,
      p_iteration_number: validPayload.iterationNumber,
    });
  });

  it("returns { data: { pausedCount: N } } and status 200 on success where N is the RPC return value", async () => {
    const pausedCount: number = 3;
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        pause_active_jobs: (): Promise<{ data: number; error: null }> =>
          Promise.resolve({ data: pausedCount, error: null }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");

    const result: PauseActiveJobsResult = await handlePauseActiveJobs(
      validPayload,
      emptyDeps,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 200);
    assertExists(result.data);
    const data: PauseActiveJobsResponse = result.data;
    assertEquals(data.pausedCount, pausedCount);
    assertEquals(result.error, undefined);
  });

  it("returns 500 when RPC fails and logs the error", async () => {
    const stubInstance = stub(logger, "error", () => {});
    errorStub = { restore: () => stubInstance.restore(), calls: stubInstance.calls };
    const rpcError: Error = new Error("pause_active_jobs failed");
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        pause_active_jobs: () =>
          Promise.resolve({ data: null, error: rpcError }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");

    const result: PauseActiveJobsResult = await handlePauseActiveJobs(
      validPayload,
      emptyDeps,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 500);
    assertExists(result.error);
    assertEquals(result.error?.message, rpcError.message);
    assertEquals(result.error?.code, "PAUSE_ACTIVE_JOBS_FAILED");
    assertEquals(errorStub.calls.length, 1);
  });

  it("returns 500 when RPC returns non-number result", async () => {
    const stubInstance = stub(logger, "error", () => {});
    errorStub = { restore: () => stubInstance.restore(), calls: stubInstance.calls };
    const config: MockSupabaseDataConfig = {
      rpcResults: {
        pause_active_jobs: (): Promise<{ data: object; error: null }> =>
          Promise.resolve({ data: {}, error: null }),
      },
    };
    mockSetup = createMockSupabaseClient("user-id", config);
    const user: User = getMockUser("user-id");

    const result: PauseActiveJobsResult = await handlePauseActiveJobs(
      validPayload,
      emptyDeps,
      mockSetup.client as unknown as SupabaseClient,
      user,
    );

    assertEquals(result.status, 500);
    assertExists(result.error);
    assertEquals(result.error?.code, "PAUSE_ACTIVE_JOBS_FAILED");
    assertEquals(errorStub.calls.length, 1);
  });
});
