import type {
	ProgressRecipeStep,
	ProgressRecipeEdge,
	PriorStageContext,
	DagProgressDto,
	StepProgressDto,
	StageProgressEntry,
	GetAllStageProgressResponse,
} from "../../../dialectic-service/dialectic.interface.ts";
import { JobTypes, GranularityStrategies } from "../../../dialectic-service/dialectic.interface.ts";
import { isRecord } from "./type_guards.common.ts";

const validJobTypes = new Set<string>(JobTypes);
const validGranularityStrategies = new Set<string>(GranularityStrategies);

const validUnifiedStageStatus = new Set<string>([
	"not_started",
	"in_progress",
	"completed",
	"failed",
]);

function isFiniteNonNegativeInteger(n: unknown): n is number {
	return typeof n === "number" && Number.isInteger(n) && Number.isFinite(n) && n >= 0;
}

function isStageProgressShape(value: unknown): value is { completedSteps: number; totalSteps: number; failedSteps: number } {
	if (!isRecord(value)) return false;
	if (!isFiniteNonNegativeInteger(value.completedSteps)) return false;
	if (!isFiniteNonNegativeInteger(value.totalSteps)) return false;
	if (!isFiniteNonNegativeInteger(value.failedSteps)) return false;
	return true;
}

export function isProgressRecipeStep(value: unknown): value is ProgressRecipeStep {
	if (!isRecord(value)) return false;
	if (typeof value.id !== "string" || value.id.length === 0) return false;
	if (typeof value.step_key !== "string" || value.step_key.length === 0) return false;
	if (typeof value.job_type !== "string" || !validJobTypes.has(value.job_type)) return false;
	if (typeof value.granularity_strategy !== "string" || !validGranularityStrategies.has(value.granularity_strategy)) return false;
	return true;
}

export function isProgressRecipeEdge(value: unknown): value is ProgressRecipeEdge {
	if (!isRecord(value)) return false;
	if (typeof value.from_step_id !== "string" || value.from_step_id.length === 0) return false;
	if (typeof value.to_step_id !== "string" || value.to_step_id.length === 0) return false;
	return true;
}

export function isPriorStageContext(value: unknown): value is PriorStageContext {
	if (!isRecord(value)) return false;
	if (typeof value.lineageCount !== "number" || typeof value.reviewerCount !== "number") return false;
	if (!Number.isFinite(value.lineageCount) || value.lineageCount < 0) return false;
	if (!Number.isFinite(value.reviewerCount) || value.reviewerCount < 0) return false;
	return true;
}

export function isDagProgressDto(value: unknown): value is DagProgressDto {
	if (!isRecord(value)) return false;
	if (!isFiniteNonNegativeInteger(value.completedStages)) return false;
	if (!isFiniteNonNegativeInteger(value.totalStages)) return false;
	return true;
}

export function isStepProgressDto(value: unknown): value is StepProgressDto {
	if (!isRecord(value)) return false;
	if (typeof value.stepKey !== "string" || value.stepKey.length === 0) return false;
	if (typeof value.status !== "string" || !validUnifiedStageStatus.has(value.status)) return false;
	if ("progress" in value) return false;
	return true;
}

export function isStageProgressEntry(value: unknown): value is StageProgressEntry {
	if (!isRecord(value)) return false;
	if (typeof value.stageSlug !== "string" || value.stageSlug.length === 0) return false;
	if (typeof value.status !== "string" || !validUnifiedStageStatus.has(value.status)) return false;
	if (value.modelCount !== null && (typeof value.modelCount !== "number" || !Number.isFinite(value.modelCount) || value.modelCount < 0)) return false;
	if (!isStageProgressShape(value.progress)) return false;
	if (!Array.isArray(value.steps) || !value.steps.every((s: unknown) => isStepProgressDto(s))) return false;
	if (!Array.isArray(value.documents)) return false;
	return true;
}

export function isGetAllStageProgressResponse(value: unknown): value is GetAllStageProgressResponse {
	if (!isRecord(value)) return false;
	if (!isDagProgressDto(value.dagProgress)) return false;
	if (!Array.isArray(value.stages) || !value.stages.every((s: unknown) => isStageProgressEntry(s))) return false;
	return true;
}
