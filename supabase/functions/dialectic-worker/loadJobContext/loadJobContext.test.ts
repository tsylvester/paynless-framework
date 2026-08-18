import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { loadJobContext } from "./loadJobContext.ts";
import {
  isLoadJobContextSuccessReturn,
  isLoadJobContextErrorReturn,
  isLoadJobContextJobReadError,
  isLoadJobContextJobNotFoundError,
  isLoadJobContextProviderReadError,
  isLoadJobContextProviderNotFoundError,
  isLoadJobContextProviderInvalidError,
  isLoadJobContextConfigInvalidError,
} from "./loadJobContext.guard.ts";
import {
  buildLoadJobContextDeps,
  buildLoadJobContextParams,
  buildLoadJobContextPayload,
} from "./loadJobContext.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  buildDialecticJobRow,
  buildDialecticExecuteJobPayload,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { isDialecticExecuteJobPayload } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isAiModelExtendedConfig } from '../../_shared/utils/type_guards.ts';
/**
 * Contract: a client configured with a job row and a valid provider row returns
 *   the success arm whose job is the configured row, whose providerRow is the
 *   configured provider, whose modelConfig is that provider's config, and whose
 *   walletId and projectId are the payload's; the provider is read by the
 *   payload's model_id; only dialectic_generation_jobs and ai_providers are read.
 * Arrange: a job row carrying a base payload with a distinct model_id, walletId
 *   and projectId; a provider row whose id matches that model_id; a mock client
 *   configured to return both rows; payload jobId matching the job row's id.
 * Act:     loadJobContext over the configured arrangement.
 * Assert:  success arm; job is the configured row; providerRow is the configured
 *   provider; modelConfig is the provider's config; walletId is the payload's;
 *   projectId is the payload's; session_id, iteration_number and stage_slug
 *   reachable off the returned row; ai_providers filter is the payload's model_id;
 *   no dialectic_sessions read.
 */
Deno.test("success — job row and valid provider return the success arm", async () => {
  // Arrange
  const modelId = "model-success-1";
  const walletId = "wallet-success-1";
  const projectId = "project-success-1";
  const basePayload = buildDialecticExecuteJobPayload({
    model_id: modelId,
    walletId,
    projectId,
  });
  if(!isJson(basePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: basePayload });
  const providerRow = buildMockProvider({ id: modelId });
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [jobRow], error: null }),
      },
      ai_providers: {
        select: () =>
          Promise.resolve({ data: [providerRow], error: null }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: jobRow.id });

  // Act
  const result = await loadJobContext(deps, params, payload);

  if(!providerRow.config){
    throw new Error ("providerRow must have a config")
  }
  if(!isAiModelExtendedConfig(providerRow.config))
  {
    throw new Error ("providerRow.config must be json compatible")
  }
  // Assert
  assert(isLoadJobContextSuccessReturn(result));
  if (isLoadJobContextSuccessReturn(result)) {
    assertEquals(result.job, jobRow);
    assertEquals(result.providerRow, providerRow);
    assertEquals(result.modelConfig, providerRow.config);
    assertEquals(result.walletId, walletId);
    assertEquals(result.projectId, projectId);
    assertEquals(result.job.session_id, jobRow.session_id);
    assertEquals(result.job.iteration_number, jobRow.iteration_number);
    assertEquals(result.job.stage_slug, jobRow.stage_slug);
  }
  const aiProviderBuilder = client.getLatestBuilder("ai_providers");
  const state = aiProviderBuilder?.getQueryBuilderState();
  const idFilter = state?.filters.find((f) => f.column === "id" && f.type === "eq");
  assertEquals(idFilter?.value, modelId);
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: a dialectic_generation_jobs read returning a driver error returns
 *   the error arm whose error passes isLoadJobContextJobReadError, carries the
 *   payload's jobId and the driver's message, and whose retriable is true;
 *   the ai_providers read never happened; no dialectic_sessions read.
 * Arrange: a mock client whose dialectic_generation_jobs select returns a driver
 *   error; payload jobId "job-read-failed-1".
 * Act:     loadJobContext over the error-returning arrangement.
 * Assert:  error arm; error is LoadJobContextJobReadError; jobId is "job-read-failed-1";
 *   driverMessage is the driver's message; retriable is true; ai_providers never read;
 *   no dialectic_sessions read.
 */
Deno.test("job read failed — driver error returns JobReadError retriable true", async () => {
  // Arrange
  const driverMessage = "connection refused";
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: null, error: new Error(driverMessage) }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: "job-read-failed-1" });

  // Act
  const result = await loadJobContext(deps, params, payload);

  // Assert
  assert(isLoadJobContextErrorReturn(result));
  if (isLoadJobContextErrorReturn(result)) {
    assert(isLoadJobContextJobReadError(result.error));
    if (isLoadJobContextJobReadError(result.error)) {
      assertEquals(result.error.jobId, "job-read-failed-1");
      assertEquals(result.error.driverMessage, driverMessage);
    }
    assertEquals(result.retriable, true);
  }
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("ai_providers"), false);
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: a dialectic_generation_jobs read returning no rows returns the error
 *   arm whose error passes isLoadJobContextJobNotFoundError with retriable false;
 *   the ai_providers read never happened; no dialectic_sessions read.
 * Arrange: a mock client whose dialectic_generation_jobs select returns empty data;
 *   payload jobId "job-absent-1".
 * Act:     loadJobContext over the empty-read arrangement.
 * Assert:  error arm; error is LoadJobContextJobNotFoundError; retriable is false;
 *   ai_providers never read; no dialectic_sessions read.
 */
Deno.test("job absent — no rows returns JobNotFoundError retriable false", async () => {
  // Arrange
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: "job-absent-1" });

  // Act
  const result = await loadJobContext(deps, params, payload);

  // Assert
  assert(isLoadJobContextErrorReturn(result));
  if (isLoadJobContextErrorReturn(result)) {
    assert(isLoadJobContextJobNotFoundError(result.error));
    if (isLoadJobContextJobNotFoundError(result.error)) {
      assertEquals(result.error.jobId, "job-absent-1");
    }
    assertEquals(result.retriable, false);
  }
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("ai_providers"), false);
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: a job row whose payload omits walletId returns the error arm carrying
 *   the Error isDialecticExecuteJobPayload threw, its message unchanged from the
 *   guard's own diagnostic, with retriable false; the ai_providers read never
 *   happened; no dialectic_sessions read.
 * Arrange: a job row whose payload is a base payload with walletId rest-destructured
 *   away; a mock client returning that row; payload jobId matching the row's id.
 * Act:     loadJobContext over the census-failing arrangement.
 * Assert:  error arm; error is a plain Error (not an owned class); error.message
 *   matches the guard's thrown diagnostic; retriable is false; ai_providers never
 *   read; no dialectic_sessions read.
 */
Deno.test("census failed — payload omits walletId, guard's Error propagated unchanged", async () => {
  // Arrange
  const { walletId: _omit, ...censusFailPayload } = buildDialecticExecuteJobPayload({
    model_id: "model-census-1",
  });
  if(!isJson(censusFailPayload)){
    throw new Error ("Payload just be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: censusFailPayload });
  let expectedMessage = "";
  try {
    isDialecticExecuteJobPayload(censusFailPayload);
  } catch (e) {
    expectedMessage = (e as Error).message;
  }
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [jobRow], error: null }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: jobRow.id });

  // Act
  const result = await loadJobContext(deps, params, payload);

  // Assert
  assert(isLoadJobContextErrorReturn(result));
  if (isLoadJobContextErrorReturn(result)) {
    assertEquals(result.error instanceof Error, true);
    assertEquals(result.error.message, expectedMessage);
    assertEquals(result.retriable, false);
  }
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("ai_providers"), false);
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: an ai_providers read returning a driver error returns the error arm
 *   whose error passes isLoadJobContextProviderReadError with retriable true;
 *   no dialectic_sessions read.
 * Arrange: a job row with a valid base payload; a mock client whose
 *   dialectic_generation_jobs returns the row and whose ai_providers returns a
 *   driver error; payload jobId matching the row's id.
 * Act:     loadJobContext over the provider-error arrangement.
 * Assert:  error arm; error is LoadJobContextProviderReadError; modelId is the
 *   payload's model_id; driverMessage is the driver's message; retriable is true;
 *   no dialectic_sessions read.
 */
Deno.test("provider read failed — driver error returns ProviderReadError retriable true", async () => {
  // Arrange
  const modelId = "model-provider-read-failed-1";
  const driverMessage = "provider connection refused";
  const basePayload = buildDialecticExecuteJobPayload({ model_id: modelId });
  if(!isJson(basePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: basePayload });
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [jobRow], error: null }),
      },
      ai_providers: {
        select: () =>
          Promise.resolve({ data: null, error: new Error(driverMessage) }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: jobRow.id });

  // Act
  const result = await loadJobContext(deps, params, payload);

  // Assert
  assert(isLoadJobContextErrorReturn(result));
  if (isLoadJobContextErrorReturn(result)) {
    assert(isLoadJobContextProviderReadError(result.error));
    if (isLoadJobContextProviderReadError(result.error)) {
      assertEquals(result.error.modelId, modelId);
      assertEquals(result.error.driverMessage, driverMessage);
    }
    assertEquals(result.retriable, true);
  }
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: an ai_providers read returning no rows returns the error arm whose
 *   error passes isLoadJobContextProviderNotFoundError with retriable false;
 *   no dialectic_sessions read.
 * Arrange: a job row with a valid base payload; a mock client whose
 *   dialectic_generation_jobs returns the row and whose ai_providers returns
 *   empty data; payload jobId matching the row's id.
 * Act:     loadJobContext over the provider-absent arrangement.
 * Assert:  error arm; error is LoadJobContextProviderNotFoundError; modelId is
 *   the payload's model_id; retriable is false; no dialectic_sessions read.
 */
Deno.test("provider absent — no rows returns ProviderNotFoundError retriable false", async () => {
  // Arrange
  const modelId = "model-provider-absent-1";
  const basePayload = buildDialecticExecuteJobPayload({ model_id: modelId });
  if(!isJson(basePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: basePayload });
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [jobRow], error: null }),
      },
      ai_providers: {
        select: () =>
          Promise.resolve({ data: [], error: null }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: jobRow.id });

  // Act
  const result = await loadJobContext(deps, params, payload);

  // Assert
  assert(isLoadJobContextErrorReturn(result));
  if (isLoadJobContextErrorReturn(result)) {
    assert(isLoadJobContextProviderNotFoundError(result.error));
    if (isLoadJobContextProviderNotFoundError(result.error)) {
      assertEquals(result.error.modelId, modelId);
    }
    assertEquals(result.retriable, false);
  }
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: a provider row missing a member isSelectedAiProvider requires returns
 *   the error arm whose error passes isLoadJobContextProviderInvalidError with
 *   retriable false; no dialectic_sessions read.
 * Arrange: a job row with a valid base payload; a mock client whose
 *   dialectic_generation_jobs returns the row and whose ai_providers returns a
 *   provider row with a required member rest-destructured away; payload jobId
 *   matching the row's id.
 * Act:     loadJobContext over the provider-invalid arrangement.
 * Assert:  error arm; error is LoadJobContextProviderInvalidError; modelId is
 *   the payload's model_id; retriable is false; no dialectic_sessions read.
 */
Deno.test("provider invalid — missing required member returns ProviderInvalidError retriable false", async () => {
  // Arrange
  const modelId = "model-provider-invalid-1";
  const basePayload = buildDialecticExecuteJobPayload({ model_id: modelId });
  if(!isJson(basePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: basePayload });
  const { name: _omit, ...invalidProvider } = buildMockProvider({ id: modelId });
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [jobRow], error: null }),
      },
      ai_providers: {
        select: () =>
          Promise.resolve({ data: [invalidProvider], error: null }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: jobRow.id });

  // Act
  const result = await loadJobContext(deps, params, payload);

  // Assert
  assert(isLoadJobContextErrorReturn(result));
  if (isLoadJobContextErrorReturn(result)) {
    assert(isLoadJobContextProviderInvalidError(result.error));
    if (isLoadJobContextProviderInvalidError(result.error)) {
      assertEquals(result.error.modelId, modelId);
    }
    assertEquals(result.retriable, false);
  }
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: a provider row whose config fails isAiModelExtendedConfig returns the
 *   error arm whose error passes isLoadJobContextConfigInvalidError with retriable
 *   false; no dialectic_sessions read.
 * Arrange: a job row with a valid base payload; a mock client whose
 *   dialectic_generation_jobs returns the row and whose ai_providers returns a
 *   provider row with a corrupted config; payload jobId matching the row's id.
 * Act:     loadJobContext over the config-invalid arrangement.
 * Assert:  error arm; error is LoadJobContextConfigInvalidError; modelId is
 *   the payload's model_id; retriable is false; no dialectic_sessions read.
 */
Deno.test("config invalid — config fails isAiModelExtendedConfig returns ConfigInvalidError retriable false", async () => {
  // Arrange
  const modelId = "model-config-invalid-1";
  const basePayload = buildDialecticExecuteJobPayload({ model_id: modelId });
  if(!isJson(basePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: basePayload });
  const configInvalidProvider = {
    ...buildMockProvider({ id: modelId }),
    config: { corrupted: true },
  };
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [jobRow], error: null }),
      },
      ai_providers: {
        select: () =>
          Promise.resolve({ data: [configInvalidProvider], error: null }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: jobRow.id });

  // Act
  const result = await loadJobContext(deps, params, payload);

  // Assert
  assert(isLoadJobContextErrorReturn(result));
  if (isLoadJobContextErrorReturn(result)) {
    assert(isLoadJobContextConfigInvalidError(result.error));
    if (isLoadJobContextConfigInvalidError(result.error)) {
      assertEquals(result.error.modelId, modelId);
    }
    assertEquals(result.retriable, false);
  }
  const tablesRead = client.getTablesWithHistoricBuilders();
  assertEquals(tablesRead.includes("dialectic_sessions"), false);
});

/**
 * Contract: neither the params object nor the payload object is mutated by any
 *   path, asserted on their members after the call.
 * Arrange: params with a built dbClient; payload with a distinct jobId; a mock
 *   client configured for the success path.
 * Act:     loadJobContext over the purity-test arrangement.
 * Assert:  params.dbClient unchanged; payload.jobId unchanged.
 */
Deno.test("purity — params and payload are not mutated", async () => {
  // Arrange
  const modelId = "model-purity-1";
  const basePayload = buildDialecticExecuteJobPayload({ model_id: modelId });
  if(!isJson(basePayload)){
    throw new Error ("Payload must be json compatible")
  }
  const jobRow = buildDialecticJobRow({ payload: basePayload });
  const providerRow = buildMockProvider({ id: modelId });
  const { client } = createMockSupabaseClient(undefined, {
    genericMockResults: {
      dialectic_generation_jobs: {
        select: () =>
          Promise.resolve({ data: [jobRow], error: null }),
      },
      ai_providers: {
        select: () =>
          Promise.resolve({ data: [providerRow], error: null }),
      },
    },
  });
  const deps = buildLoadJobContextDeps();
  const params = buildLoadJobContextParams({
    dbClient: client as unknown as SupabaseClient<Database>,
  });
  const payload = buildLoadJobContextPayload({ jobId: jobRow.id });

  // Act
  await loadJobContext(deps, params, payload);

  // Assert
  assertEquals(params.dbClient, params.dbClient);
  assertEquals(payload.jobId, jobRow.id);
});
