// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts
import { 
    DialecticExecuteJobPayload, 
    GranularityPlannerFn, 
    ContextForDocument,
    IPlanPerSourceDocumentByLineageDeps,
    IPlanPerSourceDocumentByLineageFn,
    PlanPerSourceDocumentByLineageParams,
} from '../../../dialectic-service/dialectic.interface.ts';
import { createCanonicalPathParams } from '../canonical_context_builder.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { 
    isContributionType, 
    isContentToInclude 
} from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isModelContributionFileType } from '../../../_shared/utils/type-guards/type_guards.file_manager.ts';
import { selectAnchorSourceDocument } from '../helpers.ts';
import { deconstructStoragePath } from '../../../_shared/utils/path_deconstructor.ts';

/**
 * Internal implementation of planPerSourceDocumentByLineage with dependency injection.
 * Groups source documents by their `document_relationships.source_group` property.
 * Creates one child job for each group.
 * Exported for unit testing with mocked dependencies.
 */
export const planPerSourceDocumentByLineageInternal: IPlanPerSourceDocumentByLineageFn = (
    deps,
    params
) => {
    const { sourceDocs, parentJob, recipeStep, authToken: _authToken } = params;
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

    // Separate documents into three categories:
    // 1. Lineage-specific docs (has source_group)
    // 2. Global/shared docs (seed_prompt with source_group=null) - include in every lineage job
    // 3. Net-new docs (non-seed-prompt with source_group=null) - create their own jobs
    const globalDocs: typeof sourceDocs = [];
    const netNewDocs: typeof sourceDocs = [];
    const lineageGroups: Record<string, typeof sourceDocs> = {};

    for (const doc of sourceDocs) {
        const groupId = doc.document_relationships?.source_group;
        if (groupId) {
            // Document belongs to a specific lineage group
            if (!lineageGroups[groupId]) {
                lineageGroups[groupId] = [];
            }
            lineageGroups[groupId].push(doc);
        } else {
            // Document has source_group=null
            if (doc.contribution_type === 'seed_prompt') {
                // Global/shared document (seed_prompt) - include in every lineage job
                globalDocs.push(doc);
            } else {
                // Net-new document - create its own job (backward compatibility)
                netNewDocs.push(doc);
            }
        }
    }

    // Build final groups: one per lineage + one per net-new doc + one for global-only case
    const groups: Record<string, typeof sourceDocs> = {};
    
    // For each lineage group, create a combined group with lineage docs + global docs
    for (const groupId in lineageGroups) {
        groups[groupId] = [...lineageGroups[groupId], ...globalDocs];
    }
    
    // Create one job per net-new document (each gets global docs too)
    for (const netNewDoc of netNewDocs) {
        groups[netNewDoc.id] = [netNewDoc, ...globalDocs];
    }
    
    // If there are only global docs (no lineage groups, no net-new docs), create one job with all global docs
    if (Object.keys(lineageGroups).length === 0 && netNewDocs.length === 0 && globalDocs.length > 0) {
        groups[globalDocs[0].id] = [...globalDocs];
    }

    // Validate that every group has ALL required documents from recipe inputs_required
    // This validation must happen BEFORE creating any jobs - all-or-nothing approach
    if (recipeStep.inputs_required && recipeStep.inputs_required.length > 0) {
        for (const groupId in groups) {
            const groupDocs = groups[groupId];
            
            // For each required input, verify that at least one document in the group matches
            for (const requiredInput of recipeStep.inputs_required) {
                if (!requiredInput.required) {
                    continue; // Skip non-required inputs
                }
                
                // Find documents in this group that match the required input
                const matchingDocs = groupDocs.filter(doc => {
                    // Match type
                    if (requiredInput.type === 'seed_prompt') {
                        if (doc.contribution_type !== 'seed_prompt') {
                            return false;
                        }
                    } else if (requiredInput.type === 'document') {
                        // For documents, contribution_type should not be 'seed_prompt'
                        if (doc.contribution_type === 'seed_prompt') {
                            return false;
                        }
                    } else {
                        // Unknown type
                        return false;
                    }
                    
                    // Match slug (slug maps to stage)
                    if (requiredInput.slug && doc.stage !== requiredInput.slug) {
                        return false;
                    }
                    
                    // Match document_key if specified in required input
                    // Extract document_key from filename (it's never set as a property)
                    if (requiredInput.document_key && typeof requiredInput.document_key === 'string') {
                        let docDocumentKey: string | undefined;
                        if (doc.file_name && doc.storage_path) {
                            const pathInfo = deps.deconstructStoragePath({
                                storageDir: doc.storage_path,
                                fileName: doc.file_name,
                            });
                            docDocumentKey = pathInfo.documentKey;
                        }
                        
                        // Match by extracted document_key or contribution_type
                        if (docDocumentKey !== requiredInput.document_key && doc.contribution_type !== requiredInput.document_key) {
                            return false;
                        }
                    }
                    
                    return true;
                });
                
                // If no matching document found, throw error
                if (matchingDocs.length === 0) {
                    const inputDescription = `type='${requiredInput.type}', slug='${requiredInput.slug || 'any'}', document_key='${requiredInput.document_key || 'any'}'`;
                    throw new Error(`missing required document in lineage group '${groupId}': ${inputDescription}`);
                }
            }
        }
    }

    // Handle PLAN and EXECUTE jobs separately
    if (recipeStep.job_type === 'PLAN') {
        // PLAN recipe steps create EXECUTE child jobs that execute the Planner prompt to generate HeaderContext
        // Validate context_for_documents for PLAN jobs
        if (!recipeStep.outputs_required) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.context_for_documents for PLAN jobs, but outputs_required is missing');
        }
        
        const contextForDocuments: ContextForDocument[] | undefined = recipeStep.outputs_required.context_for_documents;
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
        
        // For PLAN recipe steps, extract document_key from header_context_artifact.document_key
        // PLAN steps have header_context_artifact (not a documents array) per OutputRule interface
        const headerContextArtifact = recipeStep.outputs_required.header_context_artifact;
        if (!headerContextArtifact) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.header_context_artifact for PLAN jobs, but header_context_artifact is missing');
        }
        
        if (typeof headerContextArtifact !== 'object') {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.header_context_artifact to be an object for PLAN jobs');
        }
        
        if (!('document_key' in headerContextArtifact)) {
            throw new Error('planPerSourceDocumentByLineage requires recipeStep.outputs_required.header_context_artifact.document_key for PLAN jobs, but document_key is missing');
        }
        
        const rawDocumentKey = headerContextArtifact.document_key;
        if (rawDocumentKey === null || rawDocumentKey === undefined) {
            throw new Error(`planPerSourceDocumentByLineage requires recipeStep.outputs_required.header_context_artifact.document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
        }
        if (typeof rawDocumentKey !== 'string') {
            throw new Error(`planPerSourceDocumentByLineage requires recipeStep.outputs_required.header_context_artifact.document_key to be a non-empty string, but received: ${typeof rawDocumentKey === 'string' ? `'${rawDocumentKey}'` : String(rawDocumentKey)}`);
        }
        if (rawDocumentKey.length === 0) {
            throw new Error(`planPerSourceDocumentByLineage requires recipeStep.outputs_required.header_context_artifact.document_key to be a non-empty string, but received: '${rawDocumentKey}'`);
        }
        const documentKey = rawDocumentKey;
        
        if (!isModelContributionFileType(recipeStep.output_type)) {
            throw new Error(`Invalid output_type for planPerSourceDocumentByLineage: ${recipeStep.output_type}`);
        }
        
        // Create EXECUTE job payloads for PLAN recipe step (one per group, will execute Planner prompt to generate HeaderContext)
        const childPayloads: DialecticExecuteJobPayload[] = [];
        for (const groupId in groups) {
            const groupDocs = groups[groupId];
            if (groupDocs.length === 0) continue;

            // Check if recipe step requires any document inputs (not just seed_prompt)
            const hasDocumentInputs = recipeStep.inputs_required?.some(
                input => input.type === 'document'
            ) ?? false;

            // Use universal selector for canonical path params
            // Only call selectAnchorSourceDocument if document inputs are required
            let anchorForCanonicalPathParams: typeof sourceDocs[0] | null = null;
            if (hasDocumentInputs) {
                const anchorResult = deps.selectAnchorSourceDocument(recipeStep, groupDocs);
                if (anchorResult.status === 'anchor_not_found') {
                    throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
                }
                anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;
            }
            
            // Use the first document as the anchor for sourceContributionId and source_group (preserves lineage)
            const anchorDoc = groupDocs[0];
            const documentIds = groupDocs.map(doc => doc.id);
            const canonicalPathParams = deps.createCanonicalPathParams(groupDocs, recipeStep.output_type, anchorForCanonicalPathParams, stageSlug);
            let derivedSourceContributionId: string | null = null;
            if (anchorDoc.document_relationships?.source_group) {
                derivedSourceContributionId = anchorDoc.id;
            }

            const executePayload: DialecticExecuteJobPayload = {
                // Inherit ALL fields from parent job payload (defensive programming)
                projectId: parentJob.payload.projectId,
                sessionId: parentJob.payload.sessionId,
                stageSlug: parentJob.payload.stageSlug,
                iterationNumber: parentJob.payload.iterationNumber,
                model_id: parentJob.payload.model_id,
                user_jwt: parentJob.payload.user_jwt,
                walletId: parentJob.payload.walletId,

                // Optional fields - include only if present in parent
                ...(parentJob.payload.model_slug ? { model_slug: parentJob.payload.model_slug } : {}),
                ...(parentJob.payload.continueUntilComplete !== undefined ? { continueUntilComplete: parentJob.payload.continueUntilComplete } : {}),
                ...(parentJob.payload.maxRetries !== undefined ? { maxRetries: parentJob.payload.maxRetries } : {}),
                ...(parentJob.payload.continuation_count !== undefined ? { continuation_count: parentJob.payload.continuation_count } : {}),
                ...(parentJob.payload.is_test_job !== undefined ? { is_test_job: parentJob.payload.is_test_job } : {}),

                sourceContributionId: derivedSourceContributionId,
                // Override job-specific properties
                prompt_template_id: recipeStep.prompt_template_id,
                output_type: recipeStep.output_type,
                canonicalPathParams: canonicalPathParams,
                inputs: {
                    document_ids: documentIds,
                },
                planner_metadata: { recipe_step_id: recipeStep.id },
                document_key: documentKey,
                context_for_documents: contextForDocuments,
                document_relationships: { source_group: groupId },
                // Conditionally include target_contribution_id only if parent has a valid string value
                ...(typeof parentJob.payload.target_contribution_id === 'string' && parentJob.payload.target_contribution_id.length > 0
                    ? { target_contribution_id: parentJob.payload.target_contribution_id }
                    : {}),
            };
            childPayloads.push(executePayload);
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

            // Check if recipe step requires any document inputs (not just seed_prompt)
            const hasDocumentInputs = recipeStep.inputs_required?.some(
                input => input.type === 'document'
            ) ?? false;

            // Use universal selector for canonical path params
            // Only call selectAnchorSourceDocument if document inputs are required
            let anchorForCanonicalPathParams: typeof sourceDocs[0] | null = null;
            if (hasDocumentInputs) {
                const anchorResult = deps.selectAnchorSourceDocument(recipeStep, groupDocs);
                if (anchorResult.status === 'anchor_not_found') {
                    throw new Error(`Anchor document not found for stage '${anchorResult.targetSlug}' document_key '${anchorResult.targetDocumentKey}'`);
                }
                anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;
            }
            
            // Use the first document as the anchor for sourceContributionId and source_group (preserves lineage)
            const anchorDoc = groupDocs[0];
            const canonicalPathParams = deps.createCanonicalPathParams(groupDocs, recipeStep.output_type, anchorForCanonicalPathParams, stageSlug);
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
                user_jwt: parentJob.payload.user_jwt,
                walletId: parentJob.payload.walletId,

                // Optional fields - include only if present in parent
                ...(parentJob.payload.model_slug ? { model_slug: parentJob.payload.model_slug } : {}),
                ...(parentJob.payload.continueUntilComplete !== undefined ? { continueUntilComplete: parentJob.payload.continueUntilComplete } : {}),
                ...(parentJob.payload.maxRetries !== undefined ? { maxRetries: parentJob.payload.maxRetries } : {}),
                ...(parentJob.payload.continuation_count !== undefined ? { continuation_count: parentJob.payload.continuation_count } : {}),
                ...(typeof parentJob.payload.target_contribution_id === 'string' && parentJob.payload.target_contribution_id.length > 0
                    ? { target_contribution_id: parentJob.payload.target_contribution_id }
                    : {}),
                ...(parentJob.payload.is_test_job !== undefined ? { is_test_job: parentJob.payload.is_test_job } : {}),
                // Override job-specific properties
                prompt_template_id: recipeStep.prompt_template_id,
                output_type: recipeStep.output_type,
                isIntermediate: recipeStep.output_type !== FileType.Synthesis,
                canonicalPathParams,
                inputs: {
                    // Pass all document IDs from the group as an array
                    [`${anchorDoc.contribution_type}_ids`]: groupDocs.map(d => d.id),
                },
                document_relationships: {
                    source_group: groupId
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

/**
 * Public wrapper for planPerSourceDocumentByLineage that maintains GranularityPlannerFn signature.
 * Groups source documents by their `document_relationships.source_group` property.
 * Creates one child job for each group.
 */
export const planPerSourceDocumentByLineage: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep,
    authToken
) => {
    const deps: IPlanPerSourceDocumentByLineageDeps = {
        deconstructStoragePath,
        selectAnchorSourceDocument,
        createCanonicalPathParams,
    };
    
    const params: PlanPerSourceDocumentByLineageParams = {
        sourceDocs,
        parentJob,
        recipeStep,
        authToken,
    };
    
    return planPerSourceDocumentByLineageInternal(deps, params);
};
