import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Json, Tables } from "../types_db.ts";
import { renderPrompt } from "./prompt-renderer.ts";

export type ProjectContext = Tables<'dialectic_projects'> & {
    dialectic_domains: Pick<Tables<'dialectic_domains'>, 'name'>
};

export type SessionContext = Tables<'dialectic_sessions'>;

export type StageContext = Tables<'dialectic_stages'> & {
    system_prompts: Pick<Tables<'system_prompts'>, 'prompt_text'> | null,
    domain_specific_prompt_overlays: Pick<Tables<'domain_specific_prompt_overlays'>, 'overlay_values'>[]
};

export class PromptAssembler {
    private dbClient: SupabaseClient<Database>;

    constructor(dbClient: SupabaseClient<Database>) {
        this.dbClient = dbClient;
    }

    async assemble(
        project: ProjectContext, 
        session: SessionContext,
        stage: StageContext,
        initialPromptContent: string
    ): Promise<string> {

        // 1. Assemble Dynamic Context Variables
        const dynamicContextVariables: Record<string, unknown> = {};

        dynamicContextVariables.user_objective = project.project_name;
        dynamicContextVariables.domain = project.dialectic_domains.name;
        dynamicContextVariables.agent_count = session.selected_model_catalog_ids?.length ?? 1;
        dynamicContextVariables.context_description = initialPromptContent;
        
        // TODO: Get prior stage outputs for stages other than the first one.
        // For now, these are placeholders for the initial stage.
        dynamicContextVariables.prior_stage_outputs = 'N/A for initial stage.';

        // Placeholders for optional values. In a future step, these could be read from user inputs.
        dynamicContextVariables.deployment_context = 'Not provided.';
        dynamicContextVariables.reference_documents = 'Not provided.';
        dynamicContextVariables.constraint_boundaries = 'Not provided.';
        dynamicContextVariables.stakeholder_considerations = 'Not provided.';
        dynamicContextVariables.deliverable_format = 'Standard markdown format.'; // System default
        
        // 2. Get Overlay values
        const systemDefaultOverlayValues = stage.domain_specific_prompt_overlays[0]?.overlay_values ?? null;
        
        // TODO: Support user-specific overlays
        const userProjectOverlayValues = null;

        // 3. Get Base Prompt Text
        const basePromptText = stage.system_prompts?.prompt_text;
        if (!basePromptText) {
            throw new Error(`No system prompt template found for stage ${stage.id}`);
        }

        // 4. Render the prompt
        const renderedPrompt = renderPrompt(
            basePromptText,
            dynamicContextVariables,
            systemDefaultOverlayValues,
            userProjectOverlayValues
        );

        return renderedPrompt;
    }
} 