// supabase/functions/dialectic-worker/finalizeContributionJob/finalizeContributionJob.integration.test.ts

import {
	assertEquals,
	assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { shouldEnqueueRenderJob } from "../../_shared/utils/shouldEnqueueRenderJob.ts";
import { resolveTemplateFilename } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts";
import type { BoundResolveTemplateFilenameFn } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts";
import { recipeChainConfig } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.mock.ts";
import { enqueueRenderJob } from "../enqueueRenderJob/enqueueRenderJob.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import {
	buildFinalizeContributionJobDeps,
	buildFinalizeContributionJobParams,
	buildFinalizeContributionJobPayload,
	finalizeContributionJob,
	isFinalizeContributionJobSuccessReturn,
} from "./finalizeContributionJob.provides.ts";

// --- Shared real-deps wiring ---

const integrationLogger = new MockLogger();

function buildBoundEnqueueRenderJob(
	dbClient: SupabaseClient<Database>,
): BoundEnqueueRenderJobFn {
	const boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) =>
		resolveTemplateFilename({}, params, payload);
	return (params, payload) =>
		enqueueRenderJob(
			{ dbClient, logger: integrationLogger, shouldEnqueueRenderJob, resolveTemplateFilename: boundResolveTemplateFilename },
			params,
			payload,
		);
}

function buildIntegrationMockSetup() {
	return createMockSupabaseClient(undefined, {
		genericMockResults: {
			...recipeChainConfig(false),
			dialectic_generation_jobs: {
				insert: { data: [{ id: "render-job-xyz" }], error: null },
				update: { data: [{}], error: null },
			},
		},
	});
}

// =========================================================================
/**
 * Contract: a non-continuation with a valid user_jwt, a valid DialecticStageSlug,
 *   and an output_type that the real shouldEnqueueRenderJob classifies as
 *   is_markdown, calls the real enqueueRenderJob which calls the real
 *   shouldEnqueueRenderJob and the real resolveTemplateFilename, inserts a
 *   RENDER row, and returns a non-null renderJobId — observed via the insert
 *   spy being called once.
 * Arrange: a mock dbClient whose dialectic_stages, dialectic_stage_recipe_instances,
 *   and dialectic_recipe_template_steps return the recipeChainConfig(false)
 *   fixture (a non-cloned instance with a template step whose
 *   files_to_generate maps business_case to a .md template); whose
 *   dialectic_generation_jobs insert returns a row with id 'render-job-xyz'
 *   and whose update returns no error. The payload overrides output_type to
 *   business_case so the real shouldEnqueueRenderJob finds it in the markdown
 *   document keys. The real enqueueRenderJob, real shouldEnqueueRenderJob, and
 *   real resolveTemplateFilename are wired; notificationService, fileManager,
 *   and continueJob keep their mock defaults from buildFinalizeContributionJobDeps.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed'; the real
 *   enqueueRenderJob inserted a RENDER row into dialectic_generation_jobs
 *   (insert spy callCount 1), proving it received valid params and returned a
 *   non-null renderJobId.
 * Boundary: the database — finalizeContributionJob and the real enqueueRenderJob
 *   share the mocked dbClient; the chain finalizeContributionJob → enqueueRenderJob
 *   → shouldEnqueueRenderJob → resolveTemplateFilename is real.
 * Mocked: dbClient (all DB tables), notificationService, fileManager, continueJob.
 *   This test does not prove the DB schema, notification delivery, file assembly,
 *   or the continuation enqueue.
 */
Deno.test("Integration: finalizeContributionJob → real enqueueRenderJob with shouldEnqueueRenderJob=true inserts a RENDER row and returns completed", async () => {
	// Arrange
	const mockSetup = buildIntegrationMockSetup();
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const deps = buildFinalizeContributionJobDeps({
		logger: integrationLogger,
		enqueueRenderJob: buildBoundEnqueueRenderJob(dbClient),
	});
	const params = buildFinalizeContributionJobParams({
		dbClient,
	});
	const payload = buildFinalizeContributionJobPayload({
		output_type: FileType.business_case,
	});

	// Act
	const result = await finalizeContributionJob(deps, params, payload);

	// Assert
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
	if (isFinalizeContributionJobSuccessReturn(result)) {
		assertEquals(result.status, "completed");
	}
	const insertSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
		"dialectic_generation_jobs",
		"insert",
	);
	assertExists(insertSpy);
	assertEquals(insertSpy.callCount, 1);
});

// =========================================================================
/**
 * Contract: a non-continuation with a valid user_jwt, a valid DialecticStageSlug,
 *   and an output_type that the real shouldEnqueueRenderJob classifies as
 *   is_json, calls the real enqueueRenderJob which calls the real
 *   shouldEnqueueRenderJob and returns renderJobId null without inserting a
 *   RENDER row — observed via the insert spy being called zero times.
 * Arrange: a mock dbClient whose dialectic_stages, dialectic_stage_recipe_instances,
 *   and dialectic_recipe_template_steps return the recipeChainConfig(false)
 *   fixture (a non-cloned instance with a template step whose markdown document
 *   keys are {business_case}); whose dialectic_generation_jobs update returns
 *   no error. The payload keeps the default output_type ModelContributionRawJson,
 *   which is not in the recipe step's markdown document keys, so the real
 *   shouldEnqueueRenderJob returns {shouldRender: false, reason: 'is_json'}.
 *   The real enqueueRenderJob, real shouldEnqueueRenderJob, and real
 *   resolveTemplateFilename are wired; notificationService, fileManager, and
 *   continueJob keep their mock defaults from buildFinalizeContributionJobDeps.
 * Act: finalizeContributionJob over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed'; the real
 *   enqueueRenderJob did NOT insert a RENDER row into dialectic_generation_jobs
 *   (insert spy callCount 0), proving it returned renderJobId null via the
 *   is_json early-return branch.
 * Boundary: the database — finalizeContributionJob and the real enqueueRenderJob
 *   share the mocked dbClient; the chain finalizeContributionJob → enqueueRenderJob
 *   → shouldEnqueueRenderJob is real.
 * Mocked: dbClient (all DB tables), notificationService, fileManager, continueJob.
 *   This test does not prove the DB schema, notification delivery, file assembly,
 *   or the continuation enqueue.
 */
Deno.test("Integration: finalizeContributionJob → real enqueueRenderJob with shouldEnqueueRenderJob=false does not insert a RENDER row and returns completed", async () => {
	// Arrange
	const mockSetup = buildIntegrationMockSetup();
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const deps = buildFinalizeContributionJobDeps({
		logger: integrationLogger,
		enqueueRenderJob: buildBoundEnqueueRenderJob(dbClient),
	});
	const params = buildFinalizeContributionJobParams({
		dbClient,
	});
	const payload = buildFinalizeContributionJobPayload();

	// Act
	const result = await finalizeContributionJob(deps, params, payload);

	// Assert
	assertEquals(isFinalizeContributionJobSuccessReturn(result), true);
	if (isFinalizeContributionJobSuccessReturn(result)) {
		assertEquals(result.status, "completed");
	}
	const insertSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
		"dialectic_generation_jobs",
		"insert",
	);
	assertExists(insertSpy);
	assertEquals(insertSpy.callCount, 0);
});
