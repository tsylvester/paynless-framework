import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  AssembleContinuationPromptDeps,
  AssembledPrompt,
  BoundAssembleContinuationPromptFn,
} from "../prompt-assembler.interface.ts";

Deno.test(
  "Contract: the six recipe-stage members of AssembleContinuationPromptDeps are optional — each Pick accepts an empty object, the COMPRESS caller's shape",
  () => {
    const project: Pick<AssembleContinuationPromptDeps, "project"> = {};
    const session: Pick<AssembleContinuationPromptDeps, "session"> = {};
    const stage: Pick<AssembleContinuationPromptDeps, "stage"> = {};
    const gatherContext: Pick<AssembleContinuationPromptDeps, "gatherContext"> = {};
    const assembleChunks: Pick<AssembleContinuationPromptDeps, "assembleChunks"> = {};
    const gatherContinuationInputs: Pick<AssembleContinuationPromptDeps, "gatherContinuationInputs"> = {};
    assertEquals(Object.keys(project).length, 0);
    assertEquals(Object.keys(session).length, 0);
    assertEquals(Object.keys(stage).length, 0);
    assertEquals(Object.keys(gatherContext).length, 0);
    assertEquals(Object.keys(assembleChunks).length, 0);
    assertEquals(Object.keys(gatherContinuationInputs).length, 0);
  },
);

Deno.test(
  "Contract: AssembleContinuationPromptDeps declares every member including all six optional ones and constructStoragePath — the widening is additive",
  () => {
    const surface: Record<keyof AssembleContinuationPromptDeps, true> = {
      dbClient: true,
      fileManager: true,
      job: true,
      project: true,
      session: true,
      stage: true,
      gatherContext: true,
      assembleChunks: true,
      gatherContinuationInputs: true,
      downloadFromStorage: true,
      sourceContributionId: true,
      constructStoragePath: true,
    };
    assertEquals(Object.keys(surface).length, 12);
  },
);

Deno.test(
  "Contract: constructStoragePath is a required member of AssembleContinuationPromptDeps — a surface record naming only it type-checks",
  () => {
    const surface: Record<keyof Pick<AssembleContinuationPromptDeps, "constructStoragePath">, true> = {
      constructStoragePath: true,
    };
    assertEquals(Object.keys(surface).length, 1);
  },
);

Deno.test(
  "Contract: BoundAssembleContinuationPromptFn resolves to Promise<AssembledPrompt> — the injection shape processJob supplies and processCompressJob declares",
  () => {
    const success: AssembledPrompt = {
      promptContent: "continuation prompt",
      source_prompt_resource_id: "resource-1",
    };
    const returned: ReturnType<BoundAssembleContinuationPromptFn> = Promise.resolve(success);
    const declared: Promise<AssembledPrompt> = returned;
    assertEquals(declared instanceof Promise, true);
  },
);
