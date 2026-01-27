// supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts
import type {
	DialecticExecuteJobPayload,
	DialecticPlanJobPayload,
	GranularityPlannerFn,
	ContextForDocument,
	SelectAnchorResult,
} from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { selectAnchorSourceDocument } from '../helpers.ts';
import { isContributionType, isContentToInclude } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';

export const planPerModel: GranularityPlannerFn = (
	sourceDocs,
	parentJob,
	recipeStep,
	_authToken
) => {
	const modelId = parentJob.payload.model_id;

	if (!modelId) {
		throw new TypeError(
			`Invalid parent job for planPerModel: model_id is missing.`
		);
	}
	if (sourceDocs.length === 0) {
		throw new Error(
			'Invalid inputs for planPerModel: At least one source document is required.'
		);
	}
	if (!recipeStep.prompt_template_id) {
		throw new TypeError(
			`Invalid recipe step for planPerModel: prompt_template_id is missing.`
		);
	}
	if (!recipeStep.output_type) {
		throw new TypeError(
			`Invalid recipe step for planPerModel: output_type is missing.`
		);
	}

	if(!isModelContributionFileType(recipeStep.output_type)) {
		throw new Error(`Invalid output_type for planPerModel: ${recipeStep.output_type}`);
	}

	const stageSlug = parentJob.payload.stageSlug;
	if (!stageSlug || !isContributionType(stageSlug)) {
		throw new Error(
			`planPerModel requires a valid ContributionType stageSlug, but received: ${stageSlug}`
		);
	}

	if (!recipeStep.id) {
		throw new Error(`Invalid recipe step for planPerModel: id is missing.`);
	}

	// Validate job_type is either 'PLAN' or 'EXECUTE'
	if (recipeStep.job_type !== 'PLAN' && recipeStep.job_type !== 'EXECUTE') {
		throw new Error(`planPerModel requires job_type to be 'PLAN' or 'EXECUTE', received: ${recipeStep.job_type}`);
	}

	// Handle PLAN and EXECUTE jobs separately
	if (recipeStep.job_type === 'PLAN') {
		// Validate context_for_documents for PLAN jobs
		if (!recipeStep.outputs_required) {
			throw new Error('planPerModel requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but outputs_required is missing');
		}
		
		if (!recipeStep.outputs_required.context_for_documents) {
			throw new Error('planPerModel requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but context_for_documents is missing');
		}
		
		if (!Array.isArray(recipeStep.outputs_required.context_for_documents)) {
			throw new Error('planPerModel requires recipeStep.outputs_required.context_for_documents to be an array for PLAN jobs');
		}
		
		if (recipeStep.outputs_required.context_for_documents.length === 0) {
			throw new Error('planPerModel requires recipeStep.outputs_required.context_for_documents to have at least one entry for PLAN jobs');
		}
		
		const contextForDocuments: ContextForDocument[] = recipeStep.outputs_required.context_for_documents;
		
		// Validate each context_for_documents entry
		for (let i = 0; i < contextForDocuments.length; i++) {
			const entry = contextForDocuments[i];
			
			if (!entry || typeof entry !== 'object') {
				throw new Error(`planPerModel requires context_for_documents[${i}] to be an object`);
			}
			
			if (!('document_key' in entry) || typeof entry.document_key !== 'string' || entry.document_key.length === 0) {
				throw new Error(`planPerModel requires context_for_documents[${i}].document_key to be a non-empty string`);
			}
			
			if (!('content_to_include' in entry)) {
				throw new Error(`planPerModel requires context_for_documents[${i}].content_to_include object model, but it is missing`);
			}
			
			if (Array.isArray(entry.content_to_include)) {
				throw new Error(`planPerModel requires context_for_documents[${i}].content_to_include to be an object, not an array at top level`);
			}
			
			if (!isContentToInclude(entry.content_to_include)) {
				throw new Error(`planPerModel requires context_for_documents[${i}].content_to_include to conform to ContentToInclude type structure`);
			}
		}
		
		// Create PLAN job payload
		const planPayload: DialecticPlanJobPayload = {
			// Inherit ALL fields from parent job payload (defensive programming)
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

			context_for_documents: contextForDocuments,
	};
		
		console.log(`[planPerModel] Created 1 child job for model ${modelId}.`);
		
		return [planPayload];
	}
	
	// Handle EXECUTE jobs
	if (recipeStep.job_type === 'EXECUTE') {
		// Validate files_to_generate for EXECUTE jobs
		if (!recipeStep.outputs_required) {
			throw new Error('planPerModel requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but outputs_required is missing');
		}
		
		const filesToGenerate = recipeStep.outputs_required.files_to_generate;
		if (!filesToGenerate) {
			throw new Error('planPerModel requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but files_to_generate is missing');
		}
		
		if (!Array.isArray(filesToGenerate)) {
			throw new Error('planPerModel requires recipeStep.outputs_required.files_to_generate to be an array for EXECUTE jobs');
		}
		
		if (filesToGenerate.length === 0) {
			throw new Error('planPerModel requires recipeStep.outputs_required.files_to_generate to have at least one entry for EXECUTE jobs');
		}
		
		// Validate documents array for EXECUTE jobs (OR header_context_artifact)
		const documents = recipeStep.outputs_required.documents;
		const hasDocuments = Array.isArray(documents) && documents.length > 0;
		const hasHeaderContextArtifact = recipeStep.outputs_required.header_context_artifact && typeof recipeStep.outputs_required.header_context_artifact === 'object';

		if (!hasDocuments && !hasHeaderContextArtifact) {
			throw new Error('planPerModel requires recipeStep.outputs_required.documents (array) OR recipeStep.outputs_required.header_context_artifact (object) for EXECUTE jobs, but both are missing/empty');
		}
		
		if (hasDocuments) {
			// Validate each documents entry if present
			for (let i = 0; i < documents.length; i++) {
				// Basic validation if needed, though strictly we only use the first one's key currently
			}
		}
		
		// Validate each files_to_generate entry
		for (let i = 0; i < filesToGenerate.length; i++) {
			const file = filesToGenerate[i];
			
			if (!file || typeof file !== 'object') {
				throw new Error(`planPerModel requires files_to_generate[${i}] to be an object`);
			}
			
			if (!('from_document_key' in file) || typeof file.from_document_key !== 'string' || file.from_document_key.length === 0) {
				throw new Error(`planPerModel requires files_to_generate[${i}].from_document_key to be a non-empty string`);
			}
			
			if (!('template_filename' in file) || typeof file.template_filename !== 'string' || file.template_filename.length === 0) {
				throw new Error(`planPerModel requires files_to_generate[${i}].template_filename to be a non-empty string`);
			}
		}

		const childPayloads: DialecticExecuteJobPayload[] = [];

		// This planner creates one job for the parent job's specific model.
		// It assumes all source documents are inputs for this single job.

		// Use first doc for lineage/sourceContributionId
		const anchorDoc = sourceDocs[0];
		let sourceContributionId: string | null = anchorDoc.id;
		if (typeof sourceContributionId !== 'string' || sourceContributionId.length === 0) {
			sourceContributionId = null;
		}

		// Use universal selector for canonical path params (selects highest-relevance document)
		const anchorResult: SelectAnchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);
		if (anchorResult.status === 'anchor_not_found') {
			throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
		}
		const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;

	const canonicalPathParams = createCanonicalPathParams(
		sourceDocs,
		recipeStep.output_type,
		anchorForCanonicalPathParams,
		stageSlug
	);

	// 96.d.ii: When selectAnchorSourceDocument returns 'no_anchor_required', set source_group = null
	// This signals the producer to create a new lineage root (set source_group = self.id after save)
	const document_relationships: Record<string, string | null> = {
		source_group: anchorResult.status === 'no_anchor_required' ? null : anchorDoc.id,
	};

	// 96.d.i & 96.d.iv: Bundle ALL sourceDocs into inputs, grouped by contribution_type
	// Each contribution_type gets a key like 'thesis_ids', 'antithesis_ids', etc. containing an array of document IDs
	const inputs: Record<string, string | string[]> = {};
	for (const doc of sourceDocs) {
		const key = `${doc.contribution_type}_ids`;
		const existing = inputs[key];
		if (Array.isArray(existing)) {
			existing.push(doc.id);
		} else if (typeof existing === 'string') {
			inputs[key] = [existing, doc.id];
		} else {
			inputs[key] = [doc.id];
		}
	}

	// If this step requires a header_context input, ensure we can supply header_context_id in payload.inputs.
	const requiresHeaderContext = Array.isArray(recipeStep.inputs_required)
		&& recipeStep.inputs_required.some((rule) => rule?.type === 'header_context');
	const headerContextId = requiresHeaderContext
		? sourceDocs.find((d) => 
			d.contribution_type === 'header_context' &&
			d.model_id === modelId
		)?.id
		: undefined;
	if (requiresHeaderContext && (typeof headerContextId !== 'string' || headerContextId.length === 0)) {
		throw new Error('planPerModel requires a sourceDoc with contribution_type \'header_context\' and matching model_id when recipeStep.inputs_required includes header_context');
	}
	if (requiresHeaderContext && headerContextId) {
		inputs.header_context_id = headerContextId;
	}

		// Extract and validate document_key
		// Priority:
		// 1. outputs_required.documents[0].document_key
		// 2. outputs_required.header_context_artifact.document_key
		// 3. recipeStep.branch_key
		let documentKey: string | undefined;
		
		if (hasDocuments && documents[0]) {
			const firstDocument = documents[0];
			if (typeof firstDocument === 'object' && 'document_key' in firstDocument) {
				const rawKey = firstDocument.document_key;
				if (typeof rawKey === 'string' && rawKey.length > 0) {
					documentKey = rawKey;
				}
			}
		}

		if (!documentKey && hasHeaderContextArtifact) {
			const artifact = recipeStep.outputs_required.header_context_artifact;
			if (artifact && typeof artifact.document_key === 'string' && artifact.document_key.length > 0) {
				documentKey = artifact.document_key;
			}
		}

		if (!documentKey && typeof recipeStep.branch_key === 'string' && recipeStep.branch_key.length > 0) {
			documentKey = recipeStep.branch_key;
		}

		// Validation: document_key MUST be resolved for EXECUTE jobs
		if (!documentKey) {
			throw new Error('planPerModel failed to resolve document_key for EXECUTE job. Checked: outputs_required.documents[0].document_key, outputs_required.header_context_artifact.document_key, recipeStep.branch_key');
		}

		const newPayload: DialecticExecuteJobPayload = {
			// Inherit ALL fields from parent job payload (defensive programming)
			projectId: parentJob.payload.projectId,
			sessionId: parentJob.payload.sessionId,
			stageSlug: parentJob.payload.stageSlug,
			iterationNumber: parentJob.payload.iterationNumber,
			model_id: modelId, // Assign the job to the specific model from the parent planner
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
			
			// Override job-specific properties
			prompt_template_id: recipeStep.prompt_template_id,
			output_type: recipeStep.output_type,
			canonicalPathParams,
			document_relationships: document_relationships,
			inputs,
			sourceContributionId,
			planner_metadata: { recipe_step_id: recipeStep.id },
			document_key: documentKey,
		};

		childPayloads.push(newPayload);

		console.log(`[planPerModel] Created 1 child job for model ${modelId}.`);

		return childPayloads;
	}
	
	// This should never be reached due to job_type validation above, but TypeScript requires it
	throw new Error(`planPerModel: unreachable code reached with job_type: ${recipeStep.job_type}`);
};
