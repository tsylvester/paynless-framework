import { spy, type Spy } from 'jsr:@std/testing@0.225.1/mock';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import type {
	ProjectContext,
	SessionContext,
	StageContext,
	DynamicContextVariables,
} from './prompt-assembler.interface.ts';
import type { ContributionOverride } from './prompt-assembler.ts';
import { PromptAssembler } from './prompt-assembler.ts';

export class MockPromptAssembler extends PromptAssembler {
	public override assemble: Spy<PromptAssembler['assemble']>;
	public override gatherContext: Spy<PromptAssembler['gatherContext']>;
	public override render: Spy<PromptAssembler['render']>;
	public override gatherInputsForStage: Spy<PromptAssembler['gatherInputsForStage']>;
	public override getContextDocuments: Spy<PromptAssembler['getContextDocuments']>;

	constructor(supabaseClient?: SupabaseClient<Database>) {
		// deno-lint-ignore no-explicit-any
		super(supabaseClient as any, undefined, undefined);

		this.assemble = spy(async (
			_project: ProjectContext,
			_session: SessionContext,
			_stage: StageContext,
			_projectInitialUserPrompt: string,
			_iterationNumber: number,
		): Promise<string> => {
			return await Promise.resolve('mock assembled prompt');
		});
		this.gatherContext = spy(async (
			_project: ProjectContext,
			_session: SessionContext,
			_stage: StageContext,
			_projectInitialUserPrompt: string,
			_iterationNumber: number,
			_overrideContributions?: ContributionOverride[],
		): Promise<DynamicContextVariables> => {
			return await Promise.resolve({
				user_objective: 'mock user objective',
				domain: 'mock domain',
				agent_count: 1,
				context_description: 'mock context description',
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
		): Promise<{ priorStageContributions: string; priorStageFeedback: string }> => {
			return await Promise.resolve({
				priorStageContributions: 'mock prior stage contributions',
				priorStageFeedback: 'mock prior stage feedback',
			});
		});

		this.getContextDocuments = spy(
			async (
				_projectContext: ProjectContext,
				_stageContext: StageContext,
			): Promise<string[] | null> => {
				return await Promise.resolve(['mock document 1', 'mock document 2']);
			},
		);
	}
}

export const createMockPromptAssembler = (
	supabaseClient?: SupabaseClient<Database>,
): MockPromptAssembler => {
	return new MockPromptAssembler(supabaseClient);
}; 