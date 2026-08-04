import type { BoundAssembleContinuationPromptFn } from "../prompt-assembler.interface.ts";
import { buildAssembledPrompt } from "../prompt-assembler.mock.ts";

export const mockBoundAssembleContinuationPrompt: BoundAssembleContinuationPromptFn = async (_job) => {
    return buildAssembledPrompt();
};
