import { Json, Tables } from "../types_db.ts";

export interface IPromptAssembler {
    assemble(
        project: ProjectContext, 
        session: SessionContext,
        stage: StageContext,
        projectInitialUserPrompt: string,
        iterationNumber: number,
        continuationContent?: string,
    ): Promise<string>;

    gatherContext(
        project: ProjectContext,
        session: SessionContext,
        stage: StageContext,
        projectInitialUserPrompt: string,
        iterationNumber: number,
        overrideContributions?: ContributionOverride[],
    ): Promise<DynamicContextVariables>;

    render(
        stage: StageContext,
        context: DynamicContextVariables,
        userProjectOverlayValues?: Json | null
    ): string;

    gatherInputsForStage(
        stage: StageContext, 
        project: ProjectContext, 
        session: SessionContext, 
        iterationNumber: number
    ): Promise<AssemblerSourceDocument[]>;
}

export type DynamicContextVariables = {
    user_objective: string,
    domain: string,
    agent_count: number,
    context_description: string,
    original_user_request: string | null;
    prior_stage_ai_outputs: string,
    prior_stage_user_feedback: string,
    deployment_context: string | null,
    reference_documents: string | null,
    constraint_boundaries: string | null,
    stakeholder_considerations: string | null,
    deliverable_format: string | null
}

export type ProjectContext = Tables<'dialectic_projects'> & {
    dialectic_domains: Pick<Tables<'dialectic_domains'>, 'name'>,
    user_domain_overlay_values?: Tables<'domain_specific_prompt_overlays'>['overlay_values']
};

export type SessionContext = Tables<'dialectic_sessions'>;

export type StageContext = Tables<'dialectic_stages'> & {
    system_prompts: Pick<Tables<'system_prompts'>, 'prompt_text'> | null,
    domain_specific_prompt_overlays: Pick<Tables<'domain_specific_prompt_overlays'>, 'overlay_values'>[]
};

// Define the signature for the renderPrompt function
export type RenderPromptFunctionType = (
    basePromptText: string,
    dynamicContextVariables: DynamicContextVariables,
    systemDefaultOverlayValues?: Tables<'domain_specific_prompt_overlays'>['overlay_values'] | null,
    userProjectOverlayValues?: Tables<'domain_specific_prompt_overlays'>['overlay_values'] | null
) => string;

export type ContributionOverride = {
    content: string;

};
// Define a granular document type
export interface AssemblerSourceDocument {
	id: string;
	type: 'contribution' | 'feedback';
	content: string;
	metadata: {
		displayName: string;
		header?: string;
		modelName?: string;
	}
}