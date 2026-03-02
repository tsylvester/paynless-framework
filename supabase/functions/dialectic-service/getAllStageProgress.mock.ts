import type {
  GetAllStageProgressResult,
  GetAllStageProgressResponse,
  GetAllStageProgressFn,
  StageProgressEntry,
  StageDocumentDescriptorDto,
  StepProgressDto,
  UnifiedStageStatus,
} from "./dialectic.interface.ts";

export interface MockStageConfig {
  stageSlug: string;
  status: UnifiedStageStatus;
  modelCount: number | null;
  completedSteps: number;
  totalSteps: number;
  failedSteps: number;
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

function stepFromConfig(c: MockStepConfig): StepProgressDto {
  return {
    stepKey: c.stepKey,
    status: c.status,
  };
}

function stageFromConfig(c: MockStageConfig): StageProgressEntry {
  const steps: StepProgressDto[] = c.steps.map((s: MockStepConfig) =>
    stepFromConfig(s),
  );
  return {
    stageSlug: c.stageSlug,
    status: c.status,
    modelCount: c.modelCount,
    progress: {
      completedSteps: c.completedSteps,
      totalSteps: c.totalSteps,
      failedSteps: c.failedSteps,
    },
    steps,
    documents: c.documents,
  };
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
