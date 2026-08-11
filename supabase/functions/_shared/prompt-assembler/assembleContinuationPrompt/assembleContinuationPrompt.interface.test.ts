import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  AssembleContinuationPromptDeps,
  AssembleContinuationPromptError,
  AssembleContinuationPromptErrorReturn,
  AssembleContinuationPromptReturn,
  AssembledPrompt,
  BoundAssembleContinuationPromptFn,
  ReadArtifactReturn,
  ReadArtifactSuccessReturn,
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
  "Contract: BoundAssembleContinuationPromptFn's awaited return is AssembleContinuationPromptReturn, which admits AssembledPrompt and AssembleContinuationPromptErrorReturn",
  async () => {
    const success: AssembledPrompt = {
      promptContent: "continuation prompt",
      source_prompt_resource_id: "resource-1",
    };
    const errorArm: AssembleContinuationPromptErrorReturn = {
      error: new Error("continuation failed"),
      retriable: false,
    };
    const fromSuccess: AssembleContinuationPromptReturn = success;
    const fromError: AssembleContinuationPromptReturn = errorArm;
    const returned: ReturnType<BoundAssembleContinuationPromptFn> = Promise.resolve(fromSuccess);
    const awaited: Awaited<ReturnType<BoundAssembleContinuationPromptFn>> = await returned;
    const asUnion: AssembleContinuationPromptReturn = awaited;
    assertEquals(fromSuccess === success, true);
    assertEquals(fromError === errorArm, true);
    assertEquals(asUnion === success, true);
  },
);

Deno.test(
  "Contract: AssembleContinuationPromptErrorReturn is { error: AssembleContinuationPromptError; retriable: boolean } — neither promptContent nor source_prompt_resource_id is a member",
  () => {
    const err: AssembleContinuationPromptError = new Error("continuation failed");
    const retriable: boolean = false;
    const errorArm: AssembleContinuationPromptErrorReturn = { error: err, retriable };
    const surface: Record<keyof AssembleContinuationPromptErrorReturn, true> = {
      error: true,
      retriable: true,
    };
    assertEquals(errorArm.error instanceof Error, true);
    assertEquals(typeof errorArm.retriable, "boolean");
    assertEquals(Object.keys(surface).length, 2);
  },
);

Deno.test(
  "Contract: ReadArtifactReturn admits ReadArtifactSuccessReturn and AssembleContinuationPromptErrorReturn — the helper's error arm is this function's own error type, not a second shape",
  () => {
    const success: ReadArtifactSuccessReturn = { content: "decoded artifact text" };
    const fromSuccess: ReadArtifactReturn = success;
    const errorArm: AssembleContinuationPromptErrorReturn = {
      error: new Error("artifact read failed"),
      retriable: true,
    };
    const fromError: ReadArtifactReturn = errorArm;
    assertEquals(fromSuccess === success, true);
    assertEquals(fromError === errorArm, true);
  },
);
