import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FileType, DialecticStageSlug } from "../../types/file_manager.types.ts";
import type {
  AssembleCompressionPromptDeps,
  AssembleCompressionPromptErrorReturn,
  AssembleCompressionPromptFn,
  AssembleCompressionPromptParams,
  AssembleCompressionPromptPayload,
  AssembleCompressionPromptReturn,
  AssembleCompressionPromptSuccessReturn,
  BoundAssembleCompressionPromptFn,
  CompressionTargetStep,
} from "./assembleCompressionPrompt.interface.ts";

Deno.test(
  "Contract: AssembleCompressionPromptDeps declares exactly dbClient, renderPromptFn, logger, fileManager, and constructStoragePath",
  () => {
    const surface: Record<keyof AssembleCompressionPromptDeps, true> = {
      dbClient: true,
      renderPromptFn: true,
      logger: true,
      fileManager: true,
      constructStoragePath: true,
    };
    assertEquals(Object.keys(surface).length, 5);
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptDeps['renderPromptFn'] accepts a stub matching the renderPrompt signature",
  () => {
    const fn: AssembleCompressionPromptDeps["renderPromptFn"] = (
      _basePromptText,
      _dynamicContextVariables,
      _systemDefaultOverlayValues,
      _userProjectOverlayValues,
    ) => "rendered";
    assertEquals(typeof fn, "function");
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptParams declares exactly the thirteen expected members",
  () => {
    const surface: Record<keyof AssembleCompressionPromptParams, true> = {
      consumingStep: true,
      projectId: true,
      sessionId: true,
      iterationNumber: true,
      stageSlug: true,
      output_type: true,
      sourceType: true,
      documentKey: true,
      sourceId: true,
      role: true,
      modelSlug: true,
      attemptCount: true,
      userId: true,
    };
    assertEquals(Object.keys(surface).length, 13);
  },
);

Deno.test(
  "Contract: CompressionTargetStep declares exactly outputs_required and step_description",
  () => {
    const surface: Record<keyof CompressionTargetStep, true> = {
      outputs_required: true,
      step_description: true,
    };
    assertEquals(Object.keys(surface).length, 2);
  },
);

Deno.test(
  "Contract: CompressionTargetStep accepts a minimal consuming-step slice",
  () => {
    const target: CompressionTargetStep = {
      outputs_required: {},
      step_description: "Compress context for downstream document generation.",
    };
    assertEquals(typeof target.outputs_required, "object");
    assertEquals(typeof target.step_description, "string");
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptParams.consumingStep is assignable from CompressionTargetStep",
  () => {
    const target: CompressionTargetStep = {
      outputs_required: {},
      step_description: "Compress context for downstream document generation.",
    };
    const params: AssembleCompressionPromptParams = {
      consumingStep: target,
      projectId: "project-123",
      sessionId: "session-123",
      iterationNumber: 1,
      stageSlug: DialecticStageSlug.Thesis,
      output_type: FileType.business_case,
      sourceType: "resource",
      documentKey: FileType.business_case,
      modelSlug: "claude-3-opus",
      attemptCount: 0,
      userId: "user-123",
    };
    assertEquals(params.consumingStep.step_description, target.step_description);
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptParams accepts a 'resource' victim with documentKey and no sourceId/role",
  () => {
    const target: CompressionTargetStep = {
      outputs_required: {},
      step_description: "Compress the source for the next agent.",
    };
    const params: AssembleCompressionPromptParams = {
      consumingStep: target,
      projectId: "project-123",
      sessionId: "session-123",
      iterationNumber: 1,
      stageSlug: DialecticStageSlug.Thesis,
      output_type: FileType.business_case,
      sourceType: "resource",
      documentKey: FileType.business_case,
      modelSlug: "claude-3-opus",
      attemptCount: 0,
      userId: "user-123",
    };
    assertEquals(params.sourceType, "resource");
    assertEquals("documentKey" in params, true);
    assertEquals("sourceId" in params, false);
    assertEquals("role" in params, false);
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptParams accepts a 'history' victim with sourceId and role and no documentKey",
  () => {
    const target: CompressionTargetStep = {
      outputs_required: {},
      step_description: "Compress the source for the next agent.",
    };
    const params: AssembleCompressionPromptParams = {
      consumingStep: target,
      projectId: "project-123",
      sessionId: "session-123",
      iterationNumber: 1,
      stageSlug: DialecticStageSlug.Thesis,
      output_type: FileType.business_case,
      sourceType: "history",
      sourceId: "msg-123",
      role: "user",
      modelSlug: "claude-3-opus",
      attemptCount: 0,
      userId: "user-123",
    };
    assertEquals(params.sourceType, "history");
    assertEquals("sourceId" in params, true);
    assertEquals("role" in params, true);
    assertEquals("documentKey" in params, false);
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptPayload accepts mode and content; chunk fields are optional",
  async (t) => {
    await t.step("with all fields", () => {
      const mode: AssembleCompressionPromptPayload["mode"] = "json";
      const payload: AssembleCompressionPromptPayload = {
        mode,
        content: "source content",
        chunk_index: 1,
        chunk_total: 2,
      };
      assertEquals(payload.mode, "json");
      assertEquals(payload.content, "source content");
      assertEquals(payload.chunk_index, 1);
      assertEquals(payload.chunk_total, 2);
    });

    await t.step("without chunk fields", () => {
      const mode: AssembleCompressionPromptPayload["mode"] = "text";
      const payload: AssembleCompressionPromptPayload = {
        mode,
        content: "source content",
      };
      assertEquals(payload.mode, "text");
      assertEquals(payload.content, "source content");
      assertEquals("chunk_index" in payload, false);
      assertEquals("chunk_total" in payload, false);
    });
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptSuccessReturn is { promptContent: string; source_prompt_resource_id: string }",
  () => {
    const success: AssembleCompressionPromptSuccessReturn = {
      promptContent: "compressed prompt",
      source_prompt_resource_id: "resource-123",
    };
    const ret: AssembleCompressionPromptReturn = success;
    if ("error" in ret) {
      throw new Error("expected success branch");
    }
    assertEquals(ret.promptContent, "compressed prompt");
    assertEquals(ret.source_prompt_resource_id, "resource-123");
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptErrorReturn is { error: Error | FileManagerError; retriable: boolean }",
  () => {
    const error: AssembleCompressionPromptErrorReturn = {
      error: new Error("failed"),
      retriable: false,
    };
    assertEquals("error" in error, true);
    assertEquals("retriable" in error, true);
    assertEquals(error.error instanceof Error, true);
    assertEquals(typeof error.retriable, "boolean");
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptReturn is a discriminated union of success and error",
  async (t) => {
    await t.step("success branch is assignable", () => {
      const success: AssembleCompressionPromptSuccessReturn = {
        promptContent: "compressed prompt",
        source_prompt_resource_id: "resource-123",
      };
      const ret: AssembleCompressionPromptReturn = success;
      if ("error" in ret) {
        throw new Error("expected success branch");
      }
      assertEquals(ret.promptContent, "compressed prompt");
      assertEquals(ret.source_prompt_resource_id, "resource-123");
    });

    await t.step("error branch is assignable with an Error", () => {
      const error: AssembleCompressionPromptErrorReturn = {
        error: new Error("failed"),
        retriable: true,
      };
      const ret: AssembleCompressionPromptReturn = error;
      if ("error" in ret) {
        assertEquals(ret.retriable, true);
      } else {
        throw new Error("expected error branch");
      }
    });

    await t.step("error branch is assignable with a FileManagerError", () => {
      const error: AssembleCompressionPromptErrorReturn = {
        error: { message: "db down" },
        retriable: true,
      };
      const ret: AssembleCompressionPromptReturn = error;
      if ("error" in ret) {
        assertEquals(ret.retriable, true);
      } else {
        throw new Error("expected error branch");
      }
    });
  },
);

Deno.test(
  "Contract: AssembleCompressionPromptFn matches (deps, params, payload) => Promise<AssembleCompressionPromptReturn>",
  () => {
    const fn: AssembleCompressionPromptFn = async (
      _deps,
      _params,
      _payload,
    ) => {
      const success: AssembleCompressionPromptSuccessReturn = {
        promptContent: "compressed prompt",
        source_prompt_resource_id: "resource-123",
      };
      return success;
    };
    assertEquals(typeof fn, "function");
  },
);

Deno.test(
  "Contract: BoundAssembleCompressionPromptFn matches (params, payload) => Promise<AssembleCompressionPromptReturn>",
  () => {
    const bound: BoundAssembleCompressionPromptFn = async (
      _params,
      _payload,
    ) => {
      const success: AssembleCompressionPromptSuccessReturn = {
        promptContent: "compressed prompt",
        source_prompt_resource_id: "resource-123",
      };
      return success;
    };
    assertEquals(typeof bound, "function");
  },
);
