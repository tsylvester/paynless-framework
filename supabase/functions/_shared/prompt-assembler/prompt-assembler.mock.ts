import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import {
	AssemblePromptOptions,
	AssembledPrompt,
	AssembleSeedPromptDeps,
	AssembleSeedPromptFn,
	AssemblePlannerPromptDeps,
	AssembleTurnPromptDeps,
	AssembleTurnPromptParams,
	AssembleContinuationPromptDeps,
	IPromptAssembler,
	ProjectContext,
	SessionContext,
	StageContext,
	DynamicContextVariables,
	RenderFn,
	RenderPromptFunctionType,
} from './prompt-assembler.interface.ts';
import { buildDialecticRecipeTemplateStep, buildDialecticJobRow } from '../dialectic.mock.ts';
import { mockGatherContext } from './gatherContext/gatherContext.mock.ts';
import { mockGatherContinuationInputs } from './gatherContinuationInputs/gatherContinuationInputs.mock.ts';
import { mockAssembleChunks } from '../utils/assembleChunks/assembleChunks.mock.ts';
import { mockConstructStoragePath } from '../utils/path_constructor.mock.ts';
import { mockDownloadFromStorageTwoArg, createMockDownloadFromStorage } from '../supabase_storage_utils.mock.ts';
import { gatherInputsForStage } from './gatherInputsForStage/gatherInputsForStage.ts';
import {
	AssembleCompressionPromptFn,
	AssembleCompressionPromptReturn,
} from "./assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import { createMockSupabaseClient } from "../supabase.mock.ts";
import { MockFileManagerService } from '../services/file_manager.mock.ts';

export const TEST_STORAGE_BUCKET = 'test-content-bucket';

export function withEnv<T>(
	envVars: Record<string, string | undefined>,
	fn: () => T,
): T {
	const originals: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(envVars)) {
		originals[key] = Deno.env.get(key);
		if (value === undefined) {
			Deno.env.delete(key);
		} else {
			Deno.env.set(key, value);
		}
	}
	try {
		return fn();
	} finally {
		for (const [key, value] of Object.entries(originals)) {
			if (value === undefined) {
				Deno.env.delete(key);
			} else {
				Deno.env.set(key, value);
			}
		}
	}
}

export const mockRenderPromptFn: RenderPromptFunctionType = (
	_basePromptText,
	_dynamicContextVariables,
	_systemDefaultOverlayValues,
	_userProjectOverlayValues,
) => {
	return 'mock rendered prompt';
};

export const mockRenderFn: RenderFn = (
	_renderPromptFn,
	_stage,
	_context,
	_userProjectOverlayValues,
) => {
	return 'mock rendered prompt';
};

// Shared constants for test assertions
export const MOCK_ASSEMBLED_PROMPT: AssembledPrompt = {
    promptContent: 'mock assembled prompt from options entry point',
    source_prompt_resource_id: 'mock-resource-id',
};

export const MOCK_ASSEMBLED_SEED_PROMPT: AssembledPrompt = {
    promptContent: 'mock assembled seed prompt',
    source_prompt_resource_id: 'mock-seed-resource-id',
};

export const MOCK_ASSEMBLED_PLANNER_PROMPT: AssembledPrompt = {
    promptContent: 'mock assembled planner prompt',
    source_prompt_resource_id: 'mock-planner-resource-id',
};

export const MOCK_ASSEMBLED_TURN_PROMPT: AssembledPrompt = {
    promptContent: 'mock assembled turn prompt',
    source_prompt_resource_id: 'mock-turn-resource-id',
};

export const MOCK_ASSEMBLED_CONTINUATION_PROMPT: AssembledPrompt = {
    promptContent: 'mock assembled continuation prompt',
    source_prompt_resource_id: 'mock-continuation-resource-id',
};

export const MOCK_ASSEMBLED_COMPRESSION_PROMPT: AssembleCompressionPromptReturn = {
    promptContent: 'mock assembled compression prompt',
    source_prompt_resource_id: 'mock-compression-resource-id',
};

export type ProjectContextOverrides = Partial<ProjectContext>;

export function buildProjectContext(overrides?: ProjectContextOverrides): ProjectContext {
    const base: ProjectContext = {
        id: 'proj-123',
        user_id: 'user-123',
        project_name: 'Test Project',
        initial_user_prompt: 'Initial prompt',
        initial_prompt_resource_id: 'res-1',
        selected_domain_id: 'domain-1',
        dialectic_domains: { name: 'Software Development' },
        process_template_id: 'proc-1',
        selected_domain_overlay_id: null,
        user_domain_overlay_values: null,
        repo_url: null,
        status: 'active',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        idempotency_key: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type ProjectContextCorruptions = { [K in keyof ProjectContext]?: unknown };

export function invalidateProjectContext(corruptions: ProjectContextCorruptions): unknown {
    return { ...buildProjectContext(), ...corruptions };
}

export type SessionContextOverrides = Partial<SessionContext>;

export function buildSessionContext(overrides?: SessionContextOverrides): SessionContext {
    const base: SessionContext = {
        id: 'sess-123',
        project_id: 'proj-123',
        selected_model_ids: ['model-1'],
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        current_stage_id: 'stage-123',
        iteration_count: 1,
        session_description: 'Test session',
        status: 'pending_thesis',
        associated_chat_id: null,
        user_input_reference_url: null,
        idempotency_key: null,
        viewing_stage_id: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type SessionContextCorruptions = { [K in keyof SessionContext]?: unknown };

export function invalidateSessionContext(corruptions: SessionContextCorruptions): unknown {
    return { ...buildSessionContext(), ...corruptions };
}

export type StageContextOverrides = Partial<StageContext>;

export function buildStageContext(overrides?: StageContextOverrides): StageContext {
    const base: StageContext = {
        id: 'stage-123',
        system_prompts: { prompt_text: 'Default prompt' },
        domain_specific_prompt_overlays: [],
        slug: 'synthesis',
        display_name: 'Synthesis',
        description: 'Synthesis stage',
        created_at: '2025-01-01T00:00:00.000Z',
        default_system_prompt_id: 'dsp-123',
        recipe_step: buildDialecticRecipeTemplateStep(),
        active_recipe_instance_id: null,
        expected_output_template_ids: [],
        recipe_template_id: null,
        minimum_balance: 0,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type StageContextCorruptions = { [K in keyof StageContext]?: unknown };

export function invalidateStageContext(corruptions: StageContextCorruptions): unknown {
    return { ...buildStageContext(), ...corruptions };
}

export type DynamicContextVariablesOverrides = Partial<DynamicContextVariables>;

export function buildDynamicContextVariables(overrides?: DynamicContextVariablesOverrides): DynamicContextVariables {
    const base: DynamicContextVariables = {
        user_objective: 'Test Project',
        domain: 'Software Development',
        context_description: 'Initial prompt',
        original_user_request: 'Initial prompt',
        recipeStep: buildDialecticRecipeTemplateStep(),
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type DynamicContextVariablesCorruptions = { [K in keyof DynamicContextVariables]?: unknown };

export function invalidateDynamicContextVariables(corruptions: DynamicContextVariablesCorruptions): unknown {
    return { ...buildDynamicContextVariables(), ...corruptions };
}

export type AssembleContinuationPromptDepsOverrides = Partial<AssembleContinuationPromptDeps>;

export function buildAssembleContinuationPromptDeps(overrides?: AssembleContinuationPromptDepsOverrides): AssembleContinuationPromptDeps {
    const base: AssembleContinuationPromptDeps = {
        dbClient: createMockSupabaseClient().client as unknown as SupabaseClient<Database>,
        fileManager: new MockFileManagerService(),
        job: buildDialecticJobRow(),
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: buildStageContext(),
        gatherContext: mockGatherContext,
        assembleChunks: mockAssembleChunks,
        gatherContinuationInputs: mockGatherContinuationInputs,
        downloadFromStorage: mockDownloadFromStorageTwoArg,
        constructStoragePath: mockConstructStoragePath,
        sourceContributionId: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type AssembleContinuationPromptDepsCorruptions = { [K in keyof AssembleContinuationPromptDeps]?: unknown };

export function invalidateAssembleContinuationPromptDeps(corruptions: AssembleContinuationPromptDepsCorruptions): unknown {
    return { ...buildAssembleContinuationPromptDeps(), ...corruptions };
}

export type AssembledPromptOverrides = Partial<AssembledPrompt>;

export function buildAssembledPrompt(overrides?: AssembledPromptOverrides): AssembledPrompt {
    const base: AssembledPrompt = {
        promptContent: 'mock assembled prompt',
        source_prompt_resource_id: 'mock-resource-id',
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type AssembledPromptCorruptions = { [K in keyof AssembledPrompt]?: unknown };

export function invalidateAssembledPrompt(corruptions: AssembledPromptCorruptions): unknown {
    return { ...buildAssembledPrompt(), ...corruptions };
}

export type AssemblePromptOptionsOverrides = Partial<AssemblePromptOptions>;

export function buildAssemblePromptOptions(overrides?: AssemblePromptOptionsOverrides): AssemblePromptOptions {
    const base: AssemblePromptOptions = {
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: buildStageContext(),
        projectInitialUserPrompt: 'Initial prompt',
        iterationNumber: 1,
        job: undefined,
        sourceContributionId: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type AssemblePromptOptionsCorruptions = { [K in keyof AssemblePromptOptions]?: unknown };

export function invalidateAssemblePromptOptions(corruptions: AssemblePromptOptionsCorruptions): unknown {
    return { ...buildAssemblePromptOptions(), ...corruptions };
}

export type AssembleSeedPromptDepsOverrides = Partial<AssembleSeedPromptDeps>;

export function buildAssembleSeedPromptDeps(overrides?: AssembleSeedPromptDepsOverrides): AssembleSeedPromptDeps {
    const base: AssembleSeedPromptDeps = {
        dbClient: createMockSupabaseClient().client as unknown as SupabaseClient<Database>,
        downloadFromStorageFn: mockDownloadFromStorageTwoArg,
        gatherInputsForStageFn: gatherInputsForStage,
        renderPromptFn: mockRenderPromptFn,
        fileManager: new MockFileManagerService(),
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: buildStageContext(),
        projectInitialUserPrompt: 'Initial prompt',
        iterationNumber: 1,
        sourceContributionId: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type AssembleSeedPromptDepsCorruptions = { [K in keyof AssembleSeedPromptDeps]?: unknown };

export function invalidateAssembleSeedPromptDeps(corruptions: AssembleSeedPromptDepsCorruptions): unknown {
    return { ...buildAssembleSeedPromptDeps(), ...corruptions };
}

export type AssemblePlannerPromptDepsOverrides = Partial<AssemblePlannerPromptDeps>;

export function buildAssemblePlannerPromptDeps(overrides?: AssemblePlannerPromptDepsOverrides): AssemblePlannerPromptDeps {
    const base: AssemblePlannerPromptDeps = {
        dbClient: createMockSupabaseClient().client as unknown as SupabaseClient<Database>,
        fileManager: new MockFileManagerService(),
        job: buildDialecticJobRow(),
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: buildStageContext(),
        projectInitialUserPrompt: 'Initial prompt',
        gatherContext: mockGatherContext,
        render: mockRenderFn,
        sourceContributionId: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type AssemblePlannerPromptDepsCorruptions = { [K in keyof AssemblePlannerPromptDeps]?: unknown };

export function invalidateAssemblePlannerPromptDeps(corruptions: AssemblePlannerPromptDepsCorruptions): unknown {
    return { ...buildAssemblePlannerPromptDeps(), ...corruptions };
}

export type AssembleTurnPromptDepsOverrides = Partial<AssembleTurnPromptDeps>;

export function buildAssembleTurnPromptDeps(overrides?: AssembleTurnPromptDepsOverrides): AssembleTurnPromptDeps {
    const base: AssembleTurnPromptDeps = {
        dbClient: createMockSupabaseClient().client as unknown as SupabaseClient<Database>,
        fileManager: new MockFileManagerService(),
        gatherContext: mockGatherContext,
        render: mockRenderFn,
        downloadFromStorage: createMockDownloadFromStorage({ mode: 'success', data: new ArrayBuffer(0) }),
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type AssembleTurnPromptDepsCorruptions = { [K in keyof AssembleTurnPromptDeps]?: unknown };

export function invalidateAssembleTurnPromptDeps(corruptions: AssembleTurnPromptDepsCorruptions): unknown {
    return { ...buildAssembleTurnPromptDeps(), ...corruptions };
}

export type AssembleTurnPromptParamsOverrides = Partial<AssembleTurnPromptParams>;

export function buildAssembleTurnPromptParams(overrides?: AssembleTurnPromptParamsOverrides): AssembleTurnPromptParams {
    const base: AssembleTurnPromptParams = {
        job: buildDialecticJobRow(),
        project: buildProjectContext(),
        session: buildSessionContext(),
        stage: buildStageContext(),
        sourceContributionId: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type AssembleTurnPromptParamsCorruptions = { [K in keyof AssembleTurnPromptParams]?: unknown };

export function invalidateAssembleTurnPromptParams(corruptions: AssembleTurnPromptParamsCorruptions): unknown {
    return { ...buildAssembleTurnPromptParams(), ...corruptions };
}

// ---------------------------------------------------------------------------
// IPromptAssembler — injected service interface (see dependency-injection).
// Per mocks.md "Classes — decompose, never mock the class", the class
// PromptAssembler is never mocked; the owned object type IPromptAssembler gets
// the four standard symbols, and each method defaults to its function mock.
// ---------------------------------------------------------------------------

export const mockAssemble: (options: AssemblePromptOptions) => Promise<AssembledPrompt> =
    async () => MOCK_ASSEMBLED_PROMPT;

export const mockAssembleSeedPrompt: AssembleSeedPromptFn =
    async () => MOCK_ASSEMBLED_SEED_PROMPT;

export const mockAssemblePlannerPrompt: (deps: AssemblePlannerPromptDeps) => Promise<AssembledPrompt> =
    async () => MOCK_ASSEMBLED_PLANNER_PROMPT;

export const mockAssembleTurnPrompt: (
    deps: AssembleTurnPromptDeps,
    params: AssembleTurnPromptParams,
) => Promise<AssembledPrompt> = async () => MOCK_ASSEMBLED_TURN_PROMPT;

export const mockAssembleContinuationPrompt: (deps: AssembleContinuationPromptDeps) => Promise<AssembledPrompt> =
    async () => MOCK_ASSEMBLED_CONTINUATION_PROMPT;

export const mockAssembleCompressionPrompt: AssembleCompressionPromptFn =
    async () => MOCK_ASSEMBLED_COMPRESSION_PROMPT;

export type IPromptAssemblerOverrides = Partial<IPromptAssembler>;

export function buildIPromptAssembler(overrides?: IPromptAssemblerOverrides): IPromptAssembler {
    const base: IPromptAssembler = {
        assemble: mockAssemble,
        assembleSeedPrompt: mockAssembleSeedPrompt,
        assemblePlannerPrompt: mockAssemblePlannerPrompt,
        assembleTurnPrompt: mockAssembleTurnPrompt,
        assembleContinuationPrompt: mockAssembleContinuationPrompt,
        assembleCompressionPrompt: mockAssembleCompressionPrompt,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type IPromptAssemblerCorruptions = { [K in keyof IPromptAssembler]?: unknown };

export function invalidateIPromptAssembler(corruptions: IPromptAssemblerCorruptions): unknown {
    return { ...buildIPromptAssembler(), ...corruptions };
}