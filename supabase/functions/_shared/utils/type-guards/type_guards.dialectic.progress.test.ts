import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import type {
	ProgressRecipeStep,
	ProgressRecipeEdge,
	PriorStageContext,
	DagProgressDto,
	StepProgressDto,
	StageProgressEntry,
	GetAllStageProgressResponse,
} from "../../../dialectic-service/dialectic.interface.ts";
import {
	isProgressRecipeStep,
	isProgressRecipeEdge,
	isPriorStageContext,
	isDagProgressDto,
	isStepProgressDto,
	isStageProgressEntry,
	isGetAllStageProgressResponse,
} from "./type_guards.dialectic.progress.ts";

Deno.test("Type Guard: isProgressRecipeStep", async (t) => {
	const validStep: ProgressRecipeStep = {
		id: "step-uuid-1",
		step_key: "plan_header",
		job_type: "PLAN",
		granularity_strategy: "all_to_one",
	};

	await t.step("returns true for valid ProgressRecipeStep with all four fields and correct types", () => {
		assertEquals(isProgressRecipeStep(validStep), true);
	});

	await t.step("returns false when id is missing", () => {
		const invalid: Record<string, unknown> = { ...validStep };
		delete invalid.id;
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when step_key is missing", () => {
		const invalid: Record<string, unknown> = { ...validStep };
		delete invalid.step_key;
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when job_type is missing", () => {
		const invalid: Record<string, unknown> = { ...validStep };
		delete invalid.job_type;
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when granularity_strategy is missing", () => {
		const invalid: Record<string, unknown> = { ...validStep };
		delete invalid.granularity_strategy;
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when id is empty string", () => {
		const invalid: ProgressRecipeStep = { ...validStep, id: "" };
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when step_key is empty string", () => {
		const invalid: ProgressRecipeStep = { ...validStep, step_key: "" };
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when job_type is wrong type", () => {
		const invalid = { ...validStep, job_type: 1 };
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when job_type is invalid literal", () => {
		const invalid = { ...validStep, job_type: "INVALID" };
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when granularity_strategy is wrong type", () => {
		const invalid = { ...validStep, granularity_strategy: 1 };
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false when granularity_strategy is invalid literal", () => {
		const invalid = { ...validStep, granularity_strategy: "invalid_strategy" };
		assertEquals(isProgressRecipeStep(invalid), false);
	});

	await t.step("returns false for null", () => {
		assertEquals(isProgressRecipeStep(null), false);
	});

	await t.step("returns false for undefined", () => {
		assertEquals(isProgressRecipeStep(undefined), false);
	});

	await t.step("returns false for plain empty object", () => {
		assertEquals(isProgressRecipeStep({}), false);
	});
});

Deno.test("Type Guard: isProgressRecipeEdge", async (t) => {
	const validEdge: ProgressRecipeEdge = {
		from_step_id: "step-a",
		to_step_id: "step-b",
	};

	await t.step("returns true for valid ProgressRecipeEdge with from_step_id and to_step_id as non-empty strings", () => {
		assertEquals(isProgressRecipeEdge(validEdge), true);
	});

	await t.step("returns false when from_step_id is missing", () => {
		const invalid: Record<string, unknown> = { ...validEdge };
		delete invalid.from_step_id;
		assertEquals(isProgressRecipeEdge(invalid), false);
	});

	await t.step("returns false when to_step_id is missing", () => {
		const invalid: Record<string, unknown> = { ...validEdge };
		delete invalid.to_step_id;
		assertEquals(isProgressRecipeEdge(invalid), false);
	});

	await t.step("returns false when from_step_id is empty string", () => {
		const invalid: ProgressRecipeEdge = { ...validEdge, from_step_id: "" };
		assertEquals(isProgressRecipeEdge(invalid), false);
	});

	await t.step("returns false when to_step_id is empty string", () => {
		const invalid: ProgressRecipeEdge = { ...validEdge, to_step_id: "" };
		assertEquals(isProgressRecipeEdge(invalid), false);
	});

	await t.step("returns false when from_step_id is wrong type", () => {
		const invalid = { ...validEdge, from_step_id: 1 };
		assertEquals(isProgressRecipeEdge(invalid), false);
	});

	await t.step("returns false when to_step_id is wrong type", () => {
		const invalid = { ...validEdge, to_step_id: 1 };
		assertEquals(isProgressRecipeEdge(invalid), false);
	});

	await t.step("returns false for null", () => {
		assertEquals(isProgressRecipeEdge(null), false);
	});

	await t.step("returns false for undefined", () => {
		assertEquals(isProgressRecipeEdge(undefined), false);
	});

	await t.step("returns false for plain empty object", () => {
		assertEquals(isProgressRecipeEdge({}), false);
	});
});

Deno.test("Type Guard: isPriorStageContext", async (t) => {
	const validContext: PriorStageContext = {
		lineageCount: 2,
		reviewerCount: 3,
	};

	await t.step("returns true for valid PriorStageContext with lineageCount and reviewerCount as finite non-negative numbers", () => {
		assertEquals(isPriorStageContext(validContext), true);
	});

	await t.step("returns true when both counts are zero", () => {
		const zero: PriorStageContext = { lineageCount: 0, reviewerCount: 0 };
		assertEquals(isPriorStageContext(zero), true);
	});

	await t.step("returns false when lineageCount is missing", () => {
		const invalid: Record<string, unknown> = { ...validContext };
		delete invalid.lineageCount;
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when reviewerCount is missing", () => {
		const invalid: Record<string, unknown> = { ...validContext };
		delete invalid.reviewerCount;
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when lineageCount is negative", () => {
		const invalid: PriorStageContext = { ...validContext, lineageCount: -1 };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when reviewerCount is negative", () => {
		const invalid: PriorStageContext = { ...validContext, reviewerCount: -1 };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when lineageCount is not a number", () => {
		const invalid = { ...validContext, lineageCount: "2" };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when reviewerCount is not a number", () => {
		const invalid = { ...validContext, reviewerCount: "3" };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when lineageCount is NaN", () => {
		const invalid = { ...validContext, lineageCount: Number.NaN };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when reviewerCount is NaN", () => {
		const invalid = { ...validContext, reviewerCount: Number.NaN };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when lineageCount is Infinity", () => {
		const invalid = { ...validContext, lineageCount: Number.POSITIVE_INFINITY };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false when reviewerCount is Infinity", () => {
		const invalid = { ...validContext, reviewerCount: Number.POSITIVE_INFINITY };
		assertEquals(isPriorStageContext(invalid), false);
	});

	await t.step("returns false for null", () => {
		assertEquals(isPriorStageContext(null), false);
	});

	await t.step("returns false for undefined", () => {
		assertEquals(isPriorStageContext(undefined), false);
	});

	await t.step("returns false for plain empty object", () => {
		assertEquals(isPriorStageContext({}), false);
	});
});

Deno.test("Type Guard: isDagProgressDto", async (t) => {
	const validDag: DagProgressDto = { completedStages: 2, totalStages: 5 };

	await t.step("returns true for valid DagProgressDto with completedStages and totalStages as finite non-negative integers", () => {
		assertEquals(isDagProgressDto(validDag), true);
	});

	await t.step("returns true when both are zero", () => {
		const zero: DagProgressDto = { completedStages: 0, totalStages: 0 };
		assertEquals(isDagProgressDto(zero), true);
	});

	await t.step("returns false when completedStages is missing", () => {
		const invalid: Record<string, unknown> = { totalStages: 5 };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when totalStages is missing", () => {
		const invalid: Record<string, unknown> = { completedStages: 2 };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when completedStages is negative", () => {
		const invalid: DagProgressDto = { ...validDag, completedStages: -1 };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when totalStages is negative", () => {
		const invalid: DagProgressDto = { ...validDag, totalStages: -1 };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when completedStages is not a number", () => {
		const invalid = { ...validDag, completedStages: "2" };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when totalStages is not a number", () => {
		const invalid = { ...validDag, totalStages: "5" };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when completedStages is not an integer", () => {
		const invalid = { ...validDag, completedStages: 2.5 };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when completedStages is NaN", () => {
		const invalid = { ...validDag, completedStages: Number.NaN };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false when completedStages is Infinity", () => {
		const invalid = { ...validDag, completedStages: Number.POSITIVE_INFINITY };
		assertEquals(isDagProgressDto(invalid), false);
	});

	await t.step("returns false for null", () => {
		assertEquals(isDagProgressDto(null), false);
	});

	await t.step("returns false for undefined", () => {
		assertEquals(isDagProgressDto(undefined), false);
	});

	await t.step("returns false for plain empty object", () => {
		assertEquals(isDagProgressDto({}), false);
	});
});

Deno.test("Type Guard: isStepProgressDto", async (t) => {
	const validStep: StepProgressDto = {
		stepKey: "plan_header",
		status: "completed",
	};

	await t.step("returns true for valid StepProgressDto with stepKey and status only", () => {
		assertEquals(isStepProgressDto(validStep), true);
	});

	await t.step("returns true for each valid UnifiedStageStatus", () => {
		const statuses: StepProgressDto["status"][] = ["not_started", "in_progress", "completed", "failed"];
		for (const status of statuses) {
			const s: StepProgressDto = { stepKey: validStep.stepKey, status };
			assertEquals(isStepProgressDto(s), true);
		}
	});

	await t.step("returns false when stepKey is missing", () => {
		const invalid: Record<string, unknown> = { ...validStep };
		delete invalid.stepKey;
		assertEquals(isStepProgressDto(invalid), false);
	});

	await t.step("returns false when stepKey is empty string", () => {
		const invalid: StepProgressDto = { ...validStep, stepKey: "" };
		assertEquals(isStepProgressDto(invalid), false);
	});

	await t.step("returns false when status is missing", () => {
		const invalid: Record<string, unknown> = { ...validStep };
		delete invalid.status;
		assertEquals(isStepProgressDto(invalid), false);
	});

	await t.step("returns false when status is invalid literal", () => {
		const invalid = { ...validStep, status: "invalid" };
		assertEquals(isStepProgressDto(invalid), false);
	});

	await t.step("returns false for object with progress (old job-count shape)", () => {
		const invalid: Record<string, unknown> = { stepKey: "plan_header", status: "completed", progress: { completed: 1, total: 1, failed: 0 } };
		assertEquals(isStepProgressDto(invalid), false);
	});

	await t.step("returns false for null", () => {
		assertEquals(isStepProgressDto(null), false);
	});

	await t.step("returns false for undefined", () => {
		assertEquals(isStepProgressDto(undefined), false);
	});

	await t.step("returns false for plain empty object", () => {
		assertEquals(isStepProgressDto({}), false);
	});
});

Deno.test("Type Guard: isStageProgressEntry", async (t) => {
	const validStep: StepProgressDto = {
		stepKey: "plan_header",
		status: "completed",
	};
	const validEntry: StageProgressEntry = {
		stageSlug: "thesis",
		status: "in_progress",
		modelCount: 3,
		progress: { completedSteps: 5, totalSteps: 13, failedSteps: 0 },
		steps: [validStep],
		documents: [],
	};

	await t.step("returns true for valid StageProgressEntry with stageSlug, status, modelCount, progress (completedSteps, totalSteps, failedSteps), steps, documents", () => {
		assertEquals(isStageProgressEntry(validEntry), true);
	});

	await t.step("returns true when modelCount is null", () => {
		const withNull: StageProgressEntry = { ...validEntry, modelCount: null };
		assertEquals(isStageProgressEntry(withNull), true);
	});

	await t.step("returns false when stageSlug is missing", () => {
		const invalid: Record<string, unknown> = { ...validEntry };
		delete invalid.stageSlug;
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when stageSlug is empty string", () => {
		const invalid: StageProgressEntry = { ...validEntry, stageSlug: "" };
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when status is missing", () => {
		const invalid: Record<string, unknown> = { ...validEntry };
		delete invalid.status;
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when status is invalid literal", () => {
		const invalid = { ...validEntry, status: "invalid" };
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when modelCount is negative", () => {
		const invalid: StageProgressEntry = { ...validEntry, modelCount: -1 };
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when progress is missing", () => {
		const invalid: Record<string, unknown> = { ...validEntry };
		delete invalid.progress;
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when steps is not an array", () => {
		const invalid = { ...validEntry, steps: {} };
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when steps contains invalid element", () => {
		const invalid = { ...validEntry, steps: [{ stepKey: "", status: "completed" }] };
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when documents is missing", () => {
		const invalid: Record<string, unknown> = { ...validEntry };
		delete invalid.documents;
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false when documents is not an array", () => {
		const invalid = { ...validEntry, documents: {} };
		assertEquals(isStageProgressEntry(invalid), false);
	});

	await t.step("returns false for null", () => {
		assertEquals(isStageProgressEntry(null), false);
	});

	await t.step("returns false for undefined", () => {
		assertEquals(isStageProgressEntry(undefined), false);
	});

	await t.step("returns false for plain empty object", () => {
		assertEquals(isStageProgressEntry({}), false);
	});
});

Deno.test("Type Guard: isGetAllStageProgressResponse", async (t) => {
	const validDag: DagProgressDto = { completedStages: 1, totalStages: 5 };
	const validStage: StageProgressEntry = {
		stageSlug: "thesis",
		status: "completed",
		modelCount: 3,
		progress: { completedSteps: 13, totalSteps: 13, failedSteps: 0 },
		steps: [],
		documents: [],
	};
	const validResponse: GetAllStageProgressResponse = {
		dagProgress: validDag,
		stages: [validStage],
	};

	await t.step("returns true for valid GetAllStageProgressResponse with dagProgress and stages array", () => {
		assertEquals(isGetAllStageProgressResponse(validResponse), true);
	});

	await t.step("returns true for empty stages array", () => {
		const empty: GetAllStageProgressResponse = { dagProgress: validDag, stages: [] };
		assertEquals(isGetAllStageProgressResponse(empty), true);
	});

	await t.step("returns false when dagProgress is missing", () => {
		const invalid: Record<string, unknown> = { stages: [] };
		assertEquals(isGetAllStageProgressResponse(invalid), false);
	});

	await t.step("returns false when dagProgress is invalid", () => {
		const invalid = { dagProgress: { completedStages: -1, totalStages: 5 }, stages: [] };
		assertEquals(isGetAllStageProgressResponse(invalid), false);
	});

	await t.step("returns false when stages is missing", () => {
		const invalid: Record<string, unknown> = { dagProgress: validDag };
		delete invalid.stages;
		assertEquals(isGetAllStageProgressResponse(invalid), false);
	});

	await t.step("returns false when stages is not an array", () => {
		const invalid = { dagProgress: validDag, stages: {} };
		assertEquals(isGetAllStageProgressResponse(invalid), false);
	});

	await t.step("returns false when stages contains invalid element", () => {
		const invalid = { dagProgress: validDag, stages: [{ stageSlug: "" }] };
		assertEquals(isGetAllStageProgressResponse(invalid), false);
	});

	await t.step("returns false for null", () => {
		assertEquals(isGetAllStageProgressResponse(null), false);
	});

	await t.step("returns false for undefined", () => {
		assertEquals(isGetAllStageProgressResponse(undefined), false);
	});

	await t.step("returns false for plain empty object", () => {
		assertEquals(isGetAllStageProgressResponse({}), false);
	});

	await t.step("returns false for old response shape (plain array without dagProgress)", () => {
		const oldShape: unknown = [validStage];
		assertEquals(isGetAllStageProgressResponse(oldShape), false);
	});
});
