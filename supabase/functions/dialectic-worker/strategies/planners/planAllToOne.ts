// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { createCanonicalPathParams } from "../canonical_context_builder.ts";
import { isContributionType } from "../../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isModelContributionFileType } from "../../../_shared/utils/type-guards/type_guards.file_manager.ts";

export const planAllToOne: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    if (sourceDocs.length === 0) {
        return [];
    }

    const stageSlug = parentJob.payload.stageSlug;
    if (!stageSlug || !isContributionType(stageSlug)) {
        throw new Error(`planAllToOne requires a valid ContributionType stageSlug, but received: ${stageSlug}`);
    }

    if (!recipeStep.prompt_template_id) {
        throw new Error(
            `planAllToOne received an invalid recipe step. Expected a recipe step with a prompt_template_id. Received: ${JSON.stringify(
                recipeStep,
                null,
                2
            )}`
        );
    }

    const documentIds = sourceDocs.map(doc => doc.id);
    const anchorDocument = sourceDocs[0];
    if (!anchorDocument) {
        throw new Error('planAllToOne requires at least one source document to build its payload.');
    }

    if(!isModelContributionFileType(recipeStep.output_type)) {
        throw new Error(`Invalid output_type for planAllToOne: ${recipeStep.output_type}`);
    }
    if(!recipeStep.id) {
        throw new Error(`Invalid recipe step for planAllToOne: id is missing.`);
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
            throw new Error('planAllToOne requires recipeStep.outputs_required.documents[0].document_key but it is missing');
        }
        if (!('document_key' in firstDocument)) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.documents[0].document_key but it is missing');
        }
        const rawDocumentKey = firstDocument.document_key;
        if (rawDocumentKey === null || rawDocumentKey === undefined) {
            throw new Error(`planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
        }
        if (typeof rawDocumentKey !== 'string') {
            throw new Error(`planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
        }
        if (rawDocumentKey.length === 0) {
            throw new Error(`planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
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
        model_id: parentJob.payload.model_id,
        model_slug: parentJob.payload.model_slug,
        user_jwt: parentJob.payload.user_jwt,
        walletId: parentJob.payload.walletId,
        continueUntilComplete: parentJob.payload.continueUntilComplete,
        maxRetries: parentJob.payload.maxRetries,
        continuation_count: parentJob.payload.continuation_count,
        ...(typeof parentJob.payload.target_contribution_id === 'string' ? { target_contribution_id: parentJob.payload.target_contribution_id } : {}),
        is_test_job: parentJob.payload.is_test_job,
        sourceContributionId: anchorDocument.id,
        // Override job-specific properties
        job_type: 'execute',
        prompt_template_id: recipeStep.prompt_template_id,
        output_type: recipeStep.output_type,
        canonicalPathParams: createCanonicalPathParams(sourceDocs, recipeStep.output_type, anchorDocument, stageSlug),
        inputs: {
            document_ids: documentIds,
        },
        planner_metadata: { recipe_step_id: recipeStep.id },
        ...(documentKey ? { document_key: documentKey } : {}),
    };

    return [newPayload];
}; 

