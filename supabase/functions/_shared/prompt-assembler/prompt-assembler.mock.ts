import { spy, type Spy } from 'jsr:@std/testing@0.225.1/mock';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../../types_db.ts';
import type {
	ProjectContext,
	SessionContext,
	StageContext,
	DynamicContextVariables,
	ContributionOverride,
    AssemblerSourceDocument,
} from "./prompt-assembler.interface.ts";
import { PromptAssembler } from "./prompt-assembler.ts";
import { Messages } from "../types.ts";
import { createMockSupabaseClient } from "../supabase.mock.ts";

export class MockPromptAssembler extends PromptAssembler {
	public override assemble: Spy<PromptAssembler['assemble']>;
	public override gatherContext: Spy<PromptAssembler['gatherContext']>;
	public override render: Spy<PromptAssembler['render']>;
	public override gatherInputsForStage: Spy<PromptAssembler['gatherInputsForStage']>;
    public override gatherContinuationInputs: Spy<PromptAssembler['gatherContinuationInputs']>;

	constructor(supabaseClient?: SupabaseClient<Database>) {
        const clientToUse = supabaseClient || createMockSupabaseClient().client;
		super(clientToUse as SupabaseClient<Database>, undefined, undefined);

		this.assemble = spy(async (
			_project: ProjectContext,
			_session: SessionContext,
			_stage: StageContext,
			_projectInitialUserPrompt: string,
			_iterationNumber: number,
            _continuationContent?: string
		): Promise<string> => {
			return await Promise.resolve('mock assembled prompt');
		});
		this.gatherContext = spy(async (
			_project: ProjectContext,
			_session: SessionContext,
			_stage: StageContext,
			_projectInitialUserPrompt: string,
			_iterationNumber: number,
			_overrideContributions?: ContributionOverride[]
		): Promise<DynamicContextVariables> => {
			return await Promise.resolve({
				user_objective: 'mock user objective',
				domain: 'mock domain',
				agent_count: 1,
				context_description: 'mock context description',
                original_user_request: 'mock original user request',
				prior_stage_ai_outputs: 'mock prior stage ai outputs',
				prior_stage_user_feedback: 'mock prior stage user feedback',
				deployment_context: null,
				reference_documents: null,
				constraint_boundaries: null,
				stakeholder_considerations: null,
				deliverable_format: 'Standard markdown format.',
			});
		});
		this.render = spy(
			(
				_stage: StageContext,
				_context: DynamicContextVariables,
				_userProjectOverlayValues: Json | null = null,
			): string => {
				return 'mock rendered prompt';
			},
		);

		this.gatherInputsForStage = spy(async (
			_stage: StageContext,
			_project: ProjectContext,
			_session: SessionContext,
			_iterationNumber: number,
		): Promise<AssemblerSourceDocument[]> => {
			return await Promise.resolve([]);
		});

        this.gatherContinuationInputs = spy(async (
            _rootContributionId: string
        ): Promise<Messages[]> => {
            return await Promise.resolve([]);
        });
	}
}

export const createMockPromptAssembler = (
	supabaseClient?: SupabaseClient<Database>,
): MockPromptAssembler => {
	return new MockPromptAssembler(supabaseClient);
}; 