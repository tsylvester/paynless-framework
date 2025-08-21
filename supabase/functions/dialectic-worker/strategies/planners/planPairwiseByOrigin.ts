// supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn, SourceDocument } from "../../../dialectic-service/dialectic.interface.ts";
import { findRelatedContributions, groupSourceDocumentsByType } from "../helpers.ts";
import { createCanonicalPathParams } from "../canonical_context_builder.ts";

export const planPairwiseByOrigin: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    const childPayloads: DialecticExecuteJobPayload[] = [];
    const { thesis, antithesis } = groupSourceDocumentsByType(sourceDocs);

    if (!thesis || !antithesis) {
        return [];
    }

    for (const thesisDoc of thesis) {
        const relatedAntitheses = findRelatedContributions(antithesis, thesisDoc.id);

        for (const antithesisDoc of relatedAntitheses) {
            // Step 7.a.ii: Call the canonical context builder
            const pair: SourceDocument[] = [thesisDoc, antithesisDoc];
            const canonicalPathParams = createCanonicalPathParams(pair, recipeStep.output_type, thesisDoc);
            console.log('[planPairwiseByOrigin] Created canonicalPathParams:', JSON.stringify(canonicalPathParams, null, 2));

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
                // Inherit core context from the parent
                projectId: parentJob.payload.projectId,
                sessionId: parentJob.payload.sessionId,
                stageSlug: parentJob.payload.stageSlug,
                iterationNumber: parentJob.payload.iterationNumber,
                model_id: parentJob.payload.model_id,
                step_info: parentJob.payload.step_info,
                
                // Set job-specific properties
                job_type: 'execute',
                prompt_template_name: recipeStep.prompt_template_name,
                output_type: recipeStep.output_type,
                // Step 7.a.ii: Use the canonicalPathParams from the builder
                canonicalPathParams,
                // Step 7.a.i: Remove originalFileName
                document_relationships,
                inputs,
                isIntermediate: true,
            };

            childPayloads.push(newPayload);
        }
    }

    return childPayloads;
} 