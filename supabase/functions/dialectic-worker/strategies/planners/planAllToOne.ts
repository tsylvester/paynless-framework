// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts
import { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { createCanonicalPathParams } from "../canonical_context_builder.ts";
import { isContributionType, isContentToInclude } from "../../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isModelContributionFileType } from "../../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { selectAnchorSourceDocument } from "../helpers.ts";
import { selectAnchorForCanonicalPathParams } from "../selectAnchorForCanonicalPathParams.ts";

export const planAllToOne: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep,
    _authToken
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

    // Validate job_type is either 'PLAN' or 'EXECUTE'
    if (recipeStep.job_type !== 'PLAN' && recipeStep.job_type !== 'EXECUTE') {
        throw new Error(`planAllToOne requires job_type to be 'PLAN' or 'EXECUTE', received: ${recipeStep.job_type}`);
    }

    const hasDocumentInputs = recipeStep.inputs_required?.some(input => input.type === 'document');
    const hasRelevanceMetadata = recipeStep.inputs_relevance && recipeStep.inputs_relevance.length > 0;

    // Handle PLAN and EXECUTE jobs separately
    if (recipeStep.job_type === 'PLAN') {
        // PLAN recipe steps create EXECUTE child jobs that execute the Planner prompt to generate HeaderContext
        // Validate context_for_documents for PLAN jobs
        if (!recipeStep.outputs_required) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but outputs_required is missing');
        }
        
        const contextForDocuments = recipeStep.outputs_required.context_for_documents;
        if (!contextForDocuments) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but context_for_documents is missing');
        }
        
        if (!Array.isArray(contextForDocuments)) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.context_for_documents to be an array for PLAN jobs');
        }
        
        if (contextForDocuments.length === 0) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.context_for_documents to have at least one entry for PLAN jobs');
        }
        
        // Validate each context_for_documents entry
        for (let i = 0; i < contextForDocuments.length; i++) {
            const entry = contextForDocuments[i];
            
            if (!entry || typeof entry !== 'object') {
                throw new Error(`planAllToOne requires context_for_documents[${i}] to be an object`);
            }
            
            if (!('document_key' in entry) || typeof entry.document_key !== 'string' || entry.document_key.length === 0) {
                throw new Error(`planAllToOne requires context_for_documents[${i}].document_key to be a non-empty string`);
            }
            
            if (!('content_to_include' in entry)) {
                throw new Error(`planAllToOne requires context_for_documents[${i}].content_to_include object model, but it is missing`);
            }
            
            if (Array.isArray(entry.content_to_include)) {
                throw new Error(`planAllToOne requires context_for_documents[${i}].content_to_include to be an object, not an array at top level`);
            }
            
            if (!isContentToInclude(entry.content_to_include)) {
                throw new Error(`planAllToOne requires context_for_documents[${i}].content_to_include to conform to ContentToInclude type structure`);
            }
        }
        
        // For PLAN recipe steps, extract document_key from header_context_artifact.document_key
        // PLAN steps have header_context_artifact (not a documents array) per OutputRule interface
        const headerContextArtifact = recipeStep.outputs_required.header_context_artifact;
        if (!headerContextArtifact) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.header_context_artifact for PLAN jobs, but header_context_artifact is missing');
        }
        
        if (typeof headerContextArtifact !== 'object') {
            throw new Error('planAllToOne requires recipeStep.outputs_required.header_context_artifact to be an object for PLAN jobs');
        }
        
        if (!('document_key' in headerContextArtifact)) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.header_context_artifact.document_key for PLAN jobs, but document_key is missing');
        }
        
        const rawDocumentKey = headerContextArtifact.document_key;
        let rawDocumentKeyDisplay: string;
        if (typeof rawDocumentKey === 'string') {
            rawDocumentKeyDisplay = `'${rawDocumentKey}'`;
        } else {
            rawDocumentKeyDisplay = String(rawDocumentKey);
        }
        if (rawDocumentKey === null || rawDocumentKey === undefined) {
            throw new Error(`planAllToOne requires recipeStep.outputs_required.header_context_artifact.document_key to be a non-empty string, but received: ${rawDocumentKeyDisplay}`);
        }
        if (typeof rawDocumentKey !== 'string') {
            throw new Error(`planAllToOne requires recipeStep.outputs_required.header_context_artifact.document_key to be a non-empty string, but received: ${rawDocumentKeyDisplay}`);
        }
        if (rawDocumentKey.length === 0) {
            throw new Error(`planAllToOne requires recipeStep.outputs_required.header_context_artifact.document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
        }
        const documentKey = rawDocumentKey;
        
        // Use universal selector for canonical path params
        const anchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);
        let anchorForCanonicalPathParams = null;
        if (anchorResult.status === 'anchor_found') {
            anchorForCanonicalPathParams = anchorResult.document;
        } else if (anchorResult.status === 'anchor_not_found') {
            // When anchor_not_found but inputs_relevance exists, try selectAnchorForCanonicalPathParams
            // This allows canonical path params to be selected even when lineage anchor is not found
            if (hasRelevanceMetadata) {
                anchorForCanonicalPathParams = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);
            } else {
                // Only throw if no relevance metadata exists to fall back on
                throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
            }
        } else if (anchorResult.status === 'no_anchor_required') {
            if (hasDocumentInputs && !hasRelevanceMetadata) {
                throw new Error('planAllToOne: Recipe step has document inputs but is missing inputs_relevance metadata, preventing anchor selection for canonical path params.');
            }
            if (hasRelevanceMetadata) {
                anchorForCanonicalPathParams = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);
            }
        }
        
        // Create EXECUTE job payload for PLAN recipe step (will execute Planner prompt to generate HeaderContext)
        const executePayload: DialecticExecuteJobPayload = {
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug,
            iterationNumber: parentJob.payload.iterationNumber,
            model_id: parentJob.payload.model_id,
            user_jwt: parentJob.payload.user_jwt,
            walletId: parentJob.payload.walletId,
            sourceContributionId: anchorDocument.id,
            prompt_template_id: recipeStep.prompt_template_id,
            output_type: recipeStep.output_type,
            canonicalPathParams: createCanonicalPathParams(sourceDocs, recipeStep.output_type, anchorForCanonicalPathParams, stageSlug),
            inputs: {
                document_ids: documentIds,
            },
            planner_metadata: { recipe_step_id: recipeStep.id },
            document_key: documentKey,
            context_for_documents: contextForDocuments,
            document_relationships: { source_group: anchorDocument.id },
        };
        if (parentJob.payload.model_slug !== undefined && parentJob.payload.model_slug !== '') {
            executePayload.model_slug = parentJob.payload.model_slug;
        }
        if (parentJob.payload.continueUntilComplete !== undefined) {
            executePayload.continueUntilComplete = parentJob.payload.continueUntilComplete;
        }
        if (parentJob.payload.maxRetries !== undefined) {
            executePayload.maxRetries = parentJob.payload.maxRetries;
        }
        if (parentJob.payload.continuation_count !== undefined) {
            executePayload.continuation_count = parentJob.payload.continuation_count;
        }
        if (parentJob.payload.is_test_job !== undefined) {
            executePayload.is_test_job = parentJob.payload.is_test_job;
        }
        if (typeof parentJob.payload.target_contribution_id === 'string' && parentJob.payload.target_contribution_id.length > 0) {
            executePayload.target_contribution_id = parentJob.payload.target_contribution_id;
        }

        return [executePayload];
    }
    
    // Handle EXECUTE jobs
    if (recipeStep.job_type === 'EXECUTE') {
        // Validate files_to_generate for EXECUTE jobs
        if (!recipeStep.outputs_required) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but outputs_required is missing');
        }
        
        // LOG: Check what planAllToOne received
        console.log(`[planAllToOne] step_key=${recipeStep.step_key || 'unknown'}, recipeStep.outputs_required has files_to_generate:`, 'files_to_generate' in recipeStep.outputs_required);
        console.log(`[planAllToOne] step_key=${recipeStep.step_key || 'unknown'}, recipeStep.outputs_required keys:`, Object.keys(recipeStep.outputs_required));
        if ('files_to_generate' in recipeStep.outputs_required) {
          console.log(`[planAllToOne] step_key=${recipeStep.step_key || 'unknown'}, recipeStep.outputs_required.files_to_generate:`, JSON.stringify(recipeStep.outputs_required.files_to_generate));
        }
        
        const filesToGenerate = recipeStep.outputs_required.files_to_generate;
        if (!filesToGenerate) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.files_to_generate for EXECUTE jobs, but files_to_generate is missing');
        }
        
        if (!Array.isArray(filesToGenerate)) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.files_to_generate to be an array for EXECUTE jobs');
        }
        
        if (filesToGenerate.length === 0) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.files_to_generate to have at least one entry for EXECUTE jobs');
        }
        
        // Validate documents array for EXECUTE jobs
        const documents = recipeStep.outputs_required.documents;
        if (!documents) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing');
        }
        
        if (!Array.isArray(documents)) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.documents to be an array for EXECUTE jobs');
        }
        
        if (documents.length === 0) {
            throw new Error('planAllToOne requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs');
        }
        
        // Validate each files_to_generate entry
        for (let i = 0; i < filesToGenerate.length; i++) {
            const file = filesToGenerate[i];
            
            if (!file || typeof file !== 'object') {
                throw new Error(`planAllToOne requires files_to_generate[${i}] to be an object`);
            }
            
            if (!('from_document_key' in file) || typeof file.from_document_key !== 'string' || file.from_document_key.length === 0) {
                throw new Error(`planAllToOne requires files_to_generate[${i}].from_document_key to be a non-empty string`);
            }
            
            if (!('template_filename' in file) || typeof file.template_filename !== 'string' || file.template_filename.length === 0) {
                throw new Error(`planAllToOne requires files_to_generate[${i}].template_filename to be a non-empty string`);
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
                throw new Error('planAllToOne requires recipeStep.outputs_required.documents[0].document_key but it is missing');
            }
            if (!('document_key' in firstDocument)) {
                throw new Error('planAllToOne requires recipeStep.outputs_required.documents[0].document_key but it is missing');
            }
            const rawDocumentKey = firstDocument.document_key;
            let firstDocumentKeyDisplay: string;
            if (typeof rawDocumentKey === 'string') {
                firstDocumentKeyDisplay = `'${rawDocumentKey}'`;
            } else {
                firstDocumentKeyDisplay = String(rawDocumentKey);
            }
            if (rawDocumentKey === null || rawDocumentKey === undefined) {
                throw new Error(`planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${firstDocumentKeyDisplay}`);
            }
            if (typeof rawDocumentKey !== 'string') {
                throw new Error(`planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: ${firstDocumentKeyDisplay}`);
            }
            if (rawDocumentKey.length === 0) {
                throw new Error(`planAllToOne requires recipeStep.outputs_required.documents[0].document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
            }
            documentKey = rawDocumentKey;
        }
        // If the step does not output documents, documentKey remains undefined

        // Use universal selector for canonical path params
        const anchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs);
        let anchorForCanonicalPathParams = null;
        if (anchorResult.status === 'anchor_found') {
            anchorForCanonicalPathParams = anchorResult.document;
        } else if (anchorResult.status === 'anchor_not_found') {
            // When anchor_not_found but inputs_relevance exists, try selectAnchorForCanonicalPathParams
            // This allows canonical path params to be selected even when lineage anchor is not found
            if (hasRelevanceMetadata) {
                anchorForCanonicalPathParams = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);
            } else {
                // Only throw if no relevance metadata exists to fall back on
                throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
            }
        } else if (anchorResult.status === 'no_anchor_required') {
            if (hasDocumentInputs && !hasRelevanceMetadata) {
                throw new Error('planAllToOne: Recipe step has document inputs but is missing inputs_relevance metadata, preventing anchor selection for canonical path params.');
            }
            if (hasRelevanceMetadata) {
                anchorForCanonicalPathParams = selectAnchorForCanonicalPathParams(recipeStep, sourceDocs);
            }
        }

        // Check if this step requires a header_context input
        if (!Array.isArray(recipeStep.inputs_required)) {
            throw new Error('planAllToOne requires recipeStep.inputs_required to be an array for EXECUTE jobs');
        }
        const headerContextRule = recipeStep.inputs_required.find((rule) => rule?.type === 'header_context');
        const requiresHeaderContext = headerContextRule !== undefined;
        const requiredDocumentKey = headerContextRule?.document_key;

        // Find the header_context document matching the parent job's model_id and optional document_key
        const headerContextId = requiresHeaderContext
            ? sourceDocs.find((d) =>
                d.contribution_type === 'header_context' &&
                d.model_id === parentJob.payload.model_id &&
                (requiredDocumentKey === undefined || d.document_key === requiredDocumentKey)
            )?.id
            : undefined;

        if (requiresHeaderContext && (typeof headerContextId !== 'string' || headerContextId.length === 0)) {
            let requiredDocumentKeyLabel: string;
            if (requiredDocumentKey !== undefined) {
                requiredDocumentKeyLabel = String(requiredDocumentKey);
            } else {
                requiredDocumentKeyLabel = 'none';
            }
            throw new Error(
                `planAllToOne requires a sourceDoc with contribution_type 'header_context' and matching model_id when recipeStep.inputs_required includes header_context (requiredDocumentKey: ${requiredDocumentKeyLabel})`
            );
        }

        const inputs: Record<string, string | string[]> = {
            document_ids: documentIds,
        };
        if (requiresHeaderContext && headerContextId) {
            inputs.header_context_id = headerContextId;
        }

        const executePayload: DialecticExecuteJobPayload = {
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug,
            iterationNumber: parentJob.payload.iterationNumber,
            model_id: parentJob.payload.model_id,
            user_jwt: parentJob.payload.user_jwt,
            walletId: parentJob.payload.walletId,
            sourceContributionId: anchorDocument.id,
            prompt_template_id: recipeStep.prompt_template_id,
            output_type: recipeStep.output_type,
            canonicalPathParams: createCanonicalPathParams(sourceDocs, recipeStep.output_type, anchorForCanonicalPathParams, stageSlug),
            inputs: inputs,
            document_relationships: { source_group: anchorDocument.id },
            planner_metadata: { recipe_step_id: recipeStep.id },
            document_key: documentKey,
        };
        if (parentJob.payload.model_slug !== undefined && parentJob.payload.model_slug !== '') {
            executePayload.model_slug = parentJob.payload.model_slug;
        }
        if (parentJob.payload.continueUntilComplete !== undefined) {
            executePayload.continueUntilComplete = parentJob.payload.continueUntilComplete;
        }
        if (parentJob.payload.maxRetries !== undefined) {
            executePayload.maxRetries = parentJob.payload.maxRetries;
        }
        if (parentJob.payload.continuation_count !== undefined) {
            executePayload.continuation_count = parentJob.payload.continuation_count;
        }
        if (parentJob.payload.is_test_job !== undefined) {
            executePayload.is_test_job = parentJob.payload.is_test_job;
        }
        if (typeof parentJob.payload.target_contribution_id === 'string' && parentJob.payload.target_contribution_id.length > 0) {
            executePayload.target_contribution_id = parentJob.payload.target_contribution_id;
        }

        return [executePayload];
    }
    
    // This should never be reached due to job_type validation above, but TypeScript requires it
    throw new Error(`planAllToOne: unreachable code reached with job_type: ${recipeStep.job_type}`);
}; 
