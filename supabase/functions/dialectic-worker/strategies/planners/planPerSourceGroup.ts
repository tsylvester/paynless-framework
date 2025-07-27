// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts
import type { DialecticCombinationJobPayload, GranularityPlannerFn, SourceDocument } from "../../../dialectic-service/dialectic.interface.ts";

export const planPerSourceGroup: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    const childJobs = [];
    
    // 1. Group documents by their target_contribution_id
    const docsByGroup = sourceDocs.reduce<Record<string, SourceDocument[]>>((acc, doc) => {
        if (doc.target_contribution_id) {
            if (!acc[doc.target_contribution_id]) {
                acc[doc.target_contribution_id] = [];
            }
            acc[doc.target_contribution_id].push(doc);
        }
        return acc;
    }, {});

    // 2. Create one job per group
    for (const groupId in docsByGroup) {
        const groupDocs = docsByGroup[groupId];
        const documentIds = groupDocs.map(doc => doc.id);

        const newPayload: DialecticCombinationJobPayload = {
            // Inherit core context
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug,
            iterationNumber: parentJob.payload.iterationNumber,
            model_id: parentJob.payload.model_id,
            
            // Set job-specific properties
            job_type: 'execute',
            prompt_template_name: recipeStep.prompt_template_name,
            inputs: {
                source_group_id: groupId,
                document_ids: documentIds,
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
            target_contribution_id: null,
        });
    }

    return childJobs;
}; 