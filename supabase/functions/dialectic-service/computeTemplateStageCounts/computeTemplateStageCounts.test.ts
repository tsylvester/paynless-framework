import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { mockFetch, restoreFetch } from "../../_shared/supabase.mock.ts";
import type { Database, Tables } from "../../types_db.ts";
import type {
	ComputeExpectedCountsDeps,
	ComputeExpectedCountsParams,
	DialecticStageRecipeInstance,
	ExpectedCountsResult,
	PriorStageContext,
	ProgressRecipeEdge,
	ProgressRecipeStep,
	TopologicalSortStepsDeps,
	TopologicalSortStepsParams,
} from "../dialectic.interface.ts";
import {
	buildExpectedCountsResult,
	createMockComputeExpectedCountsFn,
} from "../computeExpectedCounts.mock.ts";
import { computeTemplateStageCounts } from "./computeTemplateStageCounts.ts";
import type {
	ComputeTemplateStageCountsDeps,
	ComputeTemplateStageCountsParams,
	ComputeTemplateStageCountsPayload,
	ComputeTemplateStageCountsResult,
	StageCountsEntry,
} from "./computeTemplateStageCounts.interface.ts";
import {
	buildComputeTemplateStageCountsDeps,
	buildComputeTemplateStageCountsParams,
	buildComputeTemplateStageCountsPayload,
} from "./computeTemplateStageCounts.mock.ts";

const SUPABASE_URL = "http://localhost:54321";
const SUPABASE_ANON_KEY = "test-anon-key";
const PROCESS_TEMPLATE_ID = "process-tpl-two-stage";
const MODEL_COUNT = 3;
const STAGE_A_SLUG = "stage-a";
const STAGE_B_SLUG = "stage-b";
const STAGE_A_ID = "stage-a-id";
const STAGE_B_ID = "stage-b-id";
const INSTANCE_A_ID = "instance-a-id";
const INSTANCE_B_ID = "instance-b-id";
const TEMPLATE_A_ID = "template-a-id";
const TEMPLATE_B_ID = "template-b-id";
const STEP_A_PLAN_ID = "step-a-plan-id";
const STEP_A_LEAF1_ID = "step-a-leaf1-id";
const STEP_A_LEAF2_ID = "step-a-leaf2-id";
const STEP_B_PAIR_ID = "step-b-pair-id";
const CYCLE_ERROR_MESSAGE = "Stage transition graph contains a cycle or unresolved node";

const headers: HeadersInit = { "Content-Type": "application/json" };

const stageASteps: ProgressRecipeStep[] = [
	{
		id: STEP_A_PLAN_ID,
		step_key: "a_plan",
		job_type: "PLAN",
		granularity_strategy: "all_to_one",
	},
	{
		id: STEP_A_LEAF1_ID,
		step_key: "a_leaf1",
		job_type: "EXECUTE",
		granularity_strategy: "per_source_document",
	},
	{
		id: STEP_A_LEAF2_ID,
		step_key: "a_leaf2",
		job_type: "EXECUTE",
		granularity_strategy: "per_source_document",
	},
];

const stageAEdges: ProgressRecipeEdge[] = [
	{ from_step_id: STEP_A_PLAN_ID, to_step_id: STEP_A_LEAF1_ID },
	{ from_step_id: STEP_A_PLAN_ID, to_step_id: STEP_A_LEAF2_ID },
];

const stageBSteps: ProgressRecipeStep[] = [
	{
		id: STEP_B_PAIR_ID,
		step_key: "b_pair",
		job_type: "EXECUTE",
		granularity_strategy: "pairwise_by_origin",
	},
];

const stageBEdges: ProgressRecipeEdge[] = [];

const stageAExpected: Map<string, number> = new Map<string, number>([
	["a_plan", 1],
	["a_leaf1", 3],
	["a_leaf2", 4],
]);

const stageACardinality: Map<string, number> = new Map<string, number>([
	[STEP_A_PLAN_ID, 1],
	[STEP_A_LEAF1_ID, 3],
	[STEP_A_LEAF2_ID, 4],
]);

const stageBExpected: Map<string, number> = new Map<string, number>([["b_pair", 10]]);

const stageBCardinality: Map<string, number> = new Map<string, number>([[STEP_B_PAIR_ID, 10]]);

const stageALineageCount = 7;

Deno.test("computeTemplateStageCounts: two-stage template A to B returns stages in topological order with expected counts", async () => {
	const iso: string = new Date().toISOString();
	const transitions: { source_stage_id: string; target_stage_id: string }[] = [
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_A_ID },
		{ source_stage_id: STAGE_B_ID, target_stage_id: STAGE_B_ID },
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_B_ID },
	];
	const stages: { id: string; slug: string; active_recipe_instance_id: string }[] = [
		{ id: STAGE_A_ID, slug: STAGE_A_SLUG, active_recipe_instance_id: INSTANCE_A_ID },
		{ id: STAGE_B_ID, slug: STAGE_B_SLUG, active_recipe_instance_id: INSTANCE_B_ID },
	];
	const instances: DialecticStageRecipeInstance[] = [
		{
			id: INSTANCE_A_ID,
			stage_id: STAGE_A_ID,
			template_id: TEMPLATE_A_ID,
			is_cloned: true,
			cloned_at: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: INSTANCE_B_ID,
			stage_id: STAGE_B_ID,
			template_id: TEMPLATE_B_ID,
			is_cloned: true,
			cloned_at: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
		{
			id: STEP_A_PLAN_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_plan",
			step_slug: "a-plan",
			step_name: "a_plan",
			step_description: null,
			job_type: "PLAN",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "all_to_one",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: STEP_A_LEAF1_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_leaf1",
			step_slug: "a-leaf1",
			step_name: "a_leaf1",
			step_description: null,
			job_type: "EXECUTE",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "per_source_document",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: STEP_A_LEAF2_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_leaf2",
			step_slug: "a-leaf2",
			step_name: "a_leaf2",
			step_description: null,
			job_type: "EXECUTE",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "per_source_document",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: STEP_B_PAIR_ID,
			instance_id: INSTANCE_B_ID,
			step_key: "b_pair",
			step_slug: "b-pair",
			step_name: "b_pair",
			step_description: null,
			job_type: "EXECUTE",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "pairwise_by_origin",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [
		{ instance_id: INSTANCE_A_ID, from_step_id: STEP_A_PLAN_ID, to_step_id: STEP_A_LEAF1_ID },
		{ instance_id: INSTANCE_A_ID, from_step_id: STEP_A_PLAN_ID, to_step_id: STEP_A_LEAF2_ID },
	];

	mockFetch([
		new Response(JSON.stringify(transitions), { status: 200, headers }),
		new Response(JSON.stringify(stages), { status: 200, headers }),
		new Response(JSON.stringify(instances), { status: 200, headers }),
		new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
		new Response(JSON.stringify(edges), { status: 200, headers }),
	]);

	const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	});

	let computeCallCount = 0;
	const computeDouble = (
		_deps: ComputeExpectedCountsDeps,
		_params: ComputeExpectedCountsParams,
	): ExpectedCountsResult => {
		const callIndex: number = computeCallCount;
		computeCallCount += 1;
		if (callIndex === 0) {
			return buildExpectedCountsResult({
				expected: stageAExpected,
				cardinality: stageACardinality,
			});
		}
		return buildExpectedCountsResult({
			expected: stageBExpected,
			cardinality: stageBCardinality,
		});
	};

	const deps: ComputeTemplateStageCountsDeps = buildComputeTemplateStageCountsDeps({
		dbClient,
		topologicalSortSteps: (
			_d: TopologicalSortStepsDeps,
			p: TopologicalSortStepsParams,
		): ProgressRecipeStep[] => p.steps,
		computeExpectedCounts: computeDouble,
	});
	const params: ComputeTemplateStageCountsParams = buildComputeTemplateStageCountsParams();
	const payload: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload({
		processTemplateId: PROCESS_TEMPLATE_ID,
		modelCount: MODEL_COUNT,
	});

	try {
		const result: ComputeTemplateStageCountsResult = await computeTemplateStageCounts(deps, params, payload);
		assertEquals(result.status, 200);
		assertExists(result.data);
		if (!result.data) {
			return;
		}
		assertEquals(result.data.totalStages, 2);
		assertEquals(result.data.stages.length, 2);
		const stageAEntry: StageCountsEntry = result.data.stages[0];
		const stageBEntry: StageCountsEntry = result.data.stages[1];
		assertExists(stageAEntry);
		assertExists(stageBEntry);
		if (!stageAEntry || !stageBEntry) {
			return;
		}
		assertEquals(stageAEntry.stageId, STAGE_A_ID);
		assertEquals(stageBEntry.stageId, STAGE_B_ID);
		assertEquals(stageAEntry.stageSlug, STAGE_A_SLUG);
		assertEquals(stageBEntry.stageSlug, STAGE_B_SLUG);
		assertEquals(stageAEntry.steps, stageASteps);
		assertEquals(stageBEntry.steps, stageBSteps);
		assertEquals(stageAEntry.edges, stageAEdges);
		assertEquals(stageBEntry.edges, stageBEdges);
		assertEquals(stageAEntry.expected, stageAExpected);
		assertEquals(stageBEntry.expected, stageBExpected);
		assertEquals(stageAEntry.totalExpected, 8);
		assertEquals(stageBEntry.totalExpected, 10);
	} finally {
		restoreFetch();
	}
});

Deno.test("computeTemplateStageCounts: stepIdToStepKey is the union of all stage step ids to step keys", async () => {
	const iso: string = new Date().toISOString();
	const transitions: { source_stage_id: string; target_stage_id: string }[] = [
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_A_ID },
		{ source_stage_id: STAGE_B_ID, target_stage_id: STAGE_B_ID },
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_B_ID },
	];
	const stages: { id: string; slug: string; active_recipe_instance_id: string }[] = [
		{ id: STAGE_A_ID, slug: STAGE_A_SLUG, active_recipe_instance_id: INSTANCE_A_ID },
		{ id: STAGE_B_ID, slug: STAGE_B_SLUG, active_recipe_instance_id: INSTANCE_B_ID },
	];
	const instances: DialecticStageRecipeInstance[] = [
		{
			id: INSTANCE_A_ID,
			stage_id: STAGE_A_ID,
			template_id: TEMPLATE_A_ID,
			is_cloned: true,
			cloned_at: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: INSTANCE_B_ID,
			stage_id: STAGE_B_ID,
			template_id: TEMPLATE_B_ID,
			is_cloned: true,
			cloned_at: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
		{
			id: STEP_A_PLAN_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_plan",
			step_slug: "a-plan",
			step_name: "a_plan",
			step_description: null,
			job_type: "PLAN",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "all_to_one",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: STEP_B_PAIR_ID,
			instance_id: INSTANCE_B_ID,
			step_key: "b_pair",
			step_slug: "b-pair",
			step_name: "b_pair",
			step_description: null,
			job_type: "EXECUTE",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "pairwise_by_origin",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];

	mockFetch([
		new Response(JSON.stringify(transitions), { status: 200, headers }),
		new Response(JSON.stringify(stages), { status: 200, headers }),
		new Response(JSON.stringify(instances), { status: 200, headers }),
		new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
		new Response(JSON.stringify(edges), { status: 200, headers }),
	]);

	const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	});

	const stageAPlanCardinality: Map<string, number> = new Map<string, number>([[STEP_A_PLAN_ID, 1]]);
	const stageAPlanExpected: Map<string, number> = new Map<string, number>([["a_plan", 1]]);

	let computeCallCount = 0;
	const computeDouble = (
		_deps: ComputeExpectedCountsDeps,
		_params: ComputeExpectedCountsParams,
	): ExpectedCountsResult => {
		const callIndex: number = computeCallCount;
		computeCallCount += 1;
		if (callIndex === 0) {
			return buildExpectedCountsResult({
				expected: stageAPlanExpected,
				cardinality: stageAPlanCardinality,
			});
		}
		return buildExpectedCountsResult({
			expected: stageBExpected,
			cardinality: stageBCardinality,
		});
	};

	const deps: ComputeTemplateStageCountsDeps = buildComputeTemplateStageCountsDeps({
		dbClient,
		topologicalSortSteps: (
			_d: TopologicalSortStepsDeps,
			p: TopologicalSortStepsParams,
		): ProgressRecipeStep[] => p.steps,
		computeExpectedCounts: computeDouble,
	});
	const params: ComputeTemplateStageCountsParams = buildComputeTemplateStageCountsParams();
	const payload: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload({
		processTemplateId: PROCESS_TEMPLATE_ID,
		modelCount: MODEL_COUNT,
	});

	try {
		const result: ComputeTemplateStageCountsResult = await computeTemplateStageCounts(deps, params, payload);
		assertEquals(result.status, 200);
		assertExists(result.data);
		if (!result.data) {
			return;
		}
		assertEquals(result.data.stepIdToStepKey.get(STEP_A_PLAN_ID), "a_plan");
		assertEquals(result.data.stepIdToStepKey.get(STEP_B_PAIR_ID), "b_pair");
		assertEquals(result.data.stepIdToStepKey.size, 2);
	} finally {
		restoreFetch();
	}
});

Deno.test("computeTemplateStageCounts: stage B receives PriorStageContext from predecessor leaf cardinalities and modelCount", async () => {
	const iso: string = new Date().toISOString();
	const transitions: { source_stage_id: string; target_stage_id: string }[] = [
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_A_ID },
		{ source_stage_id: STAGE_B_ID, target_stage_id: STAGE_B_ID },
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_B_ID },
	];
	const stages: { id: string; slug: string; active_recipe_instance_id: string }[] = [
		{ id: STAGE_A_ID, slug: STAGE_A_SLUG, active_recipe_instance_id: INSTANCE_A_ID },
		{ id: STAGE_B_ID, slug: STAGE_B_SLUG, active_recipe_instance_id: INSTANCE_B_ID },
	];
	const instances: DialecticStageRecipeInstance[] = [
		{
			id: INSTANCE_A_ID,
			stage_id: STAGE_A_ID,
			template_id: TEMPLATE_A_ID,
			is_cloned: true,
			cloned_at: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: INSTANCE_B_ID,
			stage_id: STAGE_B_ID,
			template_id: TEMPLATE_B_ID,
			is_cloned: true,
			cloned_at: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
		{
			id: STEP_A_PLAN_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_plan",
			step_slug: "a-plan",
			step_name: "a_plan",
			step_description: null,
			job_type: "PLAN",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "all_to_one",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: STEP_A_LEAF1_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_leaf1",
			step_slug: "a-leaf1",
			step_name: "a_leaf1",
			step_description: null,
			job_type: "EXECUTE",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "per_source_document",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: STEP_A_LEAF2_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_leaf2",
			step_slug: "a-leaf2",
			step_name: "a_leaf2",
			step_description: null,
			job_type: "EXECUTE",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "per_source_document",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
		{
			id: STEP_B_PAIR_ID,
			instance_id: INSTANCE_B_ID,
			step_key: "b_pair",
			step_slug: "b-pair",
			step_name: "b_pair",
			step_description: null,
			job_type: "EXECUTE",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "pairwise_by_origin",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [
		{ instance_id: INSTANCE_A_ID, from_step_id: STEP_A_PLAN_ID, to_step_id: STEP_A_LEAF1_ID },
		{ instance_id: INSTANCE_A_ID, from_step_id: STEP_A_PLAN_ID, to_step_id: STEP_A_LEAF2_ID },
	];

	mockFetch([
		new Response(JSON.stringify(transitions), { status: 200, headers }),
		new Response(JSON.stringify(stages), { status: 200, headers }),
		new Response(JSON.stringify(instances), { status: 200, headers }),
		new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
		new Response(JSON.stringify(edges), { status: 200, headers }),
	]);

	const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	});

	const capturedParams: ComputeExpectedCountsParams[] = [];
	let computeCallCount = 0;
	const computeDouble = (
		_deps: ComputeExpectedCountsDeps,
		params: ComputeExpectedCountsParams,
	): ExpectedCountsResult => {
		capturedParams.push(params);
		const callIndex: number = computeCallCount;
		computeCallCount += 1;
		if (callIndex === 0) {
			return buildExpectedCountsResult({
				expected: stageAExpected,
				cardinality: stageACardinality,
			});
		}
		return buildExpectedCountsResult({
			expected: stageBExpected,
			cardinality: stageBCardinality,
		});
	};

	const deps: ComputeTemplateStageCountsDeps = buildComputeTemplateStageCountsDeps({
		dbClient,
		topologicalSortSteps: (
			_d: TopologicalSortStepsDeps,
			p: TopologicalSortStepsParams,
		): ProgressRecipeStep[] => p.steps,
		computeExpectedCounts: computeDouble,
	});
	const params: ComputeTemplateStageCountsParams = buildComputeTemplateStageCountsParams();
	const payload: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload({
		processTemplateId: PROCESS_TEMPLATE_ID,
		modelCount: MODEL_COUNT,
	});

	try {
		const result: ComputeTemplateStageCountsResult = await computeTemplateStageCounts(deps, params, payload);
		assertEquals(result.status, 200);
		assertEquals(capturedParams.length, 2);
		const stageBParams: ComputeExpectedCountsParams = capturedParams[1];
		assertExists(stageBParams);
		if (!stageBParams) {
			return;
		}
		const prior: PriorStageContext | undefined = stageBParams.priorStageContext;
		assertExists(prior);
		if (!prior) {
			return;
		}
		assertEquals(prior.lineageCount, stageALineageCount);
		assertEquals(prior.reviewerCount, MODEL_COUNT);
	} finally {
		restoreFetch();
	}
});

Deno.test("computeTemplateStageCounts: transitions fetch error returns status 500 without throwing", async () => {
	mockFetch([
		new Response(JSON.stringify({ message: "db error", code: "500" }), { status: 500, headers }),
	]);

	const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	});

	const emptyExpectedCounts = createMockComputeExpectedCountsFn({
		expected: new Map<string, number>(),
		cardinality: new Map<string, number>(),
	});
	const deps: ComputeTemplateStageCountsDeps = buildComputeTemplateStageCountsDeps({
		dbClient,
		topologicalSortSteps: (
			_d: TopologicalSortStepsDeps,
			p: TopologicalSortStepsParams,
		): ProgressRecipeStep[] => p.steps,
		computeExpectedCounts: emptyExpectedCounts,
	});
	const params: ComputeTemplateStageCountsParams = buildComputeTemplateStageCountsParams();
	const payload: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload({
		processTemplateId: PROCESS_TEMPLATE_ID,
		modelCount: MODEL_COUNT,
	});

	try {
		const result: ComputeTemplateStageCountsResult = await computeTemplateStageCounts(deps, params, payload);
		assertEquals(result.status, 500);
		assertExists(result.error);
		assertEquals(result.data, undefined);
	} finally {
		restoreFetch();
	}
});

Deno.test("computeTemplateStageCounts: stage transition cycle returns status 500 with cycle message", async () => {
	const transitions: { source_stage_id: string; target_stage_id: string }[] = [
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_B_ID },
		{ source_stage_id: STAGE_B_ID, target_stage_id: STAGE_A_ID },
	];

	mockFetch([
		new Response(JSON.stringify(transitions), { status: 200, headers }),
	]);

	const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	});

	const emptyExpectedCounts = createMockComputeExpectedCountsFn({
		expected: new Map<string, number>(),
		cardinality: new Map<string, number>(),
	});
	const deps: ComputeTemplateStageCountsDeps = buildComputeTemplateStageCountsDeps({
		dbClient,
		topologicalSortSteps: (
			_d: TopologicalSortStepsDeps,
			p: TopologicalSortStepsParams,
		): ProgressRecipeStep[] => p.steps,
		computeExpectedCounts: emptyExpectedCounts,
	});
	const params: ComputeTemplateStageCountsParams = buildComputeTemplateStageCountsParams();
	const payload: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload({
		processTemplateId: PROCESS_TEMPLATE_ID,
		modelCount: MODEL_COUNT,
	});

	try {
		const result: ComputeTemplateStageCountsResult = await computeTemplateStageCounts(deps, params, payload);
		assertEquals(result.status, 500);
		assertExists(result.error);
		if (!result.error) {
			return;
		}
		assertEquals(result.error.message, CYCLE_ERROR_MESSAGE);
	} finally {
		restoreFetch();
	}
});

Deno.test("computeTemplateStageCounts: computeExpectedCounts throw returns status 500 with wrapped message", async () => {
	const iso: string = new Date().toISOString();
	const transitions: { source_stage_id: string; target_stage_id: string }[] = [
		{ source_stage_id: STAGE_A_ID, target_stage_id: STAGE_A_ID },
	];
	const stages: { id: string; slug: string; active_recipe_instance_id: string }[] = [
		{ id: STAGE_A_ID, slug: STAGE_A_SLUG, active_recipe_instance_id: INSTANCE_A_ID },
	];
	const instances: DialecticStageRecipeInstance[] = [
		{
			id: INSTANCE_A_ID,
			stage_id: STAGE_A_ID,
			template_id: TEMPLATE_A_ID,
			is_cloned: true,
			cloned_at: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const recipeSteps: Tables<"dialectic_stage_recipe_steps">[] = [
		{
			id: STEP_A_PLAN_ID,
			instance_id: INSTANCE_A_ID,
			step_key: "a_plan",
			step_slug: "a-plan",
			step_name: "a_plan",
			step_description: null,
			job_type: "PLAN",
			prompt_type: "Turn",
			prompt_template_id: null,
			output_type: "contribution",
			granularity_strategy: "all_to_one",
			inputs_required: [],
			inputs_relevance: [],
			outputs_required: {},
			config_override: {},
			object_filter: {},
			output_overrides: {},
			is_skipped: false,
			execution_order: null,
			parallel_group: null,
			branch_key: null,
			template_step_id: null,
			created_at: iso,
			updated_at: iso,
		},
	];
	const edges: { instance_id: string; from_step_id: string; to_step_id: string }[] = [];

	mockFetch([
		new Response(JSON.stringify(transitions), { status: 200, headers }),
		new Response(JSON.stringify(stages), { status: 200, headers }),
		new Response(JSON.stringify(instances), { status: 200, headers }),
		new Response(JSON.stringify(recipeSteps), { status: 200, headers }),
		new Response(JSON.stringify(edges), { status: 200, headers }),
	]);

	const dbClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	});

	const throwMessage = "mock compute failure";
	const deps: ComputeTemplateStageCountsDeps = buildComputeTemplateStageCountsDeps({
		dbClient,
		topologicalSortSteps: (
			_d: TopologicalSortStepsDeps,
			p: TopologicalSortStepsParams,
		): ProgressRecipeStep[] => p.steps,
		computeExpectedCounts: (
			_deps: ComputeExpectedCountsDeps,
			_params: ComputeExpectedCountsParams,
		): ExpectedCountsResult => {
			throw new Error(throwMessage);
		},
	});
	const params: ComputeTemplateStageCountsParams = buildComputeTemplateStageCountsParams();
	const payload: ComputeTemplateStageCountsPayload = buildComputeTemplateStageCountsPayload({
		processTemplateId: PROCESS_TEMPLATE_ID,
		modelCount: MODEL_COUNT,
	});

	try {
		const result: ComputeTemplateStageCountsResult = await computeTemplateStageCounts(deps, params, payload);
		assertEquals(result.status, 500);
		assertExists(result.error);
		if (!result.error) {
			return;
		}
		assertEquals(result.error.message, `computeExpectedCounts failed: ${throwMessage}`);
	} finally {
		restoreFetch();
	}
});
