// supabase/functions/dialectic-worker/task_isolator.test.ts
import {
    describe,
    it,
    beforeEach,
} from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import {
    assert,
    assertEquals,
    assertRejects,
    assertExists,
} from 'jsr:@std/assert@0.225.3';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    DialecticContributionRow,
    DialecticExecuteJobPayload,
    GranularityPlannerFn,
    GranularityStrategy,
    InputRule,
    SourceDocument,
    DialecticFeedbackRow,
    DialecticProjectResourceRow,
} from '../dialectic-service/dialectic.interface.ts';
import { ILogger } from '../_shared/types.ts';
import { IPlanJobContext } from './createJobContext/JobContext.interface.ts';
import { planComplexStage } from './task_isolator.ts';
import { findSourceDocuments } from './findSourceDocuments.ts';
import { createPlanJobContext } from './createJobContext/createJobContext.ts';
import { createMockRootContext } from './createJobContext/JobContext.mock.ts';
import {
    isDialecticPlanJobPayload,
    isDialecticExecuteJobPayload,
    isJson,
} from '../_shared/utils/type_guards.ts';
import {
    createMockSupabaseClient,
    MockQueryBuilderState,
    MockSupabaseDataConfig
} from '../_shared/supabase.mock.ts';
import { DialecticStageSlug, FileType } from '../_shared/types/file_manager.types.ts';
import { buildDialecticJobRow, buildDialecticPlanJobPayload, buildDialecticStageRecipeStep, buildDialecticExecuteJobPayload, buildSourceDocument, invalidateDialecticPlanJobPayload } from '../_shared/dialectic.mock.ts';
import type { DialecticPlanJobPayloadCorruptions } from '../_shared/dialectic.mock.ts';

describe('planComplexStage', () => {

    it('should throw if granularity_strategy is missing from the recipe step', async () => {
        // Purpose: Proves planComplexStage's upfront validation guard.
        // When recipeStep.granularity_strategy is falsy, the function throws before fetching
        // source documents or looking up a planner. This is planComplexStage's own logic — a
        // runtime boundary check against DB-sourced data that the compile-time type
        // (GranularityStrategy, non-optional) cannot guarantee at the actual data source.

        // Arrange:
        // 1. Build a valid parent job row and payload that pass the earlier gates
        //    (isPlannableStep, inputs_required non-empty, user_jwt, stageSlug).
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        const payload = buildDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(payload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }
        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 2. Build a recipe step with granularity_strategy set to null — a falsy value
        //    that the type system says cannot occur but a corrupt DB row could produce.
        //    The cast is the invalidator exception: invalid data claimed valid, proving
        //    the guard rejects it. inputs_required keeps the builder default (non-empty)
        //    so the inputs_required gate does not fire first. The isDialecticStageRecipeStep
        //    guard is deliberately NOT applied here — it would reject the invalid data
        //    before planComplexStage gets the chance to.
        const recipeStep = buildDialecticStageRecipeStep({
            granularity_strategy: null as unknown as GranularityStrategy,
            prompt_template_id: 'test-prompt-template-id',
        }) as DialecticRecipeStep;

        // 3. Provide a mock Supabase client and a trivial context. The guard fires
        //    before findSourceDocuments or getGranularityPlanner are reached, so no
        //    meaningful mock behavior is needed — just valid infrastructure.
        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext();
        const ctx = createPlanJobContext(rootCtx);

        // Act & Assert:
        // The call must reject with an Error naming granularity_strategy as required.
        await assertRejects(
            async () => {
                await planComplexStage(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    parentJob,
                    ctx,
                    recipeStep,
                    'test-auth-token',
                );
            },
            Error,
            'recipeStep.granularity_strategy is required',
            'should throw when granularity_strategy is falsy',
        );
    });

    it('should throw if inputs_required is missing from the recipe step', async () => {
        // Purpose: Proves planComplexStage's upfront validation guard for inputs_required.
        // When recipeStep.inputs_required is falsy (null/undefined), the function throws
        // before fetching source documents or looking up a planner. This is
        // planComplexStage's own logic — a runtime boundary check against DB-sourced data
        // that the compile-time type (InputRule[], non-optional) cannot guarantee at the
        // actual data source.

        // Arrange:
        // 1. Build a valid parent job row and payload that pass the isPlannableStep gate.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        const payload = buildDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(payload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }
        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 2. Build a recipe step with inputs_required set to null — a falsy value
        //    that the type system says cannot occur but a corrupt DB row could produce.
        //    The cast is the invalidator exception: invalid data claimed valid, proving
        //    the guard rejects it. granularity_strategy keeps the builder default so the
        //    granularity_strategy gate does not fire first. The isDialecticStageRecipeStep
        //    guard is deliberately NOT applied here — it would reject the invalid data
        //    before planComplexStage gets the chance to.
        const recipeStep = buildDialecticStageRecipeStep({
            inputs_required: null as unknown as InputRule[],
            prompt_template_id: 'test-prompt-template-id',
        }) as DialecticRecipeStep;

        // 3. Provide a mock Supabase client and a trivial context. The guard fires
        //    before findSourceDocuments or getGranularityPlanner are reached.
        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext();
        const ctx = createPlanJobContext(rootCtx);

        // Act & Assert:
        // The call must reject with an Error naming inputs_required as required.
        await assertRejects(
            async () => {
                await planComplexStage(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    parentJob,
                    ctx,
                    recipeStep,
                    'test-auth-token',
                );
            },
            Error,
            'recipeStep.inputs_required is required and cannot be empty',
            'should throw when inputs_required is falsy',
        );
    });

    it('should throw if inputs_required is an empty array', async () => {
        // Purpose: Proves planComplexStage's upfront validation guard for the empty-array
        // condition of inputs_required. When recipeStep.inputs_required is [], the function
        // throws before fetching source documents or looking up a planner. This is the
        // length === 0 branch of the same guard that rejects falsy inputs_required — a
        // distinct condition from the null/undefined case, proving the guard checks both.

        // Arrange:
        // 1. Build a valid parent job row and payload that pass the isPlannableStep gate.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        const payload = buildDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(payload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }
        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 2. Build a recipe step with inputs_required set to an empty array — a valid
        //    InputRule[] that the guard rejects on the empty-length condition. No cast
        //    is needed on the value; [] is a valid InputRule[]. granularity_strategy
        //    keeps the builder default so the granularity_strategy gate does not fire
        //    first.
        const recipeStep = buildDialecticStageRecipeStep({
            inputs_required: [],
            prompt_template_id: 'test-prompt-template-id',
        }) as DialecticRecipeStep;

        // 3. Provide a mock Supabase client and a trivial context. The guard fires
        //    before findSourceDocuments or getGranularityPlanner are reached.
        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext();
        const ctx = createPlanJobContext(rootCtx);

        // Act & Assert:
        // The call must reject with an Error naming inputs_required as required and non-empty.
        await assertRejects(
            async () => {
                await planComplexStage(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    parentJob,
                    ctx,
                    recipeStep,
                    'test-auth-token',
                );
            },
            Error,
            'recipeStep.inputs_required is required and cannot be empty',
            'should throw when inputs_required is an empty array',
        );
    });

    it('should correctly create child jobs for an "execute" planner creating an intermediate artifact', async () => {
        // Purpose: Proves planComplexStage preserves the isIntermediate flag through its
        // validation and row-construction pipeline. When a planner returns an EXECUTE
        // payload with isIntermediate: true, the function validates it (the execute guard
        // accepts a boolean isIntermediate), classifies it as EXECUTE, and stores it
        // verbatim on the child job row. planComplexStage neither sets nor strips
        // isIntermediate — it passes it through. The flag is consumed downstream by
        // saveResponse and continueJob, not by planComplexStage itself.

        // Arrange:
        // 1. Build a valid parent job row and payload that pass all validation gates
        //    (isPlannableStep, inputs_required non-empty, granularity_strategy present,
        //    prompt_template_id present, user_jwt present, stageSlug present).
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        const payload = buildDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(payload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }
        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 2. Build a valid recipe step that passes all upfront validations.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 3. Mock findSourceDocuments to return a non-empty array so the function
        //    does not early-exit at the empty-documents check.
        const sourceDoc = buildSourceDocument();
        const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

        // 4. Build an execute payload with isIntermediate: true and context fields
        //    matching the parent payload so the context-mismatch check passes.
        //    The builder does not include isIntermediate by default — setting it
        //    via override adds the key, which the guard validates on presence + type.
        const intermediatePayload = buildDialecticExecuteJobPayload({
            projectId: 'test-project-id',
            sessionId: 'test-session-id',
            stageSlug: 'test-stage',
            iterationNumber: 1,
            walletId: 'test-wallet-id',
            user_jwt: 'test-jwt-nonempty',
            isIntermediate: true,
        });

        const planner: GranularityPlannerFn = () => [intermediatePayload];

        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext({
            findSourceDocuments,
            getGranularityPlanner: () => planner,
        });
        const ctx = createPlanJobContext(rootCtx);

        // Act:
        // 1. Call planComplexStage.
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            ctx,
            recipeStep,
            'test-auth-token',
        );

        // Assert:
        // 1. Exactly one child job was created.
        assertEquals(childJobs.length, 1, 'expected exactly one child job');
        const childJob = childJobs[0];

        // 2. The job type is EXECUTE, not PLAN.
        assertEquals(childJob.job_type, 'EXECUTE', 'child job should be classified as EXECUTE');

        // 3. The payload is a valid DialecticExecuteJobPayload.
        assert(isDialecticExecuteJobPayload(childJob.payload), 'child payload should be a valid DialecticExecuteJobPayload');

        // 4. The isIntermediate flag is preserved through validation and row construction.
        assertEquals(childJob.payload.isIntermediate, true, 'isIntermediate flag must be preserved on the child job payload');
    });

    it('should not call the planner if no source documents are found', async () => {
        // Purpose: Proves planComplexStage's own control-flow decision: when
        // findSourceDocuments returns an empty array, the function short-circuits at the
        // early-exit guard (line 81-83) and returns [] without ever calling the planner.
        // This is planComplexStage's logic — not a pass-through. The planner is called
        // later at line 160; the early exit prevents that call from being reached.

        // Arrange:
        // 1. Build a valid parent job row and payload that pass all validation gates
        //    (isPlannableStep, inputs_required non-empty, granularity_strategy present,
        //    prompt_template_id present, user_jwt present, stageSlug present).
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        const payload = buildDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(payload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }
        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 2. Build a valid recipe step that passes all upfront validations.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 3. Mock findSourceDocuments to return an empty array — this triggers the
        //    early-exit guard before the planner is ever reached.
        const findSourceDocuments = async (): Promise<SourceDocument[]> => [];

        // 4. Mock getGranularityPlanner to return a planner that pushes to a spy array.
        //    If the early exit fails to short-circuit, the planner will be called and
        //    plannerCalls.length will be non-zero.
        const plannerCalls: { sourceDocs: SourceDocument[] }[] = [];
        const planner: GranularityPlannerFn = (sourceDocs) => {
            plannerCalls.push({ sourceDocs });
            return [buildDialecticExecuteJobPayload()];
        };

        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext({
            findSourceDocuments,
            getGranularityPlanner: () => planner,
        });
        const ctx = createPlanJobContext(rootCtx);

        // Act:
        // 1. Call planComplexStage.
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            ctx,
            recipeStep,
            'test-auth-token',
        );

        // Assert:
        // 1. The return value is an empty array — the early exit returned no child jobs.
        assertEquals(childJobs.length, 0, 'expected no child jobs when source documents are empty');

        // 2. The planner was never called — the early exit prevented it.
        assertEquals(plannerCalls.length, 0, 'planner must not be called when no source documents are found');
    });

    it('planComplexStage should throw when parent payload.user_jwt is missing', async () => {
        // Purpose: Proves planComplexStage's own upfront validation guard for user_jwt
        // presence. The guard (lines 55-62) uses Object.getOwnPropertyDescriptor to detect
        // a missing key, then checks typeof !== 'string' to catch undefined values. When
        // user_jwt is absent from the parent payload, the function throws before fetching
        // source documents or calling the planner. This is planComplexStage's own logic —
        // a runtime boundary check ensuring planners receive a valid jwt.

        // Arrange:
        // 1. Build a valid parent job row that passes all other validation gates.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        // 2. Build an invalid plan payload with user_jwt set to undefined via the
        //    invalidator. The invalidator returns unknown (the honest type for untrusted
        //    runtime data); the cast to DialecticPlanJobPayload is the permitted test-only
        //    exception proving invalid objects are rejected even when claimed valid. The
        //    guard's Object.getOwnPropertyDescriptor finds the key with value undefined,
        //    triggering the typeof !== 'string' check.
        const payload = invalidateDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: undefined,
        }) as DialecticPlanJobPayload;

        if (!isJson(payload)) {
            throw new Error('invalidateDialecticPlanJobPayload did not produce valid JSON');
        }

        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 3. Build a valid recipe step that passes all upfront validations. The guard
        //    fires before findSourceDocuments or getGranularityPlanner are reached, so
        //    the recipe step's content does not matter beyond passing the earlier gates.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 4. Provide a mock Supabase client and a trivial context. The guard fires
        //    before any dependency is called.
        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext();
        const ctx = createPlanJobContext(rootCtx);

        // Act & Assert:
        // The call must reject with an Error naming user_jwt as required.
        await assertRejects(
            async () => {
                await planComplexStage(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    parentJob,
                    ctx,
                    recipeStep,
                    'test-auth-token',
                );
            },
            Error,
            'parent payload.user_jwt is required',
            'should throw when user_jwt is missing from the parent payload',
        );
    });

    it('planComplexStage should throw when parent payload.user_jwt is empty', async () => {
        // Contract: When parentJob.payload.user_jwt is an empty string (''), planComplexStage
        // throws 'parent payload.user_jwt is required' before fetching source documents or
        // calling the planner. The empty string passes the typeof === 'string' check but
        // fails the length === 0 check — a distinct condition from missing/undefined.
        //
        // Arrange: A parent job with a valid row and a payload whose user_jwt is '' (empty
        // string), built via the invalidator. The variation this branch discriminates over:
        // user_jwt is a string (passes typeof) but has zero length (fails length check).
        // All other fields are valid so no other guard fires first.

        // Arrange:
        // 1. Build a valid parent job row.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        // 2. Build an invalid plan payload with user_jwt set to empty string via the
        //    invalidator. The empty string is a valid string type but fails the guard's
        //    length === 0 check — this is the condition that distinguishes this test from
        //    the missing/undefined test.
        const payload = invalidateDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: '',
        }) as DialecticPlanJobPayload;

        if (!isJson(payload)) {
            throw new Error('invalidateDialecticPlanJobPayload did not produce valid JSON');
        }

        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 3. Build a valid recipe step that passes all upfront validations. The guard
        //    fires before findSourceDocuments or getGranularityPlanner are reached.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 4. Provide a mock Supabase client and a trivial context.
        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext();
        const ctx = createPlanJobContext(rootCtx);

        // Act & Assert:
        // The call must reject with an Error naming user_jwt as required. If the
        // length === 0 check is removed from the guard, the empty string passes
        // typeof === 'string' and proceeds — this test fails, proving the check exists.
        await assertRejects(
            async () => {
                await planComplexStage(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    parentJob,
                    ctx,
                    recipeStep,
                    'test-auth-token',
                );
            },
            Error,
            'parent payload.user_jwt is required',
            'should throw when user_jwt is an empty string',
        );
    });

    it('constructs execute child rows with consistent dynamic stage markers (row.stage_slug === payload.stageSlug)', async () => {
        // Contract: When planComplexStage constructs a child job row, the row's stage_slug
        // and the payload's stageSlug must be equal — both sourced from parentJob.payload.stageSlug
        // (line 65 → line 223), not from parentJob.stage_slug. The context-mismatch check
        // (line 202) ensures the planner's payload.stageSlug matches the parent's, so the
        // row and payload are consistent by construction.
        //
        // Arrange: A parent job whose row.stage_slug is null (absent) while payload.stageSlug
        // is a distinct dynamic value. This variation proves line 223 sources stage_slug from
        // the payload's stageSlug, not the parent row's stage_slug — if it used the row's
        // null value, the assertion would fail. The planner returns an execute payload with
        // the same stageSlug so the context-mismatch check passes.

        // Arrange:
        // 1. Build a parent job row with stage_slug set to undefined — the parent row does not
        //    carry a stage slug. The guard at line 69 only checks for mismatch when
        //    parentJob.stage_slug is a string, so undefined is allowed.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: undefined,
        });

        // 2. Build a parent payload with a distinct dynamic stageSlug. This is the value
        //    that must appear on both the child row's stage_slug and the child payload's
        //    stageSlug.
        const dynamicStageSlug = 'dynamic-thesis-stage';

        const payload = buildDialecticPlanJobPayload({
            stageSlug: dynamicStageSlug,
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(payload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }

        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 3. Build a valid recipe step that passes all upfront validations.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 4. Mock findSourceDocuments to return a non-empty array so the function
        //    does not early-exit.
        const sourceDoc = buildSourceDocument();
        const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

        // 5. Build an execute payload with the same dynamic stageSlug and context fields
        //    matching the parent payload so the context-mismatch check passes.
        const executePayload = buildDialecticExecuteJobPayload({
            projectId: 'test-project-id',
            sessionId: 'test-session-id',
            stageSlug: dynamicStageSlug,
            iterationNumber: 1,
            walletId: 'test-wallet-id',
            user_jwt: 'test-jwt-nonempty',
        });

        const planner: GranularityPlannerFn = () => [executePayload];

        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext({
            findSourceDocuments,
            getGranularityPlanner: () => planner,
        });
        const ctx = createPlanJobContext(rootCtx);

        // Act:
        // 1. Call planComplexStage.
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            ctx,
            recipeStep,
            'test-auth-token',
        );

        // Assert:
        // 1. Exactly one child job was created.
        assertEquals(childJobs.length, 1, 'expected exactly one child job');
        const childJob = childJobs[0];

        // 2. The child row's stage_slug equals the dynamic value from the parent payload —
        //    proving line 223 sources from parentJob.payload.stageSlug, not parentJob.stage_slug
        //    (which is undefined). If line 223 used the row's undefined value, this would fail.
        assertEquals(childJob.stage_slug, dynamicStageSlug, 'row.stage_slug must equal the dynamic stageSlug from the parent payload');

        // 3. The child payload's stageSlug equals the same dynamic value — proving the
        //    context-mismatch check (line 202) ensured the planner's payload matched.
        assert(isDialecticExecuteJobPayload(childJob.payload), 'child payload should be a valid DialecticExecuteJobPayload');
        assertEquals(childJob.payload.stageSlug, dynamicStageSlug, 'payload.stageSlug must equal the dynamic stageSlug');

        // 4. The consistency relationship: row.stage_slug === payload.stageSlug. This is
        //    the contract — both fields are sourced from the same parent payload value.
        assertEquals(childJob.stage_slug, childJob.payload.stageSlug, 'row.stage_slug must equal payload.stageSlug on the child job');
    });

    it('throws when parent payload.stageSlug is missing (no healing, no defaults)', async () => {
        // Contract: When parentJob.payload.stageSlug is not a string (missing/undefined),
        // planComplexStage throws 'parent payload.stageSlug is required' — it does not
        // fall back to parentJob.stage_slug or any default. The guard at line 66 checks
        // typeof !== 'string' and throws before any dependency is called.
        //
        // Arrange: A parent job whose row.stage_slug is a valid string ('thesis') that
        // could be fallen back to, while payload.stageSlug is undefined. This variation
        // proves the function does not heal the missing payload field from the row —
        // if a fallback (payload.stageSlug || parentJob.stage_slug) were added, the
        // function would proceed instead of throwing, and this test would fail.

        // Arrange:
        // 1. Build a parent job row with a valid stage_slug — a value the function
        //    could fall back to if it attempted healing. The guard at line 69 only
        //    checks for mismatch when both are strings, so this row value is allowed.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'thesis',
        });

        // 2. Build an invalid plan payload with stageSlug set to undefined via the
        //    invalidator. user_jwt is valid so the earlier guard (lines 55-62) passes
        //    and the stageSlug guard is the one that fires.
        const payload = invalidateDialecticPlanJobPayload({
            stageSlug: undefined,
            user_jwt: 'test-jwt-nonempty',
        }) as DialecticPlanJobPayload;

        if (!isJson(payload)) {
            throw new Error('invalidateDialecticPlanJobPayload did not produce valid JSON');
        }

        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 3. Build a valid recipe step that passes all upfront validations. The guard
        //    fires before findSourceDocuments or getGranularityPlanner are reached.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 4. Provide a mock Supabase client and a trivial context.
        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext();
        const ctx = createPlanJobContext(rootCtx);

        // Act & Assert:
        // The call must reject with an Error naming stageSlug as required. If a
        // fallback to parentJob.stage_slug were added, the function would use 'thesis'
        // and proceed — this test would fail, proving no healing exists.
        await assertRejects(
            async () => {
                await planComplexStage(
                    mockSupabase.client as unknown as SupabaseClient<Database>,
                    parentJob,
                    ctx,
                    recipeStep,
                    'test-auth-token',
                );
            },
            Error,
            'parent payload.stageSlug is required',
            'should throw when payload.stageSlug is missing, without falling back to row.stage_slug',
        );
    });

    it('should correctly create PLAN child jobs when planner returns PLAN payload for PLAN recipe step', async () => {
        // Contract: When the planner returns a DialecticPlanJobPayload, planComplexStage's
        // type detection (lines 176-196) falls through the execute check and matches the
        // PLAN branch (line 190), setting jobType = 'PLAN' and creating a child row with
        // job_type: 'PLAN'. This is a distinct branch from the EXECUTE path — all other
        // tests use execute payloads from the planner.
        //
        // Arrange: A parent PLAN job with valid context, a recipe step with
        // job_type_to_create: 'plan', and a planner that returns a DialecticPlanJobPayload
        // whose context fields match the parent so the context-mismatch check passes. The
        // variation this branch discriminates over: the payload's shape is PLAN, not EXECUTE.

        // Arrange:
        // 1. Build a valid parent job row and payload with consistent context fields.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        const parentPayload = buildDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(parentPayload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }

        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload: parentPayload,
        };

        // 2. Build a recipe step with job_type_to_create: 'plan' — the condition the title
        //    names. The planner is expected to return PLAN payloads for a PLAN recipe step.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 3. Mock findSourceDocuments to return a non-empty array so the function
        //    does not early-exit.
        const sourceDoc = buildSourceDocument();
        const findSourceDocuments = async (): Promise<SourceDocument[]> => [sourceDoc];

        // 4. Build a PLAN payload from the planner with context fields matching the parent
        //    so the context-mismatch check (lines 197-209) passes. The payload must be a
        //    valid DialecticPlanJobPayload — not a DialecticExecuteJobPayload — so the type
        //    detection takes the PLAN branch (line 190).
        const planChildPayload = buildDialecticPlanJobPayload({
            projectId: parentPayload.projectId,
            sessionId: parentPayload.sessionId,
            stageSlug: parentPayload.stageSlug,
            iterationNumber: parentPayload.iterationNumber,
            walletId: parentPayload.walletId,
            user_jwt: 'test-jwt-nonempty',
        });

        const planner: GranularityPlannerFn = () => [planChildPayload];

        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext({
            findSourceDocuments,
            getGranularityPlanner: () => planner,
        });
        const ctx = createPlanJobContext(rootCtx);

        // Act:
        // 1. Call planComplexStage.
        const childJobs = await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            ctx,
            recipeStep,
            'test-auth-token',
        );

        // Assert:
        // 1. Exactly one child job was created — the PLAN payload was not skipped as malformed.
        assertEquals(childJobs.length, 1, 'expected exactly one child job from the PLAN payload');

        // 2. The child job's job_type is 'PLAN' — proving the type detection took the PLAN
        //    branch (line 190-192), not the EXECUTE branch. If the PLAN branch were removed,
        //    the payload would be skipped (line 193-195) and zero child jobs would be created.
        const childJob = childJobs[0];
        assertEquals(childJob.job_type, 'PLAN', 'child job_type must be PLAN when planner returns a PLAN payload');

        // 3. The child payload is a valid DialecticPlanJobPayload — proving the validated
        //    payload was stored verbatim on the row.
        assert(isDialecticPlanJobPayload(childJob.payload), 'child payload should be a valid DialecticPlanJobPayload');
    });

    it('should filter source documents to exclude completed ones when completedSourceDocumentIds is provided', async () => {
        // Contract: When completedSourceDocumentIds is a non-empty Set, planComplexStage
        // filters out source documents whose identifier (document_relationships.source_group)
        // is in the Set, before passing the remaining documents to the planner (lines 121-149).
        // Documents not in the Set survive and reach the planner.
        //
        // Arrange: Two source documents with distinct source_group identifiers. One is
        // marked completed (its source_group is in the Set), one is not. The variation
        // this branch discriminates over: whether a document's source_group is in the
        // completedSourceDocumentIds Set.

        // Arrange:
        // 1. Build a valid parent job row and payload.
        const parentJobRow = buildDialecticJobRow({
            job_type: 'PLAN',
            stage_slug: 'test-stage',
        });

        const payload = buildDialecticPlanJobPayload({
            stageSlug: 'test-stage',
            user_jwt: 'test-jwt-nonempty',
        });
        if (!isJson(payload)) {
            throw new Error('buildDialecticPlanJobPayload did not produce valid JSON');
        }

        const parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
            ...parentJobRow,
            payload,
        };

        // 2. Build a valid recipe step.
        const recipeStep = buildDialecticStageRecipeStep({
            prompt_template_id: 'test-prompt-template-id',
        });
        if (recipeStep === null) {
            throw new Error('buildDialecticStageRecipeStep returned null');
        }

        // 3. Build two source documents with distinct source_group identifiers.
        //    - completedDoc has source_group 'group-completed' — will be filtered out.
        //    - pendingDoc has source_group 'group-pending' — will survive the filter.
        const completedDoc = buildSourceDocument({
            id: 'doc-completed',
            document_relationships: { source_group: 'group-completed' },
        });
        const pendingDoc = buildSourceDocument({
            id: 'doc-pending',
            document_relationships: { source_group: 'group-pending' },
        });

        const findSourceDocuments = async (): Promise<SourceDocument[]> => [
            completedDoc,
            pendingDoc,
        ];

        // 4. Build a planner spy to capture the source documents it receives.
        const plannerCalls: { sourceDocs: SourceDocument[] }[] = [];
        const planner: GranularityPlannerFn = (docs) => {
            plannerCalls.push({ sourceDocs: docs });
            return [buildDialecticExecuteJobPayload()];
        };

        const mockSupabase = createMockSupabaseClient();
        const rootCtx = createMockRootContext({
            findSourceDocuments,
            getGranularityPlanner: () => planner,
        });
        const ctx = createPlanJobContext(rootCtx);

        // 5. Build the completedSourceDocumentIds Set containing the completed doc's
        //    source_group. This is the input that triggers the filter branch (line 122).
        const completedSourceDocumentIds = new Set<string>(['group-completed']);

        // Act:
        // 1. Call planComplexStage with the completedSourceDocumentIds Set.
        await planComplexStage(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            parentJob,
            ctx,
            recipeStep,
            'test-auth-token',
            completedSourceDocumentIds,
        );

        // Assert:
        // 1. The planner was called exactly once.
        assertEquals(plannerCalls.length, 1, 'planner should be called exactly once');

        // 2. The planner received exactly one document — the pending one. The completed
        //    document was filtered out. If the filter (lines 122-149) were removed, the
        //    planner would receive both documents and this assertion would fail.
        const receivedDocs = plannerCalls[0].sourceDocs;
        assertEquals(receivedDocs.length, 1, 'planner should receive only the non-completed document');

        // 3. The received document is the pending one — its id matches, independently
        //    stated, not derived from the Set.
        assertEquals(receivedDocs[0].id, 'doc-pending', 'the surviving document must be the non-completed one');
    });
});
