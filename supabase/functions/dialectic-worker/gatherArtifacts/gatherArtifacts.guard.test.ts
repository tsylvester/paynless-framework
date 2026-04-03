import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type {
  GatherArtifactsDeps,
  GatherArtifactsErrorReturn,
  GatherArtifactsParams,
  GatherArtifactsPayload,
  GatherArtifactsSuccessReturn,
} from "./gatherArtifacts.interface.ts";
import {
  isGatherArtifactsDeps,
  isGatherArtifactsParams,
  isGatherArtifactsPayload,
  isGatherArtifactsSuccessReturn,
  isGatherArtifactsErrorReturn,
} from "./gatherArtifacts.guard.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildGatherArtifactsDeps,
  buildGatherArtifactsParams,
  buildGatherArtifactsPayload,
  buildGatherArtifactsSuccessReturn,
  buildGatherArtifactsErrorReturn,
} from "./gatherArtifacts.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";


Deno.test("isGatherArtifactsDeps accepts valid deps and rejects invalid deps", () => {
  const valid: GatherArtifactsDeps = buildGatherArtifactsDeps();
  assertEquals(isGatherArtifactsDeps(valid), true);

  assertEquals(isGatherArtifactsDeps(null), false);
  assertEquals(isGatherArtifactsDeps({}), false);
  assertEquals(
    isGatherArtifactsDeps({
      logger: valid.logger,
      pickLatest: valid.pickLatest,
    }),
    false,
  );
  assertEquals(
    isGatherArtifactsDeps({
      logger: valid.logger,
      pickLatest: "not-a-function",
      downloadFromStorage: valid.downloadFromStorage,
    }),
    false,
  );
});

Deno.test("isGatherArtifactsParams accepts valid params and rejects invalid params", () => {
  const { client: dbClient } = createMockSupabaseClient();
  const valid: GatherArtifactsParams = buildGatherArtifactsParams(dbClient as unknown as SupabaseClient<Database>);
  assertEquals(isGatherArtifactsParams(valid), true);

  assertEquals(isGatherArtifactsParams(null), false);
  assertEquals(isGatherArtifactsParams({}), false);
  assertEquals(
    isGatherArtifactsParams({
      dbClient: valid.dbClient,
      projectId: valid.projectId,
      sessionId: valid.sessionId,
      iterationNumber: "1",
    }),
    false,
  );
});

Deno.test("isGatherArtifactsPayload accepts valid payload and rejects invalid payload", () => {
  const valid: GatherArtifactsPayload = buildGatherArtifactsPayload();
  assertEquals(isGatherArtifactsPayload(valid), true);

  assertEquals(isGatherArtifactsPayload(null), false);
  assertEquals(isGatherArtifactsPayload({}), false);
  assertEquals(
    isGatherArtifactsPayload({
      inputsRequired: "not-an-array",
    }),
    false,
  );
});

Deno.test("isGatherArtifactsSuccessReturn accepts valid success and rejects invalid", () => {
  const valid: GatherArtifactsSuccessReturn = buildGatherArtifactsSuccessReturn();
  assertEquals(isGatherArtifactsSuccessReturn(valid), true);

  assertEquals(isGatherArtifactsSuccessReturn(null), false);
  assertEquals(isGatherArtifactsSuccessReturn({}), false);
  assertEquals(
    isGatherArtifactsSuccessReturn({
      artifacts: "not-an-array",
    }),
    false,
  );
  assertEquals(isGatherArtifactsSuccessReturn(buildGatherArtifactsErrorReturn()), false);
});

Deno.test("isGatherArtifactsErrorReturn accepts valid error and rejects invalid", () => {
  const valid: GatherArtifactsErrorReturn = buildGatherArtifactsErrorReturn();
  assertEquals(isGatherArtifactsErrorReturn(valid), true);

  assertEquals(isGatherArtifactsErrorReturn(null), false);
  assertEquals(isGatherArtifactsErrorReturn({}), false);
  assertEquals(
    isGatherArtifactsErrorReturn({
      error: "not-error-instance",
      retriable: false,
    }),
    false,
  );
  assertEquals(
    isGatherArtifactsErrorReturn({
      error: new Error("x"),
      retriable: "no",
    }),
    false,
  );
  assertEquals(isGatherArtifactsErrorReturn(buildGatherArtifactsSuccessReturn()), false);
});
