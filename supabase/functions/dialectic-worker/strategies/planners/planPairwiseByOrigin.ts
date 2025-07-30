// supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { findRelatedContributions, groupSourceDocumentsByType } from "../helpers.ts";
import { generateShortId } from '../../../_shared/utils/path_constructor.ts';

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
            const shortThesisId = generateShortId(thesisDoc.id);
            const shortAntithesisId = generateShortId(antithesisDoc.id);
            const modelSlug = parentJob.payload.model_id; // Assuming model_id can be slugified or is a slug

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
                originalFileName: `${shortThesisId}_${shortAntithesisId}_${modelSlug}_pairwise.md`,
                document_relationships: { 
                    thesis: thesisDoc.id,
                    antithesis: antithesisDoc.id,
                    source_group: thesisDoc.id 
                },
                inputs: {
                    thesis_id: thesisDoc.id,
                    antithesis_id: antithesisDoc.id,
                },
                isIntermediate: true,
            };

            childPayloads.push(newPayload);
        }
    }

    return childPayloads;
} 