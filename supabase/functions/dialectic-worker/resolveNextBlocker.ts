import type {
    DialecticJobRow,
    DialecticRecipeStep,
    ResolveNextBlockerDeps,
    ResolveNextBlockerParams,
    ResolveNextBlockerResult,
    JobType,
} from '../dialectic-service/dialectic.interface.ts';
import {
    isDialecticRenderJobPayload,
    isDialecticExecuteJobPayload,
    isDialecticSkeletonJobPayload,
} from '../_shared/utils/type-guards/type_guards.dialectic.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';

/**
 * Helper function to check if a job produces the specified documentKey.
 * Job-type-specific matching logic:
 * - RENDER: match payload.documentKey
 * - EXECUTE: match payload.output_type (preferred), fallback to payload.canonicalPathParams?.contributionType
 * - PLAN: match payload.planner_metadata.recipe_step_id → recipe step output_type
 */
async function jobProducesDocumentKey(
    job: DialecticJobRow,
    documentKey: string,
    getRecipeStep?: (stepId: string) => Promise<DialecticRecipeStep | null>,
): Promise<boolean> {
    if (!job.job_type) {
        return false;
    }

    if (!isRecord(job.payload)) {
        return false;
    }

    if (job.job_type === 'RENDER') {
        if (!isDialecticRenderJobPayload(job.payload)) {
            return false;
        }
        return job.payload.documentKey === documentKey;
    }

    if (job.job_type === 'EXECUTE') {
        if (!isDialecticExecuteJobPayload(job.payload)) {
            return false;
        }
        if (job.payload.output_type === documentKey) {
            return true;
        }
        if (isRecord(job.payload.canonicalPathParams)) {
            const contributionType = job.payload.canonicalPathParams.contributionType;
            if (typeof contributionType === 'string' && contributionType === documentKey) {
                return true;
            }
        }
        return false;
    }

    if (job.job_type === 'PLAN') {
        if (!isDialecticSkeletonJobPayload(job.payload)) {
            return false;
        }
        if (!getRecipeStep) {
            return false;
        }
        const recipeStepId = job.payload.planner_metadata.recipe_step_id;
        if (typeof recipeStepId !== 'string' || recipeStepId.length === 0) {
            return false;
        }
        const recipeStep = await getRecipeStep(recipeStepId);
        if (!recipeStep) {
            return false;
        }
        return recipeStep.output_type === documentKey;
    }

    return false;
}

/**
 * Extracts modelId from job payload if available.
 * Checks payload.model_id field (optional) and canonicalPathParams.sourceAnchorModel for EXECUTE jobs.
 * Returns null if not available (cannot filter by model in that case).
 */
function extractModelIdFromPayload(payload: unknown): string | null {
    if (!isRecord(payload)) {
        return null;
    }
    // Check payload.model_slug first (available on all job types)
    if ('model_id' in payload && typeof payload.model_id === 'string' && payload.model_id.length > 0) {
        return payload.model_id;
    }
    // For EXECUTE jobs, check canonicalPathParams.sourceAnchorModelSlug
    // Check for canonicalPathParams without using strict type guard (to avoid errors on non-EXECUTE payloads)
    if ('canonicalPathParams' in payload && isRecord(payload.canonicalPathParams)) {
        const sourceAnchorModel = payload.canonicalPathParams.sourceAnchorModel;
        if (typeof sourceAnchorModel === 'string' && sourceAnchorModel.length > 0) {
            return sourceAnchorModel;
        }
    }
    return null;
}

/**
 * Resolves the next job that will produce a required artifact.
 * Returns the job closest to producing the artifact (RENDER > EXECUTE > PLAN priority).
 * Only returns jobs that are in-progress (not completed or failed).
 */
export async function resolveNextBlocker(
    deps: ResolveNextBlockerDeps,
    params: ResolveNextBlockerParams,
): Promise<ResolveNextBlockerResult | null> {
    const { dbClient, logger, getRecipeStep } = deps;
    const { projectId, sessionId, stageSlug, iterationNumber, model_id, requiredArtifactIdentity } = params;

    // 108.d.i: Accept typed requiredArtifactIdentity object (no string parsing)
    // 108.d.ii: Return null early if identity is missing required fields
    if (!requiredArtifactIdentity.documentKey || requiredArtifactIdentity.documentKey.trim().length === 0) {
        logger.debug('[resolveNextBlocker] Returning null: documentKey is empty');
        return null;
    }

    if (!requiredArtifactIdentity.projectId || !requiredArtifactIdentity.sessionId || 
        !requiredArtifactIdentity.stageSlug || typeof requiredArtifactIdentity.iterationNumber !== 'number' ||
        !requiredArtifactIdentity.model_id) {
        logger.debug('[resolveNextBlocker] Returning null: missing required fields in requiredArtifactIdentity');
        return null;
    }

    // 108.d.iii: Define inProgressStatuses array
    const inProgressStatuses: DialecticJobRow['status'][] = [
        'pending',
        'processing',
        'retrying',
        'waiting_for_children',
        'waiting_for_prerequisite',
    ];

    // 108.d.iv: Query RENDER jobs first (highest priority)
    const renderQuery = dbClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .eq('stage_slug', stageSlug)
        .eq('iteration_number', iterationNumber)
        .eq('job_type', 'RENDER')
        .in('status', inProgressStatuses);

    // Also scope to project_id if available (check if column exists by trying to filter)
    // Note: We'll filter by projectId in post-query filtering since we can't reliably check column existence
    const { data: renderJobs, error: renderError } = await renderQuery;

    if (renderError) {
        logger.error(`[resolveNextBlocker] Error querying RENDER jobs: ${renderError.message}`);
        throw new Error(`Failed to query RENDER jobs: ${renderError.message}`);
    }

    if (renderJobs && renderJobs.length > 0) {
        for (const job of renderJobs) {
            // Safety check: filter out completed/failed jobs (query should already filter, but be defensive)
            if (job.status === 'completed' || job.status === 'failed') {
                continue;
            }

            // Filter by projectId from payload
            if (isRecord(job.payload)) {
                const jobProjectId = job.payload.projectId;
                if (typeof jobProjectId !== 'string' || jobProjectId !== projectId) {
                    continue;
                }
            }

            // Filter by modelSlug from payload (model-safe scoping requirement)
            // If modelSlug is not available in payload, skip this job to ensure model-safe filtering
            const payloadModelId = extractModelIdFromPayload(job.payload);
            if (payloadModelId === null) {
                // Cannot verify model match - skip to ensure model-safe scoping
                continue;
            }
            if (payloadModelId !== model_id) {
                continue;
            }

            // 108.d.v: Filter RENDER results by payloadProducesDocumentKey
            if (await jobProducesDocumentKey(job, requiredArtifactIdentity.documentKey, getRecipeStep)) {
                const jobType: JobType | null = job.job_type;
                if (!jobType) {
                    continue;
                }
                logger.info(`[resolveNextBlocker] Found RENDER job ${job.id} producing ${requiredArtifactIdentity.documentKey}`);
                return {
                    id: job.id,
                    job_type: jobType,
                    status: job.status,
                };
            }
        }
    }

    // 108.d.vi: Query EXECUTE jobs (second priority)
    const executeQuery = dbClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .eq('stage_slug', stageSlug)
        .eq('iteration_number', iterationNumber)
        .eq('job_type', 'EXECUTE')
        .in('status', inProgressStatuses);

    const { data: executeJobs, error: executeError } = await executeQuery;

    if (executeError) {
        logger.error(`[resolveNextBlocker] Error querying EXECUTE jobs: ${executeError.message}`);
        throw new Error(`Failed to query EXECUTE jobs: ${executeError.message}`);
    }

    if (executeJobs && executeJobs.length > 0) {
        for (const job of executeJobs) {
            // Safety check: filter out completed/failed jobs (query should already filter, but be defensive)
            if (job.status === 'completed' || job.status === 'failed') {
                continue;
            }

            // Filter by projectId from payload
            if (isRecord(job.payload)) {
                const jobProjectId = job.payload.projectId;
                if (typeof jobProjectId !== 'string' || jobProjectId !== projectId) {
                    continue;
                }
            }

            // Filter by modelSlug from payload (model-safe scoping requirement)
            // If modelSlug is not available in payload, skip this job to ensure model-safe filtering
            const payloadModelId = extractModelIdFromPayload(job.payload);
            if (payloadModelId === null) {
                // Cannot verify model match - skip to ensure model-safe scoping
                continue;
            }
            if (payloadModelId !== model_id) {
                continue;
            }

            // 108.d.vii: Filter EXECUTE results by payloadProducesDocumentKey
            if (await jobProducesDocumentKey(job, requiredArtifactIdentity.documentKey, getRecipeStep)) {
                const jobType: JobType | null = job.job_type;
                if (!jobType) {
                    continue;
                }
                logger.info(`[resolveNextBlocker] Found EXECUTE job ${job.id} producing ${requiredArtifactIdentity.documentKey}`);
                return {
                    id: job.id,
                    job_type: jobType,
                    status: job.status,
                };
            }
        }
    }

    // 108.d.viii: Query PLAN jobs (lowest priority)
    const planQuery = dbClient
        .from('dialectic_generation_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .eq('stage_slug', stageSlug)
        .eq('iteration_number', iterationNumber)
        .eq('job_type', 'PLAN')
        .in('status', inProgressStatuses);

    const { data: planJobs, error: planError } = await planQuery;

    if (planError) {
        logger.error(`[resolveNextBlocker] Error querying PLAN jobs: ${planError.message}`);
        throw new Error(`Failed to query PLAN jobs: ${planError.message}`);
    }

    if (planJobs && planJobs.length > 0) {
        for (const job of planJobs) {
            // Safety check: filter out completed/failed jobs (query should already filter, but be defensive)
            if (job.status === 'completed' || job.status === 'failed') {
                continue;
            }

            // Only match skeleton PLAN jobs (they have planner_metadata.recipe_step_id)
            if (!isDialecticSkeletonJobPayload(job.payload)) {
                continue;
            }

            // Filter by projectId from payload
            if (isRecord(job.payload)) {
                const jobProjectId = job.payload.projectId;
                if (typeof jobProjectId !== 'string' || jobProjectId !== projectId) {
                    continue;
                }
            }

            // Filter by modelSlug from payload (model-safe scoping requirement)
            // If modelSlug is not available in payload, skip this job to ensure model-safe filtering
            const payloadModelId = extractModelIdFromPayload(job.payload);
            if (payloadModelId === null) {
                // Cannot verify model match - skip to ensure model-safe scoping
                continue;
            }
            if (payloadModelId !== model_id) {
                continue;
            }

            // 108.d.ix: Filter PLAN results by payloadProducesDocumentKey (check recipe step output_type)
            if (await jobProducesDocumentKey(job, requiredArtifactIdentity.documentKey, getRecipeStep)) {
                const jobType: JobType | null = job.job_type;
                if (!jobType) {
                    continue;
                }
                logger.info(`[resolveNextBlocker] Found PLAN job ${job.id} producing ${requiredArtifactIdentity.documentKey}`);
                return {
                    id: job.id,
                    job_type: jobType,
                    status: job.status,
                };
            }
        }
    }

    // 108.d.x: If no matches at any level, return null
    logger.debug(`[resolveNextBlocker] No jobs found producing ${requiredArtifactIdentity.documentKey} for model ${model_id}`);
    return null;
}
