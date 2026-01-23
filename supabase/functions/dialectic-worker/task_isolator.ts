import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    DialecticExecuteJobPayload,
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    SourceDocument,
} from '../dialectic-service/dialectic.interface.ts';
import { isDialecticExecuteJobPayload, isDialecticPlanJobPayload, isJson } from '../_shared/utils/type_guards.ts';
import { 
    DialecticStageRecipeStep, 
    DialecticRecipeTemplateStep 
} from '../dialectic-service/dialectic.interface.ts';
import { Database } from '../types_db.ts';
import { extractSourceDocumentIdentifier } from '../_shared/utils/source_document_identifier.ts';
import { IPlanJobContext } from './JobContext.interface.ts';

function isPlannableStep(step: DialecticRecipeStep): step is (DialecticStageRecipeStep | DialecticRecipeTemplateStep) {
    if ('is_skipped' in step && step.is_skipped) {
        return false;
    }
    return 'job_type' in step && (step.job_type === 'PLAN' || step.job_type === 'EXECUTE' || step.job_type === 'RENDER');
}

export async function planComplexStage(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    ctx: IPlanJobContext,
    recipeStep: DialecticRecipeStep,
    authToken: string,
    completedSourceDocumentIds?: Set<string>,
): Promise<DialecticJobRow[]> {
    if (!isPlannableStep(recipeStep)) {
        throw new Error('planComplexStage cannot process this type of recipe step. This indicates an orchestration logic error.');
    }
    
    // Explicitly validate required recipe properties upfront to prevent downstream errors.
    if (!recipeStep.inputs_required || recipeStep.inputs_required.length === 0) {
        throw new Error('recipeStep.inputs_required is required and cannot be empty');
    }
    if (!recipeStep.granularity_strategy) {
        throw new Error('recipeStep.granularity_strategy is required');
    }

    // Validate that the recipe step is not using deprecated properties.
    if ('step' in recipeStep) {
        throw new Error('recipeStep.step is a deprecated property. Please use step_key or step_name.');
    }
    if (!recipeStep.prompt_template_id) {
        throw new Error('recipeStep.prompt_template_id is required');
    }

    //deps.logger.info(`[task_isolator] [planComplexStage] Planning step "${recipeStep.name}" for parent job ID: ${parentJob.id}`);
    
    // Validate presence of user_jwt on the parent payload (planners will use it directly)
    {
        const desc = Object.getOwnPropertyDescriptor(parentJob.payload, 'user_jwt');
        const potential = desc ? desc.value : undefined;
        if (typeof potential !== 'string' || potential.length === 0) {
            throw new Error('parent payload.user_jwt is required');
        }
    }

    // Validate stageSlug correctness: must exist on payload and match row if present
    const stageSlug = parentJob.payload.stageSlug;
    if (typeof stageSlug !== 'string') {
        throw new Error('parent payload.stageSlug is required');
    }
    if (typeof parentJob.stage_slug === 'string' && parentJob.stage_slug !== stageSlug) {
        throw new Error('parent row.stage_slug mismatch');
    }

    // 1. Fetch source documents required for this specific step.
    ctx.logger.info(`[planComplexStage] Step '${recipeStep.step_slug}' (key: '${recipeStep.step_key}') inputs_required: ${JSON.stringify(recipeStep.inputs_required)}`);
    let sourceDocuments = await ctx.findSourceDocuments(
        dbClient, 
        parentJob, 
        recipeStep.inputs_required,
    );
    
    if (sourceDocuments.length === 0) {
        //deps.logger.info(`[task_isolator] [planComplexStage] No source documents found for step "${recipeStep.name}". Skipping planning.`);
        return [];
    }

    // 1.5. Filter by source_group if parent job has document_relationships.source_group set.
    // This ensures we select documents from the correct lineage branch when multiple documents match.
    // First filter by matching source_group, then select the most recent document from that lineage.
    const parentPayload = parentJob.payload;
    const parentSourceGroup = (parentPayload as { document_relationships?: { source_group?: string | null } | null }).document_relationships?.source_group;
    
    if (typeof parentSourceGroup === 'string' && parentSourceGroup.length > 0) {
        // Filter documents to only those matching the parent's source_group
        const matchingLineageDocs = sourceDocuments.filter((doc) => {
            const docSourceGroup = doc.document_relationships?.source_group;
            return typeof docSourceGroup === 'string' && docSourceGroup === parentSourceGroup;
        });

        if (matchingLineageDocs.length > 0) {
            // Select the most recent document from the matching lineage (by created_at, then updated_at)
            const sortedByRecency = [...matchingLineageDocs].sort((a, b) => {
                const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                if (bUpdated !== aUpdated) {
                    return bUpdated - aUpdated;
                }
                const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bCreated - aCreated;
            });
            
            sourceDocuments = [sortedByRecency[0]];
            ctx.logger.info(`[planComplexStage] Filtered by source_group '${parentSourceGroup}': ${matchingLineageDocs.length} matching document(s), selected most recent: ${sourceDocuments[0]?.id}`);
        } else {
            // No documents match the parent's source_group - this might be an error condition
            // but we'll let it proceed and let downstream logic handle it
            ctx.logger.warn(`[planComplexStage] Parent job has source_group '${parentSourceGroup}' but no source documents match this lineage. Proceeding with all ${sourceDocuments.length} document(s).`);
        }
    }

    // 2. Filter out completed source documents if completedSourceDocumentIds is provided.
    if (completedSourceDocumentIds && completedSourceDocumentIds.size > 0) {
        const sourceDocumentsBeforeFiltering = sourceDocuments.length;
        const completedIdsCount = completedSourceDocumentIds.size;
        const filteredOutIdentifiers: string[] = [];
        
        const filteredSourceDocuments: SourceDocument[] = [];
        for (const doc of sourceDocuments) {
            try {
                const identifier = extractSourceDocumentIdentifier(doc);
                if (identifier === null) {
                    throw new Error('extractSourceDocumentIdentifier returned null for source document');
                }
                if (completedSourceDocumentIds.has(identifier)) {
                    filteredOutIdentifiers.push(identifier);
                } else {
                    filteredSourceDocuments.push(doc);
                }
            } catch (error) {
                // Re-throw original error to preserve exact error message and stack trace
                // This ensures "fail loud and hard" behavior per step 45.i criterion 3
                if (error instanceof Error) {
                    throw error;
                }
                throw new Error(`Failed to extract source document identifier: ${String(error)}`);
            }
        }
        
        sourceDocuments = filteredSourceDocuments;
        
        ctx.logger.info(`[planComplexStage] Filtered source documents: ${sourceDocumentsBeforeFiltering} before, ${completedIdsCount} completed IDs in filter Set, ${sourceDocuments.length} after filtering. Filtered out identifiers: [${filteredOutIdentifiers.join(', ')}]`);
    }

    // 3. Call the planner with filtered source documents.
    const planner = ctx.getGranularityPlanner(recipeStep.granularity_strategy);
    if (!planner) {
        throw new Error(`No planner found for granularity strategy: ${recipeStep.granularity_strategy}`);
    }
    
    const plannedPayloads = planner(sourceDocuments, parentJob, recipeStep, authToken);
    if (!Array.isArray(plannedPayloads)) {
        throw new Error(`Planner for strategy '${recipeStep.granularity_strategy}' returned a non-array value.`);
    }
    const childJobPayloads: (DialecticExecuteJobPayload | DialecticPlanJobPayload)[] = plannedPayloads;
    
    //ctx.logger.info(`[task_isolator] [planComplexStage] Planner returned ${childJobPayloads.length} payloads. Content: ${JSON.stringify(childJobPayloads, null, 2)}`);

    // 4. Map to full job rows for DB insertion.
    const childJobsToInsert: DialecticJobRow[] = [];
    for (const payload of childJobPayloads) {
        try {
            // 1. Determine payload type and validate shape
            let jobType: 'PLAN' | 'EXECUTE';
            let validatedPayload: DialecticExecuteJobPayload | DialecticPlanJobPayload;

            let isExecutePayload = false;
            try {
                // Guard throws on failure; if it returns true, it matches.
                if (isDialecticExecuteJobPayload(payload)) {
                    isExecutePayload = true;
                }
            } catch {
                // Ignored: not an execute payload (or malformed), proceed to check PLAN
                isExecutePayload = false;
            }

            if (isExecutePayload) {
                jobType = 'EXECUTE';
                validatedPayload = payload;
            } else if (isDialecticPlanJobPayload(payload)) {
                jobType = 'PLAN';
                validatedPayload = payload;
            } else {
                ctx.logger.warn(`[task_isolator] Skipping malformed payload from planner due to invalid shape: ${JSON.stringify(payload)}`);
                continue;
            }
            // 2. Context Check: Ensure planner's payload matches the authoritative parent context.
            const parentPayload = parentJob.payload;
            const contextMismatches: string[] = [];
            if (validatedPayload.projectId !== parentPayload.projectId) contextMismatches.push('projectId');
            if (validatedPayload.sessionId !== parentPayload.sessionId) contextMismatches.push('sessionId');
            if (validatedPayload.stageSlug !== parentPayload.stageSlug) contextMismatches.push('stageSlug');
            if (validatedPayload.iterationNumber !== parentPayload.iterationNumber) contextMismatches.push('iterationNumber');
            if (validatedPayload.walletId !== parentPayload.walletId) contextMismatches.push('walletId');

            if (contextMismatches.length > 0) {
                ctx.logger.warn(`[task_isolator] Skipping payload with mismatched context. Fields: ${contextMismatches.join(', ')}`, { parent: parentPayload, received: validatedPayload });
                continue;
            }

            if (!isJson(validatedPayload)) {
                throw new Error('FATAL: Constructed child job payload is not a valid JSON object.');
            }

            if (!parentJob.payload.stageSlug) {
                throw new Error('parent payload.stageSlug is required');
            }
            childJobsToInsert.push({
                id: crypto.randomUUID(),
                parent_job_id: parentJob.id,
                session_id: parentJob.session_id,
                user_id: parentJob.user_id,
                stage_slug: stageSlug,
                iteration_number: parentJob.iteration_number,
                status: 'pending',
                max_retries: parentJob.max_retries,
                attempt_count: 0,
                created_at: new Date().toISOString(),
                started_at: null,
                completed_at: null,
                results: null,
                error_details: null,
                target_contribution_id: null,
                prerequisite_job_id: null,
                payload: validatedPayload,
                is_test_job: parentJob.is_test_job ?? false,
                job_type: jobType,
            });
        } catch (error) {
            ctx.logger.warn(`[task_isolator] Error processing payload, skipping. Error: ${error instanceof Error ? error.message : String(error)}`, { payload: JSON.stringify(payload) });
            continue;
        }
    }

    //ctx.logger.info(`[task_isolator] [planComplexStage] Planned ${childJobsToInsert.length} child jobs for step "${recipeStep.name}".`);
    return childJobsToInsert;
}
