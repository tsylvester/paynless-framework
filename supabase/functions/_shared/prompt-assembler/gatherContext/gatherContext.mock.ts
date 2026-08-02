import type { GatherContextFn } from "./gatherContext.ts";
import { buildDynamicContextVariables } from "../prompt-assembler.mock.ts";

export const mockGatherContext: GatherContextFn = async (
  _dbClient,
  _downloadFromStorageFn,
  _gatherInputsForStageFn,
  _project,
  _session,
  _stage,
  _projectInitialUserPrompt,
  _iterationNumber,
  _modelId,
) => {
  return buildDynamicContextVariables();
};
