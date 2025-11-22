// supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts
import type {
	DialecticExecuteJobPayload,
	GranularityPlannerFn,
	SourceDocument,
} from '../../../dialectic-service/dialectic.interface.ts';
import { findRelatedContributions, groupSourceDocumentsByType } from '../helpers.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { isContributionType } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';

export const planPairwiseByOrigin: GranularityPlannerFn = (
	sourceDocs,
	parentJob,
	recipeStep
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

	const childPayloads: DialecticExecuteJobPayload[] = [];
	const { thesis, antithesis } = groupSourceDocumentsByType(sourceDocs);

	if (!thesis) {
		throw new Error(
			`Invalid inputs for planPairwiseByOrigin: Required 'thesis' documents are missing.`
		);
	}
	if (!antithesis) {
		throw new Error(
			`Invalid inputs for planPairwiseByOrigin: Required 'antithesis' documents are missing.`
		);
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

	for (const thesisDoc of thesis) {
		const relatedAntitheses = findRelatedContributions(antithesis, thesisDoc.id);

		for (const antithesisDoc of relatedAntitheses) {
			if (!antithesisDoc.id) {
				throw new Error(
					`planPairwiseByOrigin requires each antithesis document to have an id`
				);
			}

			// Step 7.a.ii: Call the canonical context builder
			const pair: SourceDocument[] = [thesisDoc, antithesisDoc];
			const canonicalPathParams = createCanonicalPathParams(
				pair,
				recipeStep.output_type,
				thesisDoc,
				stageSlug
			);
			console.log(
				'[planPairwiseByOrigin] Created canonicalPathParams:',
				JSON.stringify(canonicalPathParams, null, 2)
			);

			// Step 7.a.iii: Dynamically create inputs and relationships
			const inputs: Record<string, string> = {};
			const document_relationships: Record<string, string> = {};

			for (const doc of pair) {
				if (doc.contribution_type) {
					inputs[`${doc.contribution_type}_id`] = doc.id;
					document_relationships[doc.contribution_type] = doc.id;
				}
			}
			// Ensure source_group is correctly populated
			document_relationships.source_group = thesisDoc.id;

			const newPayload: DialecticExecuteJobPayload = {
				// Inherit ALL fields from parent payload first (defensive programming)
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
				...(typeof parentJob.payload.target_contribution_id === 'string' ? { target_contribution_id: parentJob.payload.target_contribution_id } : {}),
				is_test_job: parentJob.payload.is_test_job,

				// Set job-specific properties that override or supplement parent fields
				job_type: 'execute',
				prompt_template_id: recipeStep.prompt_template_id,
				output_type: recipeStep.output_type,
				canonicalPathParams,
				document_relationships,
				inputs,
				isIntermediate: true,
				sourceContributionId: antithesisDoc.id,
				planner_metadata: { recipe_step_id: recipeStep.id },
				...(documentKey ? { document_key: documentKey } : {}),
			};

			childPayloads.push(newPayload);
		}
	}

	return childPayloads;
}; 