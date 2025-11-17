// supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn, SourceDocument } from "../../../dialectic-service/dialectic.interface.ts";

import { createCanonicalPathParams } from "../canonical_context_builder.ts";
import { FileType } from "../../../_shared/types/file_manager.types.ts";
import { isContributionType } from "../../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isModelContributionFileType } from "../../../_shared/utils/type-guards/type_guards.file_manager.ts";

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

    const stageSlug = parentJob.payload.stageSlug;
    if (!stageSlug || !isContributionType(stageSlug)) {
        throw new Error(`planPerSourceGroup requires a valid ContributionType stageSlug, but received: ${stageSlug}`);
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

        // The canonical source contribution for this group is the parent whose id matches the group id.
        const anchorDoc = sourceDocs.find(doc => doc.id === groupId);
        if (!anchorDoc) {
            throw new Error(`planPerSourceGroup missing anchor SourceDocument for group ${groupId}`);
        }

        if(!isModelContributionFileType(recipeStep.output_type)) {
            throw new Error(`Invalid output_type for planPerSourceGroup: ${recipeStep.output_type}`);
        }
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
            canonicalPathParams: createCanonicalPathParams(groupDocs, recipeStep.output_type, anchorDoc, stageSlug),
            document_relationships: { source_group: groupId },
            inputs: {
                document_ids: documentIds,
            },
            isIntermediate: recipeStep.output_type !== FileType.Synthesis,
            walletId: parentJob.payload.walletId,
            sourceContributionId: anchorDoc.id,
            planner_metadata: { recipe_step_id: recipeStep.id },
        };

        childPayloads.push(newPayload);
    }

    return childPayloads;
}; 