import { Tables, Database } from "../../types_db.ts";
import {
  DialecticJobRow,
  DialecticRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";
import { GatherContextFn } from "./gatherContext.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { IFileManager } from "../types/file_manager.types.ts";
import { DownloadStorageResult, DownloadFromStorageFn } from "../supabase_storage_utils.ts";
import { GatherInputsForStageFn } from "./gatherInputsForStage.ts";
import { Json } from "../../types_db.ts";
import { InputRule } from "../../dialectic-service/dialectic.interface.ts";

export type RenderFn = (
  renderPromptFn: RenderPromptFunctionType,
  stage: StageContext,
  context: DynamicContextVariables,
  userProjectOverlayValues: Json | null,
) => string;

export interface AssembleTurnPromptDeps {
  dbClient: SupabaseClient<Database>;
  fileManager: IFileManager;
  gatherContext: GatherContextFn;
  render: RenderFn;
  downloadFromStorage: DownloadFromStorageFn;
}

export interface AssembleTurnPromptParams {
  job: DialecticJobRow;
  project: ProjectContext;
  session: SessionContext;
  stage: StageContext;
  sourceContributionId?: string | null;
}

export interface AssembleContinuationPromptDeps {
  dbClient: SupabaseClient<Database>;
  fileManager: IFileManager;
  job: DialecticJobRow;
  project: ProjectContext;
  session: SessionContext;
  stage: StageContext;
  continuationContent: string;
  gatherContext: GatherContextFn;
  sourceContributionId?: string | null;
}
export interface AssemblePlannerPromptDeps {
  dbClient: SupabaseClient<Database>;
  fileManager: IFileManager;
  job: DialecticJobRow;
  project: ProjectContext;
  session: SessionContext;
  stage: StageContext;
  projectInitialUserPrompt: string;
  gatherContext: GatherContextFn;
  render: RenderFn;
  sourceContributionId?: string | null;
}

export interface AssembleSeedPromptDeps {
    dbClient: SupabaseClient<Database>;
    downloadFromStorageFn: (
      bucket: string,
      path: string,
    ) => Promise<DownloadStorageResult>;
    gatherInputsForStageFn: GatherInputsForStageFn;
    renderPromptFn: RenderPromptFunctionType;
    fileManager: IFileManager;
    project: ProjectContext;
    session: SessionContext;
    stage: StageContext;
    projectInitialUserPrompt: string;
    iterationNumber: number;
    sourceContributionId?: string | null;
  }
  
  export type AssembleSeedPromptFn = (
    deps: AssembleSeedPromptDeps,
  ) => Promise<AssembledPrompt>;
  
export interface IPromptAssembler {
    assemble(options: AssemblePromptOptions): Promise<AssembledPrompt>;
    assembleSeedPrompt(
        deps: AssembleSeedPromptDeps,
    ): Promise<AssembledPrompt>;
    assemblePlannerPrompt(
        deps: AssemblePlannerPromptDeps,
    ): Promise<AssembledPrompt>;
    assembleTurnPrompt(
        deps: AssembleTurnPromptDeps,
        params: AssembleTurnPromptParams,
    ): Promise<AssembledPrompt>;
    assembleContinuationPrompt(
        deps: AssembleContinuationPromptDeps,
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
    sourceContributionId?: string | null;
};

export type DynamicContextVariables = {
    user_objective: string,
    domain: string,
    context_description: string,
    original_user_request: string;
    deployment_context?: string,
    reference_documents?: string,
    constraint_boundaries?: string,
    stakeholder_considerations?: string,
    deliverable_format?: string,
    recipeStep: DialecticRecipeStep;
    sourceDocuments?: AssemblerSourceDocument[];
}

export type RenderContext = Record<string, unknown>;

export type GatheredRecipeContext = {
    sourceDocuments: AssemblerSourceDocument[];
    recipeStep: DialecticRecipeStep;
};

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
	type: InputRule['type'];
	content: string;
	metadata: {
		displayName: string;
		header?: string;
		modelName?: string;
	}
}