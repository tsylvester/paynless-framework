// supabase/functions/dialectic-worker/saveContributionResponse/saveContributionResponse.integration.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { buildUploadContext } from "../../_shared/utils/buildUploadContext/buildUploadContext.ts";
import type { BuildUploadContextFn } from "../createJobContext/JobContext.interface.ts";
import { resolveContributionIdentity } from "../resolveContributionIdentity/resolveContributionIdentity.ts";
import type { BoundResolveContributionIdentityFn } from "../resolveContributionIdentity/resolveContributionIdentity.interface.ts";
import {
	isResolveContributionIdentityDocumentKeyError,
} from "../resolveContributionIdentity/resolveContributionIdentity.guard.ts";
import type { BoundPersistContributionRelationshipsFn } from "../persistContributionRelationships/persistContributionRelationships.interface.ts";
import type { BoundFinalizeContributionJobFn } from "../finalizeContributionJob/finalizeContributionJob.interface.ts";
import {
	buildDialecticContributionRow,
	buildDialecticJobRow,
	buildDialecticExecuteJobPayload,
	buildDocumentRelationships,
	buildUnifiedAIResponse,
} from "../../_shared/dialectic.mock.ts";
import { buildMockProvider, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";
import { buildPrepareResponseContentPreparedReturn } from "../prepareResponseContent/prepareResponseContent.mock.ts";
import {
	buildPersistContributionRelationshipsPersistedReturn,
} from "../persistContributionRelationships/persistContributionRelationships.mock.ts";
import {
	buildFinalizeContributionJobSuccessReturn,
} from "../finalizeContributionJob/finalizeContributionJob.mock.ts";
import {
	saveContributionResponse,
	isSaveContributionResponseSuccessReturn,
} from "./saveContributionResponse.provides.ts";

// --- Shared real-deps wiring ---

const integrationLogger = new MockLogger();

function buildBoundResolveContributionIdentity(): BoundResolveContributionIdentityFn {
	return (params, payload) =>
		resolveContributionIdentity({ logger: integrationLogger }, params, payload);
}

const realBuildUploadContext: BuildUploadContextFn = buildUploadContext;

// =========================================================================
/**
 * Contract: a valid EXECUTE payload with a document-related output_type and a
 *   non-empty source_group flows through the real resolveContributionIdentity
 *   (which returns success without DB reads), the real buildUploadContext
 *   (which assembles a ModelContributionUploadContext from the identity result
 *   and payload fields), the isModelContributionContext guard (which passes),
 *   the mock fileManager (which returns a valid DialecticContributionRow), the
 *   isDialecticContribution guard (which passes), the mock
 *   persistContributionRelationships (which returns success), and the mock
 *   finalizeContributionJob (which returns status 'completed') — proving the
 *   ResolveContributionIdentityParams this module constructs are accepted by
 *   the real resolveContributionIdentity, the identity result fields plus the
 *   payload fields compose a valid BuildUploadContextParams accepted by the
 *   real buildUploadContext, and the resulting context passes
 *   isModelContributionContext.
 * Arrange: a mock dbClient (shared but not read on this path); a mock
 *   fileManager returning a valid DialecticContributionRow; a mock
 *   persistContributionRelationships returning success with the contribution;
 *   a mock finalizeContributionJob returning status 'completed'; the real
 *   resolveContributionIdentity bound with a real logger; the real
 *   buildUploadContext. The payload carries a document-related output_type
 *   (business_case), a non-empty document_key, a non-empty source_group in
 *   document_relationships, and a valid rawProviderResponse on the assembled
 *   AI response.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the success arm with status 'completed'.
 * Boundary: the database (dbClient, shared but not read on this path) and the
 *   file manager — saveContributionResponse and the real
 *   resolveContributionIdentity share the mocked dbClient; fileManager,
 *   persistContributionRelationships, and finalizeContributionJob are mocked.
 *   The chain saveContributionResponse → resolveContributionIdentity →
 *   buildUploadContext → isModelContributionContext → isDialecticContribution
 *   is real.
 * Mocked: dbClient, fileManager, persistContributionRelationships,
 *   finalizeContributionJob. This test does not prove the DB schema, file
 *   storage, relationship persistence, or finalization dispatch — it proves
 *   the real identity resolution and the real upload-context assembly accept
 *   the params this module constructs.
 */
Deno.test("Integration: saveContributionResponse → real resolveContributionIdentity → real buildUploadContext produces a completed success on a valid document-related payload", async () => {
	// Arrange — mock dbClient (not read on this path), mock fileManager returning a valid contribution
	const mockSetup = createMockSupabaseClient();
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const fileManager = createMockFileManagerService();
	fileManager.setUploadAndRegisterFileResponse(buildDialecticContributionRow(), null);

	const persistStub: BoundPersistContributionRelationshipsFn = async () =>
		buildPersistContributionRelationshipsPersistedReturn();
	const finalizeStub: BoundFinalizeContributionJobFn = async () =>
		buildFinalizeContributionJobSuccessReturn({ status: "completed" });

	const deps = {
		fileManager,
		buildUploadContext: realBuildUploadContext,
		resolveContributionIdentity: buildBoundResolveContributionIdentity(),
		persistContributionRelationships: persistStub,
		finalizeContributionJob: finalizeStub,
	};

	const payload = buildDialecticExecuteJobPayload({
		output_type: FileType.business_case,
		document_relationships: buildDocumentRelationships({ source_group: "sg-int-distinct" }),
	});

	const params = {
		dbClient,
		job: buildDialecticJobRow(),
		providerRow: buildMockProvider(),
		modelConfig: buildExtendedModelConfig(),
		assembledResponse: buildUnifiedAIResponse({
			rawProviderResponse: { token_usage: null, finish_reason: "stop" },
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn(),
	};

	// Act
	const result = await saveContributionResponse(deps, params, payload);

	// Assert
	assertEquals(isSaveContributionResponseSuccessReturn(result), true);
	if (isSaveContributionResponseSuccessReturn(result)) {
		assertEquals(result.status, "completed");
	}
});

// =========================================================================
/**
 * Contract: a document-related output_type with a missing document_key causes
 *   the real resolveContributionIdentity to return its
 *   ResolveContributionIdentityDocumentKeyError error arm, which
 *   saveContributionResponse propagates unchanged — proving the
 *   ResolveContributionIdentityParams this module constructs are accepted by
 *   the real resolveContributionIdentity and that a real identity-resolution
 *   failure surfaces intact rather than being masked or converted.
 * Arrange: a mock dbClient (not read on this path); the real
 *   resolveContributionIdentity bound with a real logger; the real
 *   buildUploadContext (not reached); a mock fileManager (not reached); a mock
 *   persistContributionRelationships (not reached); a mock
 *   finalizeContributionJob (not reached). The payload carries a
 *   document-related output_type (business_case) with document_key omitted
 *   (rest-destructured away) and a valid rawProviderResponse on the assembled
 *   AI response.
 * Act: saveContributionResponse over the arranged deps, params, payload.
 * Assert: the result is the error arm whose error passes
 *   isResolveContributionIdentityDocumentKeyError; retriable is false.
 * Boundary: the database (dbClient, shared but not read on this path). The
 *   chain saveContributionResponse → resolveContributionIdentity is real;
 *   buildUploadContext, fileManager, persistContributionRelationships, and
 *   finalizeContributionJob are not reached.
 * Mocked: dbClient, fileManager, persistContributionRelationships,
 *   finalizeContributionJob (none reached on this path). This test does not
 *   prove the DB schema, file storage, relationship persistence, or
 *   finalization dispatch — it proves the real identity resolution fails on a
 *   missing document_key and that the failure propagates unchanged.
 */
Deno.test("Integration: a document-related output_type with a missing document_key makes the real resolveContributionIdentity return its DocumentKeyError, propagated unchanged by saveContributionResponse", async () => {
	// Arrange — document_key omitted (rest-destructured away)
	const mockSetup = createMockSupabaseClient();
	const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;

	const fileManager = createMockFileManagerService();
	const persistStub: BoundPersistContributionRelationshipsFn = async () =>
		buildPersistContributionRelationshipsPersistedReturn();
	const finalizeStub: BoundFinalizeContributionJobFn = async () =>
		buildFinalizeContributionJobSuccessReturn({ status: "completed" });

	const deps = {
		fileManager,
		buildUploadContext: realBuildUploadContext,
		resolveContributionIdentity: buildBoundResolveContributionIdentity(),
		persistContributionRelationships: persistStub,
		finalizeContributionJob: finalizeStub,
	};

	const { document_key: _omit, ...payloadNoDocKey } = buildDialecticExecuteJobPayload({
		output_type: FileType.business_case,
		document_relationships: buildDocumentRelationships({ source_group: "sg-int-fail" }),
	});

	const params = {
		dbClient,
		job: buildDialecticJobRow(),
		providerRow: buildMockProvider(),
		modelConfig: buildExtendedModelConfig(),
		assembledResponse: buildUnifiedAIResponse({
			rawProviderResponse: { token_usage: null, finish_reason: "stop" },
		}),
		preparedContentResult: buildPrepareResponseContentPreparedReturn(),
	};

	// Act
	const result = await saveContributionResponse(deps, params, payloadNoDocKey);

	// Assert
	assertEquals("error" in result, true);
	if ("error" in result) {
		assertEquals(isResolveContributionIdentityDocumentKeyError(result.error), true);
		assertEquals(result.retriable, false);
	}
});
