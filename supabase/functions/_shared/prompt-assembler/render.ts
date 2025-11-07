import { Json } from "../../types_db.ts";
import {
  DynamicContextVariables,
  RenderPromptFunctionType,
  StageContext,
} from "./prompt-assembler.interface.ts";
import { isJson, isRecord } from "../utils/type_guards.ts";

export function render(
  renderPromptFn: RenderPromptFunctionType,
  stage: StageContext,
  context: DynamicContextVariables,
  userProjectOverlayValues: Json | null = null,
): string {
  // Start from the stage default overlays
  let systemDefaultOverlayValues =
    stage.domain_specific_prompt_overlays[0]?.overlay_values;

  const basePromptText: string | undefined | null =
    stage.system_prompts?.prompt_text;
  if (
    !basePromptText || typeof basePromptText !== "string" ||
    basePromptText.trim().length === 0
  ) {
    throw new Error(
      `RENDER_PRECONDITION_FAILED: missing system prompt text for stage ${stage.slug}`,
    );
  }

  const requiresStyleGuide = basePromptText.includes(
    "{{#section:style_guide_markdown}}",
  );
  const requiresArtifacts = basePromptText.includes(
    "{{outputs_required}}",
  );

  if (requiresStyleGuide) {
    const styleGuideVal = isRecord(systemDefaultOverlayValues)
      ? systemDefaultOverlayValues["style_guide_markdown"]
      : undefined;
    if (
      typeof styleGuideVal !== "string" || styleGuideVal.trim().length === 0
    ) {
      throw new Error(
        `RENDER_PRECONDITION_FAILED: missing style_guide_markdown for stage ${stage.slug}`,
      );
    }
  }

  // Inject outputs_required JSON when provided on the context's recipeStep
  const outputs = context.recipeStep?.outputs_required;
  if (outputs) {
    const isNonEmpty = Array.isArray(outputs)
      ? outputs.length > 0
      : Object.keys(outputs).length > 0;

    if (isNonEmpty) {
      if (!isJson(outputs)) {
        throw new Error(
          "context.recipeStep.outputs_required must be JSON-compatible",
        );
      }
      const injected: Record<string, Json> = {};
      if (isRecord(systemDefaultOverlayValues)) {
        for (const [key, value] of Object.entries(systemDefaultOverlayValues)) {
          if (isJson(value)) {
            injected[key] = value;
          }
        }
      }
      injected["outputs_required"] = outputs;
      systemDefaultOverlayValues = injected;
    }
  }

  if (requiresArtifacts) {
    const artifactsVal = isRecord(systemDefaultOverlayValues)
      ? systemDefaultOverlayValues["outputs_required"]
      : undefined;
    if (!artifactsVal) {
      throw new Error(
        `RENDER_PRECONDITION_FAILED: missing outputs_required for stage ${stage.slug}`,
      );
    }
  }

  try {
    return renderPromptFn(
      basePromptText,
      context,
      systemDefaultOverlayValues,
      userProjectOverlayValues,
    );
  } catch (renderingError) {
    console.error(
      `[PromptAssembler.render] Error during prompt rendering: ${
        renderingError instanceof Error
          ? renderingError.message
          : String(renderingError)
      }`,
      { error: renderingError },
    );
    throw new Error(
      `Failed to render prompt: ${
        renderingError instanceof Error
          ? renderingError.message
          : "Unknown rendering error"
      }`,
    );
  }
}
