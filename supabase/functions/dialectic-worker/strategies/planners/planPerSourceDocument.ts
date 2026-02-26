// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts
// Cache-busting comment: 2025-08-04T04:20:05
import type {
	DialecticExecuteJobPayload,
	DialecticPlanJobPayload,
	DocumentRelationships,
	GranularityPlannerFn,
	ContextForDocument,
	SelectAnchorResult,
} from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { selectAnchorSourceDocument } from '../helpers.ts';
import { isContributionType, isContentToInclude } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { ModelContributionFileTypes } from '../../../_shared/types/file_manager.types.ts';

const deriveSourceContributionId = (
	documentId: string | null | undefined,
	relationships: DocumentRelationships | null | undefined
): string | undefined => {
	const relationshipIdentifier = relationships?.source_group;
	if (typeof relationshipIdentifier === 'string' && relationshipIdentifier.length > 0) {
		return relationshipIdentifier;
	}
	if (typeof documentId !== 'string' || documentId.length === 0) {
		return undefined;
	}
};

export const planPerSourceDocument: GranularityPlannerFn = (
	sourceDocs,
	parentJob,
	recipeStep
) => {
	// Enforce presence of user_jwt on the parent payload (no fallback to authToken)
	let parentJwt: string | undefined = undefined;
	{
		const desc = Object.getOwnPropertyDescriptor(parentJob.payload, 'user_jwt');
		const potential = desc ? desc.value : undefined;
		if (typeof potential === 'string' && potential.length > 0) {
			parentJwt = potential;
		}
	}
	if (!parentJwt) {
		throw new Error('parent payload.user_jwt is required');
	}

	if (sourceDocs.length === 0) {
		throw new Error(
			'Invalid inputs for planPerSourceDocument: At least one source document is required.'
		);
	}
	if (!recipeStep.prompt_template_id) {
		throw new TypeError(
			`Invalid recipe step for planPerSourceDocument: prompt_template_id is missing.`
		);
	}
	if (!recipeStep.output_type) {
		throw new TypeError(
			`Invalid recipe step for planPerSourceDocument: output_type is missing.`
		);
	}

	const stageSlug = parentJob.payload.stageSlug;
	if (!stageSlug || !isContributionType(stageSlug)) {
		throw new Error(
			`planPerSourceDocument requires a valid ContributionType stageSlug, but received: ${stageSlug}`
		);
	}

	// Validate job_type is either 'PLAN' or 'EXECUTE'
	if (recipeStep.job_type !== 'PLAN' && recipeStep.job_type !== 'EXECUTE') {
		throw new Error(`planPerSourceDocument requires job_type to be 'PLAN' or 'EXECUTE', received: ${recipeStep.job_type}`);
	}

	// 95.d.i: Extract model_id from parent job payload
	const parentModelId = parentJob.payload.model_id;

	// 95.d.ii: Filter sourceDocs to only include documents where doc.model_id === parentJob.payload.model_id
	const filteredSourceDocs = sourceDocs.filter(doc => doc.model_id === parentModelId);

	// 95.d.iii: If filtered list is empty, return empty array (no jobs for this model)
	if (filteredSourceDocs.length === 0) {
		return [];
	}

	// Handle PLAN and EXECUTE jobs separately
	if (recipeStep.job_type === 'PLAN') {
		// Validate context_for_documents for PLAN jobs
		if (!recipeStep.outputs_required) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but outputs_required is missing');
		}
		
		const contextForDocuments = recipeStep.outputs_required.context_for_documents;
		if (!contextForDocuments) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but context_for_documents is missing');
		}
		
		if (!Array.isArray(contextForDocuments)) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.context_for_documents to be an array for PLAN jobs');
		}
		
		if (contextForDocuments.length === 0) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.context_for_documents to have at least one entry for PLAN jobs');
		}
		
		// Validate each context_for_documents entry and construct properly typed array
		const validatedContextForDocuments: ContextForDocument[] = [];
		for (let i = 0; i < contextForDocuments.length; i++) {
			const entry = contextForDocuments[i];
			
			if (!entry || typeof entry !== 'object') {
				throw new Error(`planPerSourceDocument requires context_for_documents[${i}] to be an object`);
			}
			
			if (!('document_key' in entry) || typeof entry.document_key !== 'string' || entry.document_key.length === 0) {
				throw new Error(`planPerSourceDocument requires context_for_documents[${i}].document_key to be a non-empty string`);
			}
			
			if (!('content_to_include' in entry)) {
				throw new Error(`planPerSourceDocument requires context_for_documents[${i}].content_to_include object model, but it is missing`);
			}
			
			if (Array.isArray(entry.content_to_include)) {
				throw new Error(`planPerSourceDocument requires context_for_documents[${i}].content_to_include to be an object, not an array at top level`);
			}
			
			if (!isContentToInclude(entry.content_to_include)) {
				throw new Error(`planPerSourceDocument requires context_for_documents[${i}].content_to_include to conform to ContentToInclude type structure`);
			}
			
			// Construct properly typed ContextForDocument object
			const validatedEntry: ContextForDocument = {
				document_key: entry.document_key,
				content_to_include: entry.content_to_include,
			};
			validatedContextForDocuments.push(validatedEntry);
		}
		
		// Create PLAN job payload
		const planPayload: DialecticPlanJobPayload = {
			// Inherit ALL fields from parent job payload (defensive programming)
			projectId: parentJob.payload.projectId,
			sessionId: parentJob.payload.sessionId,
			stageSlug: parentJob.payload.stageSlug,
			iterationNumber: parentJob.payload.iterationNumber,
			model_id: parentJob.payload.model_id,
			user_jwt: parentJwt,
			walletId: parentJob.payload.walletId,
			// Optional fields - include only if present in parent
			...(parentJob.payload.model_slug ? { model_slug: parentJob.payload.model_slug } : {}),
			...(parentJob.payload.continueUntilComplete !== undefined ? { continueUntilComplete: parentJob.payload.continueUntilComplete } : {}),
			...(parentJob.payload.maxRetries !== undefined ? { maxRetries: parentJob.payload.maxRetries } : {}),
			...(parentJob.payload.continuation_count !== undefined ? { continuation_count: parentJob.payload.continuation_count } : {}),
			...(typeof parentJob.payload.target_contribution_id === 'string' && parentJob.payload.target_contribution_id.length > 0
				? { target_contribution_id: parentJob.payload.target_contribution_id }
				: {}),
			...(parentJob.payload.is_test_job !== undefined ? { is_test_job: parentJob.payload.is_test_job } : {}),
			context_for_documents: validatedContextForDocuments,
		};
		
		return [planPayload];
	}

	// Handle EXECUTE jobs
	if (recipeStep.job_type === 'EXECUTE') {
		// Validate files_to_generate for EXECUTE jobs
		if (!recipeStep.outputs_required) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but outputs_required is missing');
		}
		
		const filesToGenerate = recipeStep.outputs_required.files_to_generate;
		if (!filesToGenerate) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but files_to_generate is missing');
		}
		
		if (!Array.isArray(filesToGenerate)) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.files_to_generate to be an array for EXECUTE jobs');
		}
		
		if (filesToGenerate.length === 0) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.files_to_generate to have at least one entry for EXECUTE jobs');
		}
		
		// Validate documents array for EXECUTE jobs
		const documents = recipeStep.outputs_required.documents;
		if (!documents) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing');
		}
		
		if (!Array.isArray(documents)) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.documents to be an array for EXECUTE jobs');
		}
		
		if (documents.length === 0) {
			throw new Error('planPerSourceDocument requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs');
		}
		
		// Validate each files_to_generate entry
		for (let i = 0; i < filesToGenerate.length; i++) {
			const file = filesToGenerate[i];
			
			if (!file || typeof file !== 'object') {
				throw new Error(`planPerSourceDocument requires files_to_generate[${i}] to be an object`);
			}
			
			if (!('from_document_key' in file) || typeof file.from_document_key !== 'string' || file.from_document_key.length === 0) {
				throw new Error(`planPerSourceDocument requires files_to_generate[${i}].from_document_key to be a non-empty string`);
			}
			
			if (!('template_filename' in file) || typeof file.template_filename !== 'string' || file.template_filename.length === 0) {
				throw new Error(`planPerSourceDocument requires files_to_generate[${i}].template_filename to be a non-empty string`);
			}
		}

		// Extract and validate document_key from recipeStep.outputs_required.documents[0].document_key
		// ONLY IF the step outputs documents (i.e., if outputs_required.documents exists and has at least one item)
		let documentKey: string | undefined;
	
		// Check if the step outputs documents: verify that outputs_required exists, is an object, has a documents property that is an array, and the array has at least one item
		const outputsDocuments = recipeStep.outputs_required &&
			typeof recipeStep.outputs_required === 'object' &&
			Array.isArray(recipeStep.outputs_required.documents) &&
			recipeStep.outputs_required.documents.length > 0;
		
		if (outputsDocuments && recipeStep.outputs_required && Array.isArray(recipeStep.outputs_required.documents) && recipeStep.outputs_required.documents.length > 0) {
			// If the step outputs documents, extract and validate document_key
			const firstDocument = recipeStep.outputs_required.documents[0];
			if (!firstDocument || typeof firstDocument !== 'object') {
				throw new Error('planPerSourceDocument requires recipeStep.outputs_required.documents[0].document_key but it is missing');
			}
			if (!('document_key' in firstDocument)) {
				throw new Error('planPerSourceDocument requires recipeStep.outputs_required.documents[0].document_key but it is missing');
			}
			const rawDocumentKey = firstDocument.document_key;
			if (rawDocumentKey === null || rawDocumentKey === undefined) {
				throw new Error(`planPerSourceDocument requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
			}
			if (typeof rawDocumentKey !== 'string') {
				throw new Error(`planPerSourceDocument requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
			}
			if (rawDocumentKey.length === 0) {
				throw new Error(`planPerSourceDocument requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
			}
			documentKey = rawDocumentKey;
		}
		// If the step does not output documents, documentKey remains undefined

		// If this step requires a header_context input, ensure we can supply header_context_id in payload.inputs.
		const requiresHeaderContext = Array.isArray(recipeStep.inputs_required)
			&& recipeStep.inputs_required.some((rule) => rule?.type === 'header_context');
		const headerContextId = requiresHeaderContext
			? filteredSourceDocs.find((d) => d.contribution_type === 'header_context')?.id
			: undefined;
		if (requiresHeaderContext && (typeof headerContextId !== 'string' || headerContextId.length === 0)) {
			throw new Error("planPerSourceDocument requires a sourceDoc with contribution_type 'header_context' when recipeStep.inputs_required includes header_context");
		}

		const childPayloads: DialecticExecuteJobPayload[] = [];

		// Select canonical anchor once for all child jobs based on recipe relevance,
		// not varying per iteration
		// 95.d.v: Handle 'derive_from_header_context' status from selectAnchorSourceDocument
		// IMPORTANT: Pass ALL sourceDocs (not filteredSourceDocs) to selectAnchorSourceDocument.
		// The anchor may come from a different model's output (e.g., thesis documents from model-a
		// when the parent job is for model-b in antithesis stage). Filtering is only for job creation.
		const anchorResult: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);
		if (anchorResult.status === 'anchor_not_found') {
			throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
		}
		const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;

		console.log(
			'[planPerSourceDocument] Received filteredSourceDocs:',
			JSON.stringify(filteredSourceDocs, null, 2)
		);
		for (const doc of filteredSourceDocs) {
			console.log(`[planPerSourceDocument] Processing doc: ${doc.id}`);

			// After filtering, doc.model_id must match parentModelId (which is a string)
			if (!doc.model_id || typeof doc.model_id !== 'string') {
				throw new Error(`planPerSourceDocument: doc.model_id must be a string after filtering, but got: ${typeof doc.model_id}`);
			}
			const docModelId: string = doc.model_id;

			// Resolve the effective output type for the child job.
			// Some recipe steps (e.g. comparison_vector) use an artifact-class output_type like
			// 'assembled_document_json' while the actual model contribution file type should be
			// derived from outputs_required.documents[0].document_key.
			let effectiveOutputType: ModelContributionFileTypes;
			if (isModelContributionFileType(recipeStep.output_type)) {
				effectiveOutputType = recipeStep.output_type;
			} else if (typeof documentKey === 'string' && isModelContributionFileType(documentKey)) {
				effectiveOutputType = documentKey;
			} else {
				throw new Error(`Invalid output_type for planPerSourceDocument: ${recipeStep.output_type}`);
			}

			const canonicalPathParams = createCanonicalPathParams(
				[doc],
				effectiveOutputType,
				anchorForCanonicalPathParams,
				stageSlug
			);
			console.log(
				`[planPerSourceDocument] Created canonicalPathParams for doc ${doc.id}:`,
				JSON.stringify(canonicalPathParams, null, 2)
			);

			const inputs: Record<string, string> = {};
			if (doc.contribution_type) {
				inputs[`${doc.contribution_type}_id`] = doc.id;
			}
			if (requiresHeaderContext && headerContextId) {
				inputs.header_context_id = headerContextId;
			}

			const newPayload: DialecticExecuteJobPayload = {
				// Inherit ALL fields from parent job payload (defensive programming)
				projectId: parentJob.payload.projectId,
				sessionId: parentJob.payload.sessionId,
				stageSlug: parentJob.payload.stageSlug,
				iterationNumber: parentJob.payload.iterationNumber,
				// 95.d.iv: For EXECUTE jobs, set child job's model_id from the source document's model_id
				model_id: docModelId,
				user_jwt: parentJwt, // Use the validated parentJwt
				walletId: parentJob.payload.walletId,
				// Optional fields - include only if present in parent
				...(parentJob.payload.model_slug ? { model_slug: parentJob.payload.model_slug } : {}),
				...(parentJob.payload.continueUntilComplete !== undefined ? { continueUntilComplete: parentJob.payload.continueUntilComplete } : {}),
				...(parentJob.payload.maxRetries !== undefined ? { maxRetries: parentJob.payload.maxRetries } : {}),
				...(parentJob.payload.continuation_count !== undefined ? { continuation_count: parentJob.payload.continuation_count } : {}),
				...(typeof parentJob.payload.target_contribution_id === 'string' && parentJob.payload.target_contribution_id.length > 0
					? { target_contribution_id: parentJob.payload.target_contribution_id }
					: {}),
				...(parentJob.payload.is_test_job !== undefined ? { is_test_job: parentJob.payload.is_test_job } : {}),
				// Override job-specific properties
				prompt_template_id: recipeStep.prompt_template_id,
				output_type: effectiveOutputType,
				canonicalPathParams, // Use the new contract
				document_relationships: { source_group: doc.id },
				inputs,
				planner_metadata: { recipe_step_id: recipeStep.id },
				document_key: documentKey,
			};
			const derivedSourceContributionId = deriveSourceContributionId(
				doc.id,
				doc.document_relationships
			);
			if (derivedSourceContributionId) {
				newPayload.sourceContributionId = derivedSourceContributionId;
			}
			console.log(
				`[planPerSourceDocument] Constructed newPayload for doc ${doc.id}:`,
				JSON.stringify(newPayload, null, 2)
			);

			childPayloads.push(newPayload);
			console.log(
				`[planPerSourceDocument] Pushed payload for doc ${doc.id}. childPayloads length: ${childPayloads.length}`
			);
		}

		console.log(
			`[planPerSourceDocument] Returning ${childPayloads.length} payloads:`,
			JSON.stringify(childPayloads, null, 2)
		);
		return childPayloads;
	}
	
	// This should never be reached due to job_type validation above, but TypeScript requires it
	throw new Error(`planPerSourceDocument: unreachable code reached with job_type: ${recipeStep.job_type}`);
}; 