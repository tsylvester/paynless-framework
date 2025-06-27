import { SupabaseClient } from "@supabase/supabase-js";
import { Database, Tables } from "../types_db.ts";

export type DynamicContextVariables = {
    user_objective: string,
    domain: string,
    agent_count: number,
    context_description: string,
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

export type DownloadStorageFunctionType = (
    client: SupabaseClient<Database>,
    bucket: string,
    path: string,
) => Promise<{ data: ArrayBuffer | null; error: Error | null }>;
