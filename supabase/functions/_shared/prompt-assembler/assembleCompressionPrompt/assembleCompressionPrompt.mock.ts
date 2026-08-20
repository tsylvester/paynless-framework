import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Tables } from "../../../types_db.ts";
import { CompressionMode, DialecticStageSlug, FileType } from "../../types/file_manager.types.ts";
import { createMockSupabaseClient } from "../../supabase.mock.ts";
import { MockLogger } from "../../logger.mock.ts";
import { MockFileManagerService } from "../../services/file_manager.mock.ts";
import { renderPrompt } from "../../prompt-renderer.ts";
import { constructStoragePath } from "../../utils/path_constructor.ts";
import {
  AssembleCompressionPromptDeps,
  AssembleCompressionPromptParams,
  AssembleCompressionPromptPayload,
  AssembleCompressionPromptSuccessReturn,
  AssembleCompressionPromptErrorReturn,
  AssembleCompressionPromptFn,
  BoundAssembleCompressionPromptFn,
  CompressionTargetStep,
} from "./assembleCompressionPrompt.interface.ts";

const UUID_SYSTEM_PROMPT = "a000000a-0000-4000-a000-00000000000a";

const compressionContextPromptText = `You are compressing a source that is context for a downstream agent. That agent will use the compressed result, alongside other documents, to populate the target schema below. Your output must preserve every fact that could contribute to any field of the target schema.

{{#section:json_mode}}
The source is a completed JSON structure. Return EXACTLY the same JSON structure with its values compressed:
- Every key must be present in your output. Do not add, rename, remove, or reorder keys.
- Object shapes must not change.
- Arrays may lose low-value elements; keep every element that could contribute to the target schema.
- Condense string values in place.
Return ONLY the compressed JSON.
{{/section:json_mode}}
{{#section:text_mode}}
The source is a document. Return ONLY the compressed document text.
{{/section:text_mode}}

Remove: duplicated information, examples, narrative, historical discussion, intermediate reasoning.
Preserve: requirements, constraints, assumptions, accepted decisions, identifiers, user corrections, unresolved questions.

Stage intent: {{stage_intent}}

Target schema (what the downstream agent must populate):
{{outputs_required}}

{{#section:chunk_context}}
The source is chunk {{chunk_index}} of {{chunk_total}} of a larger document. Compress this chunk on its own terms; do not attempt to summarize the whole document.
{{/section:chunk_context}}

Source:
{{source_content}}`;

const baseSystemPrompt: Tables<"system_prompts"> = {
  id: UUID_SYSTEM_PROMPT,
  name: "compression_context_v1",
  prompt_text: compressionContextPromptText,
  description: null,
  is_active: true,
  user_selectable: false,
  version: 1,
  document_template_id: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

export function buildAssembleCompressionPromptDeps(
  overrides?: Partial<AssembleCompressionPromptDeps>,
): AssembleCompressionPromptDeps {
  const { client } = createMockSupabaseClient("user-id", {
    genericMockResults: {
      system_prompts: {
        select: () =>
          Promise.resolve({ data: [baseSystemPrompt], error: null }),
      },
    },
  });

  const deps: AssembleCompressionPromptDeps = {
    dbClient: client as unknown as SupabaseClient<Database>,
    renderPromptFn: renderPrompt,
    logger: new MockLogger(),
    fileManager: new MockFileManagerService(),
    constructStoragePath: constructStoragePath,
  };

  return { ...deps, ...overrides };
}

export function buildCompressionTargetStep(
  overrides?: Partial<CompressionTargetStep>,
): CompressionTargetStep {
  const step: CompressionTargetStep = {
    outputs_required: {
      documents: [{
        artifact_class: "rendered_document",
        file_type: "markdown",
        document_key: FileType.business_case,
        template_filename: "business_case.md",
      }],
    },
    step_description: "Compress the source for the downstream agent.",
  };

  return { ...step, ...overrides };
}

export function buildAssembleCompressionPromptParams(
  overrides?: Partial<AssembleCompressionPromptParams>,
): AssembleCompressionPromptParams {
  const params: AssembleCompressionPromptParams = {
    consumingStep: buildCompressionTargetStep(),
    projectId: "project-123",
    sessionId: "session-123",
    iterationNumber: 1,
    stageSlug: DialecticStageSlug.Thesis,
    output_type: FileType.business_case,
    sourceType: "resource",
    documentKey: FileType.business_case_critique,
    modelSlug: "claude-3-opus",
    attemptCount: 0,
    userId: "user-123",
  };

  return { ...params, ...overrides };
}

export function buildAssembleCompressionPromptPayload(
  overrides?: Partial<AssembleCompressionPromptPayload>,
): AssembleCompressionPromptPayload {
  const payload: AssembleCompressionPromptPayload = {
    mode: "text",
    content: "Source content to compress.",
  };

  return { ...payload, ...overrides };
}

export function buildAssembleCompressionPromptSuccessReturn(
  overrides?: Partial<AssembleCompressionPromptSuccessReturn>,
): AssembleCompressionPromptSuccessReturn {
  const success: AssembleCompressionPromptSuccessReturn = {
    promptContent: "Rendered compression prompt.",
    source_prompt_resource_id: "mock-compression-resource-id",
  };

  return { ...success, ...overrides };
}

export function buildAssembleCompressionPromptErrorReturn(
  overrides?: Partial<AssembleCompressionPromptErrorReturn>,
): AssembleCompressionPromptErrorReturn {
  const errorReturn: AssembleCompressionPromptErrorReturn = {
    error: new Error("Assemble compression prompt failed"),
    retriable: false,
  };

  return { ...errorReturn, ...overrides };
}

export type AssembleCompressionPromptParamsCorruptions = { [K in keyof AssembleCompressionPromptParams]?: unknown };

export function invalidateAssembleCompressionPromptParams(corruptions: AssembleCompressionPromptParamsCorruptions): unknown {
  return { ...buildAssembleCompressionPromptParams(), ...corruptions };
}

export type AssembleCompressionPromptPayloadCorruptions = { [K in keyof AssembleCompressionPromptPayload]?: unknown };

export function invalidateAssembleCompressionPromptPayload(corruptions: AssembleCompressionPromptPayloadCorruptions): unknown {
  return { ...buildAssembleCompressionPromptPayload(), ...corruptions };
}

export const mockAssembleCompressionPrompt: AssembleCompressionPromptFn = async () => {
  return buildAssembleCompressionPromptSuccessReturn();
};

export const mockBoundAssembleCompressionPrompt: BoundAssembleCompressionPromptFn = async () => {
  return buildAssembleCompressionPromptSuccessReturn();
};
