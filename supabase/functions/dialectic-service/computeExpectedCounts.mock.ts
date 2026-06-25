import type {
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	ExpectedCountsResult,
	ProgressRecipeStep,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "./dialectic.interface.ts";
import { topologicalSortSteps } from "./topologicalSortSteps.ts";

export type ComputeExpectedCountsParamsOverrides = {
	steps?: ComputeExpectedCountsParams["steps"];
	edges?: ComputeExpectedCountsParams["edges"];
	n?: ComputeExpectedCountsParams["n"];
	priorStageContext?: ComputeExpectedCountsParams["priorStageContext"];
};

export type ComputeExpectedCountsDepsOverrides = {
	topologicalSortSteps?: ComputeExpectedCountsDeps["topologicalSortSteps"];
};

export type ExpectedCountsResultOverrides = {
	expected?: ExpectedCountsResult["expected"];
	cardinality?: ExpectedCountsResult["cardinality"];
};

export interface MockComputeExpectedCountsConfig {
	expected: ExpectedCountsResult["expected"];
	cardinality: ExpectedCountsResult["cardinality"];
}

export function buildComputeExpectedCountsParams(
	overrides?: ComputeExpectedCountsParamsOverrides,
): ComputeExpectedCountsParams {
	const defaultStep: ProgressRecipeStep = {
		id: "plan-id",
		step_key: "plan_header",
		job_type: "PLAN",
		granularity_strategy: "all_to_one",
	};
	const params: ComputeExpectedCountsParams = {
		steps: overrides?.steps !== undefined ? overrides.steps : [defaultStep],
		edges: overrides?.edges !== undefined ? overrides.edges : [],
		n: overrides?.n !== undefined ? overrides.n : 2,
	};
	if (overrides !== undefined && "priorStageContext" in overrides) {
		params.priorStageContext = overrides.priorStageContext;
	}
	return params;
}

export function buildComputeExpectedCountsDeps(
	overrides?: ComputeExpectedCountsDepsOverrides,
): ComputeExpectedCountsDeps {
	const deps: ComputeExpectedCountsDeps = {
		topologicalSortSteps: overrides?.topologicalSortSteps !== undefined
			? overrides.topologicalSortSteps
			: (
				d: TopologicalSortStepsDeps,
				p: TopologicalSortStepsParams,
			): ProgressRecipeStep[] => topologicalSortSteps(d, p),
	};
	return deps;
}

export function buildExpectedCountsResult(
	overrides?: ExpectedCountsResultOverrides,
): ExpectedCountsResult {
	const expected: Map<string, number> = overrides?.expected !== undefined
		? overrides.expected
		: new Map<string, number>([["plan_header", 1]]);
	const cardinality: Map<string, number> = overrides?.cardinality !== undefined
		? overrides.cardinality
		: new Map<string, number>([["plan-id", 1]]);
	const result: ExpectedCountsResult = { expected, cardinality };
	return result;
}

export function createMockComputeExpectedCountsResult(
	config: MockComputeExpectedCountsConfig,
): ExpectedCountsResult {
	return buildExpectedCountsResult({
		expected: config.expected,
		cardinality: config.cardinality,
	});
}

export function createMockComputeExpectedCountsFn(
	config: MockComputeExpectedCountsConfig,
): (
	deps: ComputeExpectedCountsDeps,
	params: ComputeExpectedCountsParams,
) => ExpectedCountsResult {
	const result: ExpectedCountsResult = createMockComputeExpectedCountsResult(config);
	return (
		_deps: ComputeExpectedCountsDeps,
		_params: ComputeExpectedCountsParams,
	): ExpectedCountsResult => result;
}
