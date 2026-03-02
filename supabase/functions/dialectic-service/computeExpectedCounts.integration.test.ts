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

const STRATEGIES_NEEDING_PREDECESSOR: readonly ProgressRecipeStep["granularity_strategy"][] = [
	"per_source_document",
];
const STRATEGIES_NEEDING_PRIOR_CONTEXT: readonly ProgressRecipeStep["granularity_strategy"][] = [
	"pairwise_by_origin",
	"per_source_document_by_lineage",
];
const STRATEGIES_SIMPLE: readonly ProgressRecipeStep["granularity_strategy"][] = [
	"all_to_one",
	"per_model",
];

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

function totalExpected(result: ExpectedCountsResult): number {
	let sum = 0;
	for (const v of result.expected.values()) {
		sum += v;
	}
	return sum;
}

function seededRng(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
}

function randomValidDag(
	rng: () => number,
	opts: { stepCount: number; n: number; includePriorContextStrategies?: boolean },
): { steps: ProgressRecipeStep[]; edges: ProgressRecipeEdge[]; params: ComputeExpectedCountsParams } {
	const { stepCount, n, includePriorContextStrategies = false } = opts;
	const steps: ProgressRecipeStep[] = [];
	const edges: ProgressRecipeEdge[] = [];
	const strategiesWithPred: ProgressRecipeStep["granularity_strategy"][] = [
		...STRATEGIES_SIMPLE,
		...STRATEGIES_NEEDING_PREDECESSOR,
	];
	if (includePriorContextStrategies) {
		strategiesWithPred.push(...STRATEGIES_NEEDING_PRIOR_CONTEXT);
	}
	const strategiesRootOnly: ProgressRecipeStep["granularity_strategy"][] = [...STRATEGIES_SIMPLE];
	if (includePriorContextStrategies) {
		strategiesRootOnly.push(...STRATEGIES_NEEDING_PRIOR_CONTEXT);
	}
	for (let i = 0; i < stepCount; i++) {
		const id = `s${i}`;
		const step_key = `step_${i}`;
		const job_type: ProgressRecipeStep["job_type"] = rng() < 0.3 ? "PLAN" : "EXECUTE";
		const pool = i === 0 ? strategiesRootOnly : strategiesWithPred;
		const strategy = pool[Math.floor(rng() * pool.length)];
		steps.push(step(id, step_key, job_type, strategy));
	}
	for (let j = 1; j < stepCount; j++) {
		const needsPredecessor = STRATEGIES_NEEDING_PREDECESSOR.includes(steps[j].granularity_strategy);
		if (needsPredecessor) {
			const fromIndex = Math.floor(rng() * j);
			edges.push(edge(steps[fromIndex].id, steps[j].id));
		}
	}
	for (let i = 0; i < stepCount; i++) {
		for (let j = i + 1; j < stepCount; j++) {
			if (rng() < 0.25) {
				edges.push(edge(steps[i].id, steps[j].id));
			}
		}
	}
	const prior: PriorStageContext | undefined = includePriorContextStrategies
		? { lineageCount: Math.max(1, Math.floor(n * rng()) + 1), reviewerCount: Math.max(1, Math.floor(n * rng()) + 1) }
		: undefined;
	const params: ComputeExpectedCountsParams = {
		steps,
		edges,
		n,
		priorStageContext: prior,
	};
	return { steps, edges, params };
}

const topologicalSortStepsDeps: TopologicalSortStepsDeps = {};
const deps: ComputeExpectedCountsDeps = {
	topologicalSortSteps: (d: TopologicalSortStepsDeps, p: TopologicalSortStepsParams) =>
		topologicalSortSteps(d, p),
};

Deno.test("computeExpectedCounts integration: topologicalSortSteps → computeExpectedCounts", async (t) => {
	await t.step("real thesis recipe steps and edges: total matches spec 4n+1", () => {
		const plan = step("plan-id", "plan_header", "PLAN", "all_to_one");
		const e1 = step("e1", "business_case", "EXECUTE", "per_source_document");
		const e2 = step("e2", "feature_spec", "EXECUTE", "per_source_document");
		const e3 = step("e3", "technical_approach", "EXECUTE", "per_source_document");
		const e4 = step("e4", "success_metrics", "EXECUTE", "per_source_document");
		const steps: ProgressRecipeStep[] = [plan, e1, e2, e3, e4];
		const edges: ProgressRecipeEdge[] = [
			edge("plan-id", "e1"),
			edge("plan-id", "e2"),
			edge("plan-id", "e3"),
			edge("plan-id", "e4"),
		];
		const params: ComputeExpectedCountsParams = { steps, edges, n: 3 };
		const result = computeExpectedCounts(deps, params);
		const total = totalExpected(result);
		assertEquals(total, 4 * params.n + 1, "thesis: 4n+1 at n=3 => 13");
	});

	await t.step("real synthesis recipe steps and edges and prior stage context: total matches spec 4n³+4n+5", () => {
		const h1 = step("h1", "prepare-pairwise-synthesis-header", "PLAN", "all_to_one");
		const h2 = step("h2", "syn-header-2", "EXECUTE", "all_to_one");
		const h3 = step("h3", "syn-header-3", "EXECUTE", "all_to_one");
		const h4 = step("h4", "syn-header-4", "EXECUTE", "all_to_one");
		const h5 = step("h5", "syn-header-5", "EXECUTE", "all_to_one");
		const p1 = step("p1", "pairwise-synthesis-business-case", "EXECUTE", "pairwise_by_origin");
		const p2 = step("p2", "pairwise-synthesis-feature-spec", "EXECUTE", "pairwise_by_origin");
		const p3 = step("p3", "pairwise-synthesis-technical-approach", "EXECUTE", "pairwise_by_origin");
		const p4 = step("p4", "pairwise-synthesis-success-metrics", "EXECUTE", "pairwise_by_origin");
		const m1 = step("m1", "synthesis-document-business-case", "EXECUTE", "per_model");
		const m2 = step("m2", "synthesis-document-feature-spec", "EXECUTE", "per_model");
		const m3 = step("m3", "synthesis-document-technical-approach", "EXECUTE", "per_model");
		const m4 = step("m4", "synthesis-document-success-metrics", "EXECUTE", "per_model");
		const steps: ProgressRecipeStep[] = [h1, h2, h3, h4, h5, p1, p2, p3, p4, m1, m2, m3, m4];
		const edges: ProgressRecipeEdge[] = [
			edge("h1", "h2"),
			edge("h2", "h3"),
			edge("h3", "h4"),
			edge("h4", "h5"),
			edge("h5", "p1"),
			edge("h5", "p2"),
			edge("h5", "p3"),
			edge("h5", "p4"),
			edge("p1", "m1"),
			edge("p2", "m2"),
			edge("p3", "m3"),
			edge("p4", "m4"),
		];
		const prior: PriorStageContext = { lineageCount: 3, reviewerCount: 3 };
		const params: ComputeExpectedCountsParams = {
			steps,
			edges,
			n: 3,
			priorStageContext: prior,
		};
		const result = computeExpectedCounts(deps, params);
		const total = totalExpected(result);
		const expectedTotal = 4 * params.n * params.n * params.n + 4 * params.n + 5;
		assertEquals(total, expectedTotal, "synthesis: 4n³+4n+5 at n=3 => 125");
	});

	await t.step("random valid DAG (no prior context): pipeline runs and returns consistent structure", () => {
		const rng = seededRng(42);
		for (let run = 0; run < 5; run++) {
			const { params } = randomValidDag(rng, { stepCount: 4 + Math.floor(rng() * 6), n: 1 + Math.floor(rng() * 4) });
			const result = computeExpectedCounts(deps, params);
			assertEquals(result.expected.size, params.steps.length);
			assertEquals(result.cardinality.size, params.steps.length);
			const total = totalExpected(result);
			assertEquals(Number.isInteger(total), true);
			assertEquals(total >= 0, true);
			for (const s of params.steps) {
				const exp = result.expected.get(s.step_key);
				const card = result.cardinality.get(s.id);
				if (exp === undefined || card === undefined) {
					throw new Error(`step "${s.step_key}" has no expected or cardinality`);
				}
				assertEquals(typeof exp, "number");
				assertEquals(typeof card, "number");
				assertEquals((exp) >= 0, true);
				assertEquals((card) >= 0, true);
			}
		}
	});

	await t.step("random valid DAG (with prior context): pipeline runs and returns consistent structure", () => {
		const rng = seededRng(99);
		for (let run = 0; run < 3; run++) {
			const { params } = randomValidDag(rng, {
				stepCount: 5 + Math.floor(rng() * 5),
				n: 2 + Math.floor(rng() * 3),
				includePriorContextStrategies: true,
			});
			const result = computeExpectedCounts(deps, params);
			assertEquals(result.expected.size, params.steps.length);
			assertEquals(result.cardinality.size, params.steps.length);
			const total = totalExpected(result);
			assertEquals(Number.isInteger(total), true);
			assertEquals(total >= 0, true);
		}
	});
});
