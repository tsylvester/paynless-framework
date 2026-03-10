import { spy, type Spy } from 'jsr:@std/testing@0.225.1/mock';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import {
	AssemblePromptOptions,
	AssembledPrompt,
	AssembleSeedPromptDeps,
	AssemblePlannerPromptDeps,
	AssembleTurnPromptDeps,
	AssembleContinuationPromptDeps,
} from './prompt-assembler.interface.ts';
import { PromptAssembler } from "./prompt-assembler.ts";
import { createMockSupabaseClient } from "../supabase.mock.ts";
import { IFileManager } from '../types/file_manager.types.ts';
import { MockFileManagerService } from '../services/file_manager.mock.ts';

export class MockPromptAssembler extends PromptAssembler {
	public override assemble: Spy<PromptAssembler['assemble']>;
	public override assembleSeedPrompt: Spy<PromptAssembler['assembleSeedPrompt']>;
	public override assemblePlannerPrompt: Spy<PromptAssembler['assemblePlannerPrompt']>;
	public override assembleTurnPrompt: Spy<PromptAssembler['assembleTurnPrompt']>;
	public override assembleContinuationPrompt: Spy<PromptAssembler['assembleContinuationPrompt']>;

	constructor(
		supabaseClient?: SupabaseClient<Database>,
		fileManager?: IFileManager,
	) {
		const clientToUse = supabaseClient || createMockSupabaseClient().client;
		const fileManagerToUse = fileManager || new MockFileManagerService();
		super(
			clientToUse as SupabaseClient<Database>,
			fileManagerToUse,
			undefined,
		);

		this.assemble = spy(
			async (
				_options: AssemblePromptOptions,
			): Promise<AssembledPrompt> => {
				return await Promise.resolve(MOCK_ASSEMBLED_PROMPT);
			},
		);

		this.assembleSeedPrompt = spy(
			async (
				_deps: AssembleSeedPromptDeps,
			): Promise<AssembledPrompt> => {
				return await Promise.resolve(MOCK_ASSEMBLED_SEED_PROMPT);
			},
		);

		this.assemblePlannerPrompt = spy(
			async (
				_deps: AssemblePlannerPromptDeps,
			): Promise<AssembledPrompt> => {
				return await Promise.resolve(MOCK_ASSEMBLED_PLANNER_PROMPT);
			},
		);

		this.assembleTurnPrompt = spy(
			async (
				_deps: AssembleTurnPromptDeps,
			): Promise<AssembledPrompt> => {
				return await Promise.resolve(MOCK_ASSEMBLED_TURN_PROMPT);
			},
		);

		this.assembleContinuationPrompt = spy(
			async (
				_deps: AssembleContinuationPromptDeps,
			): Promise<AssembledPrompt> => {
				return await Promise.resolve(MOCK_ASSEMBLED_CONTINUATION_PROMPT);
			},
		);
	}
}

export const createMockPromptAssembler = (
	supabaseClient?: SupabaseClient<Database>,
): MockPromptAssembler => {
	return new MockPromptAssembler(supabaseClient);
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