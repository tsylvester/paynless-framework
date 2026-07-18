import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database, Tables } from "../../../types_db.ts";
import { CompressionMode, FileType } from "../../types/file_manager.types.ts";
import { createMockSupabaseClient } from "../../supabase.mock.ts";
import { MockLogger } from "../../logger.mock.ts";
import { renderPrompt } from "../../prompt-renderer.ts";
import {
  AssembleCompressionPromptDeps,
  AssembleCompressionPromptParams,
  AssembleCompressionPromptPayload,
  AssembleCompressionPromptSuccessReturn,
  AssembleCompressionPromptErrorReturn,
  AssembleCompressionPromptReturn,
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
  };

  return { ...deps, ...overrides };
}

export function buildCompressionTargetStep(
  overrides?: Partial<CompressionTargetStep> | null,
): CompressionTargetStep | null {
  if (overrides === null) {
    return null;
  }

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
  overrides?: Partial<AssembleCompressionPromptParams> | null,
): AssembleCompressionPromptParams | null {
  if (overrides === null) {
    return null;
  }

  const consumingStep = buildCompressionTargetStep();
  if (consumingStep === null) {
    throw new Error(
      "buildCompressionTargetStep returned null for a default request",
    );
  }

  const params: AssembleCompressionPromptParams = {
    consumingStep,
  };

  return { ...params, ...overrides };
}

export function buildAssembleCompressionPromptPayload(
  overrides?: Partial<AssembleCompressionPromptPayload> | null,
): AssembleCompressionPromptPayload | null {
  if (overrides === null) {
    return null;
  }

  const payload: AssembleCompressionPromptPayload = {
    mode: "text",
    content: "Source content to compress.",
  };

  return { ...payload, ...overrides };
}

export function buildAssembleCompressionPromptSuccessReturn(
  overrides?: Partial<AssembleCompressionPromptSuccessReturn> | null,
): AssembleCompressionPromptSuccessReturn | null {
  if (overrides === null) {
    return null;
  }

  const success: AssembleCompressionPromptSuccessReturn = {
    prompt: "Rendered compression prompt.",
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

export function createAssembleCompressionPromptMock(options?: {
  handler?: AssembleCompressionPromptFn;
  result?: AssembleCompressionPromptReturn;
}): {
  assembleCompressionPrompt: AssembleCompressionPromptFn;
  calls: {
    deps: AssembleCompressionPromptDeps;
    params: AssembleCompressionPromptParams;
    payload: AssembleCompressionPromptPayload;
  }[];
} {
  const calls: {
    deps: AssembleCompressionPromptDeps;
    params: AssembleCompressionPromptParams;
    payload: AssembleCompressionPromptPayload;
  }[] = [];

  const assembleCompressionPrompt: AssembleCompressionPromptFn = async (
    deps,
    params,
    payload,
  ) => {
    calls.push({ deps, params, payload });

    if (options?.handler !== undefined) {
      return await options.handler(deps, params, payload);
    }

    if (options?.result !== undefined) {
      return options.result;
    }

    const success = buildAssembleCompressionPromptSuccessReturn();
    if (success === null) {
      return buildAssembleCompressionPromptErrorReturn({
        error: new Error("Fallback success return was null"),
        retriable: false,
      });
    }

    return success;
  };

  return { assembleCompressionPrompt, calls };
}

export function buildBoundAssembleCompressionPromptFn(
  depsOverrides?: Partial<AssembleCompressionPromptDeps>,
): BoundAssembleCompressionPromptFn {
  const deps = buildAssembleCompressionPromptDeps(depsOverrides);

  return async (params, payload) => {
    return buildAssembleCompressionPromptSuccessReturn() ??
      buildAssembleCompressionPromptErrorReturn({
        error: new Error("assembleCompressionPrompt not yet implemented"),
        retriable: false,
      });
  };
}
