import type {
	BuildDocumentDescriptorsDeps,
	BuildDocumentDescriptorsParams,
	DialecticJobRow,
	StageDocumentDescriptorDto,
} from "./dialectic.interface.ts";
import { isPlannerMetadata } from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";

function resolveStepKeyForRenderJob(
	job: DialecticJobRow,
	stepIdToStepKey: Map<string, string>,
	jobIdToJob: Map<string, DialecticJobRow>,
): string | undefined {
	const parentJobId: string | null = job.parent_job_id;
	if (typeof parentJobId !== "string" || parentJobId.length === 0) {
		return undefined;
	}
	const parent: DialecticJobRow | undefined = jobIdToJob.get(parentJobId);
	if (!parent) {
		return undefined;
	}
	const parentPayloadUnknown: unknown = parent.payload;
	if (!isRecord(parentPayloadUnknown)) {
		return undefined;
	}
	const pp: Record<PropertyKey, unknown> = parentPayloadUnknown;
	const parentPlannerMetadataUnknown: unknown = pp["planner_metadata"];
	if (!isPlannerMetadata(parentPlannerMetadataUnknown)) {
		return undefined;
	}
	const recipeStepId: string | undefined =
		typeof parentPlannerMetadataUnknown.recipe_step_id === "string" && parentPlannerMetadataUnknown.recipe_step_id.length > 0
			? parentPlannerMetadataUnknown.recipe_step_id
			: undefined;
	if (recipeStepId === undefined) {
		return undefined;
	}
	return stepIdToStepKey.get(recipeStepId);
}

export function buildDocumentDescriptors(
	deps: BuildDocumentDescriptorsDeps,
	params: BuildDocumentDescriptorsParams,
): Map<string, StageDocumentDescriptorDto[]> {
	const resultByStageSlug: Map<string, StageDocumentDescriptorDto[]> = new Map<string, StageDocumentDescriptorDto[]>();

	for (const job of params.jobs) {
		const jobType: string | null = job.job_type;
		if (jobType !== "RENDER") {
			continue;
		}
		const statusUnknown: unknown = job.status;
		if (typeof statusUnknown !== "string" || statusUnknown !== "completed") {
			continue;
		}

		const payloadUnknown: unknown = job.payload;
		if (!isRecord(payloadUnknown)) {
			throw new Error(`RENDER job payload is null or invalid for job: ${job.id}`);
		}
		const p: Record<PropertyKey, unknown> = payloadUnknown;

		const documentKeyUnknown: unknown = p["documentKey"];
		if (typeof documentKeyUnknown !== "string" || documentKeyUnknown.length === 0) {
			throw new Error(`RENDER job payload documentKey is null or invalid for job: ${job.id}`);
		}
		const documentKey: string = documentKeyUnknown;

		const modelIdUnknown: unknown = p["model_id"];
		if (typeof modelIdUnknown !== "string" || modelIdUnknown.length === 0) {
			throw new Error(`RENDER job payload model_id is null or invalid for job: ${job.id}`);
		}
		const modelId: string = modelIdUnknown;

		const sourceContributionIdUnknown: unknown = p["sourceContributionId"];
		if (typeof sourceContributionIdUnknown !== "string" || sourceContributionIdUnknown.length === 0) {
			throw new Error(`RENDER job payload sourceContributionId is null or invalid for job: ${job.id}`);
		}
		const sourceContributionId: string = sourceContributionIdUnknown;

		const latestRenderedResourceId: string | undefined = params.resourceIdBySourceContributionId.get(sourceContributionId);
		if (!latestRenderedResourceId) {
			throw new Error(`Rendered resource not found for RENDER job sourceContributionId: ${sourceContributionId}`);
		}

		const stepKey: string | undefined = resolveStepKeyForRenderJob(job, params.stepIdToStepKey, params.jobIdToJob);
		if (typeof job.parent_job_id === "string" && job.parent_job_id.length > 0 && !stepKey) {
			throw new Error(`RENDER job parent association could not be derived for job: ${job.id}`);
		}

		const stageSlugUnknown: unknown = job.stage_slug;
		if (typeof stageSlugUnknown !== "string" || stageSlugUnknown.length === 0) {
			throw new Error(`RENDER job stage_slug is null or invalid for job: ${job.id}`);
		}
		const stageSlug: string = stageSlugUnknown;

		const descriptor: StageDocumentDescriptorDto = {
			documentKey,
			modelId,
			jobId: job.id,
			status: "completed",
			latestRenderedResourceId,
			stepKey,
		};

		const existing: StageDocumentDescriptorDto[] | undefined = resultByStageSlug.get(stageSlug);
		if (existing) {
			existing.push(descriptor);
		} else {
			resultByStageSlug.set(stageSlug, [descriptor]);
		}
	}

	return resultByStageSlug;
}
