// supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts
import type {
	DialecticExecuteJobPayload,
	GranularityPlannerFn,
} from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { isContributionType } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';

export const planPerModel: GranularityPlannerFn = (
	sourceDocs,
	parentJob,
	recipeStep
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

	const stageSlug = parentJob.payload.stageSlug;
	if (!stageSlug || !isContributionType(stageSlug)) {
		throw new Error(
			`planPerModel requires a valid ContributionType stageSlug, but received: ${stageSlug}`
		);
	}

	const childPayloads: DialecticExecuteJobPayload[] = [];

	// This planner creates one job for the parent job's specific model.
	// It assumes all source documents are inputs for this single job.

	const anchorDoc = sourceDocs[0];
	const sourceContributionId =
		anchorDoc && typeof anchorDoc.id === 'string' && anchorDoc.id.length > 0
			? anchorDoc.id
			: null;
	const canonicalPathParams = createCanonicalPathParams(
		sourceDocs,
		recipeStep.output_type,
		anchorDoc,
		stageSlug
	);

	const synthesisDocIds = sourceDocs.map((d) => d.id);

	const document_relationships: Record<string, string> = {
		synthesis_group: synthesisDocIds.join(','),
	};

	const inputs: Record<string, string> = {
		synthesis_ids: synthesisDocIds.join(','),
	};

	if(!isModelContributionFileType(recipeStep.output_type)) {
		throw new Error(`Invalid output_type for planPerModel: ${recipeStep.output_type}`);
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
			throw new Error('planPerModel requires recipeStep.outputs_required.documents[0].document_key but it is missing');
		}
		if (!('document_key' in firstDocument)) {
			throw new Error('planPerModel requires recipeStep.outputs_required.documents[0].document_key but it is missing');
		}
		const rawDocumentKey = firstDocument.document_key;
		if (rawDocumentKey === null || rawDocumentKey === undefined) {
			throw new Error(`planPerModel requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
		}
		if (typeof rawDocumentKey !== 'string') {
			throw new Error(`planPerModel requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
		}
		if (rawDocumentKey.length === 0) {
			throw new Error(`planPerModel requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
		}
		documentKey = rawDocumentKey;
	}
	// If the step does not output documents, documentKey remains undefined

	const newPayload: DialecticExecuteJobPayload = {
		// Inherit ALL fields from parent job payload (defensive programming)
		projectId: parentJob.payload.projectId,
		sessionId: parentJob.payload.sessionId,
		stageSlug: parentJob.payload.stageSlug,
		iterationNumber: parentJob.payload.iterationNumber,
		model_id: modelId, // Assign the job to the specific model from the parent planner
		model_slug: parentJob.payload.model_slug,
		user_jwt: parentJob.payload.user_jwt,
		walletId: parentJob.payload.walletId,
		continueUntilComplete: parentJob.payload.continueUntilComplete,
		maxRetries: parentJob.payload.maxRetries,
		continuation_count: parentJob.payload.continuation_count,
		...(typeof parentJob.payload.target_contribution_id === 'string' ? { target_contribution_id: parentJob.payload.target_contribution_id } : {}),
		is_test_job: parentJob.payload.is_test_job,
		// Override job-specific properties
		job_type: 'execute',
		prompt_template_id: recipeStep.prompt_template_id,
		output_type: recipeStep.output_type,
		canonicalPathParams,
		document_relationships: document_relationships,
		inputs,
		sourceContributionId,
		planner_metadata: { recipe_step_id: recipeStep.id },
		...(documentKey ? { document_key: documentKey } : {}),
	};

	childPayloads.push(newPayload);

	console.log(`[planPerModel] Created 1 child job for model ${modelId}.`);

	return childPayloads;
};
