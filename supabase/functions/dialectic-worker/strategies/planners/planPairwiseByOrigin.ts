// supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts
import type { DialecticCombinationJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { findRelatedContributions, groupSourceDocumentsByType } from "../helpers.ts";

export const planPairwiseByOrigin: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    const childJobs = [];
    const { thesis, antithesis } = groupSourceDocumentsByType(sourceDocs);

    if (!thesis || !antithesis) {
        return [];
    }

    for (const thesisDoc of thesis) {
        const relatedAntitheses = findRelatedContributions(antithesis, thesisDoc.id);

        for (const antithesisDoc of relatedAntitheses) {
            const newPayload: DialecticCombinationJobPayload = {
                // Inherit core context from the parent
                projectId: parentJob.payload.projectId,
                sessionId: parentJob.payload.sessionId,
                stageSlug: parentJob.payload.stageSlug,
                iterationNumber: parentJob.payload.iterationNumber,
                model_id: parentJob.payload.model_id,
                
                // Set job-specific properties
                job_type: 'execute',
                prompt_template_name: recipeStep.prompt_template_name,
                inputs: {
                    thesis_id: thesisDoc.id, // Corrected from resource_id
                    antithesis_id: antithesisDoc.id, // Corrected from resource_id
                }
            };

            childJobs.push({
                parent_job_id: parentJob.id,
                session_id: parentJob.session_id,
                user_id: parentJob.user_id,
                stage_slug: parentJob.stage_slug,
                iteration_number: parentJob.iteration_number,
                max_retries: parentJob.max_retries,
                payload: newPayload,
                target_contribution_id: null, // Not applicable for this planner
            });
        }
    }

    return childJobs;
} 