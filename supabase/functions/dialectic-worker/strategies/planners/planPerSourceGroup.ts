// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn, SourceDocument } from "../../../dialectic-service/dialectic.interface.ts";

import { createCanonicalPathParams } from "../canonical_context_builder.ts";
import { FileType } from "../../../_shared/types/file_manager.types.ts";

export const planPerSourceGroup: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    if (!recipeStep.output_type) {
        throw new Error('planPerSourceGroup requires a recipe step with a defined output_type.');
    }
    if (!recipeStep.prompt_template_id) {
        throw new Error('planPerSourceGroup requires a recipe step with a defined prompt_template_id.');
    }

    const childPayloads: DialecticExecuteJobPayload[] = [];
    
    // 1. Group documents by their source_group relationship
    const docsByGroup = sourceDocs.reduce<Record<string, SourceDocument[]>>((acc, doc) => {
        const groupId = doc.document_relationships?.source_group;
        if (groupId) {
            if (!acc[groupId]) {
                acc[groupId] = [];
            }
            acc[groupId].push(doc);
        }
        return acc;
    }, {});

    // 2. Create one job per group
    for (const groupId in docsByGroup) {
        const groupDocs = docsByGroup[groupId];
        const documentIds = groupDocs.map(doc => doc.id);
        
        // Find the original thesis document to act as the anchor for the canonical path
        const anchorDoc = sourceDocs.find(doc => doc.id === groupId);

        const newPayload: DialecticExecuteJobPayload = {
            // Inherit core context
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug,
            iterationNumber: parentJob.payload.iterationNumber,
            model_id: parentJob.payload.model_id,

            // Set job-specific properties
            job_type: 'execute',
            prompt_template_id: recipeStep.prompt_template_id,
            output_type: recipeStep.output_type,
            canonicalPathParams: createCanonicalPathParams(groupDocs, recipeStep.output_type, anchorDoc!),
            document_relationships: { source_group: groupId },
            inputs: {
                document_ids: documentIds,
            },
            isIntermediate: recipeStep.output_type !== FileType.Synthesis,
            walletId: parentJob.payload.walletId,
        };

        childPayloads.push(newPayload);
    }

    return childPayloads;
}; 