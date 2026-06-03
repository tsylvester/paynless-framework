import type { SupabaseClient, User } from "npm:@supabase/supabase-js@^2";
import type { Database } from "../types_db.ts";
import type { ComputeTemplateStageCountsFn } from "./computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";
import { computeExpectedCounts } from "./computeExpectedCounts.ts";
import { deriveStepStatuses } from "./deriveStepStatuses.ts";
import { buildDocumentDescriptors } from "./buildDocumentDescriptors.ts";
import { buildJobProgressDtos } from "./buildJobProgressDtos.ts";
import { topologicalSortSteps } from "./topologicalSortSteps.ts";
import type {
	GetAllStageProgressDeps,
	GetAllStageProgressFn,
	GetAllStageProgressParams,
	GetAllStageProgressPayload,
	GetAllStageProgressResponse,
	GetAllStageProgressResult,
	JobProgressDto,
	StageDocumentDescriptorDto,
	StageProgressEntry,
	StepProgressDto,
	UnifiedStageStatus,
	BuildDocumentDescriptorsDeps,
	BuildDocumentDescriptorsParams,
	BuildJobProgressDtosDeps,
	BuildJobProgressDtosParams,
	DeriveStepStatusesDeps,
	DeriveStepStatusesParams,
	DeriveStepStatusesResult,
} from "./dialectic.interface.ts";

export interface MockStageConfig {
	stageSlug: string;
	status: UnifiedStageStatus;
	modelCount: number | null;
	completedSteps: number;
	totalSteps: number;
	failedSteps: number;
	expectedCount: number;
	steps: MockStepConfig[];
	documents: StageDocumentDescriptorDto[];
}

export interface MockStepConfig {
	stepKey: string;
	status: UnifiedStageStatus;
}

export interface MockGetAllStageProgressConfig {
	completedStages: number;
	totalStages: number;
	stages: MockStageConfig[];
}

export type BuildGetAllStageProgressDepsOverrides = {
	computeTemplateStageCounts: ComputeTemplateStageCountsFn;
	deriveStepStatuses?: (
		deps: DeriveStepStatusesDeps,
		params: DeriveStepStatusesParams,
	) => DeriveStepStatusesResult;
	buildDocumentDescriptors?: (
		deps: BuildDocumentDescriptorsDeps,
		params: BuildDocumentDescriptorsParams,
	) => Map<string, StageDocumentDescriptorDto[]>;
	buildJobProgressDtos?: (
		deps: BuildJobProgressDtosDeps,
		params: BuildJobProgressDtosParams,
	) => Map<string, JobProgressDto[]>;
};

function stepFromConfig(c: MockStepConfig): StepProgressDto {
	const step: StepProgressDto = {
		stepKey: c.stepKey,
		status: c.status,
	};
	return step;
}

function stageFromConfig(c: MockStageConfig): StageProgressEntry {
	const steps: StepProgressDto[] = c.steps.map((s: MockStepConfig) =>
		stepFromConfig(s),
	);
	const entry: StageProgressEntry = {
		stageSlug: c.stageSlug,
		status: c.status,
		modelCount: c.modelCount,
		progress: {
			completedSteps: c.completedSteps,
			totalSteps: c.totalSteps,
			failedSteps: c.failedSteps,
		},
		expectedCount: c.expectedCount,
		steps,
		documents: c.documents,
		jobs: [],
		edges: [],
	};
	return entry;
}

export function buildGetAllStageProgressParams(
	payload: GetAllStageProgressPayload,
): GetAllStageProgressParams {
	const params: GetAllStageProgressParams = { payload };
	return params;
}

export function buildGetAllStageProgressDeps(
	dbClient: SupabaseClient<Database>,
	user: User,
	overrides: BuildGetAllStageProgressDepsOverrides,
): GetAllStageProgressDeps {
	const deps: GetAllStageProgressDeps = {
		dbClient,
		user,
		topologicalSortSteps,
		deriveStepStatuses: overrides.deriveStepStatuses !== undefined
			? overrides.deriveStepStatuses
			: deriveStepStatuses,
		computeExpectedCounts,
		buildDocumentDescriptors: overrides.buildDocumentDescriptors !== undefined
			? overrides.buildDocumentDescriptors
			: buildDocumentDescriptors,
		buildJobProgressDtos: overrides.buildJobProgressDtos !== undefined
			? overrides.buildJobProgressDtos
			: buildJobProgressDtos,
		computeTemplateStageCounts: overrides.computeTemplateStageCounts,
	};
	return deps;
}

/**
 * Builds a valid GetAllStageProgressResult with the spec-compliant response shape.
 * Configurable stage count, per-stage completedSteps/totalSteps/failedSteps, per-step status (steps), and document availability (documents) per stage.
 */
export function createMockGetAllStageProgressResult(
	config: MockGetAllStageProgressConfig,
): GetAllStageProgressResult {
	const response: GetAllStageProgressResponse = {
		dagProgress: {
			completedStages: config.completedStages,
			totalStages: config.totalStages,
		},
		stages: config.stages.map((s: MockStageConfig) => stageFromConfig(s)),
	};
	return { status: 200, data: response };
}

/**
 * Returns a GetAllStageProgressFn that ignores deps/params and resolves to the configured mock result.
 */
export function createMockGetAllStageProgressFn(
	config: MockGetAllStageProgressConfig,
): GetAllStageProgressFn {
	const result: GetAllStageProgressResult = createMockGetAllStageProgressResult(config);
	return async (
		_deps: Parameters<GetAllStageProgressFn>[0],
		_params: Parameters<GetAllStageProgressFn>[1],
	): Promise<GetAllStageProgressResult> => result;
}
