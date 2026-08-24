// supabase/functions/dialectic-worker/saveCompressedResponse/saveCompressedResponse.integration.test.ts

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType, DialecticStageSlug } from "../../_shared/types/file_manager.types.ts";
import { buildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.ts";
import type { BuildUploadContextFn } from "../createJobContext/JobContext.interface.ts";
import { shouldEnqueueRenderJob } from "../../_shared/utils/shouldEnqueueRenderJob.ts";
import { resolveTemplateFilename } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts";
import type { BoundResolveTemplateFilenameFn } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts";
import { recipeChainConfig } from "../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.mock.ts";
import { enqueueRenderJob } from "../enqueueRenderJob/enqueueRenderJob.ts";
import type { BoundEnqueueRenderJobFn } from "../enqueueRenderJob/enqueueRenderJob.interface.ts";
import {
	buildDialecticJobRow,
	buildUnifiedAIResponse,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { createMockFileManagerService, buildFileRecord } from "../../_shared/services/file_manager.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
	saveCompressedResponse,
	isSaveCompressedResponseSuccessReturn,
} from "./saveCompressedResponse.provides.ts";

// --- Shared real-deps wiring ---

const integrationLogger = new MockLogger();

const realBuildUploadContext: BuildUploadContextFn = buildUploadContext;

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

// =========================================================================
/**
 * Contract: a json-mode payload with shouldContinue false, a fileManager
 *   returning a valid resource record, and a dbClient stubbed for the recipe
 *   chain queries and the waiting_for_children update, flows through the real
 *   buildUploadContext (which assembles a ResourceUploadContext from the
 *   BuildUploadContextResourceParams this module constructs), the real
 *   enqueueRenderJob (which calls the real shouldEnqueueRenderJob and the real
 *   resolveTemplateFilename, inserts a RENDER row, and returns a non-null
 *   renderJobId), and the waiting_for_children DB update — producing
 *   { status: 'waiting_for_children' } and proving the params this module
 *   constructs are accepted by the real chain rather than a type error or
 *   structural mismatch masked by a mock.
 * Arrange: a mock dbClient whose dialectic_stages, dialectic_stage_recipe_instances,
 *   and dialectic_recipe_template_steps return the recipeChainConfig(false)
 *   fixture (a non-cloned instance with a template step whose
 *   files_to_generate maps business_case to a .md template); whose
 *   dialectic_generation_jobs insert returns a row with id 'render-job-int-1'
 *   and whose update returns no error. A mock fileManager returning a valid
 *   FileRecord. The real buildUploadContext, real enqueueRenderJob, real
 *   shouldEnqueueRenderJob, and real resolveTemplateFilename are wired. The
 *   payload carries mode 'json', docType business_case, documentKey
 *   business_case, sourceStageSlug Thesis, and shouldContinue false.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'waiting_for_children';
 *   the real enqueueRenderJob inserted a RENDER row into
 *   dialectic_generation_jobs (insert spy callCount 1), proving it received
 *   valid params and returned a non-null renderJobId.
 * Boundary: the database (dbClient, shared between saveCompressedResponse and
 *   the real enqueueRenderJob) and the file manager. The chain
 *   saveCompressedResponse → buildUploadContext → enqueueRenderJob →
 *   shouldEnqueueRenderJob → resolveTemplateFilename is real.
 * Mocked: dbClient (all DB tables), fileManager. This test does not prove the
 *   DB schema, file storage, or the RENDER job's downstream processing — it
 *   proves the real buildUploadContext and the real enqueueRenderJob accept
 *   the params this module constructs and that the chain produces the expected
 *   result.
 */
Deno.test("Integration: saveCompressedResponse → real buildUploadContext → real enqueueRenderJob produces waiting_for_children on a json-mode payload", async () => {
	// Arrange — mock dbClient with recipe chain config + insert/update
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			...recipeChainConfig(false),
			dialectic_generation_jobs: {
				insert: { data: [{ id: "render-job-int-1" }], error: null },
				update: { data: [{}], error: null },
			},
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

	const deps = {
		fileManager,
		buildUploadContext: realBuildUploadContext,
		enqueueRenderJob: buildBoundEnqueueRenderJob(dbClient),
	};

	const params = {
		dbClient,
		job: buildDialecticJobRow(),
		providerRow: buildMockProvider(),
		assembledResponse: buildUnifiedAIResponse({
			rawProviderResponse: { token_usage: null, finish_reason: "stop" },
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({ shouldContinue: false }),
	};

	const payload = buildDialecticCompressJobPayload({
		mode: "json",
		output_type: FileType.business_case,
		documentKey: FileType.business_case,
		docType: FileType.business_case,
		sourceStageSlug: DialecticStageSlug.Thesis,
		stageSlug: DialecticStageSlug.Thesis,
	});

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert — success arm
	assertEquals(isSaveCompressedResponseSuccessReturn(result), true);
	if (isSaveCompressedResponseSuccessReturn(result)) {
		assertEquals(result.status, "waiting_for_children");
	}

	// Assert — real enqueueRenderJob inserted a RENDER row
	const insertSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
		"dialectic_generation_jobs",
		"insert",
	);
	assertExists(insertSpy);
	assertEquals(insertSpy.callCount, 1);
});

// =========================================================================
/**
 * Contract: a text-mode payload with shouldContinue false and a fileManager
 *   returning a valid resource record for both uploads, flows through the real
 *   buildUploadContext (called twice — once for CompressedContextRawJson and
 *   once for CompressedContext), produces { status: 'completed' }, and the
 *   real enqueueRenderJob is not called — proving the BuildUploadContextResourceParams
 *   this module constructs are accepted by the real buildUploadContext for both
 *   storage file types and that text mode does not dispatch a RENDER job.
 * Arrange: a mock dbClient (not read on this path); a mock fileManager
 *   returning a valid FileRecord for both uploads. The real buildUploadContext
 *   is wired; enqueueRenderJob is wired with the real enqueueRenderJob bound
 *   with its own real deps but should not be called. The payload carries mode
 *   'text' and shouldContinue false.
 * Act: saveCompressedResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed'; the real
 *   enqueueRenderJob did NOT insert a RENDER row into
 *   dialectic_generation_jobs (insert spy callCount 0).
 * Boundary: the database (dbClient, not read on this path) and the file
 *   manager. The chain saveCompressedResponse → buildUploadContext is real;
 *   enqueueRenderJob is not reached.
 * Mocked: dbClient, fileManager. This test does not prove the DB schema or
 *   file storage — it proves the real buildUploadContext accepts the params
 *   this module constructs for both storage file types and that text mode
 *   produces completed without dispatching a RENDER job.
 */
Deno.test("Integration: saveCompressedResponse → real buildUploadContext produces completed on a text-mode payload with no render dispatch", async () => {
	// Arrange — mock dbClient (not read on this path), mock fileManager for both uploads
	const mockSetup = createMockSupabaseClient(undefined, {
		genericMockResults: {
			dialectic_generation_jobs: {
				insert: { data: [{ id: "render-job-int-2" }], error: null },
				update: { data: [{}], error: null },
			},
		},
	});
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildFileRecord(), null);

	const deps = {
		fileManager,
		buildUploadContext: realBuildUploadContext,
		enqueueRenderJob: buildBoundEnqueueRenderJob(dbClient),
	};

	const params = {
		dbClient,
		job: buildDialecticJobRow(),
		providerRow: buildMockProvider(),
		assembledResponse: buildUnifiedAIResponse({
			rawProviderResponse: { token_usage: null, finish_reason: "stop" },
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn({ shouldContinue: false }),
	};

	const payload = buildDialecticCompressJobPayload({
		mode: "text",
		output_type: FileType.business_case,
		documentKey: FileType.business_case,
		docType: FileType.business_case,
		sourceStageSlug: DialecticStageSlug.Thesis,
		stageSlug: DialecticStageSlug.Thesis,
	});

	// Act
	const result = await saveCompressedResponse(deps, params, payload);

	// Assert — success arm
	assertEquals(isSaveCompressedResponseSuccessReturn(result), true);
	if (isSaveCompressedResponseSuccessReturn(result)) {
		assertEquals(result.status, "completed");
	}

	// Assert — real enqueueRenderJob did NOT insert a RENDER row
	const insertSpy = mockSetup.spies.getHistoricQueryBuilderSpies(
		"dialectic_generation_jobs",
		"insert",
	);
	assertExists(insertSpy);
	assertEquals(insertSpy.callCount, 0);
});
