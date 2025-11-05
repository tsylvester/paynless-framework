import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import {
  DynamicContextVariables,
  ProjectContext,
  SessionContext,
  StageContext,
  ContributionOverride,
  GatheredRecipeContext,
} from "./prompt-assembler.interface.ts";
import { hasProcessingStrategy } from "../utils/type_guards.ts";
import { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { GatherInputsForStageFn } from "./gatherInputsForStage.ts";

export type GatherContextFn = (
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  gatherInputsForStageFn: GatherInputsForStageFn,
  project: ProjectContext,
  session: SessionContext,
  stage: StageContext,
  projectInitialUserPrompt: string,
  iterationNumber: number,
  overrideContributions?: ContributionOverride[],
) => Promise<DynamicContextVariables>;

export async function gatherContext(
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  gatherInputsForStageFn: GatherInputsForStageFn,
  project: ProjectContext,
  session: SessionContext,
  stage: StageContext,
  projectInitialUserPrompt: string,
  iterationNumber: number,
  overrideContributions?: ContributionOverride[],
): Promise<DynamicContextVariables> {
    if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
        throw new Error("PRECONDITION_FAILED: Session must have at least one selected model.");
    }

  let priorStageContributions = "";
  let priorStageFeedback = "";
  let recipeStep = stage.recipe_step;

  if (overrideContributions) {
    for (const contrib of overrideContributions) {
      priorStageContributions +=
        `#### Contribution from AI Model\n${contrib.content}\n\n`;
    }
  } else {
    try {
      const gatheredContext: GatheredRecipeContext = await gatherInputsForStageFn(
        dbClient,
        downloadFromStorageFn,
        stage,
        project,
        session,
        iterationNumber,
      );
      recipeStep = gatheredContext.recipeStep;

      // If under limit, format the documents normally
      for (const doc of gatheredContext.sourceDocuments) {
        if (doc.type === "document") {
          const blockHeader = doc.metadata.header
            ? `${doc.metadata.header}\n\n`
            : `### Contributions from ${doc.metadata.displayName} Stage\n\n`;
          priorStageContributions += blockHeader;
          priorStageContributions +=
            `#### Contribution from ${
              doc.metadata.modelName || "AI Model"
            }\n${doc.content}\n\n`;
        } else if (doc.type === "feedback") {
          const blockHeader = doc.metadata.header
            ? `${doc.metadata.header}\n---\n\n`
            : `### User Feedback on Previous Stage: ${doc.metadata.displayName}\n---\n\n`;
          priorStageFeedback += `${blockHeader}${doc.content}\n\n---\n`;
        }
      }
    } catch (inputError) {
      console.error(
        `[gatherContext] Error during input gathering: ${
          (inputError instanceof Error) ? inputError.message : String(inputError)
        }`,
        {
          error: inputError,
          stageSlug: stage.slug,
          projectId: project.id,
          sessionId: session.id,
        },
      );
      throw new Error(
        `Failed to gather inputs for prompt assembly: ${
          (inputError instanceof Error) ? inputError.message : String(inputError)
        }`,
      );
    }
  }

  const dynamicContextVariables: DynamicContextVariables = {
    user_objective: project.project_name,
    domain: project.dialectic_domains.name,
    agent_count: session.selected_model_ids?.length ?? 1,
    context_description: projectInitialUserPrompt,
    original_user_request: hasProcessingStrategy(stage.recipe_step)
      ? projectInitialUserPrompt
      : null,
    prior_stage_ai_outputs: priorStageContributions,
    prior_stage_user_feedback: priorStageFeedback,
    deployment_context: null,
    reference_documents: null,
    constraint_boundaries: null,
    stakeholder_considerations: null,
    deliverable_format: "Standard markdown format.",
    recipeStep: recipeStep,
  };

  return dynamicContextVariables;
}
