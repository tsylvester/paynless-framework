import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FileType } from '../../_shared/types/file_manager.types.ts';
import { buildCanonicalPathParams, invalidateCanonicalPathParams } from '../../_shared/services/file_manager.mock.ts';
import {
  isResolveContributionIdentityDeps,
  isResolveContributionIdentityParams,
  isResolveContributionIdentityPayload,
  isResolveContributionIdentitySuccessReturn,
  isResolveContributionIdentityErrorReturn,
  isResolveContributionIdentityDocumentKeyError,
  isResolveContributionIdentityProviderIdentifierError,
  isResolveContributionIdentityRelationshipsError,
  isResolveContributionIdentityContinuationCountError,
  isResolveContributionIdentityRawProviderResponseError,
  isResolveContributionIdentitySourceGroupError,
  isResolveContributionIdentityRecipeStepReadError,
  isDocumentKeyErrorParams,
  isProviderIdentifierErrorParams,
  isRelationshipsErrorParams,
  isContinuationCountErrorParams,
  isRawProviderResponseErrorParams,
  isSourceGroupErrorParams,
  isRecipeStepReadErrorParams,
} from './resolveContributionIdentity.guard.ts';
import {
  buildResolveContributionIdentityDeps,
  invalidateResolveContributionIdentityDeps,
  buildResolveContributionIdentityParams,
  invalidateResolveContributionIdentityParams,
  buildResolveContributionIdentityPayload,
  invalidateResolveContributionIdentityPayload,
  buildResolveContributionIdentitySuccessReturn,
  invalidateResolveContributionIdentitySuccessReturn,
  buildResolveContributionIdentityErrorReturn,
  invalidateResolveContributionIdentityErrorReturn,
  buildResolveContributionIdentityDocumentKeyError,
  buildDocumentKeyErrorParams,
  invalidateDocumentKeyErrorParams,
  buildResolveContributionIdentityProviderIdentifierError,
  buildProviderIdentifierErrorParams,
  invalidateProviderIdentifierErrorParams,
  buildResolveContributionIdentityRelationshipsError,
  buildRelationshipsErrorParams,
  invalidateRelationshipsErrorParams,
  buildResolveContributionIdentityContinuationCountError,
  buildContinuationCountErrorParams,
  invalidateContinuationCountErrorParams,
  buildResolveContributionIdentityRawProviderResponseError,
  buildRawProviderResponseErrorParams,
  invalidateRawProviderResponseErrorParams,
  buildResolveContributionIdentitySourceGroupError,
  buildSourceGroupErrorParams,
  invalidateSourceGroupErrorParams,
  buildResolveContributionIdentityRecipeStepReadError,
  buildRecipeStepReadErrorParams,
  invalidateRecipeStepReadErrorParams,
} from './resolveContributionIdentity.mock.ts';

// --- isResolveContributionIdentityDeps ---

Deno.test('Type Guard: isResolveContributionIdentityDeps', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isResolveContributionIdentityDeps(buildResolveContributionIdentityDeps()));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isResolveContributionIdentityDeps(null));
    assert(!isResolveContributionIdentityDeps(undefined));
    assert(!isResolveContributionIdentityDeps('a string'));
    assert(!isResolveContributionIdentityDeps([]));
  });

  /** Contract: case 4 — logger corrupted to a non-object is rejected. */
  await t.step('rejects logger non-object', () => {
    assert(!isResolveContributionIdentityDeps(invalidateResolveContributionIdentityDeps({ logger: 'not-object' })));
  });

  /** Contract: case 4 — logger corrupted to an object carrying no info method is rejected. */
  await t.step('rejects logger carrying no info', () => {
    assert(!isResolveContributionIdentityDeps(invalidateResolveContributionIdentityDeps({ logger: {} })));
  });

  /** Contract: case 5 — logger omitted (rest-destructured away) is rejected. */
  await t.step('rejects logger omitted', () => {
    const { logger: _omit, ...missing } = buildResolveContributionIdentityDeps();
    assert(!isResolveContributionIdentityDeps(missing));
  });
});

// --- isResolveContributionIdentityParams ---

Deno.test('Type Guard: isResolveContributionIdentityParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isResolveContributionIdentityParams(buildResolveContributionIdentityParams()));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isResolveContributionIdentityParams(null));
    assert(!isResolveContributionIdentityParams(undefined));
    assert(!isResolveContributionIdentityParams('a string'));
    assert(!isResolveContributionIdentityParams([]));
  });

  /** Contract: case 4 — dbClient corrupted to a string is rejected. */
  await t.step('rejects dbClient a string', () => {
    assert(!isResolveContributionIdentityParams(invalidateResolveContributionIdentityParams({ dbClient: 'not-a-client' })));
  });

  /** Contract: case 4 — job corrupted to a value failing its owner's guard is rejected. */
  await t.step('rejects job failing its owner guard', () => {
    assert(!isResolveContributionIdentityParams(invalidateResolveContributionIdentityParams({ job: 'not-a-job' })));
  });

  /** Contract: case 4 — providerRow corrupted to a value failing its owner's guard is rejected. */
  await t.step('rejects providerRow failing its owner guard', () => {
    assert(!isResolveContributionIdentityParams(invalidateResolveContributionIdentityParams({ providerRow: 'not-a-provider' })));
  });

  /** Contract: case 4 — aiResponse corrupted to a non-record is rejected. */
  await t.step('rejects aiResponse a non-record', () => {
    assert(!isResolveContributionIdentityParams(invalidateResolveContributionIdentityParams({ aiResponse: 'not-a-record' })));
  });

  /** Contract: case 5 — dbClient omitted (rest-destructured away) is rejected. */
  await t.step('rejects dbClient omitted', () => {
    const { dbClient: _omit, ...missing } = buildResolveContributionIdentityParams();
    assert(!isResolveContributionIdentityParams(missing));
  });

  /** Contract: case 5 — job omitted (rest-destructured away) is rejected. */
  await t.step('rejects job omitted', () => {
    const { job: _omit, ...missing } = buildResolveContributionIdentityParams();
    assert(!isResolveContributionIdentityParams(missing));
  });

  /** Contract: case 5 — providerRow omitted (rest-destructured away) is rejected. */
  await t.step('rejects providerRow omitted', () => {
    const { providerRow: _omit, ...missing } = buildResolveContributionIdentityParams();
    assert(!isResolveContributionIdentityParams(missing));
  });

  /** Contract: case 5 — aiResponse omitted (rest-destructured away) is rejected. */
  await t.step('rejects aiResponse omitted', () => {
    const { aiResponse: _omit, ...missing } = buildResolveContributionIdentityParams();
    assert(!isResolveContributionIdentityParams(missing));
  });
});

// --- isResolveContributionIdentityPayload ---

Deno.test('Type Guard: isResolveContributionIdentityPayload', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isResolveContributionIdentityPayload(buildResolveContributionIdentityPayload()));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isResolveContributionIdentityPayload(null));
    assert(!isResolveContributionIdentityPayload(undefined));
    assert(!isResolveContributionIdentityPayload('a string'));
    assert(!isResolveContributionIdentityPayload([]));
  });

  /** Contract: case 4 — prompt_template_id corrupted is rejected. */
  await t.step('rejects prompt_template_id corrupted', () => {
    assert(!isResolveContributionIdentityPayload(invalidateResolveContributionIdentityPayload({ prompt_template_id: 123 })));
  });

  /** Contract: case 4 — output_type corrupted is rejected. */
  await t.step('rejects output_type corrupted', () => {
    assert(!isResolveContributionIdentityPayload(invalidateResolveContributionIdentityPayload({ output_type: 123 })));
  });

  /** Contract: case 4 — canonicalPathParams corrupted to a non-object is rejected. */
  await t.step('rejects canonicalPathParams corrupted', () => {
    assert(!isResolveContributionIdentityPayload(invalidateResolveContributionIdentityPayload({ canonicalPathParams: 'not-an-object' })));
  });

  /** Contract: case 4 — inputs corrupted is rejected. */
  await t.step('rejects inputs corrupted', () => {
    assert(!isResolveContributionIdentityPayload(invalidateResolveContributionIdentityPayload({ inputs: 'not-an-object' })));
  });

  /** Contract: case 4 — canonicalPathParams set to invalidateCanonicalPathParams({ stageSlug: 42 }) is rejected, proving the guard checks the member the arm guard checks only as a record. */
  await t.step('rejects canonicalPathParams with stageSlug corrupted', () => {
    assert(!isResolveContributionIdentityPayload(invalidateResolveContributionIdentityPayload({ canonicalPathParams: invalidateCanonicalPathParams({ stageSlug: 42 }) })));
  });

  /** Contract: case 4 — canonicalPathParams whose contributionType is absent is rejected, proving the guard checks the member rather than the key's presence alone. */
  await t.step('rejects canonicalPathParams with contributionType absent', () => {
    const { contributionType: _omit, ...badCanonical } = buildCanonicalPathParams();
    assert(!isResolveContributionIdentityPayload(invalidateResolveContributionIdentityPayload({ canonicalPathParams: badCanonical })));
  });
});

// --- isResolveContributionIdentitySuccessReturn ---

Deno.test('Type Guard: isResolveContributionIdentitySuccessReturn', async (t) => {
  /** Contract: case 1 — the builder's valid default (neither optional present) is accepted. */
  await t.step('accepts the builder default with neither optional', () => {
    assert(isResolveContributionIdentitySuccessReturn(buildResolveContributionIdentitySuccessReturn()));
  });

  /** Contract: case 2 — a return carrying both optional members is accepted. */
  await t.step('accepts both optional members present', () => {
    assert(isResolveContributionIdentitySuccessReturn(buildResolveContributionIdentitySuccessReturn({ sourceGroupFragment: 'frag', targetContributionId: 'contrib-1' })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isResolveContributionIdentitySuccessReturn(null));
    assert(!isResolveContributionIdentitySuccessReturn(undefined));
    assert(!isResolveContributionIdentitySuccessReturn('a string'));
    assert(!isResolveContributionIdentitySuccessReturn([]));
  });

  /** Contract: case 4 — restOfCanonicalPathParams failing isCanonicalPathParams is rejected. */
  await t.step('rejects restOfCanonicalPathParams failing isCanonicalPathParams', () => {
    assert(!isResolveContributionIdentitySuccessReturn(invalidateResolveContributionIdentitySuccessReturn({ restOfCanonicalPathParams: invalidateCanonicalPathParams({ stageSlug: 42 }) })));
  });

  /** Contract: case 4 — storageFileType set to a FileType outside ModelContributionFileTypes is rejected. */
  await t.step('rejects storageFileType outside ModelContributionFileTypes', () => {
    assert(!isResolveContributionIdentitySuccessReturn(invalidateResolveContributionIdentitySuccessReturn({ storageFileType: FileType.ProjectReadme })));
  });

  /** Contract: case 4 — isContinuationForStorage corrupted to a non-boolean is rejected. */
  await t.step('rejects isContinuationForStorage corrupted', () => {
    assert(!isResolveContributionIdentitySuccessReturn(invalidateResolveContributionIdentitySuccessReturn({ isContinuationForStorage: 'not-a-boolean' })));
  });

  /** Contract: case 4 — description corrupted to a non-string is rejected. */
  await t.step('rejects description corrupted', () => {
    assert(!isResolveContributionIdentitySuccessReturn(invalidateResolveContributionIdentitySuccessReturn({ description: 123 })));
  });

  /** Contract: case 4 — sourceGroupFragment present but non-string is rejected. */
  await t.step('rejects sourceGroupFragment non-string', () => {
    assert(!isResolveContributionIdentitySuccessReturn(invalidateResolveContributionIdentitySuccessReturn({ sourceGroupFragment: 123 })));
  });

  /** Contract: case 4 — targetContributionId present but non-string is rejected. */
  await t.step('rejects targetContributionId non-string', () => {
    assert(!isResolveContributionIdentitySuccessReturn(invalidateResolveContributionIdentitySuccessReturn({ targetContributionId: 123 })));
  });

  /** Contract: case 4 — the error return is rejected, proving the two arms are mutually exclusive. */
  await t.step('rejects the error return', () => {
    assert(!isResolveContributionIdentitySuccessReturn(buildResolveContributionIdentityErrorReturn()));
  });

  /** Contract: case 5 — restOfCanonicalPathParams omitted (rest-destructured away) is rejected. */
  await t.step('rejects restOfCanonicalPathParams omitted', () => {
    const { restOfCanonicalPathParams: _omit, ...missing } = buildResolveContributionIdentitySuccessReturn();
    assert(!isResolveContributionIdentitySuccessReturn(missing));
  });

  /** Contract: case 5 — storageFileType omitted (rest-destructured away) is rejected. */
  await t.step('rejects storageFileType omitted', () => {
    const { storageFileType: _omit, ...missing } = buildResolveContributionIdentitySuccessReturn();
    assert(!isResolveContributionIdentitySuccessReturn(missing));
  });

  /** Contract: case 5 — isContinuationForStorage omitted (rest-destructured away) is rejected. */
  await t.step('rejects isContinuationForStorage omitted', () => {
    const { isContinuationForStorage: _omit, ...missing } = buildResolveContributionIdentitySuccessReturn();
    assert(!isResolveContributionIdentitySuccessReturn(missing));
  });

  /** Contract: case 5 — description omitted (rest-destructured away) is rejected. */
  await t.step('rejects description omitted', () => {
    const { description: _omit, ...missing } = buildResolveContributionIdentitySuccessReturn();
    assert(!isResolveContributionIdentitySuccessReturn(missing));
  });
});

// --- isResolveContributionIdentityErrorReturn ---

Deno.test('Type Guard: isResolveContributionIdentityErrorReturn', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isResolveContributionIdentityErrorReturn(buildResolveContributionIdentityErrorReturn()));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isResolveContributionIdentityErrorReturn(null));
    assert(!isResolveContributionIdentityErrorReturn(undefined));
    assert(!isResolveContributionIdentityErrorReturn('a string'));
    assert(!isResolveContributionIdentityErrorReturn([]));
  });

  /** Contract: case 4 — error corrupted to a plain object is rejected. */
  await t.step('rejects error a plain object', () => {
    assert(!isResolveContributionIdentityErrorReturn(invalidateResolveContributionIdentityErrorReturn({ error: {} })));
  });

  /** Contract: case 4 — error corrupted to a string is rejected. */
  await t.step('rejects error a string', () => {
    assert(!isResolveContributionIdentityErrorReturn(invalidateResolveContributionIdentityErrorReturn({ error: 'not-an-error' })));
  });

  /** Contract: case 4 — retriable corrupted to a non-boolean is rejected. */
  await t.step('rejects retriable non-boolean', () => {
    assert(!isResolveContributionIdentityErrorReturn(invalidateResolveContributionIdentityErrorReturn({ retriable: 'not-a-boolean' })));
  });

  /** Contract: case 4 — the success return is rejected, proving the two arms are mutually exclusive. */
  await t.step('rejects the success return', () => {
    assert(!isResolveContributionIdentityErrorReturn(buildResolveContributionIdentitySuccessReturn()));
  });

  /** Contract: case 5 — error omitted (rest-destructured away) is rejected. */
  await t.step('rejects error omitted', () => {
    const { error: _omit, ...missing } = buildResolveContributionIdentityErrorReturn();
    assert(!isResolveContributionIdentityErrorReturn(missing));
  });

  /** Contract: case 5 — retriable omitted (rest-destructured away) is rejected. */
  await t.step('rejects retriable omitted', () => {
    const { retriable: _omit, ...missing } = buildResolveContributionIdentityErrorReturn();
    assert(!isResolveContributionIdentityErrorReturn(missing));
  });
});

// --- Owned error instanceof guards ---

Deno.test('Type Guard: isResolveContributionIdentityDocumentKeyError', async (t) => {
  /** Contract: accepts its own builder's instance. */
  await t.step('accepts its own builder instance', () => {
    assert(isResolveContributionIdentityDocumentKeyError(buildResolveContributionIdentityDocumentKeyError()));
  });

  /** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
  await t.step('rejects non-instances', () => {
    assert(!isResolveContributionIdentityDocumentKeyError(new Error('test')));
    assert(!isResolveContributionIdentityDocumentKeyError({ jobId: 'job-1' }));
    assert(!isResolveContributionIdentityDocumentKeyError(buildResolveContributionIdentityProviderIdentifierError()));
    assert(!isResolveContributionIdentityDocumentKeyError(null));
    assert(!isResolveContributionIdentityDocumentKeyError('a string'));
  });
});

Deno.test('Type Guard: isResolveContributionIdentityProviderIdentifierError', async (t) => {
  /** Contract: accepts its own builder's instance. */
  await t.step('accepts its own builder instance', () => {
    assert(isResolveContributionIdentityProviderIdentifierError(buildResolveContributionIdentityProviderIdentifierError()));
  });

  /** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
  await t.step('rejects non-instances', () => {
    assert(!isResolveContributionIdentityProviderIdentifierError(new Error('test')));
    assert(!isResolveContributionIdentityProviderIdentifierError({ jobId: 'job-1', providerId: 'model-def' }));
    assert(!isResolveContributionIdentityProviderIdentifierError(buildResolveContributionIdentityRelationshipsError()));
    assert(!isResolveContributionIdentityProviderIdentifierError(null));
    assert(!isResolveContributionIdentityProviderIdentifierError('a string'));
  });
});

Deno.test('Type Guard: isResolveContributionIdentityRelationshipsError', async (t) => {
  /** Contract: accepts its own builder's instance. */
  await t.step('accepts its own builder instance', () => {
    assert(isResolveContributionIdentityRelationshipsError(buildResolveContributionIdentityRelationshipsError()));
  });

  /** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
  await t.step('rejects non-instances', () => {
    assert(!isResolveContributionIdentityRelationshipsError(new Error('test')));
    assert(!isResolveContributionIdentityRelationshipsError({ jobId: 'job-1', targetContributionId: 'contrib-1' }));
    assert(!isResolveContributionIdentityRelationshipsError(buildResolveContributionIdentityContinuationCountError()));
    assert(!isResolveContributionIdentityRelationshipsError(null));
    assert(!isResolveContributionIdentityRelationshipsError('a string'));
  });
});

Deno.test('Type Guard: isResolveContributionIdentityContinuationCountError', async (t) => {
  /** Contract: accepts its own builder's instance. */
  await t.step('accepts its own builder instance', () => {
    assert(isResolveContributionIdentityContinuationCountError(buildResolveContributionIdentityContinuationCountError()));
  });

  /** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
  await t.step('rejects non-instances', () => {
    assert(!isResolveContributionIdentityContinuationCountError(new Error('test')));
    assert(!isResolveContributionIdentityContinuationCountError({ jobId: 'job-1', targetContributionId: 'contrib-1' }));
    assert(!isResolveContributionIdentityContinuationCountError(buildResolveContributionIdentityRawProviderResponseError()));
    assert(!isResolveContributionIdentityContinuationCountError(null));
    assert(!isResolveContributionIdentityContinuationCountError('a string'));
  });
});

Deno.test('Type Guard: isResolveContributionIdentityRawProviderResponseError', async (t) => {
  /** Contract: accepts its own builder's instance. */
  await t.step('accepts its own builder instance', () => {
    assert(isResolveContributionIdentityRawProviderResponseError(buildResolveContributionIdentityRawProviderResponseError()));
  });

  /** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
  await t.step('rejects non-instances', () => {
    assert(!isResolveContributionIdentityRawProviderResponseError(new Error('test')));
    assert(!isResolveContributionIdentityRawProviderResponseError({ jobId: 'job-1' }));
    assert(!isResolveContributionIdentityRawProviderResponseError(buildResolveContributionIdentitySourceGroupError()));
    assert(!isResolveContributionIdentityRawProviderResponseError(null));
    assert(!isResolveContributionIdentityRawProviderResponseError('a string'));
  });
});

Deno.test('Type Guard: isResolveContributionIdentitySourceGroupError', async (t) => {
  /** Contract: accepts its own builder's instance. */
  await t.step('accepts its own builder instance', () => {
    assert(isResolveContributionIdentitySourceGroupError(buildResolveContributionIdentitySourceGroupError()));
  });

  /** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
  await t.step('rejects non-instances', () => {
    assert(!isResolveContributionIdentitySourceGroupError(new Error('test')));
    assert(!isResolveContributionIdentitySourceGroupError({ jobId: 'job-1', outputType: FileType.ModelContributionRawJson }));
    assert(!isResolveContributionIdentitySourceGroupError(buildResolveContributionIdentityRecipeStepReadError()));
    assert(!isResolveContributionIdentitySourceGroupError(null));
    assert(!isResolveContributionIdentitySourceGroupError('a string'));
  });
});

Deno.test('Type Guard: isResolveContributionIdentityRecipeStepReadError', async (t) => {
  /** Contract: accepts its own builder's instance. */
  await t.step('accepts its own builder instance', () => {
    assert(isResolveContributionIdentityRecipeStepReadError(buildResolveContributionIdentityRecipeStepReadError()));
  });

  /** Contract: rejects a plain Error, a plain object carrying the same members, another owned error, null, and a primitive. */
  await t.step('rejects non-instances', () => {
    assert(!isResolveContributionIdentityRecipeStepReadError(new Error('test')));
    assert(!isResolveContributionIdentityRecipeStepReadError({ recipeStepId: 'recipe-step-1', table: 'dialectic_stage_recipe_steps', driverMessage: 'row not found' }));
    assert(!isResolveContributionIdentityRecipeStepReadError(buildResolveContributionIdentityDocumentKeyError()));
    assert(!isResolveContributionIdentityRecipeStepReadError(null));
    assert(!isResolveContributionIdentityRecipeStepReadError('a string'));
  });
});

// --- Constructor-params guards (infill: the node's guard element omits these; guards.md requires them) ---

Deno.test('Type Guard: isDocumentKeyErrorParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isDocumentKeyErrorParams(buildDocumentKeyErrorParams()));
  });

  /** Contract: case 2 — valid overrides are accepted. */
  await t.step('accepts valid overrides', () => {
    assert(isDocumentKeyErrorParams(buildDocumentKeyErrorParams({ jobId: 'different-job' })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isDocumentKeyErrorParams(null));
    assert(!isDocumentKeyErrorParams(undefined));
    assert(!isDocumentKeyErrorParams('a string'));
    assert(!isDocumentKeyErrorParams([]));
  });

  /** Contract: case 4 — jobId corrupted is rejected. */
  await t.step('rejects jobId corrupted', () => {
    assert(!isDocumentKeyErrorParams(invalidateDocumentKeyErrorParams({ jobId: 123 })));
  });

  /** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
  await t.step('rejects jobId omitted', () => {
    const { jobId: _omit, ...missing } = buildDocumentKeyErrorParams();
    assert(!isDocumentKeyErrorParams(missing));
  });
});

Deno.test('Type Guard: isProviderIdentifierErrorParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isProviderIdentifierErrorParams(buildProviderIdentifierErrorParams()));
  });

  /** Contract: case 2 — valid overrides are accepted. */
  await t.step('accepts valid overrides', () => {
    assert(isProviderIdentifierErrorParams(buildProviderIdentifierErrorParams({ jobId: 'different-job', providerId: 'different-provider' })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isProviderIdentifierErrorParams(null));
    assert(!isProviderIdentifierErrorParams(undefined));
    assert(!isProviderIdentifierErrorParams('a string'));
    assert(!isProviderIdentifierErrorParams([]));
  });

  /** Contract: case 4 — jobId corrupted is rejected. */
  await t.step('rejects jobId corrupted', () => {
    assert(!isProviderIdentifierErrorParams(invalidateProviderIdentifierErrorParams({ jobId: 123 })));
  });

  /** Contract: case 4 — providerId corrupted is rejected. */
  await t.step('rejects providerId corrupted', () => {
    assert(!isProviderIdentifierErrorParams(invalidateProviderIdentifierErrorParams({ providerId: 123 })));
  });

  /** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
  await t.step('rejects jobId omitted', () => {
    const { jobId: _omit, ...missing } = buildProviderIdentifierErrorParams();
    assert(!isProviderIdentifierErrorParams(missing));
  });

  /** Contract: case 5 — providerId omitted (rest-destructured away) is rejected. */
  await t.step('rejects providerId omitted', () => {
    const { providerId: _omit, ...missing } = buildProviderIdentifierErrorParams();
    assert(!isProviderIdentifierErrorParams(missing));
  });
});

Deno.test('Type Guard: isRelationshipsErrorParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isRelationshipsErrorParams(buildRelationshipsErrorParams()));
  });

  /** Contract: case 2 — valid overrides are accepted. */
  await t.step('accepts valid overrides', () => {
    assert(isRelationshipsErrorParams(buildRelationshipsErrorParams({ jobId: 'different-job', targetContributionId: 'different-contrib' })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isRelationshipsErrorParams(null));
    assert(!isRelationshipsErrorParams(undefined));
    assert(!isRelationshipsErrorParams('a string'));
    assert(!isRelationshipsErrorParams([]));
  });

  /** Contract: case 4 — jobId corrupted is rejected. */
  await t.step('rejects jobId corrupted', () => {
    assert(!isRelationshipsErrorParams(invalidateRelationshipsErrorParams({ jobId: 123 })));
  });

  /** Contract: case 4 — targetContributionId corrupted is rejected. */
  await t.step('rejects targetContributionId corrupted', () => {
    assert(!isRelationshipsErrorParams(invalidateRelationshipsErrorParams({ targetContributionId: 123 })));
  });

  /** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
  await t.step('rejects jobId omitted', () => {
    const { jobId: _omit, ...missing } = buildRelationshipsErrorParams();
    assert(!isRelationshipsErrorParams(missing));
  });

  /** Contract: case 5 — targetContributionId omitted (rest-destructured away) is rejected. */
  await t.step('rejects targetContributionId omitted', () => {
    const { targetContributionId: _omit, ...missing } = buildRelationshipsErrorParams();
    assert(!isRelationshipsErrorParams(missing));
  });
});

Deno.test('Type Guard: isContinuationCountErrorParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isContinuationCountErrorParams(buildContinuationCountErrorParams()));
  });

  /** Contract: case 2 — valid overrides are accepted. */
  await t.step('accepts valid overrides', () => {
    assert(isContinuationCountErrorParams(buildContinuationCountErrorParams({ jobId: 'different-job', targetContributionId: 'different-contrib' })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isContinuationCountErrorParams(null));
    assert(!isContinuationCountErrorParams(undefined));
    assert(!isContinuationCountErrorParams('a string'));
    assert(!isContinuationCountErrorParams([]));
  });

  /** Contract: case 4 — jobId corrupted is rejected. */
  await t.step('rejects jobId corrupted', () => {
    assert(!isContinuationCountErrorParams(invalidateContinuationCountErrorParams({ jobId: 123 })));
  });

  /** Contract: case 4 — targetContributionId corrupted is rejected. */
  await t.step('rejects targetContributionId corrupted', () => {
    assert(!isContinuationCountErrorParams(invalidateContinuationCountErrorParams({ targetContributionId: 123 })));
  });

  /** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
  await t.step('rejects jobId omitted', () => {
    const { jobId: _omit, ...missing } = buildContinuationCountErrorParams();
    assert(!isContinuationCountErrorParams(missing));
  });

  /** Contract: case 5 — targetContributionId omitted (rest-destructured away) is rejected. */
  await t.step('rejects targetContributionId omitted', () => {
    const { targetContributionId: _omit, ...missing } = buildContinuationCountErrorParams();
    assert(!isContinuationCountErrorParams(missing));
  });
});

Deno.test('Type Guard: isRawProviderResponseErrorParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isRawProviderResponseErrorParams(buildRawProviderResponseErrorParams()));
  });

  /** Contract: case 2 — valid overrides are accepted. */
  await t.step('accepts valid overrides', () => {
    assert(isRawProviderResponseErrorParams(buildRawProviderResponseErrorParams({ jobId: 'different-job' })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isRawProviderResponseErrorParams(null));
    assert(!isRawProviderResponseErrorParams(undefined));
    assert(!isRawProviderResponseErrorParams('a string'));
    assert(!isRawProviderResponseErrorParams([]));
  });

  /** Contract: case 4 — jobId corrupted is rejected. */
  await t.step('rejects jobId corrupted', () => {
    assert(!isRawProviderResponseErrorParams(invalidateRawProviderResponseErrorParams({ jobId: 123 })));
  });

  /** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
  await t.step('rejects jobId omitted', () => {
    const { jobId: _omit, ...missing } = buildRawProviderResponseErrorParams();
    assert(!isRawProviderResponseErrorParams(missing));
  });
});

Deno.test('Type Guard: isSourceGroupErrorParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isSourceGroupErrorParams(buildSourceGroupErrorParams()));
  });

  /** Contract: case 2 — valid overrides are accepted. */
  await t.step('accepts valid overrides', () => {
    assert(isSourceGroupErrorParams(buildSourceGroupErrorParams({ jobId: 'different-job', outputType: FileType.business_case })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isSourceGroupErrorParams(null));
    assert(!isSourceGroupErrorParams(undefined));
    assert(!isSourceGroupErrorParams('a string'));
    assert(!isSourceGroupErrorParams([]));
  });

  /** Contract: case 4 — jobId corrupted is rejected. */
  await t.step('rejects jobId corrupted', () => {
    assert(!isSourceGroupErrorParams(invalidateSourceGroupErrorParams({ jobId: 123 })));
  });

  /** Contract: case 4 — outputType corrupted is rejected. */
  await t.step('rejects outputType corrupted', () => {
    assert(!isSourceGroupErrorParams(invalidateSourceGroupErrorParams({ outputType: 123 })));
  });

  /** Contract: case 5 — jobId omitted (rest-destructured away) is rejected. */
  await t.step('rejects jobId omitted', () => {
    const { jobId: _omit, ...missing } = buildSourceGroupErrorParams();
    assert(!isSourceGroupErrorParams(missing));
  });

  /** Contract: case 5 — outputType omitted (rest-destructured away) is rejected. */
  await t.step('rejects outputType omitted', () => {
    const { outputType: _omit, ...missing } = buildSourceGroupErrorParams();
    assert(!isSourceGroupErrorParams(missing));
  });
});

Deno.test('Type Guard: isRecipeStepReadErrorParams', async (t) => {
  /** Contract: case 1 — the builder's valid default is accepted. */
  await t.step('accepts the builder default', () => {
    assert(isRecipeStepReadErrorParams(buildRecipeStepReadErrorParams()));
  });

  /** Contract: case 2 — valid overrides are accepted. */
  await t.step('accepts valid overrides', () => {
    assert(isRecipeStepReadErrorParams(buildRecipeStepReadErrorParams({ recipeStepId: 'different-step', table: 'dialectic_recipe_template_steps', driverMessage: 'different message' })));
  });

  /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
  await t.step('rejects non-objects', () => {
    assert(!isRecipeStepReadErrorParams(null));
    assert(!isRecipeStepReadErrorParams(undefined));
    assert(!isRecipeStepReadErrorParams('a string'));
    assert(!isRecipeStepReadErrorParams([]));
  });

  /** Contract: case 4 — recipeStepId corrupted is rejected. */
  await t.step('rejects recipeStepId corrupted', () => {
    assert(!isRecipeStepReadErrorParams(invalidateRecipeStepReadErrorParams({ recipeStepId: 123 })));
  });

  /** Contract: case 4 — table corrupted is rejected. */
  await t.step('rejects table corrupted', () => {
    assert(!isRecipeStepReadErrorParams(invalidateRecipeStepReadErrorParams({ table: 123 })));
  });

  /** Contract: case 4 — driverMessage corrupted is rejected. */
  await t.step('rejects driverMessage corrupted', () => {
    assert(!isRecipeStepReadErrorParams(invalidateRecipeStepReadErrorParams({ driverMessage: 123 })));
  });

  /** Contract: case 5 — recipeStepId omitted (rest-destructured away) is rejected. */
  await t.step('rejects recipeStepId omitted', () => {
    const { recipeStepId: _omit, ...missing } = buildRecipeStepReadErrorParams();
    assert(!isRecipeStepReadErrorParams(missing));
  });

  /** Contract: case 5 — table omitted (rest-destructured away) is rejected. */
  await t.step('rejects table omitted', () => {
    const { table: _omit, ...missing } = buildRecipeStepReadErrorParams();
    assert(!isRecipeStepReadErrorParams(missing));
  });

  /** Contract: case 5 — driverMessage omitted (rest-destructured away) is rejected. */
  await t.step('rejects driverMessage omitted', () => {
    const { driverMessage: _omit, ...missing } = buildRecipeStepReadErrorParams();
    assert(!isRecipeStepReadErrorParams(missing));
  });
});
