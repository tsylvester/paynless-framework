import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  RenderPromptFunctionType,
  AssembledPrompt,
} from "./prompt-assembler.interface.ts";
import { gatherContext } from "./gatherContext.ts";
import { render } from "./render.ts";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { GatherInputsForStageFn } from "./gatherInputsForStage.ts";
import { IFileManager, FileType } from "../types/file_manager.types.ts";

export type AssembleSeedPromptFn = (
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  gatherInputsForStageFn: GatherInputsForStageFn,
  renderPromptFn: RenderPromptFunctionType,
  fileManager: IFileManager,
  project: ProjectContext,
  session: SessionContext,
  stage: StageContext,
  projectInitialUserPrompt: string,
  iterationNumber: number,
) => Promise<AssembledPrompt>;

export async function assembleSeedPrompt(
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  gatherInputsForStageFn: GatherInputsForStageFn,
  renderPromptFn: RenderPromptFunctionType,
  fileManager: IFileManager,
  project: ProjectContext,
  session: SessionContext,
  stage: StageContext,
  projectInitialUserPrompt: string,
  iterationNumber: number,
): Promise<AssembledPrompt> {
  if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
    throw new Error(
      "PRECONDITION_FAILED: Session must have at least one selected model.",
    );
  }

  const context = await gatherContext(
    dbClient,
    downloadFromStorageFn,
    gatherInputsForStageFn,
    project,
    session,
    stage,
    projectInitialUserPrompt,
    iterationNumber,
    undefined,
  );

  const renderedPrompt = render(
    renderPromptFn,
    stage,
    context,
    project.user_domain_overlay_values,
  );

  const response = await fileManager.uploadAndRegisterFile({
    pathContext: {
      projectId: project.id,
      sessionId: session.id,
      iteration: iterationNumber,
      stageSlug: stage.slug,
      fileType: FileType.SeedPrompt,
    },
    fileContent: renderedPrompt,
    mimeType: "text/markdown",
    sizeBytes: new TextEncoder().encode(renderedPrompt).length,
    userId: project.user_id,
    description: `Seed prompt for stage: ${stage.slug}`,
  });

  if (response.error) {
    throw new Error(
      `Failed to save seed prompt: ${response.error.message}`,
    );
  }

  return {
    promptContent: renderedPrompt,
    source_prompt_resource_id: response.record.id,
  };
}
