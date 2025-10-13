import { Tables } from "../../types_db.ts";
import { DialecticJobRow, DialecticRecipeStep } from "../../dialectic-service/dialectic.interface.ts";

export interface IPromptAssembler {
    assemble(options: AssemblePromptOptions): Promise<AssembledPrompt>;
    assembleSeedPrompt(
        project: ProjectContext, 
        session: SessionContext,
        stage: StageContext,
        projectInitialUserPrompt: string,
        iterationNumber: number
    ): Promise<AssembledPrompt>;
    assemblePlannerPrompt(
        job: DialecticJobRow, 
        project: ProjectContext, 
        session: SessionContext, 
        stage: StageContext
    ): Promise<AssembledPrompt>;
    assembleTurnPrompt(
        job: DialecticJobRow, 
        project: ProjectContext, 
        session: SessionContext, 
        stage: StageContext
    ): Promise<AssembledPrompt>;
    assembleContinuationPrompt(
        job: DialecticJobRow, 
        project: ProjectContext, 
        session: SessionContext, 
        stage: StageContext, 
        continuationContent: string
    ): Promise<AssembledPrompt>;
}

export type AssembledPrompt = {
    promptContent: string;
    source_prompt_resource_id: string;
};

export type AssemblePromptOptions = {
    project: ProjectContext;
    session: SessionContext;
    stage: StageContext;
    projectInitialUserPrompt: string;
    iterationNumber: number;
    job?: DialecticJobRow;
    continuationContent?: string;
};

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
    recipe_step: DialecticRecipeStep;
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