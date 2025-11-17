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

			if(!isModelContributionFileType(recipeStep.output_type)) {
				throw new Error(`Invalid output_type for planPairwiseByOrigin: ${recipeStep.output_type}`);
			}
			const newPayload: DialecticExecuteJobPayload = {
				// Inherit core context from the parent
				projectId: parentJob.payload.projectId,
				sessionId: parentJob.payload.sessionId,
				stageSlug: parentJob.payload.stageSlug,
				iterationNumber: parentJob.payload.iterationNumber,
				model_id: parentJob.payload.model_id,

				// Set job-specific properties
				job_type: 'execute',
				prompt_template_id: recipeStep.prompt_template_id,
				output_type: recipeStep.output_type,
				// Step 7.a.ii: Use the canonicalPathParams from the builder
				canonicalPathParams,
				// Step 7.a.i: Remove originalFileName
				document_relationships,
				inputs,
				isIntermediate: true,
				walletId: parentJob.payload.walletId,
				sourceContributionId: antithesisDoc.id,
				planner_metadata: { recipe_step_id: recipeStep.id },
			};

			childPayloads.push(newPayload);
		}
	}

	return childPayloads;
}; 