import {
  AssembledPrompt,
  AssembleSeedPromptDeps,
} from "./prompt-assembler.interface.ts";
import { gatherContext } from "./gatherContext.ts";
import { render } from "./render.ts";
import { FileType } from "../types/file_manager.types.ts";

export async function assembleSeedPrompt(
  {
    dbClient,
    downloadFromStorageFn,
    gatherInputsForStageFn,
    renderPromptFn,
    fileManager,
    project,
    session,
    stage,
    projectInitialUserPrompt,
    iterationNumber,
  }: AssembleSeedPromptDeps,
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
