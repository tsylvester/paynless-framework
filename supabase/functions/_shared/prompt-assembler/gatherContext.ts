import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import {
  DynamicContextVariables,
  ProjectContext,
  SessionContext,
  StageContext,
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
): Promise<DynamicContextVariables> {
  try {
    const gatheredContext: GatheredRecipeContext = await gatherInputsForStageFn(
      dbClient,
      downloadFromStorageFn,
      stage,
      project,
      session,
      iterationNumber,
    );

    const dynamicContextVariables: DynamicContextVariables = {
      user_objective: project.project_name,
      domain: project.dialectic_domains.name,
      context_description: projectInitialUserPrompt,
      original_user_request: hasProcessingStrategy(stage.recipe_step)
        ? projectInitialUserPrompt
        : "",
      recipeStep: gatheredContext.recipeStep,
      sourceDocuments: gatheredContext.sourceDocuments,
    };

    // Merge overlay values from project and stage, with stage-specific values taking precedence
    const mergedOverlays: Record<string, unknown> = {};
    if (project.user_domain_overlay_values) {
      Object.assign(mergedOverlays, project.user_domain_overlay_values);
    }
    if (stage.domain_specific_prompt_overlays) {
      for (const overlay of stage.domain_specific_prompt_overlays) {
        if (overlay.overlay_values) {
          Object.assign(mergedOverlays, overlay.overlay_values);
        }
      }
    }

    // Conditionally add optional properties from the merged overlays
    if (mergedOverlays.deployment_context && typeof mergedOverlays.deployment_context === 'string') {
      dynamicContextVariables.deployment_context = mergedOverlays.deployment_context;
    }
    if (mergedOverlays.reference_documents && typeof mergedOverlays.reference_documents === 'string') {
      dynamicContextVariables.reference_documents = mergedOverlays.reference_documents;
    }
    if (mergedOverlays.constraint_boundaries && typeof mergedOverlays.constraint_boundaries === 'string') {
      dynamicContextVariables.constraint_boundaries = mergedOverlays.constraint_boundaries;
    }
    if (mergedOverlays.stakeholder_considerations && typeof mergedOverlays.stakeholder_considerations === 'string') {
      dynamicContextVariables.stakeholder_considerations = mergedOverlays.stakeholder_considerations;
    }
    if (mergedOverlays.deliverable_format && typeof mergedOverlays.deliverable_format === 'string') {
      dynamicContextVariables.deliverable_format = mergedOverlays.deliverable_format;
    }

    return dynamicContextVariables;
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
