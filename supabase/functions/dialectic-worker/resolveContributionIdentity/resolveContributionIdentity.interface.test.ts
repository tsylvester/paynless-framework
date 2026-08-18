import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import type { DialecticExecuteJobPayload } from "../../dialectic-service/dialectic.interface.ts";
import type {
  ResolveContributionIdentityDeps,
  ResolveContributionIdentityParams,
  ResolveContributionIdentityPayload,
  ResolveContributionIdentitySuccessReturn,
  ResolveContributionIdentityErrorReturn,
  ResolveContributionIdentityReturn,
  ResolveContributionIdentityFn,
  DocumentKeyErrorParams,
  ProviderIdentifierErrorParams,
  RelationshipsErrorParams,
  ContinuationCountErrorParams,
  RawProviderResponseErrorParams,
  SourceGroupErrorParams,
  RecipeStepReadErrorParams,
} from "./resolveContributionIdentity.interface.ts";

// --- ResolveContributionIdentityDeps ---

/** Contract: ResolveContributionIdentityDeps' required key surface is exactly logger — the one collaborator the branch contract invokes. */
Deno.test("ResolveContributionIdentityDeps has the required surface", () => {
  const surface: Record<keyof ResolveContributionIdentityDeps, true> = {
    logger: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

// --- ResolveContributionIdentityParams ---

/** Contract: ResolveContributionIdentityParams' required key surface is exactly dbClient, job, providerRow and aiResponse — aiResponse present because the rawProviderResponse precondition is preserved at its position in this region. */
Deno.test("ResolveContributionIdentityParams has the required surface", () => {
  const surface: Record<keyof ResolveContributionIdentityParams, true> = {
    dbClient: true,
    job: true,
    providerRow: true,
    aiResponse: true,
  };
  assertEquals(Object.keys(surface).length, 4);
});

// --- ResolveContributionIdentityPayload — equivalence to DialecticExecuteJobPayload ---

/** Contract: ResolveContributionIdentityPayload and DialecticExecuteJobPayload are assignable in both directions — an owned literal annotated as ResolveContributionIdentityPayload round-trips through a DialecticExecuteJobPayload binding and back, proving equivalence rather than a one-way widening. */
Deno.test("ResolveContributionIdentityPayload is equivalent to DialecticExecuteJobPayload in both directions", () => {
  const payload: ResolveContributionIdentityPayload = {
    prompt_template_id: "test-prompt",
    inputs: {},
    output_type: FileType.HeaderContext,
    document_key: FileType.HeaderContext,
    projectId: "project-abc",
    sessionId: "session-456",
    stageSlug: "thesis",
    model_id: "model-def",
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: "wallet-ghi",
    user_jwt: "jwt.token.here",
    canonicalPathParams: {
      contributionType: "thesis",
      stageSlug: DialecticStageSlug.Thesis,
    },
    idempotencyKey: "job-id-123_render",
  };
  const asImported: DialecticExecuteJobPayload = payload;
  const asOwned: ResolveContributionIdentityPayload = asImported;
  assertEquals(asOwned, payload);
});

// --- ResolveContributionIdentitySuccessReturn ---

/** Contract: ResolveContributionIdentitySuccessReturn's required key surface is exactly restOfCanonicalPathParams, storageFileType, isContinuationForStorage and description — a literal carrying only these four compiles, proving sourceGroupFragment and targetContributionId are optional and omittable. */
Deno.test("ResolveContributionIdentitySuccessReturn requires exactly four members, optionals omittable", () => {
  const success: ResolveContributionIdentitySuccessReturn = {
    restOfCanonicalPathParams: {
      contributionType: "thesis",
      stageSlug: DialecticStageSlug.Thesis,
    },
    storageFileType: FileType.ModelContributionRawJson,
    isContinuationForStorage: false,
    description: "test",
  };
  assertEquals(Object.keys(success).length, 4);
});

/** Contract: ResolveContributionIdentitySuccessReturn admits sourceGroupFragment and targetContributionId when present — a literal carrying both compiles with six own keys, proving they are optional rather than excluded. */
Deno.test("ResolveContributionIdentitySuccessReturn admits both optional members", () => {
  const success: ResolveContributionIdentitySuccessReturn = {
    restOfCanonicalPathParams: {
      contributionType: "thesis",
      stageSlug: DialecticStageSlug.Thesis,
    },
    storageFileType: FileType.ModelContributionRawJson,
    isContinuationForStorage: false,
    description: "test",
    sourceGroupFragment: "fragment",
    targetContributionId: "contrib-1",
  };
  assertEquals(Object.keys(success).length, 6);
});

/** Contract: ResolveContributionIdentitySuccessReturn's storageFileType admits FileType.ModelContributionRawJson, the enum member the document case selects. */
Deno.test("ResolveContributionIdentitySuccessReturn's storageFileType admits FileType.ModelContributionRawJson", () => {
  const fileType: ResolveContributionIdentitySuccessReturn["storageFileType"] =
    FileType.ModelContributionRawJson;
  assert(fileType === FileType.ModelContributionRawJson);
});

/** Contract: restOfCanonicalPathParams carries the whole CanonicalPathParams required surface — a literal with only contributionType and stageSlug compiles, proving no required member of that type was dropped on the way through. */
Deno.test("restOfCanonicalPathParams carries the whole CanonicalPathParams required surface", () => {
  const minimal: ResolveContributionIdentitySuccessReturn["restOfCanonicalPathParams"] = {
    contributionType: "thesis",
    stageSlug: DialecticStageSlug.Thesis,
  };
  assertEquals(Object.keys(minimal).length, 2);
});

// --- ResolveContributionIdentityErrorReturn ---

/** Contract: ResolveContributionIdentityErrorReturn's required key surface is exactly error and retriable. */
Deno.test("ResolveContributionIdentityErrorReturn has the required surface", () => {
  const surface: Record<keyof ResolveContributionIdentityErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

// --- ResolveContributionIdentityReturn — exactly two arms ---

/** Contract: ResolveContributionIdentitySuccessReturn is a member of ResolveContributionIdentityReturn, proving the union has a success arm. */
Deno.test("ResolveContributionIdentitySuccessReturn is a member of ResolveContributionIdentityReturn", () => {
  const success: ResolveContributionIdentitySuccessReturn = {
    restOfCanonicalPathParams: {
      contributionType: "thesis",
      stageSlug: DialecticStageSlug.Thesis,
    },
    storageFileType: FileType.ModelContributionRawJson,
    isContinuationForStorage: false,
    description: "test",
  };
  const result: ResolveContributionIdentityReturn = success;
  assertEquals(result, success);
});

/** Contract: ResolveContributionIdentityErrorReturn is a member of ResolveContributionIdentityReturn, proving the union has exactly the two arms. */
Deno.test("ResolveContributionIdentityErrorReturn is a member of ResolveContributionIdentityReturn", () => {
  const errorReturn: ResolveContributionIdentityErrorReturn = {
    error: new Error("test"),
    retriable: false,
  };
  const result: ResolveContributionIdentityReturn = errorReturn;
  assertEquals(result, errorReturn);
});

// --- ResolveContributionIdentityFn — asynchronous signature ---

/** Contract: ResolveContributionIdentityFn's declared Promise return admits its success arm, proving the signature is asynchronous. */
Deno.test("ResolveContributionIdentityFn resolves to its declared success type", () => {
  const success: ResolveContributionIdentitySuccessReturn = {
    restOfCanonicalPathParams: {
      contributionType: "thesis",
      stageSlug: DialecticStageSlug.Thesis,
    },
    storageFileType: FileType.ModelContributionRawJson,
    isContinuationForStorage: false,
    description: "test",
  };
  const returned: ReturnType<ResolveContributionIdentityFn> = Promise.resolve(success);
  const declared: Promise<ResolveContributionIdentityReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: ResolveContributionIdentityFn's declared Promise return admits its error arm, proving the signature is asynchronous. */
Deno.test("ResolveContributionIdentityFn resolves to its declared error type", () => {
  const errorReturn: ResolveContributionIdentityErrorReturn = {
    error: new Error("test"),
    retriable: false,
  };
  const returned: ReturnType<ResolveContributionIdentityFn> = Promise.resolve(errorReturn);
  const declared: Promise<ResolveContributionIdentityReturn> = returned;
  assert(declared instanceof Promise);
});

// --- Owned error constructor-params surfaces ---

/** Contract: DocumentKeyErrorParams' required key surface is exactly jobId. */
Deno.test("DocumentKeyErrorParams has the required surface", () => {
  const surface: Record<
    keyof DocumentKeyErrorParams,
    true
  > = {
    jobId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: ProviderIdentifierErrorParams' required key surface is exactly jobId and providerId. */
Deno.test("ProviderIdentifierErrorParams has the required surface", () => {
  const surface: Record<
    keyof ProviderIdentifierErrorParams,
    true
  > = {
    jobId: true,
    providerId: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RelationshipsErrorParams' required key surface is exactly jobId and targetContributionId. */
Deno.test("RelationshipsErrorParams has the required surface", () => {
  const surface: Record<
    keyof RelationshipsErrorParams,
    true
  > = {
    jobId: true,
    targetContributionId: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: ContinuationCountErrorParams' required key surface is exactly jobId and targetContributionId. */
Deno.test("ContinuationCountErrorParams has the required surface", () => {
  const surface: Record<
    keyof ContinuationCountErrorParams,
    true
  > = {
    jobId: true,
    targetContributionId: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RawProviderResponseErrorParams' required key surface is exactly jobId. */
Deno.test("RawProviderResponseErrorParams has the required surface", () => {
  const surface: Record<
    keyof RawProviderResponseErrorParams,
    true
  > = {
    jobId: true,
  };
  assertEquals(Object.keys(surface).length, 1);
});

/** Contract: SourceGroupErrorParams' required key surface is exactly jobId and outputType. */
Deno.test("SourceGroupErrorParams has the required surface", () => {
  const surface: Record<
    keyof SourceGroupErrorParams,
    true
  > = {
    jobId: true,
    outputType: true,
  };
  assertEquals(Object.keys(surface).length, 2);
});

/** Contract: RecipeStepReadErrorParams' required key surface is exactly recipeStepId, table and driverMessage. */
Deno.test("RecipeStepReadErrorParams has the required surface", () => {
  const surface: Record<
    keyof RecipeStepReadErrorParams,
    true
  > = {
    recipeStepId: true,
    table: true,
    driverMessage: true,
  };
  assertEquals(Object.keys(surface).length, 3);
});
