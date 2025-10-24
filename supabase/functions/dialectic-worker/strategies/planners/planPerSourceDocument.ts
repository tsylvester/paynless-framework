// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts
// Cache-busting comment: 2025-08-04T04:20:05
import type {
	DialecticExecuteJobPayload,
	GranularityPlannerFn,
} from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';

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

	const childPayloads: DialecticExecuteJobPayload[] = [];

	console.log(
		'[planPerSourceDocument] Received sourceDocs:',
		JSON.stringify(sourceDocs, null, 2)
	);
	for (const doc of sourceDocs) {
		console.log(`[planPerSourceDocument] Processing doc: ${doc.id}`);

		const canonicalPathParams = createCanonicalPathParams(
			[doc],
			recipeStep.output_type,
			doc
		);
		console.log(
			`[planPerSourceDocument] Created canonicalPathParams for doc ${doc.id}:`,
			JSON.stringify(canonicalPathParams, null, 2)
		);

		const inputs: Record<string, string> = {};
		if (doc.contribution_type) {
			inputs[`${doc.contribution_type}_id`] = doc.id;
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
			canonicalPathParams, // Use the new contract
			document_relationships: { source_group: doc.id },
			inputs,
			user_jwt: parentJwt,
			walletId: parentJob.payload.walletId,
		};
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
}; 