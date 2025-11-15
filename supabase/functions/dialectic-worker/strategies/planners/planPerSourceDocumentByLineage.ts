// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { isContributionType } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';

/**
 * Groups source documents by their `document_relationships.source_group` property.
 * Creates one child job for each group.
 */
export const planPerSourceDocumentByLineage: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    if (!recipeStep.output_type) {
        throw new Error('planPerSourceDocumentByLineage requires a recipe step with a defined output_type.');
    }
    if (!recipeStep.prompt_template_id) {
        throw new Error('planPerSourceDocumentByLineage requires a recipe step with a defined prompt_template_id.');
    }

    const stageSlug = parentJob.payload.stageSlug;
    if (!stageSlug || !isContributionType(stageSlug)) {
        throw new Error(
            `planPerSourceDocumentByLineage requires a valid ContributionType stageSlug, but received: ${stageSlug}`
        );
    }

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
        const canonicalPathParams = createCanonicalPathParams(groupDocs, recipeStep.output_type, anchorDoc, stageSlug);
        let derivedSourceContributionId: string | null = null;
        if (anchorDoc.document_relationships?.source_group) {
            derivedSourceContributionId = anchorDoc.id;
        }

        if(!isModelContributionFileType(recipeStep.output_type)) {
            throw new Error(`Invalid output_type for planPerSourceDocumentByLineage: ${recipeStep.output_type}`);
        }
        const newPayload: DialecticExecuteJobPayload = {
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug, // Propagate stageSlug
            iterationNumber: parentJob.payload.iterationNumber,
            job_type: 'execute',
            prompt_template_id: recipeStep.prompt_template_id,
            output_type: recipeStep.output_type,
            isIntermediate: recipeStep.output_type !== FileType.Synthesis,
            model_id: parentJob.payload.model_id, // Inherit model from the parent planner job
            canonicalPathParams,
            inputs: {
                // Pass all document IDs from the group as an array
                [`${anchorDoc.contribution_type}_ids`]: groupDocs.map(d => d.id),
            },
            document_relationships: {
                source_group: groupId,
            },
            walletId: parentJob.payload.walletId,
            sourceContributionId: derivedSourceContributionId,
        };
        childPayloads.push(newPayload);
    }

    return childPayloads;
};
