// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts
import type { DialecticExecuteJobPayload, DialecticPlanJobPayload, GranularityPlannerFn, ContextForDocument } from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { isContributionType, isContentToInclude } from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';

/**
 * Groups source documents by their `document_relationships.source_group` property.
 * Creates one child job for each group.
 */
export const planPerSourceDocumentByLineage: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep,
    authToken
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

    // Validate job_type is either 'PLAN' or 'EXECUTE'
    if (recipeStep.job_type !== 'PLAN' && recipeStep.job_type !== 'EXECUTE') {
        throw new Error(`planPerSourceDocumentByLineage requires job_type to be 'PLAN' or 'EXECUTE', received: ${recipeStep.job_type}`);
    }

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

    // Handle PLAN and EXECUTE jobs separately
    if (recipeStep.job_type === 'PLAN') {
        // Validate context_for_documents for PLAN jobs
        if (!recipeStep.outputs_required) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but outputs_required is missing');
        }
        
        const contextForDocuments = recipeStep.outputs_required.context_for_documents;
        if (!contextForDocuments) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but context_for_documents is missing');
        }
        
        if (!Array.isArray(contextForDocuments)) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.context_for_documents to be an array for PLAN jobs');
        }
        
        if (contextForDocuments.length === 0) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.context_for_documents to have at least one entry for PLAN jobs');
        }
        
        // Validate each context_for_documents entry
        for (let i = 0; i < contextForDocuments.length; i++) {
            const entry = contextForDocuments[i];
            
            if (!entry || typeof entry !== 'object') {
                throw new Error(`planPerSourceDocumentByLineage requires context_for_documents[${i}] to be an object`);
            }
            
            if (!('document_key' in entry) || typeof entry.document_key !== 'string' || entry.document_key.length === 0) {
                throw new Error(`planPerSourceDocumentByLineage requires context_for_documents[${i}].document_key to be a non-empty string`);
            }
            
            if (!('content_to_include' in entry)) {
                throw new Error(`planPerSourceDocumentByLineage requires context_for_documents[${i}].content_to_include object model, but it is missing`);
            }
            
            if (Array.isArray(entry.content_to_include)) {
                throw new Error(`planPerSourceDocumentByLineage requires context_for_documents[${i}].content_to_include to be an object, not an array at top level`);
            }
            
            if (!isContentToInclude(entry.content_to_include)) {
                throw new Error(`planPerSourceDocumentByLineage requires context_for_documents[${i}].content_to_include to conform to ContentToInclude type structure`);
            }
        }
        
        // Create one PLAN job payload per group
        const childPayloads: DialecticPlanJobPayload[] = [];
        for (const groupId in groups) {
            const groupDocs = groups[groupId];
            if (groupDocs.length === 0) continue;

            const planPayload: DialecticPlanJobPayload = {
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
                target_contribution_id: parentJob.payload.target_contribution_id,
                is_test_job: parentJob.payload.is_test_job,
                job_type: 'PLAN',
                context_for_documents: contextForDocuments,
            };
            childPayloads.push(planPayload);
        }
        
        return childPayloads;
    }
    
    // Handle EXECUTE jobs
    if (recipeStep.job_type === 'EXECUTE') {
        // Validate files_to_generate for EXECUTE jobs
        if (!recipeStep.outputs_required) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but outputs_required is missing');
        }
        
        const filesToGenerate = recipeStep.outputs_required.files_to_generate;
        if (!filesToGenerate) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but files_to_generate is missing');
        }
        
        if (!Array.isArray(filesToGenerate)) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.files_to_generate to be an array for EXECUTE jobs');
        }
        
        if (filesToGenerate.length === 0) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.files_to_generate to have at least one entry for EXECUTE jobs');
        }
        
        // Validate documents array for EXECUTE jobs
        const documents = recipeStep.outputs_required.documents;
        if (!documents) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing');
        }
        
        if (!Array.isArray(documents)) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents to be an array for EXECUTE jobs');
        }
        
        if (documents.length === 0) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs');
        }
        
        // Validate each files_to_generate entry
        for (let i = 0; i < filesToGenerate.length; i++) {
            const file = filesToGenerate[i];
            
            if (!file || typeof file !== 'object') {
                throw new Error(`planPerSourceDocumentByLineage requires files_to_generate[${i}] to be an object`);
            }
            
            if (!('from_document_key' in file) || typeof file.from_document_key !== 'string' || file.from_document_key.length === 0) {
                throw new Error(`planPerSourceDocumentByLineage requires files_to_generate[${i}].from_document_key to be a non-empty string`);
            }
            
            if (!('template_filename' in file) || typeof file.template_filename !== 'string' || file.template_filename.length === 0) {
                throw new Error(`planPerSourceDocumentByLineage requires files_to_generate[${i}].template_filename to be a non-empty string`);
            }
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
                throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents[0].document_key but it is missing');
            }
            if (!('document_key' in firstDocument)) {
                throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents[0].document_key but it is missing');
            }
            const rawDocumentKey = firstDocument.document_key;
            if (rawDocumentKey === null || rawDocumentKey === undefined) {
                throw new Error(`planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
            }
            if (typeof rawDocumentKey !== 'string') {
                throw new Error(`planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
            }
            if (rawDocumentKey.length === 0) {
                throw new Error(`planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
            }
            documentKey = rawDocumentKey;
        }
        // If the step does not output documents, documentKey remains undefined

        // Create one job per group
        const childPayloads: DialecticExecuteJobPayload[] = [];
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
                target_contribution_id: parentJob.payload.target_contribution_id,
                is_test_job: parentJob.payload.is_test_job,
                // Override job-specific properties
                job_type: 'execute',
                prompt_template_id: recipeStep.prompt_template_id,
                output_type: recipeStep.output_type,
                isIntermediate: recipeStep.output_type !== FileType.Synthesis,
                canonicalPathParams,
                inputs: {
                    // Pass all document IDs from the group as an array
                    [`${anchorDoc.contribution_type}_ids`]: groupDocs.map(d => d.id),
                },
                document_relationships: {
                    source_group: groupId,
                },
                planner_metadata: { recipe_step_id: recipeStep.id },
                sourceContributionId: derivedSourceContributionId,
                document_key: documentKey,
            };
            childPayloads.push(newPayload);
        }

        return childPayloads;
    }
    
    // This should never be reached due to job_type validation above, but TypeScript requires it
    throw new Error(`planPerSourceDocumentByLineage: unreachable code reached with job_type: ${recipeStep.job_type}`);
};
