import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
	ProgressRecipeStep,
	ProgressRecipeEdge,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "./dialectic.interface.ts";
import { topologicalSortSteps } from "./topologicalSortSteps.ts";

function step(id: string, step_key: string, job_type: ProgressRecipeStep["job_type"], granularity_strategy: ProgressRecipeStep["granularity_strategy"]): ProgressRecipeStep {
	return { id, step_key, job_type, granularity_strategy };
}

function edge(from_step_id: string, to_step_id: string): ProgressRecipeEdge {
	return { from_step_id, to_step_id };
}

const deps: TopologicalSortStepsDeps = {};

Deno.test("topologicalSortSteps", async (t) => {
	await t.step("linear chain A→B→C returns [A, B, C]", () => {
		const A = step("a", "step_a", "PLAN", "all_to_one");
		const B = step("b", "step_b", "EXECUTE", "per_model");
		const C = step("c", "step_c", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [C, A, B];
		const params: TopologicalSortStepsParams = { steps, edges: [edge("a", "b"), edge("b", "c")] };
		const result = topologicalSortSteps(deps, params);
		assertEquals(result.map((s: ProgressRecipeStep) => s.id), ["a", "b", "c"]);
	});

	await t.step("diamond A→B, A→C, B→D, C→D returns A first and D last with B, C between", () => {
		const A = step("a", "plan", "PLAN", "all_to_one");
		const B = step("b", "b", "EXECUTE", "per_model");
		const C = step("c", "c", "EXECUTE", "per_model");
		const D = step("d", "d", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [A, B, C, D];
		const params: TopologicalSortStepsParams = {
			steps,
			edges: [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
		};
		const result = topologicalSortSteps(deps, params);
		assertEquals(result[0].id, "a");
		assertEquals(result[3].id, "d");
		const middleIds = [result[1].id, result[2].id].sort();
		assertEquals(middleIds, ["b", "c"]);
	});

	await t.step("single node with no edges returns [node]", () => {
		const N = step("n", "only", "PLAN", "all_to_one");
		const params: TopologicalSortStepsParams = { steps: [N], edges: [] };
		const result = topologicalSortSteps(deps, params);
		assertEquals(result.length, 1);
		assertEquals(result[0].id, "n");
	});

	await t.step("parallel groups with no inter-group edges returns all nodes in a valid order", () => {
		const A = step("a", "a", "EXECUTE", "per_model");
		const B = step("b", "b", "EXECUTE", "per_model");
		const params: TopologicalSortStepsParams = { steps: [A, B], edges: [] };
		const result = topologicalSortSteps(deps, params);
		assertEquals(result.length, 2);
		const ids = new Set(result.map((s: ProgressRecipeStep) => s.id));
		assertEquals(ids.has("a"), true);
		assertEquals(ids.has("b"), true);
	});

	await t.step("cycle A→B→A throws descriptive error", async () => {
		const A = step("a", "a", "PLAN", "all_to_one");
		const B = step("b", "b", "EXECUTE", "per_model");
		const params: TopologicalSortStepsParams = { steps: [A, B], edges: [edge("a", "b"), edge("b", "a")] };
		await assertRejects(
			async () => { topologicalSortSteps(deps, params); },
			Error,
		);
	});

	await t.step("empty steps array returns empty array", () => {
		const params: TopologicalSortStepsParams = { steps: [], edges: [] };
		const result = topologicalSortSteps(deps, params);
		assertEquals(result, []);
	});

	await t.step("edge references step id not in steps array throws error", async () => {
		const A = step("a", "a", "PLAN", "all_to_one");
		const params: TopologicalSortStepsParams = { steps: [A], edges: [edge("a", "missing-id")] };
		await assertRejects(
			async () => { topologicalSortSteps(deps, params); },
			Error,
		);
	});

	await t.step("real thesis recipe shape (1 PLAN → 4 parallel EXECUTE) returns PLAN first", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "business_case", "EXECUTE", "per_source_document");
		const e2 = step("e2", "feature_spec", "EXECUTE", "per_source_document");
		const e3 = step("e3", "technical_approach", "EXECUTE", "per_source_document");
		const e4 = step("e4", "success_metrics", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [e1, plan, e2, e3, e4];
		const params: TopologicalSortStepsParams = {
			steps,
			edges: [edge("plan-id", "e1"), edge("plan-id", "e2"), edge("plan-id", "e3"), edge("plan-id", "e4")],
		};
		const result = topologicalSortSteps(deps, params);
		assertEquals(result[0].job_type, "PLAN");
		assertEquals(result[0].id, "plan-id");
		assertEquals(result.length, 5);
	});

	await t.step("real parenthesis recipe shape (PLAN → sequential EXECUTE chain) returns correct linear order", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "technical_requirements", "EXECUTE", "per_source_document");
		const e2 = step("e2", "master_plan", "EXECUTE", "per_source_document");
		const e3 = step("e3", "milestone_schema", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [plan, e1, e2, e3];
		const params: TopologicalSortStepsParams = {
			steps,
			edges: [edge("plan-id", "e1"), edge("e1", "e2"), edge("e2", "e3")],
		};
		const result = topologicalSortSteps(deps, params);
		assertEquals(result.map((s: ProgressRecipeStep) => s.id), ["plan-id", "e1", "e2", "e3"]);
	});
});
