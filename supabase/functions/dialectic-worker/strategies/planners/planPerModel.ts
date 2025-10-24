// supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts
import type {
	DialecticExecuteJobPayload,
	GranularityPlannerFn,
} from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';

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

	const childPayloads: DialecticExecuteJobPayload[] = [];

	// This planner creates one job for the parent job's specific model.
	// It assumes all source documents are inputs for this single job.

	const anchorDoc = sourceDocs[0];
	const canonicalPathParams = createCanonicalPathParams(
		sourceDocs,
		recipeStep.output_type,
		anchorDoc
	);

	const synthesisDocIds = sourceDocs.map((d) => d.id);

	const document_relationships: Record<string, string> = {
		synthesis_group: synthesisDocIds.join(','),
	};

	const inputs: Record<string, string> = {
		synthesis_ids: synthesisDocIds.join(','),
	};

	const newPayload: DialecticExecuteJobPayload = {
		// Inherit core context from the parent
		projectId: parentJob.payload.projectId,
		sessionId: parentJob.payload.sessionId,
		stageSlug: parentJob.payload.stageSlug,
		iterationNumber: parentJob.payload.iterationNumber,
		model_id: modelId, // Assign the job to the specific model from the parent planner

		// Set job-specific properties
		job_type: 'execute',
		prompt_template_id: recipeStep.prompt_template_id,
		output_type: recipeStep.output_type,
		canonicalPathParams,
		document_relationships: document_relationships,
		inputs,
		walletId: parentJob.payload.walletId,
	};

	childPayloads.push(newPayload);

	console.log(`[planPerModel] Created 1 child job for model ${modelId}.`);

	return childPayloads;
};
