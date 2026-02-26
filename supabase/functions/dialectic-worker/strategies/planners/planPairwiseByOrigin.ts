// supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts
import type {
	DialecticExecuteJobPayload,
	DialecticPlanJobPayload,
	GranularityPlannerFn,
	SourceDocument,
	ContextForDocument,
	SelectAnchorResult,
} from '../../../dialectic-service/dialectic.interface.ts';
import { groupSourceDocumentsByType, selectAnchorSourceDocument } from '../helpers.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { isContributionType, isContentToInclude } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { deconstructStoragePath } from '../../../_shared/utils/path_deconstructor.ts';

export const planPairwiseByOrigin: GranularityPlannerFn = (
	sourceDocs,
	parentJob,
	recipeStep,
	_authToken
) => {
	if (!recipeStep.prompt_template_id) {
		throw new TypeError(
			`Invalid recipe step for planPairwiseByOrigin: prompt_template_id is missing.`
		);
	}
	if (!recipeStep.output_type) {
		throw new TypeError(
			`Invalid recipe step for planPairwiseByOrigin: output_type is missing.`
		);
	}
	if (!recipeStep.id) {
		throw new Error(`Invalid recipe step for planPairwiseByOrigin: id is missing.`);
	}

	if (!isModelContributionFileType(recipeStep.output_type)) {
		throw new Error(`Invalid output_type for planPairwiseByOrigin: ${recipeStep.output_type}`);
	}

	const stageSlug = parentJob.payload.stageSlug;
	if (!stageSlug || !isContributionType(stageSlug)) {
		throw new Error(
			`planPairwiseByOrigin requires a valid ContributionType stageSlug, but received: ${stageSlug}`
		);
	}

	// Validate job_type is either 'PLAN' or 'EXECUTE'
	if (recipeStep.job_type !== 'PLAN' && recipeStep.job_type !== 'EXECUTE') {
		throw new Error(`planPairwiseByOrigin requires job_type to be 'PLAN' or 'EXECUTE', received: ${recipeStep.job_type}`);
	}

	// Group documents by contribution_type (generic - works with any contribution types)
	const documentsByType = groupSourceDocumentsByType(sourceDocs);
	const contributionTypes = Object.keys(documentsByType);

	if (contributionTypes.length < 2) {
		throw new Error(
			`planPairwiseByOrigin requires at least two different contribution types to create pairs, but found: ${contributionTypes.length}`
		);
	}

	// Extract stage slugs from inputs_required to identify anchor vs paired stages
	// The first document-type input is the "anchor" stage (e.g., thesis)
	// The second document-type input is the "paired" stage (e.g., antithesis)
	const inputsRequired = recipeStep.inputs_required ?? [];
	const stageSlugsByOrder: string[] = [];
	for (const input of inputsRequired) {
		if (input.type === 'document' && input.slug && !stageSlugsByOrder.includes(input.slug)) {
			stageSlugsByOrder.push(input.slug);
		}
	}

	if (stageSlugsByOrder.length < 2) {
		throw new Error(
			`planPairwiseByOrigin requires inputs_required with at least two different stage slugs for document inputs, but found: ${stageSlugsByOrder.length}`
		);
	}

	// Use the first two document stages for pairing
	const anchorStageSlug = stageSlugsByOrder[0];
	const pairedStageSlug = stageSlugsByOrder[1];

	// Get required document_key values for the paired stage (antithesis) from inputs_required
	const requiredPairedDocumentKeys = new Set<string>();
	for (const input of recipeStep.inputs_required || []) {
		if (input.type === 'document' && input.slug === pairedStageSlug && input.document_key) {
			requiredPairedDocumentKeys.add(input.document_key);
		}
	}

	// Separate all documents by stage across the entire sourceDocs array
	// Pairing works based on filename patterns, not source_group values
	const anchorStageDocs = sourceDocs.filter(doc => doc.stage === anchorStageSlug);
	const pairedStageDocs = sourceDocs.filter(doc => doc.stage === pairedStageSlug);

	if (anchorStageDocs.length === 0) {
		throw new Error(
			`planPairwiseByOrigin requires anchor documents from stage '${anchorStageSlug}', but none were found`
		);
	}

	if (pairedStageDocs.length === 0) {
		throw new Error(
			`planPairwiseByOrigin requires paired documents from stage '${pairedStageSlug}', but none were found`
		);
	}

	// Group documents by (thesis model, antithesis model) and filter by required document_key values
	// Structure: pairedDocumentsByPairingKey[`${thesisDocId}:${antithesisModelSlug}`] = [antithesis docs with required document_keys]
	type PairingKey = string; // Format: `${thesisDocId}:${antithesisModelSlug}`
	const anchorDocuments: SourceDocument[] = [];
	const pairedDocumentsByPairingKey: Record<PairingKey, SourceDocument[]> = {};

	// For each anchor document (thesis), extract thesis model
	for (const anchorDoc of anchorStageDocs) {
		if (!anchorDoc.id) continue;

		// Extract thesis model from anchor document
		let thesisModelSlug: string | undefined = anchorDoc.model_name || anchorDoc.model_id || undefined;
		if (!thesisModelSlug && anchorDoc.storage_path && anchorDoc.file_name) {
			// Fallback: extract from filename using deconstructStoragePath
			try {
				const deconstructed = deconstructStoragePath({
					storageDir: anchorDoc.storage_path,
					fileName: anchorDoc.file_name
				});
				thesisModelSlug = deconstructed.modelSlug;
			} catch (error) {
				// If deconstruction fails, skip this anchor document
				console.warn(`[planPairwiseByOrigin] Failed to extract thesis model from anchor document ${anchorDoc.id}: ${error instanceof Error ? error.message : String(error)}`);
				continue;
			}
		}

		if (!thesisModelSlug) {
			console.warn(`[planPairwiseByOrigin] Cannot extract thesis model from anchor document ${anchorDoc.id}, skipping`);
			continue;
		}

		// Track this anchor document
		if (!anchorDocuments.find(doc => doc.id === anchorDoc.id)) {
			anchorDocuments.push(anchorDoc);
		}

		// For each paired document (antithesis) across ALL documents, extract antithesis model and critiqued thesis model
		// Match based on filename patterns, not source_group values
		for (const pairedDoc of pairedStageDocs) {
			if (!pairedDoc.storage_path || !pairedDoc.file_name) {
				console.warn(`[planPairwiseByOrigin] Paired document ${pairedDoc.id} missing storage_path or file_name, skipping`);
				continue;
			}

			// Extract pairing information from filename using deconstructStoragePath
			let antithesisModelSlug: string | undefined;
			let critiquedThesisModelSlug: string | undefined;
			let pairedDocumentKey: string | undefined;

			try {
				const deconstructed = deconstructStoragePath({
					storageDir: pairedDoc.storage_path,
					fileName: pairedDoc.file_name
				});

				antithesisModelSlug = deconstructed.modelSlug;
				// For antithesis documents, sourceModelSlug is the critiqued thesis model
				critiquedThesisModelSlug = deconstructed.sourceModelSlug || deconstructed.sourceAnchorModelSlug;
				pairedDocumentKey = deconstructed.documentKey;
			} catch (error) {
				console.warn(`[planPairwiseByOrigin] Failed to deconstruct paired document ${pairedDoc.id}: ${error instanceof Error ? error.message : String(error)}`);
				continue;
			}

			if (!antithesisModelSlug) {
				console.warn(`[planPairwiseByOrigin] Cannot extract antithesis model from paired document ${pairedDoc.id}, skipping`);
				continue;
			}

			// Verify that this antithesis document critiques this thesis document
			// Match by comparing thesis model with critiqued thesis model from filename pattern
			if (critiquedThesisModelSlug && critiquedThesisModelSlug !== thesisModelSlug) {
				// This antithesis document critiques a different thesis, skip it
				continue;
			}

			// Filter by required document_key values
			if (requiredPairedDocumentKeys.size > 0) {
				const docKey = pairedDocumentKey || pairedDoc.document_key;
				if (!docKey || !requiredPairedDocumentKeys.has(docKey)) {
					// This document doesn't match any required document_key, skip it
					continue;
				}
			}

			// Group by (thesis document ID, antithesis model slug)
			const pairingKey: PairingKey = `${anchorDoc.id}:${antithesisModelSlug}`;
			if (!pairedDocumentsByPairingKey[pairingKey]) {
				pairedDocumentsByPairingKey[pairingKey] = [];
			}
			pairedDocumentsByPairingKey[pairingKey].push(pairedDoc);
		}
	}

	if (anchorDocuments.length === 0) {
		throw new Error(
			`planPairwiseByOrigin requires anchor documents from stage '${anchorStageSlug}', but none were found`
		);
	}

	// Validate that all required anchors can be found
	// If no pairing keys were created, this means no antithesis documents critique any thesis documents
	// This is an error condition - we should fail fast rather than silently returning no jobs
	const hasPairingKeys = Object.keys(pairedDocumentsByPairingKey).length > 0;
	if (!hasPairingKeys) {
		// Check if we can find required anchors - if not, throw anchor_not_found error
		const anchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);
		if (anchorResult.status === 'anchor_not_found') {
			throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
		}
		// If anchors exist but no pairing keys, it means no antithesis documents match any thesis documents
		throw new Error(
			`planPairwiseByOrigin could not create any pairs: no antithesis documents from stage '${pairedStageSlug}' critique any thesis documents from stage '${anchorStageSlug}'. ` +
			`Found ${anchorStageDocs.length} anchor document(s) and ${pairedStageDocs.length} paired document(s), but no matches based on filename patterns.`
		);
	}

	// Handle PLAN and EXECUTE jobs separately
	if (recipeStep.job_type === 'PLAN') {
		// Validate context_for_documents for PLAN jobs
		if (!recipeStep.outputs_required) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but outputs_required is missing');
		}
		
		const contextForDocuments = recipeStep.outputs_required.context_for_documents;
		if (!contextForDocuments) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but context_for_documents is missing');
		}
		
		if (!Array.isArray(contextForDocuments)) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.context_for_documents to be an array for PLAN jobs');
		}
		
		if (contextForDocuments.length === 0) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.context_for_documents to have at least one entry for PLAN jobs');
		}
		
		// Validate each context_for_documents entry
		for (let i = 0; i < contextForDocuments.length; i++) {
			const entry = contextForDocuments[i];
			
			if (!entry || typeof entry !== 'object') {
				throw new Error(`planPairwiseByOrigin requires context_for_documents[${i}] to be an object`);
			}
			
			if (!('document_key' in entry) || typeof entry.document_key !== 'string' || entry.document_key.length === 0) {
				throw new Error(`planPairwiseByOrigin requires context_for_documents[${i}].document_key to be a non-empty string`);
			}
			
			if (!('content_to_include' in entry)) {
				throw new Error(`planPairwiseByOrigin requires context_for_documents[${i}].content_to_include object model, but it is missing`);
			}
			
			if (Array.isArray(entry.content_to_include)) {
				throw new Error(`planPairwiseByOrigin requires context_for_documents[${i}].content_to_include to be an object, not an array at top level`);
			}
			
		if (!isContentToInclude(entry.content_to_include)) {
			throw new Error(`planPairwiseByOrigin requires context_for_documents[${i}].content_to_include to conform to ContentToInclude type structure`);
		}
	}
	
	// Type assertion after validation: contextForDocuments is now confirmed to be ContextForDocument[]
	const validatedContextForDocuments: ContextForDocument[] = contextForDocuments;
	
	// Create PLAN job payloads (one per thesis-antithesis model pair, bundling all required antithesis documents)
	const childPayloads: DialecticPlanJobPayload[] = [];
		
		for (const anchorDoc of anchorDocuments) {
			// Find all pairing keys that start with this anchor document ID
			const pairingKeys = Object.keys(pairedDocumentsByPairingKey).filter(key => key.startsWith(`${anchorDoc.id}:`));

			for (const pairingKey of pairingKeys) {
				const pairedDocs = pairedDocumentsByPairingKey[pairingKey] || [];
				if (pairedDocs.length === 0) continue;

				// Extract antithesis model slug from pairing key
				const antithesisModelSlug = pairingKey.split(':')[1];
				if (!antithesisModelSlug) continue;

				// Use the first paired document as the anchor for canonical path params
				// (all paired documents in this group have the same antithesis model)
				const anchorPairedDoc = pairedDocs[0];

				if (!anchorPairedDoc.id) {
					throw new Error(
						`planPairwiseByOrigin requires each paired document to have an id`
					);
				}

				const planPayload: DialecticPlanJobPayload = {
					// Inherit ALL fields from parent job payload (defensive programming)
					projectId: parentJob.payload.projectId,
					sessionId: parentJob.payload.sessionId,
					stageSlug: parentJob.payload.stageSlug,
					iterationNumber: parentJob.payload.iterationNumber,
					model_id: parentJob.payload.model_id,
					model_slug: parentJob.payload.model_slug,
					user_jwt: parentJob.payload.user_jwt,
					walletId: parentJob.payload.walletId,
					continueUntilComplete: parentJob.payload.continueUntilComplete,
					maxRetries: parentJob.payload.maxRetries,
					continuation_count: parentJob.payload.continuation_count,
				target_contribution_id: parentJob.payload.target_contribution_id,
				is_test_job: parentJob.payload.is_test_job,
				context_for_documents: validatedContextForDocuments,
			};

				childPayloads.push(planPayload);
			}
		}

		return childPayloads;
	}
	
	// Handle EXECUTE jobs
	if (recipeStep.job_type === 'EXECUTE') {
		// Validate files_to_generate for EXECUTE jobs
		if (!recipeStep.outputs_required) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but outputs_required is missing');
		}
		
		const filesToGenerate = recipeStep.outputs_required.files_to_generate;
		if (!filesToGenerate) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but files_to_generate is missing');
		}
		
		if (!Array.isArray(filesToGenerate)) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.files_to_generate to be an array for EXECUTE jobs');
		}
		
		if (filesToGenerate.length === 0) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.files_to_generate to have at least one entry for EXECUTE jobs');
		}
		
		// Validate documents array for EXECUTE jobs
		const documents = recipeStep.outputs_required.documents;
		if (!documents) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing');
		}
		
		if (!Array.isArray(documents)) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.documents to be an array for EXECUTE jobs');
		}
		
		if (documents.length === 0) {
			throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs');
		}
		
		// Validate each files_to_generate entry
		for (let i = 0; i < filesToGenerate.length; i++) {
			const file = filesToGenerate[i];
			
			if (!file || typeof file !== 'object') {
				throw new Error(`planPairwiseByOrigin requires files_to_generate[${i}] to be an object`);
			}
			
			if (!('from_document_key' in file) || typeof file.from_document_key !== 'string' || file.from_document_key.length === 0) {
				throw new Error(`planPairwiseByOrigin requires files_to_generate[${i}].from_document_key to be a non-empty string`);
			}
			
			if (!('template_filename' in file) || typeof file.template_filename !== 'string' || file.template_filename.length === 0) {
				throw new Error(`planPairwiseByOrigin requires files_to_generate[${i}].template_filename to be a non-empty string`);
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
				throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.documents[0].document_key but it is missing');
			}
			if (!('document_key' in firstDocument)) {
				throw new Error('planPairwiseByOrigin requires recipeStep.outputs_required.documents[0].document_key but it is missing');
			}
			const rawDocumentKey = firstDocument.document_key;
			if (rawDocumentKey === null || rawDocumentKey === undefined) {
				throw new Error(`planPairwiseByOrigin requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
			}
			if (typeof rawDocumentKey !== 'string') {
				throw new Error(`planPairwiseByOrigin requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
			}
			if (rawDocumentKey.length === 0) {
				throw new Error(`planPairwiseByOrigin requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
			}
			documentKey = rawDocumentKey;
		}
		// If the step does not output documents, documentKey remains undefined

		// If this step requires a header_context input, ensure we can supply header_context_id in payload.inputs.
		const requiresHeaderContext = Array.isArray(recipeStep.inputs_required)
			&& recipeStep.inputs_required.some((rule) => rule?.type === 'header_context');
		
		// Extract the document_key if specified in the header_context rule
		const headerContextRule = requiresHeaderContext
			? recipeStep.inputs_required.find((rule) => rule?.type === 'header_context')
			: null;
		const requiredHeaderContextKey = headerContextRule?.document_key;
		
		// Find the header_context document matching the parent job's model_id (the executing model)
		const headerContextId = requiresHeaderContext
			? sourceDocs.find((d: SourceDocument) => 
				d.contribution_type === 'header_context' &&
				d.model_id === parentJob.payload.model_id &&
				(!requiredHeaderContextKey || d.document_key === requiredHeaderContextKey)
			)?.id
			: undefined;
		
		if (requiresHeaderContext && (typeof headerContextId !== 'string' || headerContextId.length === 0)) {
			throw new Error(
				`planPairwiseByOrigin requires a sourceDoc with contribution_type 'header_context' ` +
				`and model_id '${parentJob.payload.model_id}' when recipeStep.inputs_required includes header_context`
			);
		}

		const childPayloads: DialecticExecuteJobPayload[] = [];

		for (const anchorDoc of anchorDocuments) {
			// Find all pairing keys that start with this anchor document ID
			const pairingKeys = Object.keys(pairedDocumentsByPairingKey).filter(key => key.startsWith(`${anchorDoc.id}:`));

			for (const pairingKey of pairingKeys) {
				const pairedDocs = pairedDocumentsByPairingKey[pairingKey] || [];
				if (pairedDocs.length === 0) continue;

				// Extract antithesis model slug from pairing key
				const antithesisModelSlug = pairingKey.split(':')[1];
				if (!antithesisModelSlug) continue;

				// Use the first paired document as the anchor for canonical path params
				// (all paired documents in this group have the same antithesis model)
				const anchorPairedDoc = pairedDocs[0];

				if (!anchorPairedDoc.id) {
					throw new Error(
						`planPairwiseByOrigin requires each paired document to have an id`
					);
				}

				// Step 7.a.ii: Call the canonical context builder
				// Create pair array: thesis document + all antithesis documents from this antithesis model
				const pair: SourceDocument[] = [anchorDoc, ...pairedDocs];
				// Select canonical anchor from pair based on recipe relevance, not structural anchor
				const anchorResult: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, pair);
				if (anchorResult.status === 'anchor_not_found') {
					throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
				}
				const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;
				const canonicalPathParams = createCanonicalPathParams(
					pair,
					recipeStep.output_type,
					anchorForCanonicalPathParams,
					stageSlug
				);
				console.log(
					'[planPairwiseByOrigin] Created canonicalPathParams:',
					JSON.stringify(canonicalPathParams, null, 2)
				);

				// Step 7.a.iii: Dynamically create inputs and relationships
				const inputs: Record<string, string | string[]> = {};
				const document_relationships: Record<string, string> = {};

				// Add thesis document
				if (anchorDoc.contribution_type) {
					inputs[`${anchorDoc.contribution_type}_id`] = anchorDoc.id;
					document_relationships[anchorDoc.contribution_type] = anchorDoc.id;
				}

				// Add all paired antithesis documents as an array
				// Bundle ALL required antithesis documents from the same antithesis model
				if (pairedDocs.length > 0 && anchorPairedDoc.contribution_type) {
					const pairedContributionType = anchorPairedDoc.contribution_type;
					const pairedKey = `${pairedContributionType}_ids`;
					const pairedIds = pairedDocs
						.filter((doc: SourceDocument) => doc.id && doc.contribution_type === pairedContributionType)
						.map((doc: SourceDocument) => doc.id!);
					
					if (pairedIds.length > 0) {
						inputs[pairedKey] = pairedIds;
					}

					// Use the anchor paired document for document_relationships (first one)
					document_relationships[pairedContributionType] = anchorPairedDoc.id;
				}
				// Ensure source_group is correctly populated
				document_relationships.source_group = anchorDoc.id;

				// Add header_context_id if required
				if (requiresHeaderContext && headerContextId) {
					inputs.header_context_id = headerContextId;
				}

				const newPayload: DialecticExecuteJobPayload = {
					// Inherit ALL fields from parent payload first (defensive programming)
					projectId: parentJob.payload.projectId,
					sessionId: parentJob.payload.sessionId,
					stageSlug: parentJob.payload.stageSlug,
					iterationNumber: parentJob.payload.iterationNumber,
					model_id: parentJob.payload.model_id,
					user_jwt: parentJob.payload.user_jwt,
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

					// Set job-specific properties that override or supplement parent fields
					prompt_template_id: recipeStep.prompt_template_id,
					output_type: recipeStep.output_type,
					canonicalPathParams,
					document_relationships,
					inputs,
					isIntermediate: true,
					sourceContributionId: anchorPairedDoc.id,
					planner_metadata: { recipe_step_id: recipeStep.id },
					document_key: documentKey,
				};

				childPayloads.push(newPayload);
			}
		}

		return childPayloads;
	}
	
	// This should never be reached due to job_type validation above, but TypeScript requires it
	throw new Error(`planPairwiseByOrigin: unreachable code reached with job_type: ${recipeStep.job_type}`);
}; 