import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	ProgressRecipeStep,
	ProgressRecipeEdge,
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	ExpectedCountsResult,
	PriorStageContext,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "./dialectic.interface.ts";
import { topologicalSortSteps } from "./topologicalSortSteps.ts";
import { computeExpectedCounts } from "./computeExpectedCounts.ts";

function step(
	id: string,
	step_key: string,
	job_type: ProgressRecipeStep["job_type"],
	granularity_strategy: ProgressRecipeStep["granularity_strategy"],
): ProgressRecipeStep {
	return { id, step_key, job_type, granularity_strategy };
}

function edge(from_step_id: string, to_step_id: string): ProgressRecipeEdge {
	return { from_step_id, to_step_id };
}

const topologicalSortStepsDeps: TopologicalSortStepsDeps = {};
const deps: ComputeExpectedCountsDeps = {
	topologicalSortSteps: (d: TopologicalSortStepsDeps, p: TopologicalSortStepsParams) =>
		topologicalSortSteps(d, p),
};

function totalExpected(result: ExpectedCountsResult): number {
	let sum = 0;
	for (const v of result.expected.values()) {
		sum += v;
	}
	return sum;
}

Deno.test("computeExpectedCounts", async (t) => {
	await t.step("thesis n=2: PLAN all_to_one expected=1 cardinality=2, four EXECUTE per_source_document expected=2 each, total=9", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "business_case", "EXECUTE", "per_source_document");
		const e2 = step("e2", "feature_spec", "EXECUTE", "per_source_document");
		const e3 = step("e3", "technical_approach", "EXECUTE", "per_source_document");
		const e4 = step("e4", "success_metrics", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [plan, e1, e2, e3, e4];
		const params: ComputeExpectedCountsParams = {
			steps,
			edges: [edge("plan-id", "e1"), edge("plan-id", "e2"), edge("plan-id", "e3"), edge("plan-id", "e4")],
			n: 2,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("plan_header"), 1);
		assertEquals(result.cardinality.get("plan-id"), 2);
		assertEquals(result.expected.get("business_case"), 2);
		assertEquals(result.expected.get("feature_spec"), 2);
		assertEquals(result.expected.get("technical_approach"), 2);
		assertEquals(result.expected.get("success_metrics"), 2);
		assertEquals(totalExpected(result), 9);
	});

	await t.step("thesis n=3: PLAN expected=1 cardinality=3, four EXECUTE expected=3 each, total=13", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "business_case", "EXECUTE", "per_source_document");
		const e2 = step("e2", "feature_spec", "EXECUTE", "per_source_document");
		const e3 = step("e3", "technical_approach", "EXECUTE", "per_source_document");
		const e4 = step("e4", "success_metrics", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [plan, e1, e2, e3, e4];
		const params: ComputeExpectedCountsParams = {
			steps,
			edges: [edge("plan-id", "e1"), edge("plan-id", "e2"), edge("plan-id", "e3"), edge("plan-id", "e4")],
			n: 3,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("plan_header"), 1);
		assertEquals(result.cardinality.get("plan-id"), 3);
		assertEquals(result.expected.get("business_case"), 3);
		assertEquals(result.expected.get("feature_spec"), 3);
		assertEquals(result.expected.get("technical_approach"), 3);
		assertEquals(result.expected.get("success_metrics"), 3);
		assertEquals(totalExpected(result), 13);
	});

	await t.step("antithesis n=2: root per_model expected=2, PLAN per_source_document expected=2, six EXECUTE per_source_document expected=2 each, total=16", () => {
		const root = step("root", "root", "PLAN", "per_model");
		const plan = step("plan-id", "plan_header", "PLAN", "per_source_document");
		const e1 = step("e1", "exec1", "EXECUTE", "per_source_document");
		const e2 = step("e2", "exec2", "EXECUTE", "per_source_document");
		const e3 = step("e3", "exec3", "EXECUTE", "per_source_document");
		const e4 = step("e4", "exec4", "EXECUTE", "per_source_document");
		const e5 = step("e5", "exec5", "EXECUTE", "per_source_document");
		const e6 = step("e6", "exec6", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [root, plan, e1, e2, e3, e4, e5, e6];
		const params: ComputeExpectedCountsParams = {
			steps,
			edges: [
				edge("root", "plan-id"),
				edge("plan-id", "e1"),
				edge("plan-id", "e2"),
				edge("plan-id", "e3"),
				edge("plan-id", "e4"),
				edge("plan-id", "e5"),
				edge("plan-id", "e6"),
			],
			n: 2,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("root"), 2);
		assertEquals(result.expected.get("plan_header"), 2);
		assertEquals(result.expected.get("exec1"), 2);
		assertEquals(result.expected.get("exec2"), 2);
		assertEquals(result.expected.get("exec3"), 2);
		assertEquals(result.expected.get("exec4"), 2);
		assertEquals(result.expected.get("exec5"), 2);
		assertEquals(result.expected.get("exec6"), 2);
		assertEquals(totalExpected(result), 16);
	});

	await t.step("synthesis n=2 with L=2 R=2: pairwise_by_origin steps expected=8 each, all_to_one consolidation expected=1 each", () => {
		const pair1 = step("pair1", "pairwise_1", "EXECUTE", "pairwise_by_origin");
		const pair2 = step("pair2", "pairwise_2", "EXECUTE", "pairwise_by_origin");
		const cons = step("cons", "consolidation", "EXECUTE", "all_to_one");
		const prior: PriorStageContext = { lineageCount: 2, reviewerCount: 2 };
		const steps: ProgressRecipeStep[] = [pair1, pair2, cons];
		const params: ComputeExpectedCountsParams = {
			steps,
			edges: [edge("pair1", "cons"), edge("pair2", "cons")],
			n: 2,
			priorStageContext: prior,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("pairwise_1"), 8);
		assertEquals(result.expected.get("pairwise_2"), 8);
		assertEquals(result.expected.get("consolidation"), 1);
	});

	await t.step("per_source_document_by_lineage with n=3 L=2 expected=6", () => {
		const psdLineage = step("psdl", "per_src_lineage", "EXECUTE", "per_source_document_by_lineage");
		const prior: PriorStageContext = { lineageCount: 2, reviewerCount: 0 };
		const params: ComputeExpectedCountsParams = {
			steps: [psdLineage],
			edges: [],
			n: 3,
			priorStageContext: prior,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("per_src_lineage"), 6);
		assertEquals(result.cardinality.get("psdl"), 6);
	});

	await t.step("all_to_one PLAN with no per_source_document children has cardinality=1", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "exec1", "EXECUTE", "per_model");
		const params: ComputeExpectedCountsParams = {
			steps: [plan, e1],
			edges: [edge("plan-id", "e1")],
			n: 2,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("plan_header"), 1);
		assertEquals(result.cardinality.get("plan-id"), 1);
	});

	await t.step("all_to_one PLAN with per_source_document children has cardinality=n", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "exec1", "EXECUTE", "per_source_document");
		const params: ComputeExpectedCountsParams = {
			steps: [plan, e1],
			edges: [edge("plan-id", "e1")],
			n: 3,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("plan_header"), 1);
		assertEquals(result.cardinality.get("plan-id"), 3);
	});

	await t.step("per_source_document root step (no edges) returns expected count from n", () => {
		const rootStep = step("root-id", "root_step", "EXECUTE", "per_source_document");
		const params: ComputeExpectedCountsParams = {
			steps: [rootStep],
			edges: [],
			n: 2,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(result.expected.get("root_step"), 2);
		assertEquals(result.cardinality.get("root-id"), 2);
	});

	await t.step("parenthesis n=3: expected total = 3n+1 = 10", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "technical_requirements", "EXECUTE", "per_model");
		const e2 = step("e2", "master_plan", "EXECUTE", "per_model");
		const e3 = step("e3", "milestone_schema", "EXECUTE", "per_model");
		const steps: ProgressRecipeStep[] = [plan, e1, e2, e3];
		const params: ComputeExpectedCountsParams = {
			steps,
			edges: [edge("plan-id", "e1"), edge("plan-id", "e2"), edge("plan-id", "e3")],
			n: 3,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(totalExpected(result), 10);
	});

	await t.step("paralysis n=3: expected total = 3n+1 = 10", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "exec1", "EXECUTE", "per_model");
		const e2 = step("e2", "exec2", "EXECUTE", "per_model");
		const e3 = step("e3", "exec3", "EXECUTE", "per_model");
		const steps: ProgressRecipeStep[] = [plan, e1, e2, e3];
		const params: ComputeExpectedCountsParams = {
			steps,
			edges: [edge("plan-id", "e1"), edge("plan-id", "e2"), edge("plan-id", "e3")],
			n: 3,
		};
		const result = computeExpectedCounts(deps, params);
		assertEquals(totalExpected(result), 10);
	});
});
