import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  RenderPromptFunctionType,
} from "./prompt-assembler.interface.ts";
import { gatherContext } from "./gatherContext.ts";
import { render } from "./render.ts";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { GatherInputsForStageFn } from "./gatherInputsForStage.ts";

export type AssembleFn = (
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  gatherInputsForStageFn: GatherInputsForStageFn,
  renderPromptFn: RenderPromptFunctionType,
  project: ProjectContext,
  session: SessionContext,
  stage: StageContext,
  projectInitialUserPrompt: string,
  iterationNumber: number,
  continuationContent?: string,
) => Promise<string>;

export async function assemble(
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  gatherInputsForStageFn: GatherInputsForStageFn,
  renderPromptFn: RenderPromptFunctionType,
  project: ProjectContext,
  session: SessionContext,
  stage: StageContext,
  projectInitialUserPrompt: string,
  iterationNumber: number,
  continuationContent?: string,
): Promise<string> {
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

  if (continuationContent) {
    return `${renderedPrompt} ${continuationContent}`;
  }

  return renderedPrompt;
}
