// supabase/functions/dialectic-worker/processComplexJob.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticSkeletonJobPayload,
    RequiredArtifactIdentity,
} from '../dialectic-service/dialectic.interface.ts';
import { resolveNextBlocker } from './resolveNextBlocker.ts';
import type { IPlanJobContext } from './JobContext.interface.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import {
    isDialecticPlanJobPayload,
    isRecord,
    isJson,
} from '../_shared/utils/type_guards.ts';
import { isDialecticSkeletonJobPayload } from '../_shared/utils/type-guards/type_guards.dialectic.ts';
import type {
    DialecticRecipeTemplateStep,
    DialecticStageRecipeStep,
    DialecticStageRecipeInstance,
} from '../dialectic-service/dialectic.interface.ts';
import {
    isDialecticRecipeTemplateStep,
    isDialecticStageRecipeStep,
} from '../_shared/utils/type-guards/type_guards.dialectic.recipe.ts';

export async function processComplexJob(
    dbClient: SupabaseClient<Database>,
    job: DialecticJobRow & { payload: DialecticPlanJobPayload | DialecticSkeletonJobPayload },
    projectOwnerUserId: string,
    ctx: IPlanJobContext,
    authToken: string,
): Promise<void> {
    const { id: parentJobId } = job;
    
    if (job.prerequisite_job_id) {
        if (!isDialecticSkeletonJobPayload(job.payload)) {
            throw new Error(`[processComplexJob] Job ${parentJobId} has an invalid payload for deferred planning.`);
        }
    } else if (!isDialecticPlanJobPayload(job.payload)) {
        throw new Error(`[processComplexJob] Job ${parentJobId} has an invalid payload for complex processing.`);
    }

    const stageSlugFromRow: unknown = job.stage_slug;
    const stageSlugFromPayload: unknown = isRecord(job.payload) ? job.payload.stageSlug : undefined;
    let stageSlug: string;
    if (typeof stageSlugFromRow === 'string' && stageSlugFromRow.length > 0) {
        stageSlug = stageSlugFromRow;
    } else if (typeof stageSlugFromPayload === 'string' && stageSlugFromPayload.length > 0) {
        stageSlug = stageSlugFromPayload;
    } else {
        throw new Error(`[processComplexJob] Job ${parentJobId} is missing stageSlug.`);
    }

    // 1. Fetch the stage data to find the active recipe instance
    const { data: stageData, error: stageError } = await dbClient
        .from('dialectic_stages')
        .select('active_recipe_instance_id')
        .eq('slug', stageSlug)
        .single();

    if (stageError || !stageData || !stageData.active_recipe_instance_id) {
        await dbClient.from('dialectic_generation_jobs').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_details: { message: `Stage '${stageSlug}' not found or has no active recipe.` },
        }).eq('id', parentJobId);
        return;
    }

    // 2. Resolve the active recipe instance, then load steps/edges from template or instance tables (CoW model)
    const { data: instance, error: instanceError } = await dbClient
        .from('dialectic_stage_recipe_instances')
        .select('*')
        .eq('id', stageData.active_recipe_instance_id)
        .single();

    if (instanceError || !instance) {
        await dbClient.from('dialectic_generation_jobs').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_details: { message: `Recipe instance not found for stage '${stageSlug}' with instance ID '${stageData.active_recipe_instance_id}'.` },
        }).eq('id', parentJobId);
        return;
    }

    const isClonedInstance = (inst: DialecticStageRecipeInstance): boolean => inst.is_cloned === true;

    let steps: unknown[] = [];
    let edges: { from_step_id: string; to_step_id: string }[] = [];

    if (isClonedInstance(instance)) {
        const [{ data: stepRows, error: stepErr }, { data: edgeRows, error: _edgeErr }] = await Promise.all([
            dbClient.from('dialectic_stage_recipe_steps').select('*').eq('instance_id', instance.id),
            dbClient.from('dialectic_stage_recipe_edges').select('*').eq('instance_id', instance.id),
        ]);
        if (stepErr || !stepRows || stepRows.length === 0) {
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_details: { message: `Active recipe instance '${instance.id}' has no recipe steps.` },
            }).eq('id', parentJobId);
            return;
        }
        steps = (stepRows ?? []);
        const validCount = (steps).filter(isDialecticStageRecipeStep).length;
        if (validCount === 0) {
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_details: { message: `Active recipe instance '${instance.id}' has no valid recipe steps.` },
            }).eq('id', parentJobId);
            return;
        }
        edges = (edgeRows ?? []).map((e) => ({ from_step_id: e.from_step_id, to_step_id: e.to_step_id }));
    } else {
        const [{ data: stepRows, error: stepErr }, { data: edgeRows, error: _edgeErr }] = await Promise.all([
            dbClient.from('dialectic_recipe_template_steps').select('*').eq('template_id', instance.template_id),
            dbClient.from('dialectic_recipe_template_edges').select('*').eq('template_id', instance.template_id),
        ]);
        if (stepErr || !stepRows || stepRows.length === 0) {
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_details: { message: `Recipe template '${instance.template_id}' has no recipe steps.` },
            }).eq('id', parentJobId);
            return;
        }
        steps = (stepRows ?? []);
        const validCount = steps.filter(isDialecticRecipeTemplateStep).length;
        if (validCount === 0) {
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_details: { message: `Recipe template '${instance.template_id}' has no valid recipe steps.` },
            }).eq('id', parentJobId);
            return;
        }
        edges = (edgeRows ?? []).map((e) => ({ from_step_id: e.from_step_id, to_step_id: e.to_step_id }));
    }

    ctx.logger.info(`[processComplexJob] Loaded ${steps.length} steps and ${edges.length} edges`);
    ctx.logger.info(`[processComplexJob] Edges: ${JSON.stringify(edges.map(e => ({ from: e.from_step_id, to: e.to_step_id })))}`);

    // 3. Determine readiness by looking at ALL child jobs (not just completed) and the DAG
    const { data: allChildren, error: childrenError } = await dbClient
        .from('dialectic_generation_jobs')
        .select('id, payload, status')
        .eq('parent_job_id', parentJobId);

    if (childrenError) {
        throw new Error(`Failed to fetch child jobs for parent ${parentJobId}: ${childrenError.message}`);
    }

    // Build step ID to step slug mapping first (needed for tracking completed steps)
    const stepIdToStep = new Map<string, DialecticRecipeTemplateStep | DialecticStageRecipeStep>();
    const stepSlugById = new Map<string, string>();
    for (const s of steps) {
        if (isDialecticStageRecipeStep(s)) {
            stepIdToStep.set(s.id, s);
            stepSlugById.set(s.id, s.step_slug);
            continue;
        }
        if (isDialecticRecipeTemplateStep(s)) {
            stepIdToStep.set(s.id, s);
            stepSlugById.set(s.id, s.step_slug);
        }
    }

    // 106.e: Deferred Planning Handler
    // If this is a skeleton PLAN job returning after a prerequisite completed,
    // we perform single-step deferred planning here and exit.
    if (job.prerequisite_job_id) {
        ctx.logger.info(`[processComplexJob] Deferred planning triggered for job ${job.id} (prerequisite ${job.prerequisite_job_id} completed)`);

        if (!isDialecticSkeletonJobPayload(job.payload)) {
            throw new Error(`[processComplexJob] Deferred planning failed: invalid skeleton payload`);
        }

        const recipeStepIdUnknown: unknown = job.payload.planner_metadata.recipe_step_id;
        if (typeof recipeStepIdUnknown !== 'string' || recipeStepIdUnknown.length === 0) {
            throw new Error(`[processComplexJob] Deferred planning failed: planner_metadata.recipe_step_id missing`);
        }
        const recipeStepId: string = recipeStepIdUnknown;

        const step = stepIdToStep.get(recipeStepId);
        if (!step) {
             throw new Error(`[processComplexJob] Deferred planning failed: Step ${recipeStepId} not found in recipe`);
        }

        // 109.f.ii: Extract requiredArtifactIdentity from job.results
        if (!isRecord(job.results)) {
            throw new Error(`[processComplexJob] Deferred planning failed: job.results is not a record`);
        }
        const requiredArtifactIdentityUnknown: unknown = job.results.required_artifact_identity;
        if (!isRecord(requiredArtifactIdentityUnknown)) {
            throw new Error(`[processComplexJob] Deferred planning failed: job.results.required_artifact_identity is missing or invalid`);
        }
        const requiredArtifactIdentity: RequiredArtifactIdentity = {
            projectId: typeof requiredArtifactIdentityUnknown.projectId === 'string' ? requiredArtifactIdentityUnknown.projectId : '',
            sessionId: typeof requiredArtifactIdentityUnknown.sessionId === 'string' ? requiredArtifactIdentityUnknown.sessionId : '',
            stageSlug: typeof requiredArtifactIdentityUnknown.stageSlug === 'string' ? requiredArtifactIdentityUnknown.stageSlug : '',
            iterationNumber: typeof requiredArtifactIdentityUnknown.iterationNumber === 'number' ? requiredArtifactIdentityUnknown.iterationNumber : 0,
            model_id: typeof requiredArtifactIdentityUnknown.model_id === 'string' ? requiredArtifactIdentityUnknown.model_id : '',
            documentKey: typeof requiredArtifactIdentityUnknown.documentKey === 'string' ? requiredArtifactIdentityUnknown.documentKey : '',
            branchKey: requiredArtifactIdentityUnknown.branchKey !== undefined && requiredArtifactIdentityUnknown.branchKey !== null ? String(requiredArtifactIdentityUnknown.branchKey) : null,
            parallelGroup: requiredArtifactIdentityUnknown.parallelGroup !== undefined && requiredArtifactIdentityUnknown.parallelGroup !== null ? Number(requiredArtifactIdentityUnknown.parallelGroup) : null,
            sourceGroupFragment: requiredArtifactIdentityUnknown.sourceGroupFragment !== undefined && requiredArtifactIdentityUnknown.sourceGroupFragment !== null ? String(requiredArtifactIdentityUnknown.sourceGroupFragment) : null,
        };

        // Extract params for resolveNextBlocker
        const skeletonPayload = job.payload;
        const projectId = skeletonPayload.projectId;
        const sessionId = skeletonPayload.sessionId;
        const iterationNumber = typeof job.iteration_number === 'number' ? job.iteration_number : skeletonPayload.iterationNumber;
        const model_id = skeletonPayload.model_id;

        // 109.f.iii: Wrap findSourceDocuments in try/catch
        try {
            // Verify inputs are now available (since prereq and any RENDER completed)
            await ctx.findSourceDocuments(
                dbClient,
                job,
                step.inputs_required ?? []
            );
        } catch (findSourceDocumentsError) {
            // 109.f.iv: Call resolveNextBlocker in catch block
            const getRecipeStep = async (stepId: string) => {
                const recipeStep = stepIdToStep.get(stepId);
                return recipeStep ?? null;
            };

            const nextBlocker = await resolveNextBlocker(
                {
                    dbClient,
                    logger: ctx.logger,
                    getRecipeStep,
                },
                {
                    projectId,
                    sessionId,
                    stageSlug,
                    iterationNumber,
                    model_id,
                    requiredArtifactIdentity,
                }
            );

            // 109.f.v: If nextBlocker !== null && nextBlocker.id !== job.prerequisite_job_id: update and return early
            if (nextBlocker !== null && nextBlocker.id !== job.prerequisite_job_id) {
                ctx.logger.info(`[processComplexJob] Re-chaining job ${job.id} to wait for ${nextBlocker.id} (type: ${nextBlocker.job_type})`);
                await dbClient.from('dialectic_generation_jobs').update({
                    status: 'waiting_for_prerequisite',
                    prerequisite_job_id: nextBlocker.id,
                }).eq('id', job.id);
                return; // EXIT - wait for next blocker to complete
            }

            // 109.f.vi: Otherwise (nextBlocker is null or same as current): re-throw the original error
            throw findSourceDocumentsError;
        }

        if (!ctx.planComplexStage) {
            throw new Error("planComplexStage dependency is missing.");
        }

        // Plan just this one step
        // New children will be parented to this skeleton job (job.id)
        const childJobs = await ctx.planComplexStage(
            dbClient,
            job,
            ctx,
            step,
            authToken
        );

        if (childJobs.length > 0) {
             const { error: insertError } = await dbClient.from('dialectic_generation_jobs').insert(childJobs);
             if (insertError) {
                 throw new Error(`Failed to insert child jobs during deferred planning: ${insertError.message}`);
             }
             ctx.logger.info(`[processComplexJob] Deferred planning enqueued ${childJobs.length} child jobs for step ${step.step_slug}`);

             // Update skeleton job to waiting_for_children and clear prerequisite_job_id
             await dbClient.from('dialectic_generation_jobs').update({
                status: 'waiting_for_children',
                prerequisite_job_id: null,
             }).eq('id', job.id);
        } else {
            ctx.logger.warn(`[processComplexJob] Deferred planning produced no child jobs for step ${step.step_slug}`);
            // If no children, mark as completed
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                results: { status_reason: 'Deferred planning produced no child jobs.' },
            }).eq('id', job.id);
        }

        return; // EXIT - do not run standard stage planning
    }

    // Helper function to extract source document identifier from child job payload
    const extractSourceDocumentIdentifier = (payload: unknown): string | null => {
        if (!isRecord(payload)) {
            return null;
        }
        
        // Prefer document_relationships?.source_group if available
        if (isRecord(payload.document_relationships)) {
            const sourceGroup = payload.document_relationships.source_group;
            if (typeof sourceGroup === 'string' && sourceGroup.length > 0) {
                return sourceGroup;
            }
        }
        
        // Fallback to constructing identifier from canonicalPathParams
        if (isRecord(payload.canonicalPathParams)) {
            const params = payload.canonicalPathParams;
            const contributionType = typeof params.contributionType === 'string' ? params.contributionType : '';
            const stageSlug = typeof params.stageSlug === 'string' ? params.stageSlug : '';
            const sourceAttemptCount = typeof params.sourceAttemptCount === 'number' ? params.sourceAttemptCount : null;
            
            if (contributionType && stageSlug && sourceAttemptCount !== null) {
                return `${contributionType}_${stageSlug}_${sourceAttemptCount}`;
            }
        }
        
        return null;
    };

    // Track steps with in-progress jobs (pending, processing, retrying)
    const stepsWithInProgressJobs = new Set<string>();
    
    // Track steps with failed jobs (failed, retry_loop_failed) to distinguish mixed completed + failed from only completed
    const stepsWithFailedJobs = new Set<string>();
    
    // Track completed source documents by step for selective re-planning
    const completedSourceDocumentsByStep = new Map<string, Set<string>>();
    
    // Track completed steps by looking up step_slug from planner_metadata.recipe_step_id
    const completedStepSlugs = new Set<string>();
    
    // Process ALL child jobs to build tracking structures
    for (const child of allChildren ?? []) {
        // Validate that ALL child jobs have required planner_metadata (not just completed ones)
        if (!isRecord(child.payload)) {
            throw new Error(`processComplexJob cannot track child job ${child.id} because planner_metadata.recipe_step_id is missing or invalid. All child jobs MUST have planner_metadata with a non-empty recipe_step_id to enable step completion tracking.`);
        }
        
        if (!isRecord(child.payload.planner_metadata)) {
            throw new Error(`processComplexJob cannot track child job ${child.id} because planner_metadata.recipe_step_id is missing or invalid. All child jobs MUST have planner_metadata with a non-empty recipe_step_id to enable step completion tracking.`);
        }
        
        const recipeStepId = child.payload.planner_metadata.recipe_step_id;
        if (typeof recipeStepId !== 'string' || recipeStepId === '') {
            throw new Error(`processComplexJob cannot track child job ${child.id} because planner_metadata.recipe_step_id is missing or invalid. All child jobs MUST have planner_metadata with a non-empty recipe_step_id to enable step completion tracking.`);
        }
        
        const stepSlug = stepSlugById.get(recipeStepId);
        if (!stepSlug) {
            continue;
        }
        
        const childStatus = child.status;
        
        // Track in-progress jobs (includes waiting states to prevent duplicate scheduling)
        if (childStatus === 'pending' || childStatus === 'processing' || childStatus === 'retrying' || childStatus === 'waiting_for_prerequisite' || childStatus === 'waiting_for_children') {
            stepsWithInProgressJobs.add(stepSlug);
            ctx.logger.info(`[processComplexJob] Step '${stepSlug}' has in-progress child job ${child.id} with status '${childStatus}'`);
        }
        
        // Track failed jobs (terminal failure states)
        if (childStatus === 'failed' || childStatus === 'retry_loop_failed') {
            stepsWithFailedJobs.add(stepSlug);
            ctx.logger.info(`[processComplexJob] Step '${stepSlug}' has failed child job ${child.id} with status '${childStatus}'`);
        }
        
        // Track completed source documents for selective re-planning
        if (childStatus === 'completed') {
            completedStepSlugs.add(stepSlug);
            
            const sourceDocId = extractSourceDocumentIdentifier(child.payload);
            if (sourceDocId) {
                const completedSet = completedSourceDocumentsByStep.get(stepSlug) ?? new Set<string>();
                completedSet.add(sourceDocId);
                completedSourceDocumentsByStep.set(stepSlug, completedSet);
                ctx.logger.info(`[processComplexJob] Step '${stepSlug}' has completed source document with identifier '${sourceDocId}'`);
            }
        }
    }
    
    // Log in-progress job tracking
    if (stepsWithInProgressJobs.size > 0) {
        ctx.logger.info(`[processComplexJob] Steps with in-progress jobs (excluded from re-planning): [${Array.from(stepsWithInProgressJobs).join(', ')}]`);
    }
    
    // Log completed source documents per step
    for (const [stepSlug, completedIds] of completedSourceDocumentsByStep.entries()) {
        ctx.logger.info(`[processComplexJob] Step '${stepSlug}' has ${completedIds.size} completed source document(s): [${Array.from(completedIds).join(', ')}]`);
    }
    // Build predecessor map from edges
    const predecessors = new Map<string, Set<string>>();
    for (const e of edges) {
        const set = predecessors.get(e.to_step_id) ?? new Set<string>();
        set.add(e.from_step_id);
        predecessors.set(e.to_step_id, set);
    }

    // Log predecessor map for debugging
    for (const [stepId, slug] of stepSlugById.entries()) {
        const predIds = predecessors.get(stepId);
        if (predIds && predIds.size > 0) {
            const predSlugs = Array.from(predIds).map(id => stepSlugById.get(id) || id);
            ctx.logger.info(`[processComplexJob] Step '${slug}' (id: ${stepId}) has ${predIds.size} predecessor(s): [${predSlugs.join(', ')}]`);
        } else {
            ctx.logger.info(`[processComplexJob] Step '${slug}' (id: ${stepId}) has NO predecessors`);
        }
    }

    const isSkipped = (s: DialecticRecipeTemplateStep | DialecticStageRecipeStep): boolean => {
        // Template steps never have is_skipped; instance steps may
        return ('is_skipped' in s) && s.is_skipped === true;
    };

    // Determine which steps are ready: all predecessors completed (or skipped) and not already completed
    // Steps with ONLY completed jobs are excluded, but steps with MIXED completed + failed jobs are included
    const readySteps: (DialecticRecipeTemplateStep | DialecticStageRecipeStep)[] = [];
    for (const [id, s] of stepIdToStep.entries()) {
        const slug = stepSlugById.get(id)!;
        // Exclude steps with ONLY completed jobs (no failed jobs), but include steps with MIXED completed + failed jobs
        if (completedStepSlugs.has(slug) && !stepsWithFailedJobs.has(slug)) continue;
        if (isSkipped(s)) continue;
        // Exclude steps with in-progress jobs to prevent re-planning loop
        if (stepsWithInProgressJobs.has(slug)) continue;
        const preds = predecessors.get(id);
        if (!preds || preds.size === 0) {
            // No predecessors → initial step
            readySteps.push(s);
        } else {
            let allPredsDone = true;
            for (const predId of preds) {
                const predStep = stepIdToStep.get(predId);
                const predSlug = stepSlugById.get(predId);
                const predWasSkipped = predStep ? isSkipped(predStep) : false;
                // A predecessor is satisfied if it was completed AND has no in-progress jobs AND has no failed jobs, OR explicitly marked as skipped
                // If a predecessor has in-progress jobs or failed jobs, it's not done yet, even if it has some completed jobs
                if (!predWasSkipped && (!predSlug || !completedStepSlugs.has(predSlug) || stepsWithInProgressJobs.has(predSlug) || stepsWithFailedJobs.has(predSlug))) {
                    allPredsDone = false;
                    break;
                }
            }
            if (allPredsDone) {
                readySteps.push(s);
            }
        }
    }

    // Filter out steps with in-progress jobs from readySteps
    // Steps with ONLY completed jobs are already excluded in readySteps building
    // Steps with MIXED completed + failed jobs are included (can re-plan for failed work)
    const filteredReadySteps = readySteps.filter(step => !stepsWithInProgressJobs.has(step.step_slug));

    // If no ready steps remain, either we're waiting on siblings or all steps are complete
    if (filteredReadySteps.length === 0) {
        // Check if all non-skipped, validated steps are completed → complete the parent job
        const validatedSteps = Array.from(stepIdToStep.values());
        const allDone = validatedSteps
            .filter((s) => !isSkipped(s))
            .every((s) => completedStepSlugs.has(s.step_slug));
        if (allDone) {
            await dbClient.from('dialectic_generation_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', parentJobId);
        }
        return;
    }

    // Choose deterministic order for planning (execution_order for instance, step_number for template) but plan all
    filteredReadySteps.sort((a, b) => {
        const ao = ('execution_order' in a && typeof a.execution_order === 'number')
            ? a.execution_order
            : ('step_number' in a && typeof a.step_number === 'number') ? a.step_number : 0;
        const bo = ('execution_order' in b && typeof b.execution_order === 'number')
            ? b.execution_order
            : ('step_number' in b && typeof b.step_number === 'number') ? b.step_number : 0;
        return ao - bo;
    });

    // Log the first step for continuity with prior messages
    const firstReady = filteredReadySteps[0];
    ctx.logger.info(`[processComplexJob] Processing step '${firstReady.step_slug}' for job ${parentJobId}`);
    ctx.logger.info(`[processComplexJob] Total ready steps: ${filteredReadySteps.length}, step slugs: [${filteredReadySteps.map(s => s.step_slug).join(', ')}]`);
    for (const step of filteredReadySteps) {
        ctx.logger.info(`[processComplexJob] Ready step '${step.step_slug}' inputs_required: ${JSON.stringify(step.inputs_required)}`);
    }
    
    // Log which steps are excluded due to in-progress jobs
    const excludedSteps = Array.from(stepsWithInProgressJobs).filter(slug => 
        Array.from(stepIdToStep.values()).some(step => step.step_slug === slug)
    );
    if (excludedSteps.length > 0) {
        ctx.logger.info(`[processComplexJob] Steps excluded from planning due to in-progress jobs: [${excludedSteps.join(', ')}]`);
    }

    // CRITICAL VALIDATION: If multiple steps are ready initially (no completed steps yet), only the header_context generator should be ready.
    // All other steps require header_context as input, so they should have the header_context generator as a predecessor.
    if (completedStepSlugs.size === 0 && filteredReadySteps.length > 1) {
        const stepsRequiringHeader = filteredReadySteps.filter(s => 
            s.inputs_required && s.inputs_required.some(r => r.type === 'header_context')
        );
        if (stepsRequiringHeader.length > 0) {
            const errorMsg = `[processComplexJob] CRITICAL BUG: Multiple steps are ready initially, including steps that require header_context. This indicates the DAG edges are not set up correctly. Ready steps requiring header_context: [${stepsRequiringHeader.map(s => s.step_slug).join(', ')}]. This should never happen - these steps should have 'build-stage-header' as a predecessor.`;
            ctx.logger.error(errorMsg);
            // Don't throw here - let it fail naturally so we can see the full error, but log it clearly
        }
    }

    // Filter out steps with missing required intra-stage dependencies
    // A step requires intra-stage dependencies if it has required inputs from the same stage
    // that are produced by other steps in the same planning batch
    const stepsWithAvailableInputs: (DialecticRecipeTemplateStep | DialecticStageRecipeStep)[] = [];
    const stepsWithPrerequisiteDeps: Array<{
        step: DialecticRecipeTemplateStep | DialecticStageRecipeStep;
        missingDocumentKey: string;
        prerequisiteStepId: string;
        blockerJobId?: string; // If set, use this job ID directly instead of searching
    }> = [];
    
    for (const recipeStep of filteredReadySteps) {
        if (!recipeStep.inputs_required || recipeStep.inputs_required.length === 0) {
            stepsWithAvailableInputs.push(recipeStep);
            continue;
        }

        // Check for required intra-stage dependencies (inputs from the same stage)
        const intraStageRequiredInputs = recipeStep.inputs_required.filter(
            rule => rule.required !== false && rule.slug === stageSlug
        );

        if (intraStageRequiredInputs.length === 0) {
            // No intra-stage dependencies - step can be planned
            stepsWithAvailableInputs.push(recipeStep);
            continue;
        }

        // Check if all required intra-stage inputs are available
        // findSourceDocuments throws an error if a required input is missing, so if it succeeds, all required inputs are available
        try {
            await ctx.findSourceDocuments(
                dbClient,
                job,
                intraStageRequiredInputs,
            );
            // All required inputs are available - step can be planned
            stepsWithAvailableInputs.push(recipeStep);
        } catch (error) {
            // findSourceDocuments threw an error for a required input - check if we can schedule with waiting_for_prerequisite
            const errorMessage = error instanceof Error ? error.message : String(error);
            ctx.logger.info(`[processComplexJob] Step '${recipeStep.step_slug}' missing required intra-stage dependencies. Error: ${errorMessage}`);
            
            // Extract missing document_key from error message or identify which input rule failed
            let missingDocumentKey: string | null = null;
            for (const inputRule of intraStageRequiredInputs) {
                if (inputRule.document_key && errorMessage.includes(`document_key '${inputRule.document_key}'`)) {
                    missingDocumentKey = inputRule.document_key;
                    break;
                }
            }
            
            // If we couldn't extract from error message, try the first required input rule with a document_key
            if (!missingDocumentKey && intraStageRequiredInputs.length > 0) {
                const firstRequiredRule = intraStageRequiredInputs.find(rule => rule.document_key);
                if (firstRequiredRule && firstRequiredRule.document_key) {
                    missingDocumentKey = firstRequiredRule.document_key;
                }
            }
            
            if (!missingDocumentKey) {
                // Cannot identify missing document_key - cannot schedule safely
                ctx.logger.warn(`[processComplexJob] Step '${recipeStep.step_slug}' excluded from planning: missing required intra-stage dependencies but cannot identify missing document_key. Error: ${errorMessage}`);
                continue;
            }
            
            // Search stepIdToStep Map to find prerequisite-producing step where output_type === missing_document_key
            let prerequisiteStepId: string | null = null;
            for (const [stepId, step] of stepIdToStep.entries()) {
                if (step.output_type === missingDocumentKey) {
                    prerequisiteStepId = stepId;
                    break;
                }
            }
            
            // Verify prerequisite step exists in recipe instance (throw error if not found - cannot schedule safely)
            if (!prerequisiteStepId) {
                throw new Error(`[processComplexJob] Step '${recipeStep.step_slug}' requires document_key '${missingDocumentKey}' but no step in the recipe produces this output_type. Cannot schedule safely.`);
            }
            
            const prerequisiteStep = stepIdToStep.get(prerequisiteStepId);
            if (!prerequisiteStep) {
                throw new Error(`[processComplexJob] Step '${recipeStep.step_slug}' requires document_key '${missingDocumentKey}' but prerequisite step with id '${prerequisiteStepId}' not found in stepIdToStep map. Cannot schedule safely.`);
            }
            
            // Verify prerequisite step is either in completedStepSlugs OR in filteredReadySteps (will be available)
            const prerequisiteStepSlug = prerequisiteStep.step_slug;
            const prerequisiteIsCompleted = completedStepSlugs.has(prerequisiteStepSlug);
            const prerequisiteIsReady = filteredReadySteps.some(step => step.step_slug === prerequisiteStepSlug);
            
            if (!prerequisiteIsCompleted && !prerequisiteIsReady) {
                // Prerequisite step is not available and won't be available - cannot schedule safely
                ctx.logger.warn(`[processComplexJob] Step '${recipeStep.step_slug}' requires document_key '${missingDocumentKey}' from step '${prerequisiteStepSlug}', but prerequisite step is not completed and not in ready steps. Cannot schedule safely.`);
                continue;
            } else if (prerequisiteIsCompleted && !prerequisiteIsReady) {
                // Prerequisite step is completed but findSourceDocuments failed - the RENDER job may still be pending
                // Use resolveNextBlocker to find a pending RENDER job that will produce the document
                const payloadProjectId = isRecord(job.payload) && typeof job.payload.projectId === 'string' ? job.payload.projectId : null;
                const payloadSessionId = isRecord(job.payload) && typeof job.payload.sessionId === 'string' ? job.payload.sessionId : null;
                const payloadModelId = isRecord(job.payload) && typeof job.payload.model_id === 'string' ? job.payload.model_id : null;
                const payloadIterationNumber = typeof job.iteration_number === 'number' ? job.iteration_number : 
                    (isRecord(job.payload) && typeof job.payload.iterationNumber === 'number' ? job.payload.iterationNumber : null);

                if (payloadProjectId && payloadSessionId && payloadModelId && payloadIterationNumber !== null) {
                    const blockerResult = await resolveNextBlocker(
                        {
                            dbClient,
                            logger: ctx.logger,
                            getRecipeStep: async (stepId: string) => stepIdToStep.get(stepId) ?? null,
                        },
                        {
                            projectId: payloadProjectId,
                            sessionId: payloadSessionId,
                            stageSlug: stageSlug,
                            iterationNumber: payloadIterationNumber,
                            model_id: payloadModelId,
                            requiredArtifactIdentity: {
                                projectId: payloadProjectId,
                                sessionId: payloadSessionId,
                                stageSlug: stageSlug,
                                iterationNumber: payloadIterationNumber,
                                model_id: payloadModelId,
                                documentKey: missingDocumentKey,
                            },
                        }
                    );

                    if (blockerResult) {
                        ctx.logger.info(`[processComplexJob] Step '${recipeStep.step_slug}' prerequisite step '${prerequisiteStepSlug}' is completed but document not rendered yet. Found pending ${blockerResult.job_type} job ${blockerResult.id} to wait for.`);
                        stepsWithPrerequisiteDeps.push({
                            step: recipeStep,
                            missingDocumentKey: missingDocumentKey,
                            prerequisiteStepId: prerequisiteStepId,
                            blockerJobId: blockerResult.id,
                        });
                        continue;
                    }
                }

                // No pending job found - truly inconsistent state
                throw new Error(`[processComplexJob] Step '${recipeStep.step_slug}' requires document_key '${missingDocumentKey}' from completed step '${prerequisiteStepSlug}', but the document was not found.`);
            }
            
            // If verified, add step to stepsWithPrerequisiteDeps instead of filtering out completely
            stepsWithPrerequisiteDeps.push({
                step: recipeStep,
                missingDocumentKey: missingDocumentKey,
                prerequisiteStepId: prerequisiteStepId,
            });
            ctx.logger.info(`[processComplexJob] Step '${recipeStep.step_slug}' will be scheduled with waiting_for_prerequisite status. Missing document_key: '${missingDocumentKey}', prerequisite step: '${prerequisiteStepSlug}' (${prerequisiteIsCompleted ? 'completed' : 'will be planned in this batch'})`);
        }
    }

    if (stepsWithAvailableInputs.length === 0 && stepsWithPrerequisiteDeps.length === 0) {
        ctx.logger.warn(`[processComplexJob] No steps have all required inputs available. Ready steps: [${filteredReadySteps.map(s => s.step_slug).join(', ')}]. Waiting for intra-stage dependencies to be produced.`);
        return;
    }

    // Log which steps were filtered out
    const filteredOutSteps = filteredReadySteps.filter(step => !stepsWithAvailableInputs.includes(step));
    if (filteredOutSteps.length > 0) {
        ctx.logger.info(`[processComplexJob] Steps filtered out due to missing intra-stage dependencies: [${filteredOutSteps.map(s => s.step_slug).join(', ')}]`);
    }

	// Emit planner_started notification with required context
	await ctx.notificationService.sendDocumentCentricNotification({
		type: 'planner_started',
		sessionId: job.session_id,
		stageSlug: stageSlug,
		job_id: job.id,
		document_key: String(firstReady.output_type),
		modelId: job.payload.model_id,
		iterationNumber: job.iteration_number,
	}, projectOwnerUserId);

    try {
        if (!ctx.planComplexStage) {
            throw new Error("planComplexStage dependency is missing.");
        }
        // 5. Delegate to the planner for each ready step and aggregate child jobs.
        const plannedChildrenArrays = await Promise.all(
            stepsWithAvailableInputs.map((recipeStep) => {
                ctx.logger.info(`[processComplexJob] Calling planComplexStage for step '${recipeStep.step_slug}' with inputs_required: ${JSON.stringify(recipeStep.inputs_required)}`);
                
                // Check if this step has completed source documents that should be excluded from re-planning
                const completedSourceDocIds = completedSourceDocumentsByStep.get(recipeStep.step_slug);
                if (completedSourceDocIds && completedSourceDocIds.size > 0) {
                    ctx.logger.info(`[processComplexJob] Step '${recipeStep.step_slug}' has ${completedSourceDocIds.size} completed source document(s) that should be excluded from re-planning: [${Array.from(completedSourceDocIds).join(', ')}]`);
                }
                
                return ctx.planComplexStage!(
                    dbClient,
                    job,
                    ctx,
                    recipeStep,
                    authToken,
                    completedSourceDocIds ?? undefined,
                );
            })
        );
        const childJobs = plannedChildrenArrays.flat();

        // 106.d: Create skeleton PLAN jobs for steps with prerequisite dependencies
        // Instead of calling planComplexStage (which would call findSourceDocuments and fail),
        // we create skeleton PLAN jobs directly. These will return through processComplexJob
        // after the prerequisite completes and be handled by the deferred planning logic.
        if (stepsWithPrerequisiteDeps.length > 0) {
            ctx.logger.info(`[processComplexJob] Creating ${stepsWithPrerequisiteDeps.length} skeleton PLAN job(s) for steps with prerequisite dependencies`);

            for (const { step, missingDocumentKey, prerequisiteStepId, blockerJobId } of stepsWithPrerequisiteDeps) {
                let prerequisiteJobId: string;

                // If blockerJobId is set (from resolveNextBlocker), use it directly
                if (blockerJobId) {
                    prerequisiteJobId = blockerJobId;
                    ctx.logger.info(`[processComplexJob] Using blocker job '${prerequisiteJobId}' for step '${step.step_slug}' (pending RENDER/EXECUTE job)`);
                } else {
                    // Find prerequisite-producing job ID from childJobs array
                    const prerequisiteJob = childJobs.find(childJob => {
                        if (!isRecord(childJob.payload) || !isRecord(childJob.payload.planner_metadata)) {
                            return false;
                        }
                        const childRecipeStepId = childJob.payload.planner_metadata.recipe_step_id;
                        return typeof childRecipeStepId === 'string' && childRecipeStepId === prerequisiteStepId;
                    });

                    if (!prerequisiteJob) {
                        // If prerequisite step is completed, we need to find it from existing child jobs in the database
                        const prerequisiteStep = stepIdToStep.get(prerequisiteStepId);
                        if (prerequisiteStep && completedStepSlugs.has(prerequisiteStep.step_slug)) {
                            // Prerequisite is already completed - find the job from database
                            const { data: existingJobs } = await dbClient
                                .from('dialectic_generation_jobs')
                                .select('id, payload')
                                .eq('parent_job_id', parentJobId)
                                .eq('status', 'completed');

                            const existingPrerequisiteJob = existingJobs?.find(existingJob => {
                                if (!isRecord(existingJob.payload) || !isRecord(existingJob.payload.planner_metadata)) {
                                    return false;
                                }
                                const existingRecipeStepId = existingJob.payload.planner_metadata.recipe_step_id;
                                return typeof existingRecipeStepId === 'string' && existingRecipeStepId === prerequisiteStepId;
                            });

                            if (existingPrerequisiteJob) {
                                prerequisiteJobId = existingPrerequisiteJob.id;
                                ctx.logger.info(`[processComplexJob] Found existing completed prerequisite job '${prerequisiteJobId}' for step '${step.step_slug}'`);
                            } else {
                                throw new Error(`[processComplexJob] Cannot find prerequisite job for step '${step.step_slug}'. Prerequisite step ID: '${prerequisiteStepId}', missing document_key: '${missingDocumentKey}'`);
                            }
                        } else {
                            throw new Error(`[processComplexJob] Cannot find prerequisite job for step '${step.step_slug}'. Prerequisite step ID: '${prerequisiteStepId}', missing document_key: '${missingDocumentKey}'`);
                        }
                    } else {
                        prerequisiteJobId = prerequisiteJob.id;
                    }
                }

                // 106.d.ii-vi: Build skeleton PLAN job object.
                // We must explicitly build the payload object property by property to satisfy TypeScript's
                // strict checking against the `Json` type for the `payload` column in `dialectic_generation_jobs`.
                // Directly spreading `job.payload` fails because `job.payload` is `Json`, not a guaranteed object.
                // Optional fields are only included if they are defined (not undefined) to pass the type guard.
                if (!isDialecticPlanJobPayload(job.payload)) {
                    throw new Error(`[processComplexJob] Cannot create skeleton job: invalid parent PLAN payload.`);
                }

                const parentPayload: DialecticPlanJobPayload = job.payload;

                const iterationNumberFromRow: unknown = job.iteration_number;
                const iterationNumberFromPayload: unknown = parentPayload.iterationNumber;
                let iterationNumber: number;
                if (typeof iterationNumberFromRow === 'number') {
                    iterationNumber = iterationNumberFromRow;
                } else if (typeof iterationNumberFromPayload === 'number') {
                    iterationNumber = iterationNumberFromPayload;
                } else {
                    throw new Error(`[processComplexJob] Cannot create skeleton job: missing iterationNumber.`);
                }

                const skeletonPlannerMetadata: DialecticSkeletonJobPayload['planner_metadata'] = {
                    recipe_step_id: step.id,
                };

                const skeletonStepInfo: DialecticSkeletonJobPayload['step_info'] = {
                    current_step: 1,
                    total_steps: 1,
                };

                const skeletonPayload: DialecticSkeletonJobPayload = {
                    // Required fields (always present)
                    projectId: parentPayload.projectId,
                    sessionId: parentPayload.sessionId,
                    model_id: parentPayload.model_id,
                    walletId: parentPayload.walletId,
                    user_jwt: parentPayload.user_jwt,
                    stageSlug: stageSlug,
                    iterationNumber: iterationNumber,
                    planner_metadata: skeletonPlannerMetadata,
                    step_info: skeletonStepInfo,
                    
                    // Optional fields - only include if defined to pass type guard validation
                    ...(parentPayload.sourceContributionId !== undefined && { sourceContributionId: parentPayload.sourceContributionId }),
                    ...(parentPayload.continueUntilComplete !== undefined && { continueUntilComplete: parentPayload.continueUntilComplete }),
                    ...(parentPayload.maxRetries !== undefined && { maxRetries: parentPayload.maxRetries }),
                    ...(parentPayload.continuation_count !== undefined && { continuation_count: parentPayload.continuation_count }),
                    ...(parentPayload.target_contribution_id !== undefined && { target_contribution_id: parentPayload.target_contribution_id }),
                    ...(parentPayload.is_test_job !== undefined && { is_test_job: parentPayload.is_test_job }),
                    ...(parentPayload.model_slug !== undefined && { model_slug: parentPayload.model_slug }),
                    ...(parentPayload.context_for_documents !== undefined && { context_for_documents: parentPayload.context_for_documents }),
                };

                if (!isJson(skeletonPayload)) {
                    throw new Error('Skeleton job payload is not a valid JSON object');
                }

                // 109.e: Build required_artifact_identity for storing in results
                const requiredArtifactIdentity: RequiredArtifactIdentity = {
                    projectId: parentPayload.projectId,
                    sessionId: parentPayload.sessionId,
                    stageSlug: stageSlug,
                    iterationNumber: iterationNumber,
                    model_id: parentPayload.model_id,
                    documentKey: missingDocumentKey,
                };

                const resultsWithIdentity: { required_artifact_identity: RequiredArtifactIdentity } = {
                    required_artifact_identity: requiredArtifactIdentity,
                };
                if (!isJson(resultsWithIdentity)) {
                    throw new Error('Skeleton job results is not a valid JSON object');
                }

                const skeletonPlanJob: DialecticJobRow = {
                    id: crypto.randomUUID(),
                    user_id: job.user_id,
                    session_id: job.session_id,
                    stage_slug: job.stage_slug,
                    iteration_number: job.iteration_number,
                    status: 'waiting_for_prerequisite',
                    job_type: 'PLAN',
                    parent_job_id: parentJobId,
                    prerequisite_job_id: prerequisiteJobId,
                    payload: skeletonPayload,
                    attempt_count: 0,
                    max_retries: 3,
                    created_at: new Date().toISOString(),
                    started_at: null,
                    completed_at: null,
                    results: resultsWithIdentity,
                    error_details: null,
                    target_contribution_id: null,
                    is_test_job: job.is_test_job ?? false,
                };

                childJobs.push(skeletonPlanJob);
                ctx.logger.info(`[processComplexJob] Created skeleton PLAN job '${skeletonPlanJob.id}' for step '${step.step_slug}' with prerequisite_job_id '${prerequisiteJobId}' (waiting for '${missingDocumentKey}')`);
            }
        }

        if (!childJobs || childJobs.length === 0) {
            ctx.logger.warn(`[processComplexJob] Planner returned no child jobs for parent ${parentJobId}. Completing parent job.`);
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                results: { status_reason: 'Planner generated no child jobs for the current step.' },
            }).eq('id', parentJobId);
            return;
        }

        ctx.logger.info(`[processComplexJob] Planner created ${childJobs.length} child jobs for parent ${parentJobId}. Enqueuing now.`);
        //console.log('[processComplexJob] Child jobs to be inserted:', JSON.stringify(childJobs, null, 2));

        // 6. Enqueue the child jobs.
        const { error: insertError } = await dbClient.from('dialectic_generation_jobs').insert(childJobs);
        if (insertError) {
            throw new Error(`Failed to insert child jobs: ${insertError.message}`);
        }

        // 7. Update the parent job's status to signal it's waiting for the children.
        const { error: updateError } = await dbClient.from('dialectic_generation_jobs').update({
            status: 'waiting_for_children',
        }).eq('id', parentJobId);

        if (updateError) {
            throw new Error(`Failed to update parent job status: ${updateError.message}`);
        }

        ctx.logger.info(`[processComplexJob] Successfully enqueued child jobs and updated parent job ${parentJobId} to 'waiting_for_children'.`);

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        ctx.logger.error(`[processComplexJob] Error processing complex job ${parentJobId}`, { error });
        
        const failureReason = e instanceof ContextWindowError 
            ? `Context window limit exceeded: ${error.message}`
            : `Failed to plan or enqueue child jobs: ${error.message}`;

        // If planning or enqueuing fails, mark the parent job as failed.
        await dbClient.from('dialectic_generation_jobs').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_details: { message: failureReason }
        }).eq('id', parentJobId);

        // Emit document-centric job_failed notification
        try {
            const documentKey = (firstReady && 'output_type' in firstReady)
                ? String(firstReady.output_type)
                : 'unknown';
            const errCode = e instanceof ContextWindowError ? 'CONTEXT_WINDOW_ERROR' : 'PLANNING_FAILED';
            await ctx.notificationService.sendDocumentCentricNotification({
                type: 'job_failed',
                sessionId: job.session_id,
                stageSlug: stageSlug,
                job_id: parentJobId,
                document_key: documentKey,
                modelId: job.payload.model_id,
                iterationNumber: job.iteration_number,
                error: { code: errCode, message: error.message },
            }, projectOwnerUserId);
        } catch { /* best-effort notification */ }
    }
}



