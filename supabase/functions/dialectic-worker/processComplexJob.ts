// supabase/functions/dialectic-worker/processComplexJob.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type {
    DialecticJobRow,
    DialecticPlanJobPayload,
    IDialecticJobDeps,
} from '../dialectic-service/dialectic.interface.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import {
    isDialecticPlanJobPayload,
    isRecord,
} from '../_shared/utils/type_guards.ts';
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
    job: DialecticJobRow & { payload: DialecticPlanJobPayload },
    projectOwnerUserId: string,
    deps: IDialecticJobDeps,
    authToken: string,
): Promise<void> {
    const { id: parentJobId } = job;
    
    if (!isDialecticPlanJobPayload(job.payload)) {
        throw new Error(`[processComplexJob] Job ${parentJobId} has an invalid payload for complex processing.`);
    }

    // 1. Fetch the stage data to find the active recipe instance
    const stageSlug = job.stage_slug ?? job.payload.stageSlug!;
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

    // 3. Determine readiness by looking at completed child jobs and the DAG
    const { data: completedChildren, error: childrenError } = await dbClient
        .from('dialectic_generation_jobs')
        .select('payload')
        .eq('parent_job_id', parentJobId)
        .eq('status', 'completed');

    if (childrenError) {
        throw new Error(`Failed to fetch completed child jobs for parent ${parentJobId}: ${childrenError.message}`);
    }

    const completedStepSlugs = new Set<string>();
    for (const child of completedChildren) {
        if (isRecord(child.payload) && typeof child.payload.step_slug === 'string') {
            completedStepSlugs.add(child.payload.step_slug);
        }
    }
    // Build predecessor map from edges
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
    const predecessors = new Map<string, Set<string>>();
    for (const e of edges) {
        const set = predecessors.get(e.to_step_id) ?? new Set<string>();
        set.add(e.from_step_id);
        predecessors.set(e.to_step_id, set);
    }

    const isSkipped = (s: DialecticRecipeTemplateStep | DialecticStageRecipeStep): boolean => {
        // Template steps never have is_skipped; instance steps may
        return ('is_skipped' in s) && s.is_skipped === true;
    };

    // Determine which steps are ready: all predecessors completed (or skipped) and not already completed
    const readySteps: (DialecticRecipeTemplateStep | DialecticStageRecipeStep)[] = [];
    for (const [id, s] of stepIdToStep.entries()) {
        const slug = stepSlugById.get(id)!;
        if (completedStepSlugs.has(slug)) continue;
        if (isSkipped(s)) continue;
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
                // A predecessor is satisfied if it was completed OR explicitly marked as skipped
                if (!predWasSkipped && (!predSlug || !completedStepSlugs.has(predSlug))) {
                    allPredsDone = false;
                    break;
                }
            }
            if (allPredsDone) {
                readySteps.push(s);
            }
        }
    }

    // If no ready steps remain, either we're waiting on siblings or all steps are complete
    if (readySteps.length === 0) {
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
    readySteps.sort((a, b) => {
        const ao = ('execution_order' in a && typeof a.execution_order === 'number')
            ? a.execution_order
            : ('step_number' in a && typeof a.step_number === 'number') ? a.step_number : 0;
        const bo = ('execution_order' in b && typeof b.execution_order === 'number')
            ? b.execution_order
            : ('step_number' in b && typeof b.step_number === 'number') ? b.step_number : 0;
        return ao - bo;
    });

    // Log the first step for continuity with prior messages
    const firstReady = readySteps[0];
    deps.logger.info(`[processComplexJob] Processing step '${firstReady.step_slug}' for job ${parentJobId}`);

	// Emit planner_started notification with required context
	await deps.notificationService.sendDocumentCentricNotification({
		type: 'planner_started',
		sessionId: job.session_id,
		stageSlug: stageSlug,
		job_id: job.id,
		document_key: String(firstReady.output_type),
		modelId: job.payload.model_id,
		iterationNumber: job.iteration_number,
	}, projectOwnerUserId);

    try {
        if (!deps.planComplexStage) {
            throw new Error("planComplexStage dependency is missing.");
        }
        // 5. Delegate to the planner for each ready step and aggregate child jobs.
        const plannedChildrenArrays = await Promise.all(
            readySteps.map((recipeStep) => deps.planComplexStage!(
                dbClient,
                job,
                deps,
                recipeStep,
                authToken,
            ))
        );
        const childJobs = plannedChildrenArrays.flat();

        if (!childJobs || childJobs.length === 0) {
            deps.logger.warn(`[processComplexJob] Planner returned no child jobs for parent ${parentJobId}. Completing parent job.`);
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                results: { status_reason: 'Planner generated no child jobs for the current step.' },
            }).eq('id', parentJobId);
            return;
        }

        deps.logger.info(`[processComplexJob] Planner created ${childJobs.length} child jobs for parent ${parentJobId}. Enqueuing now.`);
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

        deps.logger.info(`[processComplexJob] Successfully enqueued child jobs and updated parent job ${parentJobId} to 'waiting_for_children'.`);

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        deps.logger.error(`[processComplexJob] Error processing complex job ${parentJobId}`, { error });
        
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
            await deps.notificationService.sendDocumentCentricNotification({
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


