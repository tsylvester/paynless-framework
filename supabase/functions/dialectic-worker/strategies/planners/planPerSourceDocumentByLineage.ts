// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';

/**
 * Groups source documents by their `document_relationships.source_group` property.
 * Creates one child job for each group.
 */
export const planPerSourceDocumentByLineage: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    const childPayloads: DialecticExecuteJobPayload[] = [];
    const groups: Record<string, typeof sourceDocs> = {};

    // 1. Group documents by their source_group
    for (const doc of sourceDocs) {
        const groupId = doc.document_relationships?.source_group;
        if (groupId) {
            if (!groups[groupId]) {
                groups[groupId] = [];
            }
            groups[groupId].push(doc);
        } else {
            // If a document is missing a source_group, treat it as the root of a new lineage.
            // The document's own ID becomes the new group ID for this lineage.
            const newGroupId = doc.id;
            if (!groups[newGroupId]) {
                groups[newGroupId] = [];
            }
            groups[newGroupId].push(doc);
        }
    }

    // 2. Create one job per group
    for (const groupId in groups) {
        const groupDocs = groups[groupId];
        if (groupDocs.length === 0) continue;

        // Use the first document as the anchor for canonical path generation.
        const anchorDoc = groupDocs[0];
        const canonicalPathParams = createCanonicalPathParams(groupDocs, recipeStep.output_type, anchorDoc);

        const newPayload: DialecticExecuteJobPayload = {
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug, // Propagate stageSlug
            iterationNumber: parentJob.payload.iterationNumber,
            job_type: 'execute',
            prompt_template_name: recipeStep.prompt_template_name,
            output_type: recipeStep.output_type,
            isIntermediate: recipeStep.output_type !== 'final_synthesis',
            model_id: parentJob.payload.model_id, // Inherit model from the parent planner job
            step_info: parentJob.payload.step_info,
            canonicalPathParams,
            inputs: {
                // Pass all document IDs from the group as an array
                [`${anchorDoc.contribution_type}_ids`]: groupDocs.map(d => d.id),
            },
            document_relationships: {
                source_group: groupId,
            },
            walletId: parentJob.payload.walletId,
        };
        childPayloads.push(newPayload);
    }

    return childPayloads;
};
